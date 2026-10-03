import { describe, expect, it } from 'vitest';
import { co2PerJoulePCI, etaOnPCS, priceOnPCI, siegertLoss, steamUnitCost } from './combustion';
import { RuleError, napierLeak, NAPIER_SI, STEAM_CRITICAL_RATIO } from './rules';

describe('combustion', () => {
  // GIEC 2006 : gaz naturel 56 100 kg/TJ → 56 100 × 3,6·10⁻⁶ = 0,20196 kg CO2/kWh PCI.
  it('facteur CO2 du gaz naturel', () => {
    expect(co2PerJoulePCI('gaz-naturel') * 3.6e6).toBeCloseTo(0.20196, 5);
  });
  it('prix PCS → PCI et rendement PCS', () => {
    expect(priceOnPCI(50, 'PCS', 'gaz-naturel')).toBeCloseTo(50 / 0.901, 10);
    expect(priceOnPCI(50, 'PCI', 'gaz-naturel')).toBe(50);
    expect(etaOnPCS(0.9, 'gaz-naturel')).toBeCloseTo(0.8109, 10);
  });
  // Siegert, gaz : (180 − 20) × (0,66/(21 − 3) + 0,009) = 160 × 0,045667 = 7,307 % → q = 0,07307.
  it('perte fumées Siegert (calcul à la main)', () => {
    expect(siegertLoss({ fuelId: 'gaz-naturel', Tflue: 453.15, Tair: 293.15, O2: 3 }).q).toBeCloseTo(0.073067, 5);
  });
  it('Siegert : cas invalides', () => {
    expect(() => siegertLoss({ fuelId: 'fioul-lourd', Tflue: 453, Tair: 293, O2: 3 })).toThrow(RuleError);
    expect(() => siegertLoss({ fuelId: 'gaz-naturel', Tflue: 453, Tair: 293, O2: 21 })).toThrow(RuleError);
    expect(() => siegertLoss({ fuelId: 'gaz-naturel', Tflue: 280, Tair: 293, O2: 3 })).toThrow(RuleError);
    expect(() => siegertLoss({ fuelId: 'inconnu', Tflue: 453, Tair: 293, O2: 3 })).toThrow(RuleError);
  });
  // (2700 − 400) kJ/kg / 0,9 = 2555,6 kJ PCI/kg = 0,70988 kWh/kg ; × 50 €/MWh = 0,035494 €/kg = 35,49 €/t.
  it('coût de la vapeur', () => {
    const r = steamUnitCost({ hSteam: 2700e3, hFeed: 400e3, etaPCI: 0.9, pricePCI: 50 / 3.6e9, co2PCI: 0 });
    expect(r.costPerKg * 1000).toBeCloseTo(35.494, 2);
    expect(() => steamUnitCost({ hSteam: 2700e3, hFeed: 400e3, etaPCI: 0, pricePCI: 1, co2PCI: 0 })).toThrow(RuleError);
  });
});

describe('Napier', () => {
  // Constante SI : 0,45359237 / (6894,757 × 6,4516e-4 × 70) = 1,4568e-3.
  it('constante SI', () => expect(NAPIER_SI).toBeCloseTo(1.4568e-3, 6));
  // Cas impérial : 100 psia, orifice 0,1 in² → 100 × 0,1 / 70 = 0,142857 lb/s.
  it('équivalence avec la forme impériale', () => {
    const p = 100 * 6894.757293168;
    const A = 0.1 * 6.4516e-4;
    const d = Math.sqrt((4 * A) / Math.PI);
    const r = napierLeak({ pUp: p, pDown: 101325, d, cd: 1 });
    expect(r.m / 0.45359237).toBeCloseTo(100 * 0.1 / 70, 9);
    expect(r.choked).toBe(true);
  });
  it('rapport critique ≈ 0,577', () => expect(STEAM_CRITICAL_RATIO).toBeCloseTo(0.5774, 3));
  it('diamètre nul → débit nul ; non bloqué signalé ; entrées invalides', () => {
    expect(napierLeak({ pUp: 1e6, pDown: 1e5, d: 0, cd: 1 }).m).toBe(0);
    expect(napierLeak({ pUp: 1e6, pDown: 8e5, d: 0.003, cd: 1 }).choked).toBe(false);
    expect(() => napierLeak({ pUp: 1e6, pDown: 2e6, d: 0.003, cd: 1 })).toThrow(RuleError);
    expect(() => napierLeak({ pUp: 1e6, pDown: 1e5, d: 0.003, cd: 0 })).toThrow(RuleError);
  });
});
