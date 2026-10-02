import { describe, expect, it } from 'vitest';
import { calculators } from './registry';
import { defaultRaw, parseInputs } from '@/core/form';
import { CATEGORIES } from '@/core/categories';

describe('registre : tous les calculateurs avec leurs seules valeurs par défaut', () => {
  it('identifiants uniques et catégories connues', () => {
    const ids = calculators.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of calculators) expect(CATEGORIES.some((k) => k.id === c.category)).toBe(true);
  });

  for (const c of calculators) {
    describe(c.id, () => {
      it('métadonnées complètes', () => {
        expect(c.title && c.summary).toBeTruthy();
        expect(c.references.length).toBeGreaterThan(0);
        expect(c.assumptions.length).toBeGreaterThan(0);
        expect(c.validity.length).toBeGreaterThan(0);
        const keys = c.inputs.map((f) => f.key);
        expect(new Set(keys).size).toBe(keys.length);
      });
      it('répond correctement aux défauts', () => {
        const parsed = parseInputs(c.inputs, defaultRaw(c.inputs));
        expect(parsed.ok).toBe(true);
        if (!parsed.ok) return;
        const r = c.compute(parsed.input);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.main.length).toBeGreaterThan(0);
        expect(r.formulas.length).toBeGreaterThan(0);
        for (const q of [...r.main, ...r.intermediates]) expect(Number.isFinite(q.value)).toBe(true);
        for (const f of r.formulas) expect(f.substituted).not.toMatch(/NaN|undefined|Infinity/);
      });
    });
  }
});
