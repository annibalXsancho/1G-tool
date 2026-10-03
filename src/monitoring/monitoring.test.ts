import { describe, expect, it } from 'vitest';
import { applyAction, alignStart, controlChart, detectionPower, optionA, periodsNeeded, runMV, simulateMV, type MVConfig, type SimOptions } from './ipmvp';
import { checkQuality } from './quality';
import { DEFAULT_OCCUPATION, delta, dayTypeEnergy, isOccupied, kpis, previousPeriod, topPeaks } from './kpis';
import { autoMap, detectUnit, readTable, readTemperatures, tableFromMatrix, toMeasures, toNumber, toTime } from './read';
import { aggregate, dailyEnergy, heatMatrix, loadDuration, medianStep, slice, totalCurve, typicalProfile } from './series';
import { costs, isOffPeak, optimalPower, overruns, DEFAULT_TARIFF } from './tariff';
import { exempleMonitoring, EXEMPLE_ACTION_DATE, EXEMPLE_SITES } from './exemple';
import { isAnalysis } from '@/suivi/analyse';
import { tCritical } from '@/suivi/regress';
import type { Measure } from './types';

/** Courbe plate : `kw` kW, pas d'une heure, du 02/06/2026 (mardi) pendant `days` jours, un compteur. */
function flat(kw: number, days: number, site = 'A', start = new Date(2026, 5, 2)): Measure[] {
  const out: Measure[] = [];
  for (let i = 0; i < days * 24; i++) out.push({ t: new Date(start.getFullYear(), start.getMonth(), start.getDate(), i).getTime(), site, kw });
  return out;
}

describe('lecture des relevés', () => {
  it('nombres et dates à la française, heure locale', () => {
    expect(toNumber('1 234,5')).toBeCloseTo(1234.5); expect(toNumber('')).toBeNaN();
    expect(toTime('2026-06-01 13:30')).toBe(new Date(2026, 5, 1, 13, 30).getTime());
    expect(toTime('01/06/2026 13:30')).toBe(new Date(2026, 5, 1, 13, 30).getTime());
    expect(toTime('45900.5')).toBeNaN(); // jamais l'an 45900
    expect(toTime('45900', true)).not.toBeNaN(); // série Excel acceptée si la colonne est désignée
  });
  it('unité devinée : intitulé puis ordre de grandeur', () => {
    expect(detectUnit('Site A P [W]')).toBe('W'); expect(detectUnit('Puissance (kW)')).toBe('kW'); expect(detectUnit('Charge MW')).toBe('MW');
    expect(detectUnit('FM Normale', 26345)).toBe('W'); expect(detectUnit('FM Normale', 800)).toBe('kW');
  });
  it('CSV français : séparateur point-virgule, unité en W, un compteur', () => {
    const t = readTable('Date;Puissance [W]\n01/06/2026 00:00;12 000,5\n01/06/2026 01:00;13 000\n01/06/2026 02:00;11 000\n01/06/2026 03:00;10 000\n');
    const m = autoMap(t);
    expect(m.unit).toBe('W');
    const rows = toMeasures(t, m);
    expect(rows).toHaveLength(4); expect(rows[0].kw).toBeCloseTo(12.0005, 6);
  });
  it('format large : une colonne par compteur ; une colonne kWh est écartée', () => {
    const t = readTable('timestamp,Atelier P [kW],Bureaux P [kW],Atelier kWh\n2026-06-01 00:00,10,5,10\n2026-06-01 01:00,11,5,11\n2026-06-01 02:00,12,5,12\n2026-06-01 03:00,9,5,9\n');
    const m = autoMap(t);
    expect(m.power).toHaveLength(2);
    const rows = toMeasures(t, m);
    expect(new Set(rows.map((r) => r.site)).size).toBe(2); expect(rows).toHaveLength(8);
  });
  it('feuille Excel : dates et nombres natifs', () => {
    const t = tableFromMatrix([['Date', 'Puissance (kW)'], [new Date(2026, 5, 1, 0, 0), 10], [new Date(2026, 5, 1, 1, 0), 12], [new Date(2026, 5, 1, 2, 0), 11], [new Date(2026, 5, 1, 3, 0), 9]]);
    expect(toMeasures(t, autoMap(t))).toHaveLength(4);
  });
  it('colonnes introuvables : erreur explicite', () => {
    const t = readTable('a,b\n1,2\n3,4\n');
    expect(() => toMeasures(t, { timestamp: -1, power: [-1], site: -1, unit: 'kW', siteName: '' })).toThrow(/date/i);
  });
  it('températures : Tmin / Tmax', () => {
    const { days } = readTemperatures(readTable('Date;Tmin;Tmax\n01/01/2026;-1,5;6\n02/01/2026;0;8\n'));
    expect(days.get('2026-01-01')).toEqual({ tmin: -1.5, tmax: 6 });
  });
});

describe('séries', () => {
  const rows = flat(10, 3);
  it('pas de temps médian et énergie journalière', () => {
    expect(medianStep(rows)).toBeCloseTo(1, 12);
    const d = dailyEnergy(rows, 1);
    expect(d).toHaveLength(3); expect(d.every((x) => x.complete && Math.abs(x.kwh - 240) < 1e-9)).toBe(true);
  });
  it('jour incomplet signalé', () => {
    const half = flat(10, 1).slice(0, 10);
    expect(dailyEnergy(half, 1)[0].complete).toBe(false);
  });
  it('agrégation : puissance moyenne, pointe, énergie', () => {
    const r: Measure[] = [{ t: new Date(2026, 5, 2, 0).getTime(), site: 'A', kw: 10 }, { t: new Date(2026, 5, 2, 1).getTime(), site: 'A', kw: 30 }];
    const a = aggregate(r, 'D', 1);
    expect(a).toHaveLength(1); expect(a[0]).toMatchObject({ kw: 20, peak: 30, kwh: 40 });
  });
  it('total multi-compteurs, monotone décroissante, carte de chaleur 24 × jours', () => {
    const two = [...flat(10, 2, 'A'), ...flat(5, 2, 'B')];
    expect(totalCurve(two)[0].kw).toBe(15);
    const ld = loadDuration(two); expect(ld[0].kw).toBe(15); expect(ld.at(-1)!.share).toBeCloseTo(100, 9);
    const hm = heatMatrix(two); expect(hm.z).toHaveLength(24); expect(hm.days).toHaveLength(2);
  });
  it('profil type ouvré / week-end', () => {
    const wk = flat(10, 14); // 2 semaines à partir d'un mardi
    expect(typicalProfile(wk, 'ouvre').days).toBe(10); expect(typicalProfile(wk, 'we').days).toBe(4);
    expect(typicalProfile(wk, 'we').mean[5]).toBe(10);
  });
  it('filtrage par compteur et période (bornes de jour incluses)', () => {
    const r = [...flat(1, 3, 'A'), ...flat(2, 3, 'B')];
    expect(slice(r, new Date(2026, 5, 3).getTime(), new Date(2026, 5, 3).getTime(), ['B'])).toHaveLength(24);
  });
});

describe('KPIs (calculés à la main sur 10 kW constants)', () => {
  it('énergie, pointe, moyenne, facteur de charge, talon', () => {
    const k = kpis(flat(10, 2), 1);
    expect(k.energy).toBeCloseTo(480, 9); expect(k.peak).toBe(10); expect(k.mean).toBe(10);
    expect(k.loadFactor).toBeCloseTo(100, 9); expect(k.baseLoad).toBe(10); expect(k.baseShare).toBeCloseTo(100, 9);
    expect(k.utilisationHours).toBeCloseTo(48, 9); expect(k.peakiness).toBeCloseTo(1, 9);
  });
  it('part hors occupation : un mardi, 11 h occupées sur 24 → 13/24 hors occupation', () => {
    const k = kpis(flat(10, 1), 1); // 8 h → 19 h = 11 h occupées
    expect(k.offShare).toBeCloseTo((13 / 24) * 100, 9);
    expect(isOccupied(new Date(2026, 5, 2, 9).getTime(), DEFAULT_OCCUPATION)).toBe(true);
    expect(isOccupied(new Date(2026, 5, 6, 9).getTime(), DEFAULT_OCCUPATION)).toBe(false); // samedi
  });
  it('pointe isolée : le talon, la pointe et leur rapport se distinguent', () => {
    const r = flat(10, 4); r[50] = { ...r[50], kw: 100 };
    const k = kpis(r, 1);
    expect(k.peak).toBe(100); expect(k.peakiness).toBeGreaterThan(5); expect(k.peakAt).not.toBeNull();
    expect(topPeaks(r, 3)[0].kw).toBe(100); expect(topPeaks(r, 3)).toHaveLength(3);
  });
  it('écarts et période précédente', () => {
    expect(delta(110, 100)).toEqual({ abs: 10, pct: 10 }); expect(delta(1, 0).pct).toBeNaN();
    const r = flat(10, 6);
    const from = new Date(2026, 5, 5).getTime(); const to = new Date(2026, 5, 7).getTime();
    expect(previousPeriod(r, from, to)).toHaveLength(72); // 3 jours (5 → 7 juin inclus) → les 3 jours précédents, 2 → 4 juin
  });
  it('jours ouvrés / week-end', () => {
    const r = [...flat(10, 5)]; // mardi → samedi
    const d = dayTypeEnergy(r, 1);
    expect(d.ouvre).toBeCloseTo(240, 9); expect(d.we).toBeCloseTo(240, 9); expect(d.ratio).toBeCloseTo(1, 9);
  });
});

describe('tarif', () => {
  it('heures creuses à cheval sur minuit', () => {
    expect(isOffPeak(23, DEFAULT_TARIFF)).toBe(true); expect(isOffPeak(3, DEFAULT_TARIFF)).toBe(true); expect(isOffPeak(12, DEFAULT_TARIFF)).toBe(false);
    expect(isOffPeak(5, { hcStart: 0, hcEnd: 0 })).toBe(false);
  });
  it('coût : 10 kW sur 24 h = 8 h creuses + 16 h pleines', () => {
    const c = costs(flat(10, 1), 1, DEFAULT_TARIFF, 1);
    expect(c.energyHc).toBeCloseTo(80, 9); expect(c.energyHp).toBeCloseTo(160, 9);
    expect(c.energyCost).toBeCloseTo(80 * 0.13 + 160 * 0.19, 9);
  });
  it('dépassements de puissance souscrite et puissance optimale', () => {
    const r = flat(10, 2); r[3].kw = 18; r[30].kw = 14;
    const o = overruns(totalCurve(r), 1, { ...DEFAULT_TARIFF, subscribedKw: 12, overrunPerKw: 10 })!;
    expect(o.maxOver).toBe(6); expect(o.hours).toBe(2); expect(o.cost).toBe(60);
    expect(overruns(totalCurve(r), 1, DEFAULT_TARIFF)).toBeNull();
    expect(optimalPower(loadDuration(r), 1)).toBe(18); // 1 % de 48 points : la pointe elle-même
    expect(optimalPower(loadDuration(r), 5)).toBe(10); // 5 % : on ignore les deux plus fortes pointes (18 et 14)
  });
});

describe('qualité des données', () => {
  const varied = (days: number): Measure[] => flat(10, days).map((r, i) => ({ ...r, kw: 10 + ((i * 7) % 11) }));
  it('relevé propre', () => { const q = checkQuality(varied(3), 1); expect(q.completeness).toBeCloseTo(100, 9); expect(q.gaps).toBe(0); expect(q.issues[0].level).toBe('info'); });
  it('trous, doublons, négatifs', () => {
    const r = varied(4);
    const holed = r.filter((_, i) => i < 20 || i > 30); // 11 mesures manquantes d'un seul tenant
    holed.push({ ...holed[0] }); holed.push({ ...holed[5], kw: -3 });
    holed.sort((a, b) => a.t - b.t);
    const q = checkQuality(holed, 1);
    expect(q.gaps).toBe(1); expect(q.duplicates).toBe(2); expect(q.negatives).toBe(1);
    expect(q.completeness).toBeCloseTo(((96 - 11) / 96) * 100, 6);
  });
  it('palier figé : une valeur identique pendant 24 h', () => { expect(checkQuality(flat(10, 3), 1).flat).toBeGreaterThanOrEqual(1); expect(checkQuality(varied(3), 1).flat).toBe(0); });
});

describe('simulation IPMVP : action connue', () => {
  it('chiffrage exact de l’économie vraie pour chaque type d’action', () => {
    const r = flat(100, 4); const from = new Date(2026, 5, 4).getTime(); // 2 jours après l'action (48 h)
    expect(applyAction(r, { action: { kind: 'pct', pct: 10 }, from, sites: null }, 1).trueKwh).toBeCloseTo(48 * 10, 9);
    expect(applyAction(r, { action: { kind: 'kw', kw: 15 }, from, sites: null }, 1).trueKwh).toBeCloseTo(48 * 15, 9);
    expect(applyAction(r, { action: { kind: 'ecretage', capKw: 80 }, from, sites: null }, 1).trueKwh).toBeCloseTo(48 * 20, 9);
    const ho = applyAction(r, { action: { kind: 'horsOccupation', pct: 50 }, from, sites: null }, 1);
    expect(ho.trueKwh).toBeCloseTo(2 * 13 * 50, 9); // 13 h hors occupation par jour ouvré
    expect(applyAction(r, { action: { kind: 'kw', kw: 500 }, from, sites: null }, 1).rows.every((x) => x.kw >= 0)).toBe(true); // jamais négatif
    expect(applyAction(flat(100, 2, 'A').concat(flat(100, 2, 'B')), { action: { kind: 'pct', pct: 10 }, from: 0, sites: ['B'] }, 1).trueKwh).toBeCloseTo(48 * 10, 9);
  });
  it('alignement du suivi sur un début de période', () => {
    expect(new Date(alignStart(new Date(2026, 2, 10).getTime(), 'mois')).getDate()).toBe(1);
    expect(new Date(alignStart(new Date(2026, 2, 10).getTime(), 'mois')).getMonth()).toBe(3);
    expect(new Date(alignStart(new Date(2026, 2, 10).getTime(), 'semaine')).getDay()).toBe(1);
  });
  it('option A : économie et incertitude composée en quadrature', () => {
    const a = optionA({ dpKw: 20, hours: 4000, uPowerPct: 3, uHoursPct: 4, confidence: 0.9 });
    expect(a.saving).toBe(80000);
    expect(a.relative).toBeCloseTo(Math.sqrt(0.03 ** 2 + 0.04 ** 2) * 1.645, 12); // 0,05 × 1,645
    expect(a.U).toBeCloseTo(80000 * 0.05 * 1.645, 6);
  });
});

describe('exemple complet : l’action intégrée est retrouvée par l’option C', () => {
  const ex = exempleMonitoring();
  const mv: MVConfig = { from: EXEMPLE_ACTION_DATE, grain: 'jour', regressors: ['dju', 'djr', 'we'], base: 18, confidence: 0.9 };
  it('jeu d’exemple : taille, pas de temps, journées complètes', () => {
    expect(ex.stepHours).toBe(0.5); expect(ex.rows.length).toBeGreaterThan(80000);
    expect(dailyEnergy(ex.rows, 0.5).every((d) => d.complete)).toBe(true);
    expect(ex.trueSavingKwh).toBeGreaterThan(0);
  });
  it('option C (compteur général) : estimation proche de la vérité, dans l’incertitude', () => {
    const a = runMV(ex.rows, 0.5, ex.temps, mv);
    expect(isAnalysis(a)).toBe(true);
    if (!isAnalysis(a)) return;
    expect(a.fit.r2).toBeGreaterThan(0.9);
    const est = a.savings!.total;
    expect(Math.abs(est - ex.trueSavingKwh)).toBeLessThanOrEqual(a.savings!.U + 1);
    expect(est).toBeGreaterThan(0.5 * ex.trueSavingKwh); expect(est).toBeLessThan(1.5 * ex.trueSavingKwh);
  });
  it('option B (sous-compteur CVC) : incertitude plus petite que l’option C', () => {
    const sim = simulateMV(ex.rows, 0.5, { mv, temps: ex.temps, action: { action: { kind: 'pct', pct: 0 }, from: EXEMPLE_ACTION_DATE, sites: [EXEMPLE_SITES.cvc] }, stipulation: { hoursShare: 1, uPowerPct: 2, uHoursPct: 10, spotDays: 7 } });
    const B = sim.options.find((o) => o.option === 'B'); const C = sim.options.find((o) => o.option === 'C');
    expect(B && C).toBeTruthy();
    expect(B!.U).toBeLessThan(C!.U);
    // Action nulle ajoutée : l'estimation B reste proche de la vraie économie intégrée à l'exemple (12 % de la CVC)
    expect(B!.estimate).toBeGreaterThan(0.7 * ex.trueSavingKwh); expect(B!.estimate).toBeLessThan(1.3 * ex.trueSavingKwh);
  });
  it('simulation d’une action supplémentaire sur le process : vérité exacte et options A, B, C', () => {
    const o: SimOptions = { mv: { ...mv, from: new Date(2026, 5, 1).getTime() }, temps: ex.temps, action: { action: { kind: 'pct', pct: 10 }, from: new Date(2026, 5, 1).getTime(), sites: [EXEMPLE_SITES.process] }, stipulation: { hoursShare: 1, uPowerPct: 2, uHoursPct: 5, spotDays: 7 } };
    const sim = simulateMV(ex.rows, 0.5, o);
    const process = ex.rows.filter((r) => r.site === EXEMPLE_SITES.process && r.t >= o.action.from);
    expect(sim.trueKwh).toBeCloseTo(process.reduce((s, r) => s + r.kw * 0.5 * 0.1, 0), 4);
    expect(sim.options.map((x) => x.option).sort()).toEqual(['A', 'B', 'C']);
    const B = sim.options.find((x) => x.option === 'B')!;
    expect(Math.abs(B.errorPct)).toBeLessThan(10); // le process est insensible à la météo : l'isoler retrouve la vérité
    expect(sim.options.every((x) => Number.isFinite(x.U) && x.U > 0)).toBe(true);
  });
});

describe('puissance de détection et cartes de contrôle', () => {
  const ex = exempleMonitoring();
  const mv: MVConfig = { from: EXEMPLE_ACTION_DATE, grain: 'jour', regressors: ['dju', 'djr', 'we'], base: 18, confidence: 0.9 };
  const a = runMV(ex.rows, 0.5, ex.temps, mv);
  if (!isAnalysis(a)) throw new Error('analyse');
  it('la puissance de détection croît avec l’économie vraie, la fausse alarme reste faible', () => {
    const d = detectionPower(a, { m: 26, fractions: [0, 0.01, 0.03, 0.06, 0.12], trials: 400, seed: 7 });
    for (let i = 1; i < d.power.length; i++) expect(d.power[i]).toBeGreaterThanOrEqual(d.power[i - 1] - 0.05);
    expect(d.power[4]).toBeGreaterThan(0.95); expect(d.power[0]).toBeLessThan(0.15); expect(d.falseAlarm).toBeLessThan(0.15);
    expect(d.minDetectable).toBeGreaterThan(0); expect(d.minDetectable).toBeLessThan(0.2);
    // à la fraction minimale détectable, la puissance est de l'ordre de 50 %
    const dm = detectionPower(a, { m: 26, fractions: [d.minDetectable], trials: 600, seed: 9 });
    expect(dm.power[0]).toBeGreaterThan(0.25); expect(dm.power[0]).toBeLessThan(0.75);
  });
  it('durée de suivi nécessaire : plus l’économie visée est petite, plus il faut de périodes (en 1/s²)', () => {
    const ref = a.lines.filter((l) => l.role === 'reference'); const meanExp = ref.reduce((x, l) => x + l.expected, 0) / ref.length;
    const c = (a.factor * tCritical(a.fit.dof, 0.9) * a.fit.rmse) / meanExp;
    for (const s of [0.002, 0.004, 0.01]) expect(periodsNeeded(a, s)).toBe(Math.ceil((c / s) ** 2 * (1 + 2 / ref.length)));
    expect(periodsNeeded(a, 0.002) / periodsNeeded(a, 0.004)).toBeGreaterThan(3.5); expect(periodsNeeded(a, 0.002) / periodsNeeded(a, 0.004)).toBeLessThan(4.5);
    expect(periodsNeeded(a, 0)).toBe(Infinity);
  });
  it('cartes de contrôle : peu d’alarmes dans la référence, dérive détectée après l’action', () => {
    const cc = controlChart(a);
    const ref = a.lines.map((l, i) => ({ l, i })).filter((x) => x.l.role === 'reference').map((x) => x.i);
    const refAlarms = cc.alarms.filter((al) => ref.includes(al.index) && (al.kind === '3 sigma' || al.kind === 'CUSUM+' || al.kind === 'CUSUM−'));
    expect(refAlarms.length).toBeLessThan(ref.length * 0.1);
    expect(cc.alarms.some((al) => al.kind === 'CUSUM−' && !ref.includes(al.index))).toBe(true); // consommation sous l'attendu : économie
    expect(cc.z).toHaveLength(a.lines.length);
  });
});
