import { describe, expect, it } from 'vitest';
import { blowdown, boilerEfficiencyDirect, condensateReturnPower, desuperheat, flashSteam, RuleError, steamForDuty, steamPower, throttle, turbineExpansion } from './rules';
import { saturationP, statePT, statePx } from './steam';

describe('flashSteam', () => {
  // Calcul à la main, condensat saturé de 1 MPa détendu à 0,1 MPa (enthalpies de saturation IF97) :
  // hf(1 MPa) = 762,68 ; hf(0,1 MPa) = 417,44 ; hfg(0,1 MPa) = 2257,51 kJ/kg → x = 345,25/2257,51 = 0,1529.
  it('1 MPa → 0,1 MPa : 15,3 % de vapeur flash', () => {
    expect(flashSteam({ pHigh: 1e6, pLow: 0.1e6 }).xFlash).toBeCloseTo(0.1529, 3);
  });
  it('bilan d’énergie bouclé', () => {
    const r = flashSteam({ pHigh: 1.1e6, pLow: 101325 });
    expect(r.xFlash * r.low.hg + (1 - r.xFlash) * r.low.hf).toBeCloseTo(r.hCondensate, 3);
  });
  it('condensat sous-refroidi sous la saturation basse : aucune vapeur flash', () => {
    expect(flashSteam({ pHigh: 1e6, pLow: 0.1e6, hCondensate: 300e3 }).xFlash).toBe(0);
  });
  it('pressions incohérentes', () => {
    expect(() => flashSteam({ pHigh: 1e5, pLow: 1e6 })).toThrow(RuleError);
    expect(() => flashSteam({ pHigh: 1e6, pLow: 0 })).toThrow(RuleError);
  });
});

describe('throttle (détendeur)', () => {
  it('isenthalpique : vapeur saturée 1 MPa → 0,1 MPa devient surchauffée (~150 °C)', () => {
    const s1 = statePx(1e6, 1);
    const s2 = throttle(s1, 0.1e6);
    expect(s2.h).toBeCloseTo(s1.h, 3);
    expect(s2.phase).toBe('vapeur-surchauffee');
    expect(s2.T - 273.15).toBeGreaterThan(145);
    expect(s2.T - 273.15).toBeLessThan(155);
  });
  it('vapeur très humide : le laminage reste humide', () => {
    expect(throttle(statePx(1e6, 0.5), 0.5e6).phase).toBe('vapeur-humide');
  });
  it('refuse une pression aval supérieure', () => {
    expect(() => throttle(statePx(1e6, 1), 2e6)).toThrow(RuleError);
  });
});

describe('desuperheat', () => {
  // Bilan à la main : (3000 − 2800)/(2800 − 400) = 200/2400 = 0,08333 kg d'eau par kg de vapeur.
  it('exemple chiffré', () => {
    expect(desuperheat({ hSteam: 3000e3, hWater: 400e3, hTarget: 2800e3 }).waterPerSteam).toBeCloseTo(1 / 12, 10);
  });
  it('cibles impossibles', () => {
    expect(() => desuperheat({ hSteam: 2800e3, hWater: 400e3, hTarget: 3000e3 })).toThrow(RuleError);
    expect(() => desuperheat({ hSteam: 3000e3, hWater: 400e3, hTarget: 300e3 })).toThrow(RuleError);
  });
});

describe('chaudière', () => {
  // 1 kg/s de vapeur saturée à 1 MPa (hg ≈ 2777 kJ/kg), eau d'alimentation à 100 °C (≈ 419 kJ/kg) :
  // Q ≈ 2358 kW. Gaz : 0,06 kg/s × PCI 50 MJ/kg = 3 MW → η ≈ 0,786.
  it('rendement direct', () => {
    const hs = saturationP(1e6).hg;
    const hfw = 419.1e3;
    const r = boilerEfficiencyDirect({ m: 1, hSteam: hs, hFeed: hfw, mFuel: 0.06, pci: 50e6 });
    expect(r.Q / 1e3).toBeCloseTo(2358, -1);
    expect(r.eta).toBeCloseTo(0.786, 2);
    expect(r.fuelPower).toBeCloseTo(3e6, 6);
  });
  it('débit nul → puissance nulle ; combustible nul → erreur', () => {
    expect(steamPower({ m: 0, hSteam: 2.7e6, hFeed: 4e5 })).toBe(0);
    expect(() => boilerEfficiencyDirect({ m: 1, hSteam: 2.7e6, hFeed: 4e5, mFuel: 0, pci: 5e7 })).toThrow(RuleError);
    expect(() => steamPower({ m: 1, hSteam: 3e5, hFeed: 4e5 })).toThrow(RuleError);
  });
  // Formule classique B/S = c_alim/(c_chaudière − c_alim) : 200/(3000 − 200) = 7,14 %.
  it('déconcentration', () => {
    const r = blowdown({ tdsFeed: 200, tdsBoiler: 3000, mSteam: 10, pBoiler: 1e6, hFeed: 419.1e3 });
    expect(r.purgePerSteam).toBeCloseTo(0.0714286, 6);
    expect(r.mPurge).toBeCloseTo(0.714286, 5);
    expect(r.powerLost).toBeCloseTo(r.mPurge * (saturationP(1e6).hf - 419.1e3), 3);
  });
  it('concentrations incohérentes', () => {
    expect(() => blowdown({ tdsFeed: 3000, tdsBoiler: 200, mSteam: 1, pBoiler: 1e6, hFeed: 4e5 })).toThrow(RuleError);
    expect(() => blowdown({ tdsFeed: 0, tdsBoiler: 200, mSteam: 1, pBoiler: 1e6, hFeed: 4e5 })).toThrow(RuleError);
  });
});

describe('process, condensats, turbine', () => {
  it('steamForDuty : chaleur latente seule à 1 MPa pour 1 MW', () => {
    const r = steamForDuty({ duty: 1e6, p: 1e6 });
    expect(r.m).toBeCloseTo(1e6 / saturationP(1e6).hfg, 9);
    // hfg(1 MPa) ≈ 2015 kJ/kg (tables usuelles : 2014,6) → ≈ 0,496 kg/s par MW.
    expect(r.m).toBeCloseTo(0.4964, 3);
  });
  it('steamForDuty : puissance nulle → débit nul', () => expect(steamForDuty({ duty: 0, p: 1e6 }).m).toBe(0));
  it('condensateReturnPower', () => {
    expect(condensateReturnPower({ mReturn: 2, hCondensate: 500e3, hMakeup: 100e3 })).toBe(800e3);
  });
  // Détente 3 MPa / 400 °C → 0,5 MPa : h1 = 3231,6 kJ/kg, h2s = 2792,7 kJ/kg (IF97 ; cf. tables usuelles).
  it('turbine isentropique', () => {
    const r = turbineExpansion({ state1: statePT(3e6, 673.15), p2: 0.5e6, etaIs: 1 });
    expect(r.h2s / 1e3).toBeCloseTo(2792.7, 0);
    expect(r.w / 1e3).toBeCloseTo(3231.6 - 2792.7, 0);
    expect(r.state2.s).toBeCloseTo(statePT(3e6, 673.15).s, 4);
  });
  it('rendement 80 % : travail réduit, sortie plus chaude', () => {
    const s1 = statePT(3e6, 673.15);
    const ideal = turbineExpansion({ state1: s1, p2: 0.5e6, etaIs: 1 });
    const real = turbineExpansion({ state1: s1, p2: 0.5e6, etaIs: 0.8 });
    expect(real.w).toBeCloseTo(0.8 * ideal.w, 6);
    expect(real.state2.T).toBeGreaterThan(ideal.state2.T);
  });
  it('turbine : rendement invalide', () => {
    expect(() => turbineExpansion({ state1: statePT(3e6, 673.15), p2: 0.5e6, etaIs: 0 })).toThrow(RuleError);
    expect(() => turbineExpansion({ state1: statePT(3e6, 673.15), p2: 4e6, etaIs: 0.8 })).toThrow(RuleError);
  });
});
