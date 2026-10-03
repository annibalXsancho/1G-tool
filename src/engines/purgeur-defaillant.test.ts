import { describe, expect, it } from 'vitest';
import { purgeurDefaillant as calc, type PurgeurInput } from './purgeur-defaillant';

const PSI = 6894.757293168;
const base: PurgeurInput = {
  pAmont: 100 * PSI, pAval: 101325, d: Math.sqrt((4 * 0.1 * 6.4516e-4) / Math.PI), cd: 1, nombre: 1, heures: 1000 * 3600,
  tAlim: 363.15, rendement: 0.9, combustible: 'gaz-naturel', prixEnergie: 50 / 3.6e9, basePrix: 'PCI',
};
const ok = (o: Partial<PurgeurInput>) => {
  const r = calc.compute({ ...base, ...o });
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r;
};

describe('purgeur-defaillant', () => {
  // Napier impérial : 100 psia, 0,1 in² → 100 × 0,1 / 70 = 0,142857 lb/s = 0,064799 kg/s.
  it('équivalence avec la forme d’origine de Napier', () => {
    expect(ok({}).data.mLeak).toBeCloseTo((10 / 70) * 0.45359237, 9);
  });
  // 3 mm à 10 bar(g) : 1,4568e-3 × 1,101325e6 × 7,0686e-6 = 0,011341 kg/s = 40,8 kg/h.
  it('orifice 3 mm à 10 bar(g)', () => {
    expect(ok({ pAmont: 11.01325e5, d: 3e-3 }).data.mLeak * 3600).toBeCloseTo(40.8, 1);
  });
  it('linéaire en nombre et en coefficient, quadratique en diamètre', () => {
    const m = ok({ d: 3e-3 }).data.mLeak;
    expect(ok({ d: 3e-3, nombre: 4 }).data.mLeak).toBeCloseTo(4 * m, 12);
    expect(ok({ d: 3e-3, cd: 0.5 }).data.mLeak).toBeCloseTo(0.5 * m, 12);
    expect(ok({ d: 6e-3 }).data.mLeak).toBeCloseTo(4 * m, 12);
  });
  it('écoulement non critique : avertissement de validité', () => {
    const r = ok({ pAmont: 3e5, pAval: 2.5e5 });
    expect(r.data.choked).toBe(false);
    expect(r.warnings.some((w) => w.level === 'validity')).toBe(true);
  });
  it('cas limites', () => {
    expect(ok({ d: 0 }).data.costYear).toBe(0);
    expect(ok({ nombre: 0 }).data.mLeak).toBe(0);
    expect(calc.compute({ ...base, pAval: base.pAmont * 2 }).ok).toBe(false);
    expect(calc.compute({ ...base, cd: 0 }).ok).toBe(false);
  });
});
