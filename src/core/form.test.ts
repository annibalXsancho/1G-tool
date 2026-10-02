import { describe, expect, it } from 'vitest';
import { changeRowUnit, changeUnit, defaultRaw, getRows, parseInputs, parseNumber } from './form';
import { rawToSearch, searchToRaw } from './url-state';
import { fmtNum } from './fmt';
import type { InputField, NumberField, RowsField } from './types';

const T: NumberField = { type: 'number', key: 't', label: 'T', dimension: 'temperature', default: 333.15, min: 1 };
const rows: RowsField = {
  type: 'rows', key: 'p', label: 'Parois', minRows: 1, maxRows: 3,
  columns: [{ type: 'number', key: 'a', label: 'A', dimension: 'area', default: 10 }, { type: 'choice', key: 'k', label: 'K', options: [{ value: 'x', label: 'X' }, { value: 'y', label: 'Y' }], default: 'x' }],
  default: [{ a: 10, k: 'x' }],
};
const fields: InputField[] = [
  T,
  { type: 'choice', key: 'm', label: 'M', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }], default: 'a' },
  { type: 'number', key: 'h', label: 'H', dimension: 'length', default: 2, min: 0, showIf: { key: 'm', in: ['b'] } },
  rows,
];

describe('form', () => {
  it('défauts : affichés en unité par défaut, sans bruit flottant', () => {
    const r = defaultRaw(fields);
    expect(r.t).toBe('60');
    expect(r['t~u']).toBe('°C');
    expect(r.p).toBe('10|x');
  });
  it('parseNumber accepte virgule décimale et espaces', () => {
    expect(parseNumber('1 234,5')).toBe(1234.5);
    expect(Number.isNaN(parseNumber('abc'))).toBe(true);
    expect(Number.isNaN(parseNumber(''))).toBe(true);
  });
  it('parse les défauts en SI', () => {
    const r = parseInputs<{ t: number; m: string }>(fields, {});
    expect(r.ok && r.input.t).toBeCloseTo(333.15, 9);
  });
  it('erreurs de saisie et bornes', () => {
    const r = parseInputs(fields, { t: '-300', 't~u': '°C' });
    expect(r.ok).toBe(false);
    const e = parseInputs(fields, { t: '' });
    expect(!e.ok && e.errors[0].message).toMatch(/requise/);
  });
  it('champ masqué non validé', () => {
    expect(parseInputs(fields, { h: 'zzz' }).ok).toBe(true);
    expect(parseInputs(fields, { m: 'b', h: 'zzz' }).ok).toBe(false);
  });
  it('changement d’unité conserve la grandeur', () => {
    const r = changeUnit(T, defaultRaw(fields), 'K');
    expect(r.t).toBe('333.15');
    const back = parseInputs<{ t: number }>(fields, r);
    expect(back.ok && back.input.t).toBeCloseTo(333.15, 9);
  });
  it('lignes : parsing, bornes et conversion de colonne', () => {
    const raw = { ...defaultRaw(fields), p: '10|x;5|y' };
    const r = parseInputs<{ p: { a: number; k: string }[] }>(fields, raw);
    expect(r.ok && r.input.p).toEqual([{ a: 10, k: 'x' }, { a: 5, k: 'y' }]);
    expect(parseInputs(fields, { p: '' }).ok).toBe(false);
    const c = changeRowUnit(rows, raw, 0, 'cm²');
    expect(getRows(rows, c)[0][0]).toBe('100000');
  });
  it('URL : aller-retour, seules les valeurs modifiées sont écrites', () => {
    const raw = { ...defaultRaw(fields), t: '75,5', m: 'b' };
    const qs = rawToSearch(fields, raw);
    expect(qs).toBe('t=75%2C5&m=b');
    expect(searchToRaw(fields, new URLSearchParams(qs))).toEqual(raw);
    expect(rawToSearch(fields, defaultRaw(fields))).toBe('');
  });
});

describe('fmtNum', () => {
  it('formats', () => {
    expect(fmtNum(0)).toBe('0');
    expect(fmtNum(4.182)).toBe('4,182');
    expect(fmtNum(83640)).toBe('83 640');
    expect(fmtNum(-12.3456)).toBe('−12,35');
    expect(fmtNum(0.00001234)).toBe('1,234×10⁻⁵');
    expect(fmtNum(12.5, 4, 'tex')).toBe('12{,}5');
    expect(fmtNum(NaN)).toBe('—');
  });
});
