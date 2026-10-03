import { describe, expect, it } from 'vitest';
import { rendementChaudiere as calc, type RendementInput } from './rendement-chaudiere';
import { saturationP, saturationT } from '@/thermo/steam';

const base: RendementInput = {
  methode: 'indirecte', combustible: 'gaz-naturel',
  p: 1e6, debitVapeur: 1, tAlim: 363.15, puissanceComb: 3e6, baseConso: 'PCI',
  tFumees: 453.15, tAir: 293.15, O2: 0.03, pertesAutres: 0.01, puissanceUtile: 1e6,
  prixEnergie: 50 / 3.6e9, basePrix: 'PCI', heures: 1000 * 3600,
};
const ok = (o: Partial<RendementInput>) => {
  const r = calc.compute({ ...base, ...o });
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r;
};

describe('rendement-chaudiere', () => {
  // Siegert gaz : 160 × (0,66/18 + 0,009) = 7,307 % ; η = 100 − 7,307 − 1 = 91,69 %.
  it('méthode indirecte', () => {
    const r = ok({});
    expect(r.data.etaPCI).toBeCloseTo(0.916933, 5);
    expect(r.data.etaPCS).toBeCloseTo(0.916933 * 0.901, 5);
  });
  // Gain d'un point : 1 MW × 1000 h × (1/0,91693 − 1/0,92693) = 11,77 MWh ; × 50 = 588 €.
  it('valeur d’un point', () => {
    const r = ok({});
    const e = 1000 * (1 / 0.916933 - 1 / 0.926933);
    expect(r.data.gainPoint).toBeCloseTo(e * 50, 0);
  });
  // Directe : Q = 1 × (hg(1 MPa) − hf(90 °C)) ≈ 2400 kW ; combustible 3000 kW PCI → η ≈ 80 %.
  it('méthode directe', () => {
    const r = ok({ methode: 'directe' });
    const Q = saturationP(1e6).hg - saturationT(363.15).hf;
    expect(r.data.etaPCI).toBeCloseTo(Q / 3e6, 9);
    expect(r.data.etaPCI).toBeCloseTo(0.80, 2);
  });
  it('directe en PCS : la consommation PCI est plus faible, le rendement PCI plus haut', () => {
    expect(ok({ methode: 'directe', baseConso: 'PCS' }).data.etaPCI).toBeGreaterThan(ok({ methode: 'directe' }).data.etaPCI);
  });
  it('avertissements et erreurs', () => {
    expect(ok({ methode: 'directe', puissanceComb: 2e6 }).warnings.some((w) => w.level === 'validity')).toBe(true); // η > 100 %
    expect(ok({ tFumees: 323.15 }).warnings.some((w) => w.level === 'validity')).toBe(true); // condensation
    expect(calc.compute({ ...base, combustible: 'fioul-lourd' }).ok).toBe(false); // Siegert non défini
    expect(calc.compute({ ...base, O2: 0.21 }).ok).toBe(false);
    expect(calc.compute({ ...base, pertesAutres: 0.95 }).ok).toBe(false);
  });
});
