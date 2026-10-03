import { describe, expect, it } from 'vitest';
import { vapeurFlash as calc, type VapeurFlashInput } from './vapeur-flash';

const base: VapeurFlashInput = {
  pHaute: 1e6, pBasse: 0.1e6, debit: 1, etat: 'sature', tCond: 433.15, heures: 1000 * 3600,
  tAlim: 363.15, rendement: 0.9, combustible: 'gaz-naturel', prixEnergie: 50 / 3.6e9, basePrix: 'PCI',
};
const ok = (o: Partial<VapeurFlashInput>) => {
  const r = calc.compute({ ...base, ...o });
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r;
};

describe('vapeur-flash', () => {
  // Calcul à la main (enthalpies de saturation IF97) : (762,68 − 417,44)/2257,51 = 0,1529.
  it('1 MPa → 0,1 MPa absolus : 15,3 %', () => {
    const r = ok({});
    expect(r.data.xFlash).toBeCloseTo(0.1529, 3);
    expect(r.data.mFlash).toBeCloseTo(0.1529, 3);
  });
  // Cas usuel « 10 bar(g) vers l'atmosphère » : environ 16 % (abaques courants des fabricants de purgeurs).
  it('10 bar(g) → 0 bar(g) : ~16 %', () => {
    expect(ok({ pHaute: 11.01325e5, pBasse: 101325 }).data.xFlash).toBeCloseTo(0.16, 2);
  });
  it('condensat sous-refroidi : moins de flash ; trop froid : pas de flash', () => {
    expect(ok({ etat: 'sous-refroidi', tCond: 433.15 }).data.xFlash).toBeLessThan(ok({}).data.xFlash);
    const cold = ok({ etat: 'sous-refroidi', tCond: 363.15 });
    expect(cold.data.xFlash).toBe(0);
    expect(cold.warnings.some((w) => /pas de revaporisation/.test(w.message))).toBe(true);
  });
  it('débit nul → valeur nulle', () => expect(ok({ debit: 0 }).data.valueYear).toBe(0));
  it('erreurs', () => {
    expect(calc.compute({ ...base, pBasse: 2e6 }).ok).toBe(false);
    expect(calc.compute({ ...base, etat: 'sous-refroidi', tCond: 500 }).ok).toBe(false);
  });
  it('tableau de sensibilité décroissant avec la pression basse', () => {
    const r = ok({ pHaute: 11.01325e5, pBasse: 1.51325e5 });
    const rows = (r.display as { rows: number[][] }).rows;
    for (let k = 1; k < rows.length; k++) expect(rows[k][2]).toBeLessThan(rows[k - 1][2]);
  });
});
