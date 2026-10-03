// Simulation IPMVP sur une courbe de charge réelle. Pur.
//
// Principe : on applique à la courbe MESURÉE une action dont l'économie est connue exactement (la « vérité »), puis on
// la mesure comme le ferait un plan de M&V (options A, B, C de l'IPMVP) et on compare. On apprend ainsi, sur le site même,
// si la méthode retrouve la vérité, avec quelle incertitude, et quelle économie elle ne pourrait jamais détecter.
//   Option A : isolation du périmètre, paramètre clé mesuré, le reste stipulé (heures de fonctionnement).
//   Option B : isolation du périmètre, tous les paramètres mesurés (sous-compteur, régression sur ce compteur).
//   Option C : installation entière, régression du compteur général sur la météo et l'activité.
//   Option D (simulation calibrée) : hors périmètre de cet outil.
// TODO: source à vérifier (IPMVP Core Concepts : définitions des options ; ASHRAE Guideline 14 : incertitude).
import { analyse, isAnalysis, type Analysis } from '@/suivi/analyse';
import { addDays, isoDate, parseDay } from '@/suivi/aggregate';
import { defaultConfig, type Config, type Grain, type Regressor, type Row } from '@/suivi/model';
import { tCritical, type Confidence } from '@/suivi/regress';
import { DEFAULT_OCCUPATION, isOccupied, type Occupation } from './kpis';
import { dailyEnergy, dayStart, sitesOf } from './series';
import type { Measure } from './types';

export type Temps = Map<string, { tmin: number; tmax: number }>;

// ---------------------------------------------------------------- action
export type Action =
  | { kind: 'pct'; pct: number }
  | { kind: 'kw'; kw: number }
  | { kind: 'horsOccupation'; pct: number }
  | { kind: 'ecretage'; capKw: number };

export const ACTION_LABEL: Record<Action['kind'], string> = {
  pct: 'Réduction de x % de la charge',
  kw: 'Réduction constante de x kW (talon)',
  horsOccupation: 'Réduction de x % hors occupation (nuits, week-ends)',
  ecretage: 'Écrêtage : plafonner chaque compteur à x kW',
};

export type ActionConfig = { action: Action; /** Début de l'action (ms). */ from: number; /** Compteurs concernés ; null = tous. */ sites: string[] | null };

/** Applique l'action aux mesures postérieures à `from` et chiffre exactement l'économie (kWh). */
export function applyAction(rows: Measure[], cfg: ActionConfig, stepHours: number, occ: Occupation = DEFAULT_OCCUPATION): { rows: Measure[]; trueKwh: number } {
  const target = cfg.sites && cfg.sites.length ? new Set(cfg.sites) : null;
  let saved = 0;
  const out = rows.map((r) => {
    if (r.t < cfg.from || (target && !target.has(r.site))) return r;
    const a = cfg.action; let kw = r.kw;
    switch (a.kind) {
      case 'pct': kw = r.kw * (1 - a.pct / 100); break;
      case 'kw': kw = Math.max(0, r.kw - a.kw); break;
      case 'horsOccupation': if (!isOccupied(r.t, occ)) kw = r.kw * (1 - a.pct / 100); break;
      case 'ecretage': kw = Math.min(r.kw, a.capKw); break;
    }
    saved += (r.kw - kw) * stepHours;
    return kw === r.kw ? r : { ...r, kw };
  });
  return { rows: out, trueKwh: saved };
}

// ---------------------------------------------------------------- pont vers le module Suivi
/** Journées complètes → lignes du module Suivi (énergie du jour, températures si connues). */
export function dailyRows(rows: Measure[], stepHours: number, temps?: Temps): Row[] {
  return dailyEnergy(rows, stepHours).filter((d) => d.complete).map((d) => {
    const t = temps?.get(d.day);
    return t ? { date: d.day, kwh: d.kwh, tmin: t.tmin, tmax: t.tmax } : { date: d.day, kwh: d.kwh };
  });
}

export type MVConfig = {
  /** Premier jour de la période de suivi (ms) ; la référence va du premier jour du relevé à la veille. */
  from: number;
  grain: Grain;
  regressors: Regressor[];
  base: number;
  confidence: Confidence;
  saison?: Config['saison'];
};

/** Aligne le début du suivi sur un début de période (lundi pour la semaine, 1er du mois pour le mois) : une période ne peut pas être à la fois référence et suivi. */
export function alignStart(from: number, grain: Grain): number {
  const d0 = dayStart(from); const d = new Date(d0);
  if (grain === 'mois') return d.getDate() === 1 ? d0 : new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
  if (grain === 'semaine') { const w = (d.getDay() + 6) % 7; return w === 0 ? d0 : new Date(d.getFullYear(), d.getMonth(), d.getDate() + (7 - w)).getTime(); }
  return d0;
}

/** Mesure et vérification d'un plan M&V (régression) sur ces mesures : référence avant `from`, suivi après. */
export function runMV(rows: Measure[], stepHours: number, temps: Temps | undefined, mv: MVConfig): Analysis | { errors: string[] } {
  const data = dailyRows(rows, stepHours, temps);
  if (data.length < 10) return { errors: ['Moins de 10 journées complètes : relevé trop court pour un modèle.'] };
  const from = alignStart(mv.from, mv.grain);
  const cfg: Config = {
    ...defaultConfig(), grain: mv.grain, base: mv.base, regressors: mv.regressors, confidence: mv.confidence, saison: mv.saison,
    baselineFrom: data[0].date, baselineTo: isoDate(addDays(parseDay(isoDate(new Date(from))), -1)),
    reportFrom: isoDate(new Date(from)), reportTo: data[data.length - 1].date,
  };
  return analyse(toPeriodsOf(data, cfg), cfg);
}
import { toPeriods } from '@/suivi/aggregate';
const toPeriodsOf = (rows: Row[], cfg: Config) => toPeriods(rows, cfg);

// ---------------------------------------------------------------- options A, B, C
export type OptionResult = { option: 'A' | 'B' | 'C'; label: string; estimate: number; U: number; error: number; errorPct: number; within: boolean; note: string };

/** Option A : économie = ΔP mesurée × durée stipulée. Incertitude composée en quadrature (puissance mesurée, durée stipulée). */
export function optionA(o: { dpKw: number; hours: number; uPowerPct: number; uHoursPct: number; confidence?: Confidence }) {
  const saving = o.dpKw * o.hours;
  const rel = Math.sqrt((o.uPowerPct / 100) ** 2 + (o.uHoursPct / 100) ** 2);
  const z = { 0.8: 1.282, 0.9: 1.645, 0.95: 1.96 }[o.confidence ?? 0.9];
  // Les incertitudes saisies sont des écarts-types relatifs ; au niveau de confiance choisi on les multiplie par z.
  return { saving, U: Math.abs(saving) * rel * z, relative: rel * z };
}

export type MVSimulation = {
  trueKwh: number;
  options: OptionResult[];
  analysisC: Analysis | null;
  analysisB: Analysis | null;
  errors: string[];
};

export type SimOptions = { mv: MVConfig; action: ActionConfig; occ?: Occupation; temps?: Temps; stipulation: { hoursShare: number; uPowerPct: number; uHoursPct: number; spotDays: number } };

export function simulateMV(rows: Measure[], stepHours: number, o: SimOptions): MVSimulation {
  const occ = o.occ ?? DEFAULT_OCCUPATION;
  const { rows: mod, trueKwh } = applyAction(rows, o.action, stepHours, occ);
  const errors: string[] = [];
  const mk = (option: OptionResult['option'], label: string, est: number, U: number, note: string): OptionResult => ({ option, label, estimate: est, U, error: est - trueKwh, errorPct: trueKwh ? ((est - trueKwh) / trueKwh) * 100 : NaN, within: Math.abs(est - trueKwh) <= U, note });
  const options: OptionResult[] = [];

  const C = runMV(mod, stepHours, o.temps, o.mv);
  let analysisC: Analysis | null = null;
  if (isAnalysis(C) && C.savings) { analysisC = C; options.push(mk('C', 'Option C : installation entière', C.savings.total, C.savings.U, `Régression du compteur général (${C.fit.n} périodes de référence, R² ${C.fit.r2.toFixed(3).replace('.', ',')}).`)); }
  else errors.push(`Option C : ${isAnalysis(C) ? 'aucune période de suivi.' : C.errors.join(' ')}`);

  const target = o.action.sites && o.action.sites.length ? o.action.sites : null;
  let analysisB: Analysis | null = null;
  if (target) {
    const sub = mod.filter((r) => target.includes(r.site));
    const B = runMV(sub, stepHours, o.temps, o.mv);
    if (isAnalysis(B) && B.savings) { analysisB = B; options.push(mk('B', `Option B : sous-compteur (${target.join(', ')})`, B.savings.total, B.savings.U, `Régression sur le périmètre isolé (R² ${B.fit.r2.toFixed(3).replace('.', ',')}) : le bruit des autres usages disparaît.`)); }
    else errors.push(`Option B : ${isAnalysis(B) ? 'aucune période de suivi.' : B.errors.join(' ')}`);
  } else errors.push('Option B : choisissez un ou plusieurs compteurs pour isoler le périmètre (sinon elle se confond avec l’option C).');

  // Option A : mesure ponctuelle de la puissance moyenne du périmètre sur `spotDays` jours avant puis après l'action, durée stipulée.
  const scope = (rs: Measure[]) => rs.filter((r) => !target || target.includes(r.site));
  const spot = o.stipulation.spotDays * 86400000;
  const before = scope(rows).filter((r) => r.t >= o.action.from - spot && r.t < o.action.from);
  const after = scope(mod).filter((r) => r.t >= o.action.from && r.t < o.action.from + spot);
  const meanKw = (rs: Measure[]) => { const s = new Map<number, number>(); for (const r of rs) s.set(r.t, (s.get(r.t) || 0) + r.kw); return s.size ? [...s.values()].reduce((a, b) => a + b, 0) / s.size : NaN; };
  const pB = meanKw(before); const pA = meanKw(after);
  const endT = rows.length ? rows[rows.length - 1].t + stepHours * 3600000 : o.action.from;
  const hours = Math.max(0, (endT - o.action.from) / 3600000) * o.stipulation.hoursShare;
  if (Number.isFinite(pB) && Number.isFinite(pA) && hours > 0) {
    const a = optionA({ dpKw: pB - pA, hours, uPowerPct: o.stipulation.uPowerPct, uHoursPct: o.stipulation.uHoursPct, confidence: o.mv.confidence });
    options.push(mk('A', 'Option A : mesure ponctuelle et durée stipulée', a.saving, a.U, `ΔP = ${(pB - pA).toFixed(1).replace('.', ',')} kW mesuré sur ${o.stipulation.spotDays} j, × ${Math.round(hours)} h stipulées. Ne voit ni la météo ni l'activité.`));
  } else errors.push('Option A : pas assez de mesures avant ou après l’action.');
  return { trueKwh, options, analysisC, analysisB, errors };
}

// ---------------------------------------------------------------- puissance de détection (Monte-Carlo)
function mulberry32(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export type Detection = {
  fractions: number[];
  /** Probabilité de détecter l'économie (économie estimée > incertitude) pour chaque fraction vraie. */
  power: number[];
  /** Taux de fausse alarme à économie nulle (|estimée| > incertitude). */
  falseAlarm: number;
  /** Économie minimale détectable (fraction de l'énergie attendue) : U / énergie attendue, pour m périodes. */
  minDetectable: number;
  /** Incertitude absolue (kWh) sur m périodes. */
  U: number;
  expectedPerPeriod: number;
};

/** Simule `trials` suivis de `m` périodes : attendu et résidus rééchantillonnés dans la référence, économie vraie s × attendu. */
export function detectionPower(a: Analysis, o: { m: number; fractions: number[]; trials: number; seed?: number; block?: number }): Detection {
  const ref = a.lines.filter((l) => l.role === 'reference');
  const n = ref.length;
  const factor = a.factor;
  const tc = tCritical(a.fit.dof, 0.9 as Confidence);
  const rand = mulberry32(o.seed ?? 12345);
  const m = Math.max(1, Math.round(o.m));
  const U = factor * tc * a.fit.rmse * Math.sqrt(m * (1 + 2 / n));
  const meanExp = ref.reduce((s, l) => s + l.expected, 0) / n;
  // Rééchantillonnage par blocs : des écarts consécutifs sont tirés ensemble, ce qui conserve leur autocorrélation.
  const L = Math.max(1, Math.min(n, o.block ?? Math.ceil(2 / (1 - a.autocorr))));
  const trial = (s: number) => {
    let est = 0; let i = 0;
    while (i < m) {
      const e0 = Math.floor(rand() * n); const r0 = Math.floor(rand() * Math.max(1, n - L + 1));
      for (let j = 0; j < L && i < m; j++, i++) { const e = ref[(e0 + j) % n].expected; const r = ref[Math.min(n - 1, r0 + j)].residual; est += e - (e * (1 - s) + r); }
    }
    return est;
  };
  const power = o.fractions.map((s) => { let hit = 0; for (let k = 0; k < o.trials; k++) if (trial(s) > U) hit++; return hit / o.trials; });
  let fa = 0; for (let k = 0; k < o.trials; k++) if (Math.abs(trial(0)) > U) fa++;
  return { fractions: o.fractions, power, falseAlarm: fa / o.trials, minDetectable: U / (meanExp * m), U, expectedPerPeriod: meanExp };
}

/** Nombre de périodes de suivi pour qu'une économie de fraction `s` dépasse l'incertitude : m > (1,26·t·RMSE / (s·Ē))² · (1 + 2/n). */
export function periodsNeeded(a: Analysis, s: number, confidence: Confidence = 0.9): number {
  const ref = a.lines.filter((l) => l.role === 'reference');
  const meanExp = ref.reduce((x, l) => x + l.expected, 0) / ref.length;
  if (!(s > 0) || !(meanExp > 0)) return Infinity;
  const k = (a.factor * tCritical(a.fit.dof, confidence) * a.fit.rmse) / (s * meanExp);
  return Math.ceil(k * k * (1 + 2 / ref.length));
}

// ---------------------------------------------------------------- cartes de contrôle
export type Alarm = { index: number; kind: '3 sigma' | '2 sigma' | 'série' | 'CUSUM+' | 'CUSUM−' };
export type ControlChart = { z: number[]; cplus: number[]; cminus: number[]; alarms: Alarm[]; sigma: number };

/** Cartes de contrôle des résidus du modèle de référence : Shewhart (±2σ, ±3σ), série de 8 résidus de même signe, CUSUM tabulaire
 *  (k = 0,5σ, h = 5σ). Les limites sont calculées sur la référence ; sur la référence elle-même elles donnent le taux de fausses alarmes. */
export function controlChart(a: Analysis, o: { k?: number; h?: number; run?: number } = {}): ControlChart {
  const k = o.k ?? 0.5; const h = o.h ?? 5; const runLen = o.run ?? 8;
  const sigma = a.fit.rmse;
  const z = a.lines.map((l) => (sigma > 0 ? l.residual / sigma : 0));
  const cplus: number[] = []; const cminus: number[] = []; const alarms: Alarm[] = [];
  let cp = 0; let cm = 0; let run = 0; let sign = 0;
  z.forEach((v, i) => {
    // Un résidu positif = surconsommation (mesuré > attendu).
    cp = Math.max(0, cp + v - k); cm = Math.max(0, cm - v - k);
    cplus.push(cp); cminus.push(cm);
    if (Math.abs(v) > 3) alarms.push({ index: i, kind: '3 sigma' }); else if (Math.abs(v) > 2) alarms.push({ index: i, kind: '2 sigma' });
    const s = Math.sign(v); if (s !== 0 && s === sign) run++; else { run = s === 0 ? 0 : 1; sign = s; }
    if (run === runLen) alarms.push({ index: i, kind: 'série' });
    if (cp > h) { alarms.push({ index: i, kind: 'CUSUM+' }); cp = 0; }
    if (cm > h) { alarms.push({ index: i, kind: 'CUSUM−' }); cm = 0; }
  });
  return { z, cplus, cminus, alarms, sigma };
}

export { sitesOf };
