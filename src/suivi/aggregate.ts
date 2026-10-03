// Agrégation des relevés journaliers en périodes (semaine, mois) avec leurs degrés-jours. Pur.
// Les périodes incomplètes sont écartées : une semaine de six jours pesée comme sept se placerait sous la droite
// (même règle que weekly() dans js/weather.js du tableau de bord).
import { coolingDegreeDay, heatingDegreeDay } from './dju';
import type { Config, Period, Row } from './model';

const pad = (n: number) => String(n).padStart(2, '0');
export const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** Date locale à midi : insensible aux changements d'heure. */
export const parseDay = (s: string) => { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d, 12); };
export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12);
export const daysInMonth = (y: number, m: number) => new Date(y, m, 0).getDate();

export function rowDegreeDays(r: Row, base: number): { dju: number; djr: number } {
  const have = Number.isFinite(r.tmin) && Number.isFinite(r.tmax);
  return {
    dju: Number.isFinite(r.dju) ? (r.dju as number) : have ? heatingDegreeDay(r.tmin as number, r.tmax as number, base) : 0,
    djr: Number.isFinite(r.djr) ? (r.djr as number) : have ? coolingDegreeDay(r.tmin as number, r.tmax as number, base) : 0,
  };
}

export function toPeriods(rows: Row[], cfg: Pick<Config, 'grain' | 'base'>): Period[] {
  const sorted = [...rows].filter((r) => /^\d{4}-\d{2}-\d{2}/.test(r.date) && Number.isFinite(r.kwh)).sort((a, b) => a.date.localeCompare(b.date));
  if (cfg.grain === 'brut' || cfg.grain === 'jour') {
    return sorted.map((r) => ({ id: r.date.slice(0, 10), start: r.date.slice(0, 10), days: r.jours ?? 1, kwh: r.kwh, ...rowDegreeDays(r, cfg.base), x: r.x ?? 0 }));
  }
  const groups = new Map<string, Period & { n: number }>();
  for (const r of sorted) {
    const d = parseDay(r.date);
    let key: string; let start: string;
    if (cfg.grain === 'mois') { key = start = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`; } else {
      const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7), 12);
      key = start = isoDate(monday);
    }
    let g = groups.get(key);
    if (!g) { g = { id: key, start, days: 0, kwh: 0, dju: 0, djr: 0, x: 0, n: 0 }; groups.set(key, g); }
    const dd = rowDegreeDays(r, cfg.base);
    g.kwh += r.kwh; g.dju += dd.dju; g.djr += dd.djr; g.x += r.x ?? 0; g.n += 1; g.days += r.jours ?? 1;
  }
  const out: Period[] = [];
  for (const g of groups.values()) {
    const d = parseDay(g.start);
    const expected = cfg.grain === 'mois' ? daysInMonth(d.getFullYear(), d.getMonth() + 1) : 7;
    if (g.n < expected) continue; // période incomplète
    const { n: _n, ...p } = g; void _n;
    out.push(p);
  }
  return out.sort((a, b) => a.start.localeCompare(b.start));
}
