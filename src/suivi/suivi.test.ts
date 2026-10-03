import { describe, expect, it } from 'vitest';
import { analyse, isAnalysis, suggestRegressors } from './analyse';
import { inSeason, toPeriods } from './aggregate';
import { coolingDegreeDay, heatingDegreeDay } from './dju';
import { exempleBatimentGaz, exempleDoc, exempleReseauChaleur, exempleRows, EXEMPLE_PENTE, lignesMensuelles } from './exemple';
import { TD5_EX3 } from './exemple-cours';
import { defaultConfig, type Config, type Row } from './model';
import { csvToMatrix, parseDate, parseNumber, parseTable } from './parse';
import { invert, ols, predict, tCritical } from './regress';

describe('degrés-jours (Costic)', () => {
  it('journée entièrement sous la base : base − moyenne', () => expect(heatingDegreeDay(2, 8, 18)).toBeCloseTo(13, 12));
  it('journée à cheval : pondération 0,08 / 0,42', () => {
    // (18 − 10)(0,08 + 0,42 × 8/10) = 8 × 0,416 = 3,328
    expect(heatingDegreeDay(10, 20, 18)).toBeCloseTo(3.328, 12);
  });
  it('journée entièrement au-dessus : zéro', () => expect(heatingDegreeDay(19, 25, 18)).toBe(0));
  it('climatisation : formule retournée', () => {
    expect(coolingDegreeDay(20, 30, 18)).toBeCloseTo(7, 12);
    expect(coolingDegreeDay(10, 20, 18)).toBeCloseTo((20 - 18) * (0.08 + 0.42 * 2 / 10), 12);
    expect(coolingDegreeDay(5, 15, 18)).toBe(0);
  });
});

describe('régression', () => {
  it('cas classique : y = 2,2 + 0,6 x, R² = 0,6 (Anscombe-like, calcul à la main)', () => {
    // x = 1..5, y = 2,4,5,4,5 : pente 6/10, talon 4 − 0,6×3 = 2,2 ; SSE = 2,4, SST = 6 → R² = 0,6
    const f = ols([[1], [2], [3], [4], [5]], [2, 4, 5, 4, 5], ['x'])!;
    expect(f.coef[0]).toBeCloseTo(2.2, 12); expect(f.coef[1]).toBeCloseTo(0.6, 12);
    expect(f.r2).toBeCloseTo(0.6, 12);
    expect(f.rmse).toBeCloseTo(Math.sqrt(2.4 / 3), 12);
    expect(f.se[1]).toBeCloseTo(Math.sqrt(0.8 / 10), 12);
    expect(f.nmbe).toBeCloseTo(0, 12);
  });
  it('deux variables : retrouve exactement des coefficients sans bruit', () => {
    const X = [[1, 0], [2, 1], [3, 5], [4, 2], [5, 9], [6, 4]];
    const y = X.map(([a, b]) => 10 + 3 * a - 2 * b);
    const f = ols(X, y, ['a', 'b'])!;
    expect(f.coef[0]).toBeCloseTo(10, 9); expect(f.coef[1]).toBeCloseTo(3, 9); expect(f.coef[2]).toBeCloseTo(-2, 9);
    expect(f.r2).toBeCloseTo(1, 12); expect(predict(f, [7, 1])).toBeCloseTo(29, 9);
  });
  it('cas dégénérés : variable constante, trop peu de points', () => {
    expect(ols([[1], [1], [1], [1]], [1, 2, 3, 4], ['x'])).toBeNull();
    expect(ols([[1], [2]], [1, 2], ['x'])).toBeNull();
    expect(invert([[1, 2], [2, 4]])).toBeNull();
  });
  it('quantiles de Student : valeurs tabulées et interpolation', () => {
    expect(tCritical(10, 0.9)).toBeCloseTo(1.812, 3);
    expect(tCritical(10, 0.95)).toBeCloseTo(2.228, 3);
    expect(tCritical(1, 0.8)).toBeCloseTo(3.078, 3);
    expect(tCritical(35, 0.95)).toBeGreaterThan(2.0); expect(tCritical(35, 0.95)).toBeLessThan(2.042);
    expect(tCritical(10000, 0.95)).toBeCloseTo(1.96, 1);
  });
});

describe('agrégation', () => {
  const day = (d: string, kwh = 100, tmin = 5, tmax = 10): Row => ({ date: d, kwh, tmin, tmax });
  it('mois : écarte le mois incomplet', () => {
    const rows: Row[] = [];
    for (let d = 1; d <= 28; d++) rows.push(day(`2025-02-${String(d).padStart(2, '0')}`)); // février 2025 : 28 jours, complet
    for (let d = 1; d <= 20; d++) rows.push(day(`2025-03-${String(d).padStart(2, '0')}`)); // mars incomplet
    const p = toPeriods(rows, { grain: 'mois', base: 18 });
    expect(p).toHaveLength(1);
    expect(p[0].start).toBe('2025-02-01'); expect(p[0].kwh).toBe(2800); expect(p[0].days).toBe(28);
    expect(p[0].dju).toBeCloseTo(28 * (18 - 7.5), 9);
  });
  it('semaine : lundi → dimanche, semaines entamées écartées', () => {
    const rows: Row[] = [];
    for (let d = 3; d <= 16; d++) rows.push(day(`2025-02-${String(d).padStart(2, '0')}`)); // lundi 3 → dimanche 16 : 2 semaines
    rows.push(day('2025-02-17'));
    const p = toPeriods(rows, { grain: 'semaine', base: 18 });
    expect(p.map((x) => x.start)).toEqual(['2025-02-03', '2025-02-10']);
  });
  it('DJU déjà fournis prioritaires sur les températures', () => {
    const p = toPeriods([{ date: '2025-01-01', kwh: 5, dju: 12, tmin: 0, tmax: 1 }], { grain: 'brut', base: 18 });
    expect(p[0].dju).toBe(12);
  });
});

describe('analyse sur l’exemple (vérité connue : 350 kWh/DJU, −9 % depuis mars 2026)', () => {
  const doc = exempleDoc();
  const periods = toPeriods(doc.rows, doc.config);
  const a = analyse(periods, doc.config);
  it('retrouve la thermosensibilité et un modèle de bonne qualité', () => {
    expect(isAnalysis(a)).toBe(true);
    if (!isAnalysis(a)) return;
    expect(a.fit.coef[1]).toBeGreaterThan(EXEMPLE_PENTE * 0.97); expect(a.fit.coef[1]).toBeLessThan(EXEMPLE_PENTE * 1.03);
    expect(a.fit.r2).toBeGreaterThan(0.97);
    expect(a.fit.n).toBe(12);
    expect(a.checks.filter((c) => c.level === 'ko')).toHaveLength(0);
  });
  it('mesure l’économie de 9 % (à partir de mars) avec une incertitude cohérente', () => {
    if (!isAnalysis(a)) throw new Error('analyse');
    expect(a.suiviN).toBe(9);
    const s = a.savings!;
    // Janvier-février 2026 sont sans économie : sur 9 mois l'économie moyenne est de 7 mois × 9 % / 9 ≈ 7 %
    expect(s.pct).toBeGreaterThan(5.5); expect(s.pct).toBeLessThan(8.5);
    expect(s.total).toBeCloseTo(s.expected - s.measured, 6);
    expect(s.U).toBeGreaterThan(0); expect(s.significant).toBe(true);
    expect(a.ipe!.modelRatio).toBeCloseTo(s.measured / s.expected, 9);
    expect(a.ipe!.change).toBeLessThan(0);
  });
  it('CUSUM : nul à la fin de la référence, puis pente montante', () => {
    if (!isAnalysis(a)) throw new Error('analyse');
    const lastRef = a.lines.filter((l) => l.role === 'reference').at(-1)!;
    expect(Math.abs(lastRef.cusum)).toBeLessThan(1e-6 * a.fit.mean * 12 + 1e-6);
    const end = a.lines.at(-1)!;
    expect(end.cusum).toBeCloseTo(a.savings!.total, 6);
    expect(end.cusum).toBeGreaterThan(lastRef.cusum);
  });
  it('normalisation : la référence normalisée est positive et plus grande que le suivi normalisé', () => {
    if (!isAnalysis(a)) throw new Error('analyse');
    expect(a.normalised!.reference).toBeGreaterThan(0);
    expect(a.normalised!.suivi).not.toBeNull();
    expect(a.normalised!.saving!).toBeGreaterThan(0);
  });
  it('suggère DJU (avec ou sans effet week-end) pour un site chauffé, jamais DJR seul', () => {
    const r = suggestRegressors(periods, doc.config);
    expect(r).toContain('dju'); expect(r).not.toContain('djr');
  });
  it('variable week-end : part de jours de week-end exacte', () => {
    expect(periods[0].we).toBeCloseTo(8 / 31, 12); // janvier 2025 : 4 samedis + 4 dimanches
    const j = toPeriods(doc.rows, { ...doc.config, grain: 'jour' });
    expect(j.filter((p) => p.we === 1).length).toBeGreaterThan(150);
  });
  it('toutes les formules sont produites', () => { if (isAnalysis(a)) expect(a.formulas.length).toBeGreaterThanOrEqual(7); });
});

describe('cas limites de l’analyse', () => {
  const base: Config = { ...defaultConfig(), grain: 'brut' };
  it('aucune donnée : erreur', () => expect(isAnalysis(analyse([], base))).toBe(false));
  it('trop peu de périodes de référence : erreur', () => {
    const p = toPeriods([{ date: '2025-01-01', kwh: 1, dju: 1 }, { date: '2025-02-01', kwh: 2, dju: 2 }], base);
    expect(isAnalysis(analyse(p, base))).toBe(false);
  });
  it('relevé sans lien avec les DJU : R² faible signalé, pas d’habillage', () => {
    const rows = exempleRows().slice(0, 400);
    const noise: Row[] = rows.map((r, i) => ({ date: r.date, kwh: 1000 + ((i * 7919) % 13) * 10, dju: ((i * 31) % 17) }));
    const cfg: Config = { ...base, grain: 'brut' };
    const a = analyse(toPeriods(noise, cfg), cfg);
    if (!isAnalysis(a)) throw new Error('analyse');
    expect(a.fit.r2).toBeLessThan(0.3);
    expect(a.checks.find((c) => c.id === 'r2')!.level).toBe('ko');
  });
  it('pente négative : signalée comme erreur de sens', () => {
    const rows: Row[] = Array.from({ length: 12 }, (_, i) => ({ date: `2025-${String(i + 1).padStart(2, '0')}-01`, kwh: 1000 - 20 * i, dju: i * 5 }));
    const a = analyse(toPeriods(rows, base), base);
    if (!isAnalysis(a)) throw new Error('analyse');
    expect(a.checks.some((c) => c.id.startsWith('sign') && c.level === 'ko')).toBe(true);
  });
  it('sans période de suivi : pas d’économie', () => {
    const doc = exempleDoc();
    const cfg = { ...doc.config, reportFrom: '', reportTo: '', baselineTo: '2026-09-01' };
    const a = analyse(toPeriods(doc.rows, cfg), cfg);
    if (!isAnalysis(a)) throw new Error('analyse');
    expect(a.savings).toBeNull();
  });
});

describe('lecture de fichiers', () => {
  it('nombres et dates à la française et numéros de série Excel', () => {
    expect(parseNumber('1 234,5')).toBeCloseTo(1234.5);
    expect(parseDate('03/02/2025')).toBe('2025-02-03');
    expect(parseDate('2025-02')).toBe('2025-02-01');
    expect(parseDate(45700)).toBe('2025-02-12'); // 12/02/2025
    expect(parseDate('hier')).toBeNull();
  });
  it('CSV avec point-virgule : colonnes reconnues', () => {
    const m = csvToMatrix('Date;Énergie (kWh);Tmin;Tmax\n01/01/2025;1 200,5;-1;5\n02/01/2025;1300;0;6\n');
    const { rows, issues } = parseTable(m);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ date: '2025-01-01', kwh: 1200.5, tmin: -1, tmax: 5 });
    expect(issues.some((i) => i.level === 'erreur')).toBe(false);
  });
  it('colonne d’énergie absente : erreur explicite', () => {
    const { issues } = parseTable([['Date', 'Autre'], ['01/01/2025', 3]]);
    expect(issues.some((i) => i.level === 'erreur' && /énergie/i.test(i.message))).toBe(true);
  });
});

describe('données réelles des TD du cours (Saint-Étienne)', () => {
  it('DJU recalculés = DJU du corrigé du TD n°5 exercice 3 (mois de la saison de chauffe)', () => {
    // Corrigé DJ.xlsx : janv. 425,1 ; fév. 367,9 ; mars 279,77 ; avril 236,79 ; nov. 290,77 ; déc. 382,8 (base 18 °C).
    const rows = lignesMensuelles(TD5_EX3, 18);
    [0, 1, 2, 3, 10, 11].forEach((i) => expect(rows[i].dju!).toBeCloseTo(TD5_EX3.djuCours[i], 1));
    // Hors saison le corrigé met les DJU à zéro ; l'outil le fait via la saison de chauffe.
    expect(TD5_EX3.djuCours[6]).toBe(0);
    expect(rows[6].dju!).toBeGreaterThan(0);
  });
  it('saison de chauffe : mois de la saison, y compris à cheval sur l’année', () => {
    expect(inSeason(11, { debut: 11, fin: 4 })).toBe(true); expect(inSeason(2, { debut: 11, fin: 4 })).toBe(true); expect(inSeason(7, { debut: 11, fin: 4 })).toBe(false);
    expect(inSeason(6, { debut: 4, fin: 9 })).toBe(true); expect(inSeason(1, { debut: 4, fin: 9 })).toBe(false);
    expect(inSeason(7, undefined)).toBe(true);
  });
  it('réseau de chaleur 2023 : talon quasi nul, pente voisine du ratio kWh/DJU du cours', () => {
    const doc = exempleReseauChaleur();
    const ps = toPeriods(doc.rows, doc.config);
    expect(ps.slice(4, 10).every((p) => p.dju === 0)).toBe(true);
    const a = analyse(ps, doc.config);
    if (!isAnalysis(a)) throw new Error('analyse');
    const ratioCours = ps.reduce((s, p) => s + p.kwh, 0) / ps.reduce((s, p) => s + p.dju, 0); // Σ kWh / Σ DJU ≈ 692
    expect(ratioCours).toBeGreaterThan(690); expect(ratioCours).toBeLessThan(695);
    expect(a.fit.coef[1]).toBeGreaterThan(ratioCours * 0.9); expect(a.fit.coef[1]).toBeLessThan(ratioCours * 1.05);
    expect(Math.abs(a.fit.coef[0])).toBeLessThan(0.02 * a.fit.mean);
    expect(a.fit.r2).toBeGreaterThan(0.97);
    expect(a.parts.part).toBeGreaterThan(97);
    expect(a.checks.filter((c) => c.level === 'ko')).toHaveLength(0);
  });
  it('bâtiment au gaz 2022-23 : talon positif (ECS), sensibilité positive, qualité moyenne signalée', () => {
    const doc = exempleBatimentGaz();
    const a = analyse(toPeriods(doc.rows, doc.config), doc.config);
    if (!isAnalysis(a)) throw new Error('analyse');
    expect(a.fit.coef[0]).toBeGreaterThan(1000); expect(a.fit.coef[1]).toBeGreaterThan(100); expect(a.fit.coef[1]).toBeLessThan(150);
    expect(a.fit.r2).toBeGreaterThan(0.8);
    expect(a.checks.find((c) => c.id === 'cv')!.level).toBe('warn'); // CV(RMSE) ≈ 40 % : dispersion forte, dite
  });
});

describe('incertitude : facteur d’autocorrélation', () => {
  const lcg = (seed: number) => { let x = seed >>> 0; return () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 4294967296 - 0.5; }; };
  const make = (rho: number): Row[] => {
    const r = lcg(99); let e = 0;
    return Array.from({ length: 160 }, (_, i) => {
      e = rho * e + r() * 60;
      const d = new Date(2025, 0, 1 + i, 12);
      return { date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, kwh: 1000 + 50 * ((i * 13) % 17) + e, dju: (i * 13) % 17 };
    });
  };
  const cfg = (rows: Row[]): Config => ({ ...defaultConfig(), grain: 'brut', baselineFrom: rows[0].date, baselineTo: rows[119].date, reportFrom: rows[120].date, reportTo: rows[159].date });
  it('écarts indépendants : facteur plancher 1,26', () => {
    const rows = make(0); const c = cfg(rows);
    const a = analyse(toPeriods(rows, c), c);
    if (!isAnalysis(a)) throw new Error('analyse');
    expect(a.autocorr).toBeLessThan(0.3); expect(a.factor).toBeCloseTo(1.26, 12);
  });
  it('écarts fortement autocorrélés (ρ ≈ 0,8) : facteur √((1+ρ)/(1−ρ)) et incertitude majorée', () => {
    const rows = make(0.8); const c = cfg(rows);
    const a = analyse(toPeriods(rows, c), c);
    if (!isAnalysis(a)) throw new Error('analyse');
    expect(a.autocorr).toBeGreaterThan(0.6); expect(a.autocorr).toBeLessThan(0.95);
    expect(a.factor).toBeCloseTo(Math.sqrt((1 + a.autocorr) / (1 - a.autocorr)), 12); expect(a.factor).toBeGreaterThan(2);
    expect(a.savings!.U).toBeCloseTo(a.factor * a.tCrit * a.fit.rmse * Math.sqrt(a.suiviN * (1 + 2 / a.fit.n)), 6);
    expect(a.checks.some((c2) => c2.id === 'autocorr')).toBe(true);
  });
});
