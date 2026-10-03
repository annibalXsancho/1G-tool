import { describe, expect, it } from 'vitest';
import { proprietesVapeur as calc, type ProprietesVapeurInput } from './proprietes-vapeur';

const base: ProprietesVapeurInput = { entree: 'pT', p: 3e6, T: 673.15, x: 1, h: 2.8e6 };
const run = (o: Partial<ProprietesVapeurInput>) => calc.compute({ ...base, ...o });
const ok = (o: Partial<ProprietesVapeurInput>) => {
  const r = run(o);
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r;
};

describe('proprietes-vapeur', () => {
  // Tables usuelles : eau à 3 MPa et 400 °C, h = 3231,5 kJ/kg, s = 6,9235 kJ/(kg·K).
  it('3 MPa / 400 °C', () => {
    const r = ok({});
    expect(r.data.state.h / 1e3).toBeCloseTo(3231.5, 0);
    expect(r.data.state.s / 1e3).toBeCloseTo(6.9235, 2);
    expect(r.data.state.phase).toBe('vapeur-surchauffee');
  });
  // Valeur de vérification IF97 (région 2) : 3500 Pa, 300 K → h = 2549,91145 kJ/kg.
  it('vérification IF97 région 2', () => {
    expect(ok({ p: 3500, T: 300 }).data.state.h / 1e3).toBeCloseTo(2549.91145, 4);
  });
  it('mode (p, x) : h = hf + x·hfg', () => {
    const r = ok({ entree: 'px', p: 1e6, x: 0.5 });
    expect(r.data.state.h).toBeCloseTo(r.data.sat.hf + 0.5 * r.data.sat.hfg, 3);
    expect(r.formulas.length).toBe(2);
  });
  it('mode (p, h) retrouve le titre', () => {
    const w = ok({ entree: 'px', p: 1e6, x: 0.3 });
    expect(ok({ entree: 'ph', p: 1e6, h: w.data.state.h }).data.state.x).toBeCloseTo(0.3, 9);
  });
  it('liquide sous-refroidi : écart signalé comme sous-refroidissement', () => {
    const r = ok({ p: 1e6, T: 300 });
    expect(r.intermediates.find((q) => q.key === 'dT')?.label).toBe('Sous-refroidissement');
  });
  it('hors domaine : erreur de calcul, pas d’exception', () => {
    expect(run({ p: 20e6 }).ok).toBe(false);
    expect(run({ T: 1500 }).ok).toBe(false);
    expect(run({ entree: 'px', x: 2 }).ok).toBe(false);
    expect(run({ p: NaN }).ok).toBe(false);
  });
  it('température à la saturation : remarque d’ambiguïté', () => {
    const sat = ok({ entree: 'px', p: 1e6, x: 0 }).data.sat;
    expect(ok({ p: 1e6, T: sat.T }).warnings.some((w) => /ambigu/.test(w.message))).toBe(true);
  });
});
