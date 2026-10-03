import { describe, expect, it } from 'vitest';
import { purgeChaudiere as calc, type PurgeInput } from './purge-chaudiere';
import { saturationP, saturationT } from '@/thermo/steam';

const base: PurgeInput = {
  p: 1e6, debitVapeur: 1, tdsAlim: 200e-6, tdsMax: 3000e-6, coutEau: 0, heures: 1000 * 3600, recup: 'aucune', pFlash: 1.2e5,
  tAlim: 363.15, rendement: 0.9, combustible: 'gaz-naturel', prixEnergie: 50 / 3.6e9, basePrix: 'PCI',
};
const ok = (o: Partial<PurgeInput>) => {
  const r = calc.compute({ ...base, ...o });
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r;
};

describe('purge-chaudiere', () => {
  // Formule classique : 200/(3000 − 200) = 7,14 % de la vapeur.
  it('taux de purge 7,14 %', () => {
    const r = ok({});
    expect(r.data.purgePerSteam).toBeCloseTo(0.0714286, 6);
    expect(r.data.mPurge).toBeCloseTo(0.0714286, 6);
  });
  // P = 0,0714 kg/s × (762,7 − 376,9) kJ/kg ≈ 27,6 kW ; sur 1000 h et η = 0,9 : 30,6 MWh × 50 = 1532 €.
  it('puissance et coût énergie', () => {
    const r = ok({});
    const P = (200 / 2800) * (saturationP(1e6).hf - saturationT(363.15).hf);
    expect(r.data.powerLost).toBeCloseTo(P, 2);
    expect(r.data.costYear).toBeCloseTo(((P * 1000 * 3600) / 0.9) * (50 / 3.6e9), 4);
  });
  it('coût de l’eau ajouté', () => {
    const r = ok({ coutEau: 3 });
    expect(r.data.costYear - ok({}).data.costYear).toBeCloseTo((0.0714286 * 3600 * 1000 / 1000) * 3, 1);
  });
  it('récupération flash réduit le coût', () => {
    const r = ok({ recup: 'flash' });
    expect(r.data.recovered).toBeGreaterThan(0);
    expect(r.data.costYear).toBeLessThan(ok({}).data.costYear);
  });
  it('cas limites', () => {
    expect(ok({ debitVapeur: 0 }).data.costYear).toBe(0);
    expect(calc.compute({ ...base, tdsMax: 100e-6 }).ok).toBe(false);
    expect(calc.compute({ ...base, rendement: 0 }).ok).toBe(false);
  });
});
