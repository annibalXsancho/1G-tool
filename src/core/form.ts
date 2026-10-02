// Passerelle entre les champs saisis (texte brut, dans l'unité choisie) et les
// entrées SI des moteurs. Fonctions pures, testables sans navigateur.
//
// État brut (`Raw`) = dictionnaire plat de chaînes, directement sérialisable en URL :
//   nombre  : raw[key] = "60,5", raw[key~u] = "°C"
//   choix   : raw[key] = "eau"
//   lignes  : raw[key] = "a|b;c|d" (lignes séparées par « ; », cellules par « | »),
//             raw[key~u] = unités des colonnes séparées par « | ».
import { DIMENSIONS, fromSI, toSI, type Dimension } from './units';
import { fmtNum } from './fmt';
import type { FieldError, InputField, NumberField, RowColumn, RowsField } from './types';

export type Raw = Record<string, string>;
export type { FieldError };

export const unitKey = (key: string) => `${key}~u`;

type NumLike = { dimension: Dimension; units?: string[] };

export function fieldUnits(f: NumLike): string[] {
  return f.units ?? Object.keys(DIMENSIONS[f.dimension].units);
}
export function defaultUnit(f: NumLike): string {
  return f.units?.[0] ?? DIMENSIONS[f.dimension].display;
}

/** Représentation texte d'un nombre : 12 chiffres significatifs pour éliminer le bruit flottant. */
export const numToRaw = (x: number): string => String(Number(x.toPrecision(12)));

export function parseNumber(s: string): number {
  const t = s.replace(/[\s  ]/g, '').replace(',', '.');
  if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(t)) return NaN;
  return Number(t);
}

const isNum = (c: RowColumn): c is Extract<RowColumn, { type: 'number' }> => c.type === 'number';

function rowsToRaw(f: RowsField, rows: Record<string, number | string>[]): string {
  return rows
    .map((r) => f.columns.map((c) => (isNum(c) ? numToRaw(fromSI(Number(r[c.key]), c.dimension, defaultUnit(c))) : String(r[c.key]))).join('|'))
    .join(';');
}

export function defaultRaw(fields: InputField[]): Raw {
  const raw: Raw = {};
  for (const f of fields) {
    if (f.type === 'number') {
      const u = defaultUnit(f);
      raw[f.key] = numToRaw(fromSI(f.default, f.dimension, u));
      raw[unitKey(f.key)] = u;
    } else if (f.type === 'choice') {
      raw[f.key] = f.default;
    } else {
      raw[f.key] = rowsToRaw(f, f.default);
      raw[unitKey(f.key)] = f.columns.map((c) => (isNum(c) ? defaultUnit(c) : '')).join('|');
    }
  }
  return raw;
}

export function isVisible(f: InputField, raw: Raw): boolean {
  return !f.showIf || f.showIf.in.includes(raw[f.showIf.key] ?? '');
}

export function getRows(f: RowsField, raw: Raw): string[][] {
  const s = raw[f.key] ?? '';
  return s === '' ? [] : s.split(';').map((r) => r.split('|'));
}
export const setRows = (f: RowsField, raw: Raw, rows: string[][]): Raw => ({ ...raw, [f.key]: rows.map((r) => r.join('|')).join(';') });
export const rowUnits = (f: RowsField, raw: Raw): string[] => (raw[unitKey(f.key)] ?? '').split('|');

function resolveUnit(f: NumLike, u: string | undefined): string {
  return u && fieldUnits(f).includes(u) ? u : defaultUnit(f);
}

function parseNumberValue(f: NumLike & { min?: number; max?: number }, text: string, unit: string): { value: number } | { error: string } {
  if (text.trim() === '') return { error: 'Valeur requise' };
  const v = parseNumber(text);
  if (!Number.isFinite(v)) return { error: 'Nombre invalide' };
  const si = toSI(v, f.dimension, unit);
  const eps = 1e-9;
  if (f.min !== undefined && si < f.min - eps * Math.abs(f.min)) return { error: `Doit être ≥ ${fmtNum(fromSI(f.min, f.dimension, unit))} ${unit}` };
  if (f.max !== undefined && si > f.max + eps * Math.abs(f.max)) return { error: `Doit être ≤ ${fmtNum(fromSI(f.max, f.dimension, unit))} ${unit}` };
  return { value: si };
}

export function parseInputs<I>(fields: InputField[], rawIn: Raw): { ok: true; input: I } | { ok: false; errors: FieldError[] } {
  const raw = { ...defaultRaw(fields), ...rawIn };
  const out: Record<string, unknown> = {};
  const errors: FieldError[] = [];
  for (const f of fields) {
    if (!isVisible(f, raw)) {
      // Champ masqué : valeur par défaut, aucune validation.
      out[f.key] = f.type === 'rows' ? f.default : f.default;
      continue;
    }
    if (f.type === 'number') {
      const r = parseNumberValue(f, raw[f.key], resolveUnit(f, raw[unitKey(f.key)]));
      if ('error' in r) errors.push({ key: f.key, message: r.error });
      else out[f.key] = r.value;
    } else if (f.type === 'choice') {
      if (f.options.some((o) => o.value === raw[f.key])) out[f.key] = raw[f.key];
      else errors.push({ key: f.key, message: 'Choix invalide' });
    } else {
      const rows = getRows(f, raw);
      const units = rowUnits(f, raw);
      if (f.minRows !== undefined && rows.length < f.minRows) errors.push({ key: f.key, message: `Au moins ${f.minRows} ligne(s) requise(s)` });
      if (f.maxRows !== undefined && rows.length > f.maxRows) errors.push({ key: f.key, message: `Au plus ${f.maxRows} lignes` });
      const parsed: Record<string, number | string>[] = [];
      rows.forEach((cells, i) => {
        const row: Record<string, number | string> = {};
        f.columns.forEach((c, j) => {
          const cell = cells[j] ?? '';
          if (isNum(c)) {
            const r = parseNumberValue(c, cell, resolveUnit(c, units[j]));
            if ('error' in r) errors.push({ key: f.key, message: `Ligne ${i + 1}, ${c.label} : ${r.error}` });
            else row[c.key] = r.value;
          } else if (c.options.some((o) => o.value === cell)) row[c.key] = cell;
          else errors.push({ key: f.key, message: `Ligne ${i + 1}, ${c.label} : choix invalide` });
        });
        parsed.push(row);
      });
      out[f.key] = parsed;
    }
  }
  return errors.length ? { ok: false, errors } : { ok: true, input: out as I };
}

/** Change l'unité d'un champ nombre en conservant la grandeur physique saisie. */
export function changeUnit(f: NumberField, raw: Raw, newUnit: string): Raw {
  const old = resolveUnit(f, raw[unitKey(f.key)]);
  const v = parseNumber(raw[f.key] ?? '');
  const next = { ...raw, [unitKey(f.key)]: newUnit };
  if (Number.isFinite(v)) next[f.key] = numToRaw(fromSI(toSI(v, f.dimension, old), f.dimension, newUnit));
  return next;
}

/** Idem pour la colonne `col` d'un champ « lignes » (toutes les lignes sont converties). */
export function changeRowUnit(f: RowsField, raw: Raw, col: number, newUnit: string): Raw {
  const c = f.columns[col];
  if (!isNum(c)) return raw;
  const units = rowUnits(f, raw);
  const old = resolveUnit(c, units[col]);
  const rows = getRows(f, raw).map((cells) => {
    const v = parseNumber(cells[col] ?? '');
    const copy = [...cells];
    if (Number.isFinite(v)) copy[col] = numToRaw(fromSI(toSI(v, c.dimension, old), c.dimension, newUnit));
    return copy;
  });
  const us = f.columns.map((_, j) => (j === col ? newUnit : units[j] ?? ''));
  return { ...setRows(f, raw, rows), [unitKey(f.key)]: us.join('|') };
}

export function newRow(f: RowsField): string[] {
  const last = getRows(f, defaultRaw([f]))[0] ?? f.columns.map(() => '');
  return last.map((cell, j) => (isNum(f.columns[j]) ? '' : cell));
}
