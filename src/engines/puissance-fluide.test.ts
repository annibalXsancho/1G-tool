import { describe, expect, it } from 'vitest';
import { puissanceFluide as calc, type PuissanceFluideInput } from './puissance-fluide';

const K0 = 273.15;
const base: PuissanceFluideInput = { fluide: 'eau', mode: 'massique', qm: 1, qv: 0, tIn: 10 + K0, tOut: 30 + K0, pression: 101325, cpManuel: 4186, rhoManuel: 1000 };
const run = (o: Partial<PuissanceFluideInput>) => calc.compute({ ...base, ...o });
const P = (o: Partial<PuissanceFluideInput>) => {
  const r = run(o);
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r;
};

describe('puissance-fluide : cas de référence', () => {
  // Calcul à la main P = qm·cp·ΔT avec cp(20 °C) = 4182 J/(kg·K) (Incropera, table A.6) :
  // 1 × 4182 × 20 = 83 640 W.
  it('eau 1 kg/s de 10 à 30 °C', () => {
    expect(P({}).data.P).toBeCloseTo(83640, 6);
  });
  // Débit volumique 36 m³/h d'eau entrant à 20 °C (ρ = 998,2), sortie 40 °C, cp(30 °C) = 4178 :
  // qm = 0,01 × 998,2 = 9,982 kg/s ; P = 9,982 × 4178 × 20 = 834 095,9 W.
  it('eau 36 m³/h de 20 à 40 °C', () => {
    const r = P({ mode: 'volumique', qv: 36 / 3600, tIn: 20 + K0, tOut: 40 + K0 });
    expect(r.data.qm).toBeCloseTo(9.982, 6);
    expect(r.data.P).toBeCloseTo(834095.9, 0);
  });
  // Air, cp interpolé entre 300 K (1007) et 350 K (1009) à 325 K = 1008 : 2 × 1008 × 50 = 100 800 W.
  it('air 2 kg/s de 300 à 350 K', () => {
    expect(P({ fluide: 'air', qm: 2, tIn: 300, tOut: 350 }).data.P).toBeCloseTo(100800, 6);
  });
  it('air en débit volumique : ρ gaz parfait', () => {
    const r = P({ fluide: 'air', mode: 'volumique', qv: 1, tIn: 300, tOut: 350 });
    expect(r.data.rho).toBeCloseTo(101325 / (287.05 * 300), 9);
  });
  // Vapeur : cp(450 K) = 1980 : 1 × 1980 × 100 = 198 000 W.
  it('vapeur 1 kg/s de 400 à 500 K', () => {
    expect(P({ fluide: 'vapeur', tIn: 400, tOut: 500 }).data.P).toBeCloseTo(198000, 6);
  });
  it('fluide libre', () => {
    expect(P({ fluide: 'autre', cpManuel: 3500, qm: 2, tIn: 300, tOut: 310 }).data.P).toBeCloseTo(70000, 6);
  });
});

describe('puissance-fluide : cas limites', () => {
  it('débit nul → P = 0 avec info', () => {
    const r = P({ qm: 0 });
    expect(r.data.P).toBe(0);
    expect(r.warnings.some((w) => w.level === 'info')).toBe(true);
  });
  it('ΔT nul → P = 0', () => expect(P({ tOut: 10 + K0 }).data.P).toBe(0));
  it('ΔT négatif → puissance négative et information', () => {
    const r = P({ tIn: 30 + K0, tOut: 10 + K0 });
    expect(r.data.P).toBeLessThan(0);
    expect(r.warnings.some((w) => /négatif/.test(w.message))).toBe(true);
  });
  it('hors table → avertissement de validité', () => {
    const r = P({ tIn: 150 + K0, tOut: 200 + K0 });
    expect(r.warnings.some((w) => w.level === 'validity')).toBe(true);
  });
  it('entrées invalides → erreur de calcul', () => {
    expect(run({ qm: -1 }).ok).toBe(false);
    expect(run({ tIn: NaN }).ok).toBe(false);
    expect(run({ fluide: 'inconnu' }).ok).toBe(false);
    expect(run({ fluide: 'autre', cpManuel: 0 }).ok).toBe(false);
  });
});
