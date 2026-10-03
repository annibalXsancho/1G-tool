import { describe, expect, it } from 'vitest';
import { retourCondensats as calc, type RetourCondensatsInput } from './retour-condensats';

const base: RetourCondensatsInput = {
  debit: 1, tCond: 353.15, tAppoint: 288.15, coutEau: 0, heures: 1000 * 3600,
  rendement: 0.9, combustible: 'gaz-naturel', prixEnergie: 50 / 3.6e9, basePrix: 'PCI',
};
const ok = (o: Partial<RetourCondensatsInput>) => {
  const r = calc.compute({ ...base, ...o });
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r;
};

describe('retour-condensats', () => {
  // Tables usuelles : hf(80 °C) = 334,9 ; hf(15 °C) = 62,98 kJ/kg → P ≈ 1 × 271,9 = 271,9 kW.
  it('1 kg/s de 80 °C vs appoint à 15 °C', () => {
    expect(ok({}).data.power / 1e3).toBeCloseTo(271.9, 0);
  });
  // E = 271,9 × 1000 / 0,9 = 302,1 MWh ; × 50 €/MWh = 15 106 €.
  it('économie énergie', () => {
    const r = ok({});
    expect(r.data.fuelYear / 3.6e9).toBeCloseTo(302.1, 0);
    expect(r.data.savingYear).toBeCloseTo(15106, -2);
  });
  // Eau : 1 kg/s × 3,6e6 s / 1000 = 3600 m³ ; à 3 €/m³ = 10 800 €.
  it('économie eau', () => {
    expect(ok({ coutEau: 3 }).data.savingYear - ok({}).data.savingYear).toBeCloseTo(10800, 3);
  });
  it('cas limites', () => {
    expect(ok({ debit: 0 }).data.savingYear).toBe(0);
    expect(ok({ tCond: 283.15 }).warnings.length).toBeGreaterThan(0);
    expect(calc.compute({ ...base, rendement: 0 }).ok).toBe(false);
    expect(calc.compute({ ...base, combustible: 'x' }).ok).toBe(false);
  });
});
