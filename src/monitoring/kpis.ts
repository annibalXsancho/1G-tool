// Indicateurs de base d'une courbe de charge. Pur. Chaque indicateur est défini dans le commentaire qui le précède.
import { dailyEnergy, dayKey, isWeekend, loadDuration, medianStep, quantile, slice, totalCurve } from './series';
import type { Measure } from './types';

/** Plage d'occupation : jours ouvrés de `from` h à `to` h (heure locale). Hors de cette plage et le week-end : « hors occupation ». */
export type Occupation = { from: number; to: number };
export const DEFAULT_OCCUPATION: Occupation = { from: 8, to: 19 };
export const isOccupied = (ms: number, o: Occupation): boolean => { if (isWeekend(ms)) return false; const h = new Date(ms).getHours(); return h >= o.from && h < o.to; };

export type Kpis = {
  /** Énergie (kWh) = Σ puissance × pas. */
  energy: number;
  /** Pointe : puissance maximale du total (kW) et instant. */
  peak: number; peakAt: Date | null;
  /** Puissance moyenne (kW) et facteur de charge = moyenne / pointe (%). */
  mean: number; loadFactor: number;
  /** Talon : 5e centile de la puissance (kW), c'est-à-dire la charge qui ne s'arrête jamais ; part du talon dans la moyenne (%). */
  baseLoad: number; baseShare: number;
  /** Puissance minimale (kW). */
  min: number;
  /** Durée d'utilisation de la pointe = énergie / pointe (h) : combien d'heures à pleine puissance pour consommer la période. */
  utilisationHours: number;
  /** Rapport pointe / 95e centile : mesure d'une pointe isolée (proche de 1 = charge régulière, élevé = pointe écrêtable). */
  peakiness: number;
  /** Énergie hors occupation (nuits, week-ends) en kWh et en % du total. */
  offEnergy: number; offShare: number;
  /** Énergie des week-ends en % du total. */
  weekendShare: number;
  days: number;
};

export function kpis(rows: Measure[], stepHours: number, occ: Occupation = DEFAULT_OCCUPATION): Kpis {
  const curve = totalCurve(rows);
  if (!curve.length) return { energy: 0, peak: 0, peakAt: null, mean: 0, loadFactor: 0, baseLoad: 0, baseShare: 0, min: 0, utilisationHours: 0, peakiness: 0, offEnergy: 0, offShare: 0, weekendShare: 0, days: 0 };
  let peak = -Infinity; let peakAt: number | null = null; let sum = 0; let min = Infinity; let off = 0; let we = 0;
  for (const p of curve) {
    sum += p.kw; if (p.kw > peak) { peak = p.kw; peakAt = p.t; } if (p.kw < min) min = p.kw;
    if (!isOccupied(p.t, occ)) off += p.kw * stepHours;
    if (isWeekend(p.t)) we += p.kw * stepHours;
  }
  const energy = sum * stepHours; const mean = sum / curve.length;
  const sorted = curve.map((p) => p.kw).sort((a, b) => a - b);
  const base = quantile(sorted, 0.05); const p95 = quantile(sorted, 0.95);
  return {
    energy, peak, peakAt: peakAt === null ? null : new Date(peakAt), mean, loadFactor: peak ? (mean / peak) * 100 : 0,
    baseLoad: base, baseShare: mean ? (base / mean) * 100 : 0, min, utilisationHours: peak ? energy / peak : 0, peakiness: p95 ? peak / p95 : 0,
    offEnergy: off, offShare: energy ? (off / energy) * 100 : 0, weekendShare: energy ? (we / energy) * 100 : 0,
    days: new Set(curve.map((p) => dayKey(p.t))).size,
  };
}

/** Les n journées de plus forte pointe : une ligne par jour, jamais deux pointes de la même journée. */
export function topPeaks(rows: Measure[], n = 10): { day: string; at: Date; kw: number }[] {
  const best = new Map<string, { t: number; kw: number }>();
  for (const p of totalCurve(rows)) { const k = dayKey(p.t); const b = best.get(k); if (!b || p.kw > b.kw) best.set(k, p); }
  return [...best.entries()].map(([day, v]) => ({ day, at: new Date(v.t), kw: v.kw })).sort((a, b) => b.kw - a.kw).slice(0, n);
}

/** Période de même durée juste avant [from, to] (jours inclus) : sert aux écarts d'indicateurs. */
export function previousPeriod(rows: Measure[], from: number, to: number, sites?: string[] | null): Measure[] {
  const span = to + 86400000 - from;
  return slice(rows, from - span, from - 86400000, sites);
}

export type Delta = { abs: number; pct: number };
/** Écart entre deux valeurs : absolu et relatif (NaN si la référence est nulle). */
export const delta = (cur: number, prev: number): Delta => ({ abs: cur - prev, pct: prev ? ((cur - prev) / prev) * 100 : NaN });

/** Consommation spécifique : énergie rapportée à une grandeur d'activité (surface, production, nuitées…). */
export const specific = (energyKwh: number, denominator: number): number => (denominator > 0 ? energyKwh / denominator : NaN);

/** Résumé quotidien utile à la lecture : énergie des jours ouvrés et de week-end (moyenne), pour chiffrer la veille. */
export function dayTypeEnergy(rows: Measure[], stepHours: number): { ouvre: number; we: number; ratio: number } {
  const days = dailyEnergy(rows, stepHours).filter((d) => d.complete);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
  const ouvre = avg(days.filter((d) => !isWeekend(d.t)).map((d) => d.kwh)); const we = avg(days.filter((d) => isWeekend(d.t)).map((d) => d.kwh));
  return { ouvre, we, ratio: ouvre ? we / ouvre : NaN };
}

export { loadDuration, medianStep };
