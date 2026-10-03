import { describe, expect, it } from 'vitest';
import { calculate } from './calc';
import { drawInstallation, wrap } from './draw';
import { EXEMPLE_UNIFILAIRE } from './exemple';

describe('dessin du schéma unifilaire', () => {
  for (const inst of EXEMPLE_UNIFILAIRE.installations) {
    const d = drawInstallation(inst);
    it(`${inst.id} : un point de sélection par élément, dimensions positives`, () => {
      const refs = new Set(d.hits.map((h) => h.ref));
      for (const e of inst.elements) expect(refs.has(e.id), e.id).toBe(true);
      expect(d.width).toBeGreaterThan(200);
      expect(d.height).toBeGreaterThan(200);
    });
    it(`${inst.id} : toutes les primitives dans le cadre`, () => {
      for (const p of d.prims) {
        if (p.t === 'line') { expect(Math.min(p.x1, p.x2)).toBeGreaterThanOrEqual(0); expect(Math.max(p.x1, p.x2)).toBeLessThanOrEqual(d.width); expect(Math.max(p.y1, p.y2)).toBeLessThanOrEqual(d.height); }
        if (p.t === 'circle') { expect(p.cx - p.r).toBeGreaterThanOrEqual(0); expect(p.cx + p.r).toBeLessThanOrEqual(d.width); }
        if (p.t === 'rect') { expect(p.x).toBeGreaterThanOrEqual(0); expect(p.x + p.w).toBeLessThanOrEqual(d.width + 0.5); }
        if (p.t === 'text') { expect(p.x).toBeGreaterThanOrEqual(0); expect(p.text.length).toBeGreaterThan(0); }
      }
    });
  }
  it('un tableau dessine un jeu de barres et un départ par enfant', () => {
    const inst = { elements: [
      { id: 'B', label: 'B', kind: 'tableau' as const, voltage: 400 },
      { id: 'A', label: 'A', kind: 'charge' as const, parent: 'B', p: 10, breaker: { type: 'disjoncteur' as const, in: 32 } },
      { id: 'C', label: 'C', kind: 'moteur' as const, parent: 'B', p: 10, breaker: { type: 'disjoncteur' as const, in: 32 } },
    ] };
    const d = drawInstallation(inst);
    expect(d.prims.filter((p) => p.t === 'rect' && p.h === 6)).toHaveLength(1); // jeu de barres
    expect(d.prims.filter((p) => p.t === 'circle' && (p as { r: number }).r === 18)).toHaveLength(1); // moteur
  });
  it('protection en défaut tracée en rouge', () => {
    const inst = { elements: [
      { id: 'B', label: 'B', kind: 'tableau' as const, voltage: 400 },
      { id: 'A', label: 'A', kind: 'charge' as const, parent: 'B', p: 100, cosphi: 1, breaker: { type: 'disjoncteur' as const, in: 16 } },
    ] };
    expect(calculate({ id: '', name: '', site: '', elements: inst.elements }).issues.some((i) => i.level === 'erreur')).toBe(true);
    expect(drawInstallation(inst).prims.some((p) => p.t === 'text' && p.role === 'err')).toBe(true);
  });
  it('installation vide : dessin vide sans exception', () => {
    const d = drawInstallation({ elements: [] });
    expect(d.prims).toEqual([]);
  });
  it('plusieurs racines côte à côte, boucle sans exception', () => {
    const d = drawInstallation({ elements: [
      { id: 'A', label: 'A', kind: 'tableau', voltage: 400 }, { id: 'B', label: 'B', kind: 'tableau', voltage: 400 },
      { id: 'X', label: 'X', kind: 'tableau', parent: 'Y' }, { id: 'Y', label: 'Y', kind: 'tableau', parent: 'X' },
    ] });
    expect(d.hits.length).toBeGreaterThanOrEqual(4);
  });
  it('wrap : 2 lignes maximum', () => {
    expect(wrap('Court')).toEqual(['Court']);
    expect(wrap('Centrales de traitement d’air du bâtiment principal et annexes').length).toBe(2);
    expect(wrap('')).toEqual([]);
  });
});
