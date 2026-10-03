// Lecture d'un relevé tabulaire (CSV ou feuille Excel déjà lue) en lignes de suivi. Pur.
import { isoDate } from './aggregate';
import type { Row } from './model';

export type ParseIssue = { level: 'erreur' | 'avertissement' | 'info'; message: string };
export type Cell = string | number | boolean | Date | null | undefined;

const norm = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

type Key = 'date' | 'kwh' | 'tmin' | 'tmax' | 'dju' | 'djr' | 'x' | 'jours';
const MATCH: [Key, RegExp][] = [
  ['tmin', /(^|[^a-z])t\s*min|temp.*min|minimum/],
  ['tmax', /(^|[^a-z])t\s*max|temp.*max|maximum/],
  ['dju', /dju|degres?.?jours?.*(chauff|unifi)|^dju/],
  ['djr', /djr|degres?.?jours?.*(clim|froid|refroid)/],
  ['kwh', /kwh|energie|consommation|conso\b|index/],
  ['jours', /^(nb|nombre)?\s*jours?$|duree/],
  ['date', /date|jour|periode|debut|mois|timestamp/],
  ['x', /^x$|production|surface|occupation|variable|unites?|volume/],
];

export function parseNumber(v: Cell): number {
  if (typeof v === 'number') return v;
  if (typeof v !== 'string') return NaN;
  const s = v.replace(/\s| /g, '').replace(',', '.');
  return s === '' ? NaN : Number(s);
}

export function parseDate(v: Cell): string | null {
  if (v instanceof Date && !isNaN(v.getTime())) return isoDate(new Date(v.getFullYear(), v.getMonth(), v.getDate(), 12));
  if (typeof v === 'number') {
    if (v > 20000 && v < 80000) return isoDate(new Date(Date.UTC(1899, 11, 30) + v * 86400000 + 43200000)).replace(/^/, '') ; // numéro de série Excel
    return null;
  }
  if (typeof v !== 'string') return null;
  const s = v.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/.exec(s);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = /^(\d{4})-(\d{2})$/.exec(s);
  if (m) return `${m[1]}-${m[2]}-01`;
  m = /^(\d{1,2})[/.-](\d{4})$/.exec(s);
  if (m) return `${m[2]}-${m[1].padStart(2, '0')}-01`;
  return null;
}

/** Détecte le séparateur d'un CSV (point-virgule, tabulation, virgule) sur sa première ligne. */
export function csvToMatrix(text: string): string[][] {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.length === 0) return [];
  const first = lines[0];
  const sep = [';', '\t', ','].map((c) => [c, first.split(c).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  return lines.map((l) => l.split(sep).map((c) => c.replace(/^"|"$/g, '').trim()));
}

export function parseTable(matrix: Cell[][]): { rows: Row[]; issues: ParseIssue[] } {
  const issues: ParseIssue[] = [];
  const hi = matrix.findIndex((r) => r.some((c) => typeof c === 'string' && c.trim() !== ''));
  if (hi < 0) return { rows: [], issues: [{ level: 'erreur', message: 'Fichier vide.' }] };
  const header = matrix[hi].map(norm);
  const idx: Partial<Record<Key, number>> = {};
  header.forEach((h, i) => {
    for (const [key, re] of MATCH) {
      if (idx[key] === undefined && re.test(h) && !Object.values(idx).includes(i)) { idx[key] = i; break; }
    }
  });
  if (idx.date === undefined) issues.push({ level: 'erreur', message: 'Colonne de date introuvable (intitulé « Date », « Jour » ou « Période »).' });
  if (idx.kwh === undefined) issues.push({ level: 'erreur', message: 'Colonne d’énergie introuvable (intitulé contenant « kWh » ou « Énergie »).' });
  if (issues.some((i) => i.level === 'erreur')) return { rows: [], issues };
  if (idx.dju === undefined && (idx.tmin === undefined || idx.tmax === undefined)) issues.push({ level: 'avertissement', message: 'Ni DJU ni températures minimale et maximale : seule une variable libre pourra expliquer la consommation.' });
  const rows: Row[] = [];
  let bad = 0;
  for (const r of matrix.slice(hi + 1)) {
    const date = parseDate(r[idx.date!]);
    const kwh = parseNumber(r[idx.kwh!]);
    if (!date || !Number.isFinite(kwh)) { if (r.some((c) => c !== '' && c != null)) bad++; continue; }
    const row: Row = { date, kwh };
    for (const k of ['tmin', 'tmax', 'dju', 'djr', 'x', 'jours'] as const) {
      const i = idx[k]; if (i === undefined) continue;
      const v = parseNumber(r[i]); if (Number.isFinite(v)) row[k] = v;
    }
    rows.push(row);
  }
  if (bad > 0) issues.push({ level: 'avertissement', message: `${bad} ligne(s) ignorée(s) : date ou énergie illisible.` });
  const names = (Object.keys(idx) as Key[]).map((k) => `${k} ← « ${String(matrix[hi][idx[k]!])} »`).join(' ; ');
  issues.push({ level: 'info', message: `${rows.length} ligne(s) lues. Colonnes reconnues : ${names}.` });
  if (rows.length === 0) issues.push({ level: 'erreur', message: 'Aucune ligne exploitable.' });
  return { rows, issues };
}
