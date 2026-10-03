import { describe, expect, it } from 'vitest';
import { coutVapeur as calc, type CoutVapeurInput } from './cout-vapeur';
import { saturationP, saturationT } from '@/thermo/steam';

const base: CoutVapeurInput = {
  p: 1101325, etat: 'saturee', T: 523.15, tAlim: 363.15, rendement: 0.9,
  combustible: 'gaz-naturel', prixEnergie: 50 / 3.6e9, basePrix: 'PCI', production: 5000 / 3600, heures: 6000 * 3600,
};
const ok = (o: Partial<CoutVapeurInput>) => {
  const r = calc.compute({ ...base, ...o });
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r;
};

describe('cout-vapeur', () => {
  // À la main : (hg(11 bar) − hf(90 °C))/0,9 × 50 €/MWh ; hg ≈ 2781, hf ≈ 377 kJ/kg → 742 kWh/t → 37,1 €/t.
  it('vapeur saturée 10 bar(g), gaz 50 €/MWh PCI, η = 90 %', () => {
    const r = ok({});
    const dh = saturationP(1101325).hg - saturationT(363.15).hf;
    expect(r.data.costPerKg).toBeCloseTo((dh / 0.9) * (50 / 3.6e9), 12);
    expect(r.data.costPerKg * 1e3).toBeCloseTo(37.1, 0);
  });
  // CO2 : 742 kWh/t × 0,20196 kg/kWh ≈ 150 kg/t.
  it('CO2 par tonne', () => expect(ok({}).data.co2PerKg * 1e3).toBeCloseTo(150, -1));
  it('prix sur PCS plus élevé qu’en PCI pour la même valeur saisie', () => {
    expect(ok({ basePrix: 'PCS' }).data.costPerKg).toBeGreaterThan(ok({}).data.costPerKg);
  });
  it('surchauffe : plus chère que la saturée', () => {
    expect(ok({ etat: 'surchauffee', T: 573.15 }).data.costPerKg).toBeGreaterThan(ok({}).data.costPerKg);
  });
  it('cas limites', () => {
    expect(calc.compute({ ...base, etat: 'surchauffee', T: 400 }).ok).toBe(false); // sous la saturation
    expect(calc.compute({ ...base, rendement: 0 }).ok).toBe(false);
    expect(ok({ production: 0 }).intermediates.find((q) => q.key === 'coutAn')!.value).toBe(0);
    expect(ok({ rendement: 1.05 }).warnings.some((w) => w.level === 'validity')).toBe(true);
    expect(calc.compute({ ...base, tAlim: 473.15 + 50 }).ok).toBe(false); // alimentation plus chaude que la vapeur ? domaine
  });
});
