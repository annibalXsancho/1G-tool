// Lecture d'un relevé de puissance (CSV ou feuille Excel) : séparateur deviné, nombres à la française, dates locales,
// unité (W, kW, MW) devinée, plusieurs compteurs en colonnes. Pur. Porté du tableau de bord energy-dashboard (js/data.js).
// Règle d'or : l'énergie n'est jamais lue, elle vaut puissance × durée du pas. Une colonne de kWh ou d'index est écartée.
import type { Mapping, Measure, Table, Unit } from './types';

export class ReadError extends Error {}

const NUM_CLEAN = /[\s  ]/g;
export const UNITS: Record<Unit, number> = { W: 0.001, kW: 1, MW: 1000 };

export function splitLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let field = ''; let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) { if (c === '"' && line[i + 1] === '"') { field += '"'; i++; } else if (c === '"') quoted = false; else field += c; }
    else if (c === '"') quoted = true;
    else if (c === sep) { out.push(field); field = ''; } else field += c;
  }
  out.push(field);
  return out.map((f) => f.trim());
}

function sniff(headerLine: string): string {
  let best = ','; let bestN = 0;
  for (const sep of [',', ';', '\t']) { const n = splitLine(headerLine, sep).length; if (n > bestN) { bestN = n; best = sep; } }
  if (bestN < 2) throw new ReadError('Séparateur introuvable : le fichier n’a qu’une colonne.');
  return best;
}

export function toNumber(text: string | undefined): number {
  if (text === undefined || text === '') return NaN;
  return Number(String(text).replace(NUM_CLEAN, '').replace(',', '.'));
}

const ISO = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/;
const FR = /^(\d{2})\/(\d{2})\/(\d{4})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/;

/** Instant en ms, lu en heure LOCALE (jamais en UTC : `new Date('2026-06-01')` décalerait la journée). */
export function toTime(text: string, allowSerial = false): number {
  const s = String(text).trim();
  if (allowSerial) {
    const serial = Number(s.replace(',', '.'));
    if (Number.isFinite(serial) && serial > 20000 && serial < 80000) {
      const u = new Date(Math.round((serial - 25569) * 86400000));
      return new Date(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate(), u.getUTCHours(), u.getUTCMinutes(), u.getUTCSeconds()).getTime();
    }
  }
  let m = ISO.exec(s);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)).getTime();
  m = FR.exec(s);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)).getTime();
  if (!/[-/:]/.test(s)) return NaN; // « 45900.5 » ne doit pas devenir l'an 45900
  const fb = Date.parse(s);
  return Number.isNaN(fb) ? NaN : fb;
}

/** Texte CSV → en-tête + lignes de cellules, sans rien interpréter. */
export function readTable(text: string): Table {
  const clean = text.replace(/^﻿/, '').trim();
  if (!clean) throw new ReadError('Fichier vide.');
  const lines = clean.split(/\r?\n/);
  const sep = sniff(lines[0]);
  const header = splitLine(lines[0], sep).map((h) => h.replace(/^"|"$/g, '').trim());
  const rows = lines.slice(1).filter((l) => l.trim()).map((l) => splitLine(l, sep));
  if (!rows.length) throw new ReadError('Le fichier ne contient aucune ligne de données.');
  return { header, rows };
}

/** Feuille Excel déjà lue (matrice de cellules) → table de chaînes. Les dates deviennent « AAAA-MM-JJ hh:mm:ss » locales. */
export function tableFromMatrix(cells: (string | number | boolean | Date | null | undefined)[][]): Table {
  const pad = (n: number) => String(n).padStart(2, '0');
  const str = (c: unknown): string => (c instanceof Date ? `${c.getFullYear()}-${pad(c.getMonth() + 1)}-${pad(c.getDate())} ${pad(c.getHours())}:${pad(c.getMinutes())}:${pad(c.getSeconds())}` : c == null ? '' : String(c));
  const i0 = cells.findIndex((r) => r.some((c) => typeof c === 'string' && c.trim() !== ''));
  if (i0 < 0) throw new ReadError('Feuille vide.');
  const header = cells[i0].map((c) => str(c).trim());
  const rows = cells.slice(i0 + 1).filter((r) => r.some((c) => c != null && c !== '')).map((r) => header.map((_, j) => str(r[j])));
  if (!rows.length) throw new ReadError('La feuille ne contient aucune ligne de données.');
  return { header, rows };
}

const SAMPLE = 40;
function medianOf(table: Table, col: number): number | null {
  const v: number[] = [];
  for (const r of table.rows.slice(0, 300)) { const x = toNumber(r[col]); if (!Number.isNaN(x) && x > 0) v.push(x); }
  if (!v.length) return null;
  v.sort((a, b) => a - b);
  return v[Math.floor(v.length / 2)];
}

/** Unité d'une colonne : d'abord son intitulé, sinon l'ordre de grandeur (> 5 000 → watts : 26 MW n'existent pas sur un divisionnaire). */
export function detectUnit(headerCell: string, median: number | null = null): Unit {
  const h = String(headerCell).toLowerCase();
  if (/\bmw\b|\[mw\]|\(mw\)/.test(h)) return 'MW';
  if (/\bkw\b|\[kw\]|\(kw\)|_kw/.test(h)) return 'kW';
  if (/\[w\]|\(w\)|\bw\b|watt/.test(h)) return 'W';
  if (median !== null && median >= 5000) return 'W';
  return 'kW';
}
export const detectUnitFor = (t: Table, col: number): Unit => (col < 0 ? 'kW' : detectUnit(t.header[col] ?? '', medianOf(t, col)));

const looksLikeTime = (t: Table, c: number) => t.rows.slice(0, SAMPLE).filter((r) => !Number.isNaN(toTime(r[c] ?? ''))).length >= Math.min(3, t.rows.length);
const looksNumeric = (t: Table, c: number) => t.rows.slice(0, SAMPLE).filter((r) => !Number.isNaN(toNumber(r[c] ?? ''))).length >= Math.min(3, t.rows.length);
const distinct = (t: Table, c: number) => new Set(t.rows.slice(0, 500).map((r) => r[c])).size;

/** Devine le rôle des colonnes. -1 quand rien ne convient. Les colonnes d'énergie (kWh, index) sont écartées. */
export function autoMap(table: Table): Mapping {
  const lower = table.header.map((h) => h.toLowerCase());
  const find = (test: (h: string, i: number) => boolean) => lower.findIndex(test);
  let timestamp = find((h) => h === 'timestamp');
  if (timestamp === -1) timestamp = find((h) => /date|heure|time|horodat|période|periode/.test(h));
  if (timestamp === -1 || !looksLikeTime(table, timestamp)) timestamp = find((_h, i) => looksLikeTime(table, i));
  let site = find((h) => h === 'site');
  if (site === -1) site = find((h, i) => i !== timestamp && /site|lieu|compteur|meter|point|pdl|prm|bâtiment|batiment|nom/.test(h) && distinct(table, i) <= 40);
  const isEnergy = (h: string) => /kwh|k?wh\b|énergie|energie|consommation|index/.test(h);
  const isPowerName = (h: string) => /puissance|power/.test(h) || /\bkw\b|\(kw\)|\[kw\]|_kw|\bmw\b|\[mw\]|\[w\]|\(w\)|\bw\b/.test(h) || /\bp\b/.test(h);
  let powers = lower.map((h, i) => ({ h, i })).filter(({ h, i }) => i !== timestamp && !isEnergy(h) && isPowerName(h) && looksNumeric(table, i)).map(({ i }) => i);
  if (!powers.length) { const e = lower.indexOf('power_kw'); if (e >= 0) powers = [e]; }
  if (!powers.length) {
    const isTimePart = (h: string) => /année|annee|mois|jour|heure|year|month|day|hour|date|time/.test(h);
    const isOther = (h: string) => /temp|°c|cos ?phi|humid|prix|price|tarif|index|dju|cdd|hdd|tmin|tmax/.test(h);
    powers = lower.map((h, i) => ({ h, i })).filter(({ h, i }) => i !== timestamp && i !== site && !isEnergy(h) && !isTimePart(h) && !isOther(h) && looksNumeric(table, i)).map(({ i }) => i);
  }
  const first = powers[0] ?? -1;
  const name = first >= 0 ? String(table.header[first]).replace(/[[(][^\])]*[\])]/g, '').trim() : '';
  return { timestamp, power: powers, site, unit: first >= 0 ? detectUnit(table.header[first] ?? '', medianOf(table, first)) : 'kW', siteName: name };
}

/** Applique une désignation de colonnes et produit les mesures triées par instant. */
export function toMeasures(table: Table, m: Mapping): Measure[] {
  const powers = m.power.filter((i) => i >= 0);
  if (m.timestamp < 0 || !powers.length) throw new ReadError('Il faut au moins une colonne de date et une colonne de puissance.');
  const fallback = (m.siteName || '').trim() || 'Site';
  const factor = UNITS[m.unit] ?? 1;
  const cell = (cells: string[]) => String(cells[m.site] ?? '').replace(/^"|"$/g, '').trim();
  const varying = m.site >= 0 && new Set(table.rows.slice(0, 2000).map(cell)).size > 1;
  const rows: Measure[] = [];
  for (const cells of table.rows) {
    const t = toTime(cells[m.timestamp] ?? '', true);
    if (Number.isNaN(t)) continue;
    for (const col of powers) {
      const kw = toNumber(cells[col] ?? '') * factor;
      if (Number.isNaN(kw)) continue;
      let name: string;
      if (powers.length > 1) { const meter = String(table.header[col] ?? `Colonne ${col + 1}`).trim(); name = varying ? `${cell(cells)} · ${meter}` : meter; }
      else name = m.site >= 0 ? cell(cells) || fallback : fallback;
      rows.push({ t, site: name, kw });
    }
  }
  if (!rows.length) throw new ReadError('Aucune ligne exploitable : vérifiez les colonnes désignées (dates lisibles, puissances numériques).');
  rows.sort((a, b) => a.t - b.t);
  return rows;
}

/** Températures journalières : colonnes date, Tmin, Tmax (ou Tmoy). → Map « AAAA-MM-JJ » → { tmin, tmax }. */
export function readTemperatures(table: Table): { days: Map<string, { tmin: number; tmax: number }>; issues: string[] } {
  const low = table.header.map((h) => h.toLowerCase());
  const di = low.findIndex((h) => /date|jour|day/.test(h));
  const ti = low.findIndex((h) => /t\s*min|mini|minimum/.test(h));
  const ta = low.findIndex((h) => /t\s*max|maxi|maximum/.test(h));
  const tm = low.findIndex((h) => /moy|mean|temp/.test(h));
  const issues: string[] = [];
  if (di < 0 || (ti < 0 && ta < 0 && tm < 0)) throw new ReadError('Colonnes introuvables : « Date » et « Tmin » / « Tmax » (ou « Tmoy »).');
  const days = new Map<string, { tmin: number; tmax: number }>();
  let bad = 0;
  for (const r of table.rows) {
    const t = toTime(r[di] ?? '', true);
    if (Number.isNaN(t)) { bad++; continue; }
    const d = new Date(t);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    let lo = ti >= 0 ? toNumber(r[ti]) : NaN; let hi = ta >= 0 ? toNumber(r[ta]) : NaN;
    if (Number.isNaN(lo) && Number.isNaN(hi) && tm >= 0) { lo = hi = toNumber(r[tm]); }
    if (Number.isNaN(lo) || Number.isNaN(hi)) { bad++; continue; }
    days.set(key, { tmin: Math.min(lo, hi), tmax: Math.max(lo, hi) });
  }
  if (bad) issues.push(`${bad} ligne(s) de température ignorée(s).`);
  if (days.size === 0) throw new ReadError('Aucune température exploitable.');
  return { days, issues };
}
