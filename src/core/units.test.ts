import { describe, expect, it } from 'vitest';
import { DIMENSIONS, fromSI, toSI, unitsOf, type Dimension } from './units';

describe('unités', () => {
  it('aller-retour SI pour chaque unité de chaque dimension', () => {
    for (const d of Object.keys(DIMENSIONS) as Dimension[]) {
      for (const u of unitsOf(d)) {
        for (const v of [0, 1, 12.345, -7.5, 1e5]) {
          expect(fromSI(toSI(v, d, u), d, u)).toBeCloseTo(v, 9);
        }
      }
    }
  });
  it('valeurs de référence', () => {
    expect(toSI(0, 'temperature', '°C')).toBeCloseTo(273.15, 10);
    expect(toSI(20, 'temperatureDelta', '°C')).toBe(20); // écart : pas de décalage
    expect(toSI(1, 'pressure', 'bar')).toBe(1e5);
    expect(toSI(3600, 'volFlow', 'm³/h')).toBeCloseTo(1, 12);
    expect(toSI(36, 'massFlow', 't/h')).toBeCloseTo(10, 12);
    expect(toSI(1, 'energy', 'kWh')).toBe(3.6e6); // définition : 1 kWh = 3,6 MJ
    expect(toSI(50, 'ratio', '%')).toBe(0.5);
  });
  it('unité inconnue : erreur explicite', () => {
    expect(() => toSI(1, 'power', 'xx')).toThrow();
  });
});
