import { describe, expect, it } from 'vitest';
import { saturationP, saturationT, statePH, statePS, statePT, statePx, Tsat, SteamDomainError } from './steam';

// Valeurs de vérification publiées avec IAPWS-IF97 (Release on the IAPWS Industrial Formulation 1997,
// tables de vérification des régions 1, 2 et 4). Unités converties en SI. Précision de publication : 9 chiffres.
const close = (a: number, b: number, rel = 1e-8) => expect(Math.abs(a - b)).toBeLessThanOrEqual(rel * Math.abs(b));

describe('steam : valeurs de vérification IAPWS-IF97', () => {
  it('région 1, T = 300 K, p = 3 MPa', () => {
    const s = statePT(3e6, 300);
    expect(s.phase).toBe('liquide');
    close(s.v, 0.100215168e-2); close(s.h, 0.115331273e6); close(s.u, 0.112324818e6);
    close(s.s, 0.392294792e3); close(s.cp!, 0.417301218e4);
  });
  it('région 1, T = 500 K, p = 3 MPa', () => {
    const s = statePT(3e6, 500);
    close(s.v, 0.120241800e-2); close(s.h, 0.975542239e6); close(s.s, 0.258041912e4); close(s.cp!, 0.465580682e4);
  });
  it('région 2, T = 300 K, p = 0,0035 MPa', () => {
    const s = statePT(3500, 300);
    expect(s.phase).toBe('vapeur-surchauffee');
    close(s.v, 0.394913866e2); close(s.h, 0.254991145e7); close(s.u, 0.241169160e7);
    close(s.s, 0.852238967e4); close(s.cp!, 0.191300162e4);
  });
  it('région 2, T = 700 K, p = 0,0035 MPa', () => {
    const s = statePT(3500, 700);
    close(s.v, 0.923015898e2); close(s.h, 0.333568375e7); close(s.s, 0.101749996e5); close(s.cp!, 0.208141274e4);
  });
  it('région 4 : pression de saturation à T = 300, 500, 600 K', () => {
    close(saturationT(300).p, 0.353658941e-2 * 1e6);
    close(saturationT(500).p, 0.263889776e1 * 1e6);
    close(saturationT(600).p, 0.123443146e2 * 1e6);
  });
  it('région 4 : température de saturation à p = 0,1 ; 1 ; 10 MPa', () => {
    close(Tsat(0.1e6), 0.372755919e3);
    close(Tsat(1e6), 0.453035632e3);
    close(Tsat(10e6), 0.584149488e3);
  });
});

describe('steam : cohérence et usage industriel', () => {
  it('ébullition à la pression atmosphérique normale : 99,974 °C', () => {
    expect(Tsat(101325) - 273.15).toBeCloseTo(99.974, 3);
  });
  it('h = hf + x·hfg et aller-retour (p,h) ↔ (p,x)', () => {
    const sat = saturationP(1e6);
    const w = statePx(1e6, 0.3);
    expect(w.phase).toBe('vapeur-humide');
    close(w.h, sat.hf + 0.3 * sat.hfg, 1e-9);
    const back = statePH(1e6, w.h);
    expect(back.x).toBeCloseTo(0.3, 9);
    expect(back.T).toBeCloseTo(sat.T, 9);
  });
  it('liquide saturé et vapeur saturée aux extrémités du titre', () => {
    expect(statePx(1e6, 0).phase).toBe('liquide-sature');
    expect(statePx(1e6, 1).phase).toBe('vapeur-saturee');
  });
  it('surchauffe et sous-refroidissement signalés par dTsat', () => {
    expect(statePT(1e6, 573.15).dTsat).toBeCloseTo(573.15 - Tsat(1e6), 9);
    expect(statePT(1e6, 300).dTsat).toBeLessThan(0);
  });
  it('isentropique : (p,s) conserve s', () => {
    const a = statePT(3e6, 673.15);
    const b = statePS(0.5e6, a.s);
    close(b.s, a.s, 1e-8);
  });
  it('enthalpie de l’eau à 400 °C / 3 MPa proche des tables usuelles (3231,5 kJ/kg)', () => {
    expect(statePT(3e6, 673.15).h / 1e3).toBeCloseTo(3231.5, 0);
  });
  it('hors domaine : erreur explicite', () => {
    expect(() => statePT(20e6, 600)).toThrow(SteamDomainError);
    expect(() => statePT(1e6, 1500)).toThrow(SteamDomainError);
    expect(() => statePT(100, 400)).toThrow(SteamDomainError);
    expect(() => statePx(1e6, 1.2)).toThrow(SteamDomainError);
    expect(() => statePT(NaN, 400)).toThrow(SteamDomainError);
    expect(() => saturationT(200)).toThrow(SteamDomainError);
  });
});
