// Séries temporelles : pas de mesure, filtrage, agrégation, monotone, carte de chaleur, profils types, énergie journalière. Pur.
import type { Freq, Measure } from './types';

const pad = (n: number) => String(n).padStart(2, '0');
export const dayKey = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
export const dayStart = (ms: number) => { const d = new Date(ms); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };
export const addDaysMs = (ms: number, n: number) => { const d = new Date(ms); return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes()).getTime(); };
const DAY = 86400000;

/** Durée d'un pas, en heures : écart médian entre deux points d'un même compteur (la médiane ignore les trous). */
export function medianStep(rows: Measure[]): number {
  const bySite = new Map<string, number[]>();
  for (const r of rows) { const a = bySite.get(r.site); if (a) a.push(r.t); else bySite.set(r.site, [r.t]); }
  const deltas: number[] = [];
  for (const ts of bySite.values()) for (let i = 1; i < ts.length && deltas.length < 5000; i++) { const d = ts[i] - ts[i - 1]; if (d > 0) deltas.push(d); }
  if (!deltas.length) return 1;
  deltas.sort((a, b) => a - b);
  return deltas[Math.floor(deltas.length / 2)] / 3600000 || 1;
}

export const sitesOf = (rows: Measure[]) => [...new Set(rows.map((r) => r.site))].sort((a, b) => a.localeCompare(b, 'fr'));

/** Restreint aux compteurs cochés et à la période (bornes de jour incluses). */
export function slice(rows: Measure[], from: number | null, to: number | null, sites?: string[] | null): Measure[] {
  const a = from ?? -Infinity; const b = to === null ? Infinity : to + DAY;
  const keep = sites && sites.length ? new Set(sites) : null;
  return rows.filter((r) => r.t >= a && r.t < b && (!keep || keep.has(r.site)));
}

export function bucketStart(ms: number, freq: Freq): number {
  const d = new Date(ms);
  if (freq === 'h') return new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()).getTime();
  if (freq === 'D') return dayStart(ms);
  if (freq === 'W') return new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7)).getTime();
  if (freq === 'M') return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  return ms;
}

export type Agg = { t: number; site: string; kw: number; peak: number; kwh: number };
/** Regroupe par tranche de temps et par compteur : puissance moyenne, pointe, énergie. */
export function aggregate(rows: Measure[], freq: Freq, stepHours: number): Agg[] {
  const g = new Map<string, { t: number; site: string; sum: number; peak: number; n: number }>();
  for (const r of rows) {
    const t = bucketStart(r.t, freq); const key = `${t} ${r.site}`;
    let c = g.get(key);
    if (!c) { c = { t, site: r.site, sum: 0, peak: -Infinity, n: 0 }; g.set(key, c); }
    c.sum += r.kw; c.n++; if (r.kw > c.peak) c.peak = r.kw;
  }
  return [...g.values()].map((c) => ({ t: c.t, site: c.site, kw: c.sum / c.n, peak: c.peak, kwh: c.sum * stepHours })).sort((a, b) => a.t - b.t || a.site.localeCompare(b.site, 'fr'));
}

/** Puissance totale, tous compteurs confondus, instant par instant. */
export function totalCurve(rows: Measure[]): { t: number; kw: number }[] {
  const m = new Map<number, number>();
  for (const r of rows) m.set(r.t, (m.get(r.t) || 0) + r.kw);
  return [...m.entries()].map(([t, kw]) => ({ t, kw })).sort((a, b) => a.t - b.t);
}

/** Monotone de charge : puissances triées et % du temps où elles sont atteintes ou dépassées. */
export function loadDuration(rows: Measure[]): { share: number; kw: number }[] {
  const v = totalCurve(rows).map((p) => p.kw).sort((a, b) => b - a);
  return v.map((kw, i) => ({ share: ((i + 1) / v.length) * 100, kw }));
}

/** Carte de chaleur : heures (lignes) × jours (colonnes). */
export function heatMatrix(rows: Measure[]) {
  const cells = new Map<string, { sum: number; n: number }>(); const days = new Set<number>();
  for (const p of totalCurve(rows)) {
    const d = new Date(p.t); const day = dayStart(p.t); days.add(day);
    const k = `${day} ${d.getHours()}`; const c = cells.get(k) || { sum: 0, n: 0 };
    c.sum += p.kw; c.n++; cells.set(k, c);
  }
  const dayList = [...days].sort((a, b) => a - b);
  const hours = Array.from({ length: 24 }, (_, h) => h);
  return { days: dayList, hours, z: hours.map((h) => dayList.map((day) => { const c = cells.get(`${day} ${h}`); return c ? c.sum / c.n : null; })) };
}

export const isWeekend = (ms: number) => { const g = new Date(ms).getDay(); return g === 0 || g === 6; };

const quantile = (sorted: number[], q: number) => { if (!sorted.length) return NaN; const i = (sorted.length - 1) * q; const lo = Math.floor(i); const hi = Math.ceil(i); return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo); };
export { quantile };

export type Profile = { hours: number[]; mean: number[]; p10: number[]; p90: number[]; days: number };
/** Profil horaire type d'un jour ouvré ou de week-end : moyenne et bande 10 %-90 % sur les jours observés. */
export function typicalProfile(rows: Measure[], kind: 'ouvre' | 'we'): Profile {
  const hourDay = new Map<string, number[]>(); // « jour h » → puissances totales
  for (const p of totalCurve(rows)) {
    if (isWeekend(p.t) !== (kind === 'we')) continue;
    const k = `${dayStart(p.t)} ${new Date(p.t).getHours()}`;
    const a = hourDay.get(k); if (a) a.push(p.kw); else hourDay.set(k, [p.kw]);
  }
  const perHour: number[][] = Array.from({ length: 24 }, () => []);
  const daySet = new Set<number>();
  for (const [k, v] of hourDay) { const [d, h] = k.split(' ').map(Number); perHour[h].push(v.reduce((a, b) => a + b, 0) / v.length); daySet.add(d); }
  const hours = Array.from({ length: 24 }, (_, h) => h);
  const sorted = perHour.map((a) => [...a].sort((x, y) => x - y));
  return { hours, mean: perHour.map((a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN)), p10: sorted.map((a) => quantile(a, 0.1)), p90: sorted.map((a) => quantile(a, 0.9)), days: daySet.size };
}

export type Day = { day: string; t: number; kwh: number; peak: number; mean: number; n: number; complete: boolean };
/** Énergie par journée (tous les compteurs retenus). Une journée est complète si elle porte au moins 90 % des mesures attendues. */
export function dailyEnergy(rows: Measure[], stepHours: number): Day[] {
  const perStamp = new Map<number, number>();
  for (const r of rows) perStamp.set(r.t, (perStamp.get(r.t) || 0) + r.kw);
  const g = new Map<string, Day>();
  for (const [t, kw] of perStamp) {
    const key = dayKey(t); let d = g.get(key);
    if (!d) { d = { day: key, t: dayStart(t), kwh: 0, peak: -Infinity, mean: 0, n: 0, complete: false }; g.set(key, d); }
    d.kwh += kw * stepHours; d.n++; d.mean += kw; if (kw > d.peak) d.peak = kw;
  }
  const expected = Math.round(24 / stepHours);
  return [...g.values()].map((d) => ({ ...d, mean: d.mean / d.n, complete: d.n >= 0.9 * expected })).sort((a, b) => a.t - b.t);
}
