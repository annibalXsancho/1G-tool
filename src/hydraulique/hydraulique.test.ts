import { describe, expect, it } from 'vitest';
import { statePT } from '@/thermo/steam';
import { colebrook, darcy, frictionFactor, swameeJain, velocity } from './friction';
import { custom, water } from './fluid';
import { compute, isOk, type Net, type NetResult, type Section } from './network';
import { PRESETS } from './presets';
import { kBendRound, kBendSharp, kContract, kEnlarge, singularityK } from './singularities';

const ok = (n: Net): NetResult => { const r = compute(n); if (!isOk(r)) throw new Error(r.errors.join(' ')); return r; };
const sec = (over: Partial<Section> = {}): Section => ({ id: 's1', nom: 'T', D_mm: 100, L_m: 100, materiau: 'acier', dz_m: 0, sings: [], ...over });
const net = (over: Partial<Net> = {}, s: Section[] = [sec()]): Net => ({ fluid: water(20), Q_m3h: 36, method: 'colebrook', kMode: 'defaut', sections: s, ...over });

describe('eau', () => {
  it('ρ et ν à 20 °C, et accord avec IAPWS-IF97 à pression atmosphérique', () => {
    const w = water(20);
    expect(w.rho).toBeCloseTo(998.2, 6); expect(w.nu).toBeCloseTo(1.002e-3 / 998.2, 12);
    for (const T of [10, 40, 60, 80]) expect(Math.abs(water(T).rho - statePT(101325, T + 273.15).rho) / water(T).rho).toBeLessThan(0.001);
    expect(water(25).rho).toBeCloseTo((998.2 + 995.7) / 2, 6); // interpolation linéaire
    expect(() => water(120)).toThrow(/hors tableau/);
  });
});

describe('frottement', () => {
  it('laminaire : f = 64/Re ; continuité aux bornes de la zone de transition', () => {
    expect(frictionFactor(1000, 1e-3)).toEqual({ f: 0.064, regime: 'laminaire' });
    expect(frictionFactor(2000, 1e-3).f).toBeCloseTo(0.032, 12);
    const t = frictionFactor(3000, 1e-3); expect(t.regime).toBe('transition');
    expect(t.f).toBeGreaterThan(0.032); expect(t.f).toBeLessThan(colebrook(4000, 1e-3) + 1e-9 + 0.1);
    expect(frictionFactor(4000.0001, 1e-3).regime).toBe('turbulent');
    expect(() => frictionFactor(0, 1e-3)).toThrow();
  });
  it('Colebrook : vérifie l’équation implicite et colle à Moody (Re = 10⁵, ε/D = 10⁻³ → 0,0222)', () => {
    const f = colebrook(1e5, 1e-3);
    expect(Math.abs(1 / Math.sqrt(f) + 2 * Math.log10(1e-3 / 3.7 + 2.51 / (1e5 * Math.sqrt(f))))).toBeLessThan(1e-10);
    expect(f).toBeGreaterThan(0.0217); expect(f).toBeLessThan(0.0227);
    expect(Math.abs(swameeJain(1e5, 1e-3) - f) / f).toBeLessThan(0.02); // Swamee-Jain à moins de 2 %
    const smooth = colebrook(1e5, 1e-10); expect(smooth).toBeGreaterThan(0.0175); expect(smooth).toBeLessThan(0.0185);
  });
  it('Colebrook converge sur tout le domaine', () => {
    for (const Re of [4.1e3, 1e4, 1e5, 1e6, 1e7, 1e8]) for (const rel of [1e-6, 1e-4, 1e-3, 1e-2, 5e-2]) { const f = colebrook(Re, rel); expect(Number.isFinite(f) && f > 0.005 && f < 0.2).toBe(true); }
  });
});

describe('singularités', () => {
  it('Weisbach : coude arrondi 90° R/D = 1,5 → 0,17 ; proportionnel à l’angle ; coude vif 90° → 0,99', () => {
    expect(kBendRound(90, 1.5)).toBeCloseTo(0.131 + 1.847 * Math.pow(1 / 3, 3.5), 12);
    expect(kBendRound(90, 1.5)).toBeGreaterThan(0.169); expect(kBendRound(90, 1.5)).toBeLessThan(0.172);
    expect(kBendRound(45, 1.5)).toBeCloseTo(kBendRound(90, 1.5) / 2, 12);
    expect(kBendRound(90, 1)).toBeGreaterThan(kBendRound(90, 3)); // plus le rayon est grand, moins on perd
    expect(kBendSharp(90)).toBeCloseTo(0.946 * 0.5 + 2.05 * 0.25, 12); expect(kBendSharp(45)).toBeLessThan(kBendSharp(90));
  });
  it('Borda-Carnot : élargissement brusque β = 0,5 → 0,5625 ; rétrécissement brusque → 0,375 ; conique plus doux', () => {
    expect(kEnlarge(0.5, 180)).toBeCloseTo(0.5625, 12); expect(kContract(0.5, 180)).toBeCloseTo(0.375, 12);
    expect(kEnlarge(0.5, 20)).toBeLessThan(kEnlarge(0.5, 180)); expect(kContract(0.5, 20)).toBeLessThan(kContract(0.5, 180));
    expect(kEnlarge(1, 180)).toBe(0); // même diamètre : rien à perdre
  });
  it('rapportés à la vitesse du tronçon : rétrécissement 100 → 50 mm = 0,375 × 16 = 6', () => {
    const k = singularityK({ id: 'x', def: 'retrecissement', qty: 1, cone: 180 }, 0.1, 0.05);
    expect(k.K).toBeCloseTo(6, 12);
    expect(singularityK({ id: 'x', def: 'elargissement', qty: 1, cone: 180 }, 0.05, 0.1).K).toBeCloseTo(0.5625, 12);
    expect(singularityK({ id: 'x', def: 'elargissement', qty: 1 }, 0.1, 0.05).warning).toMatch(/pas plus grand/);
    expect(singularityK({ id: 'x', def: 'retrecissement', qty: 1 }, 0.1).warning).toMatch(/Aucun tronçon suivant/);
  });
  it('catalogue : valeurs par défaut dans leur plage, K libre', () => {
    const v = singularityK({ id: 'x', def: 'vanne-soupape', qty: 1 }, 0.05);
    expect(v.Kmin).toBeLessThanOrEqual(v.K); expect(v.Kmax).toBeGreaterThanOrEqual(v.K);
    expect(singularityK({ id: 'x', def: 'libre', qty: 1, K: 3.3 }, 0.05).K).toBe(3.3);
    expect(() => singularityK({ id: 'x', def: 'inconnue', qty: 1 }, 0.05)).toThrow();
  });
});

describe('cas de référence du cours : conduite forcée (HYDRAULIQUE.xlsx)', () => {
  const r = ok(PRESETS.find((p) => p.id === 'conduite-forcee')!.net);
  const sr = r.sections[0];
  it('vitesse 8,49 m/s, Reynolds 2,547·10⁷, f = 0,008980 (Swamee-Jain)', () => {
    expect(sr.v).toBeCloseTo(8.49, 9); expect(sr.Re).toBeCloseTo(25470000, 0); expect(sr.f).toBeCloseTo(0.008980449378, 9);
  });
  it('pertes linéiques 4,3990 m et singulières 10,2867 m, total 14,6857 m', () => {
    expect(r.sections[0].dpLin / (1000 * 9.81)).toBeCloseTo(4.398992111, 6);
    expect(r.dpSing / (1000 * 9.81)).toBeCloseTo(10.28666055, 6);
    expect(r.hFrict).toBeCloseTo(14.68565266, 6);
    expect(r.Ktot).toBeCloseTo(2.8, 12);
  });
  it('Colebrook-White donne une valeur voisine (écart < 1 %)', () => {
    const n = { ...PRESETS.find((p) => p.id === 'conduite-forcee')!.net, method: 'colebrook' as const };
    expect(Math.abs(ok(n).hFrict - r.hFrict) / r.hFrict).toBeLessThan(0.01);
  });
});

describe('réseau', () => {
  it('un tronçon : Darcy-Weisbach et cohérence des grandeurs', () => {
    const r = ok(net());
    const s = r.sections[0];
    expect(s.v).toBeCloseTo(0.01 / (Math.PI * 0.05 ** 2), 9);
    expect(s.dpLin).toBeCloseTo(darcy(s.f, 100, 0.1, 998.2, velocity(0.01, 0.1)), 6);
    expect(s.R).toBeCloseTo(s.dpLin / 100, 9); expect(s.R).toBeGreaterThan(100); expect(s.R).toBeLessThan(250); // ≈ 150 Pa/m à 1,27 m/s
    expect(r.dpTotal).toBeCloseTo(r.dpFrict, 9);
  });
  it('hauteur statique : ρ g Δz', () => { const r = ok(net({}, [sec({ dz_m: 10 })])); expect(r.dpStatic).toBeCloseTo(998.2 * 9.81 * 10, 6); expect(r.dpTotal).toBeCloseTo(r.dpFrict + r.dpStatic, 9); expect(r.hTotal).toBeCloseTo(r.hFrict + 10, 6); });
  it('plusieurs tronçons : cumul continu, débit propre, rétrécissement relié au tronçon suivant', () => {
    const r = ok(net({}, [sec({ id: 'a', sings: [{ id: 'x', def: 'retrecissement', qty: 1, cone: 180 }] }), sec({ id: 'b', D_mm: 50, L_m: 20 })]));
    expect(r.sections[0].cumEnd).toBeCloseTo(r.sections[1].cumStart, 9); expect(r.sections[1].cumEnd).toBeCloseTo(r.dpFrict, 9);
    expect(r.sections[0].items[0].K).toBeCloseTo(6, 9);
    expect(r.sections[1].v).toBeCloseTo(4 * r.sections[0].v, 9); // (100/50)² = 4
    const own = ok(net({}, [sec({ id: 'a' }), sec({ id: 'b', Q_m3h: 18 })]));
    expect(own.sections[1].Q).toBeCloseTo(0.005, 12);
  });
  it('plage des coefficients : min ≤ défaut ≤ max, et le mode « max » donne les pertes maximales', () => {
    const s = sec({ sings: [{ id: 'x', def: 'vanne-soupape', qty: 2 }, { id: 'y', def: 'clapet-battant', qty: 1 }] });
    const d = ok(net({}, [s])); const hi = ok(net({ kMode: 'max' }, [s])); const lo = ok(net({ kMode: 'min' }, [s]));
    expect(d.dpFrictMin).toBeLessThanOrEqual(d.dpFrict); expect(d.dpFrictMax).toBeGreaterThanOrEqual(d.dpFrict);
    expect(lo.dpFrict).toBeCloseTo(d.dpFrictMin, 6); expect(hi.dpFrict).toBeCloseTo(d.dpFrictMax, 6);
  });
  it('contrôles : vitesse trop élevée, trop faible, transition, aspiration, part des singularités', () => {
    expect(ok(net({ Q_m3h: 60 })).checks.find((c) => c.id === 'v-s1')?.level).toBe('warn'); // 2,1 m/s
    expect(ok(net({ Q_m3h: 100 })).checks.find((c) => c.id === 'v-s1')?.level).toBe('ko'); // 3,5 m/s > 1,5 × 2
    expect(ok(net({ Q_m3h: 200 })).checks.find((c) => c.id === 'v-s1')?.level).toBe('ko'); // 7 m/s
    expect(ok(net({ Q_m3h: 1 })).checks.find((c) => c.id === 'v-s1')?.level).toBe('warn'); // 0,035 m/s
    expect(ok(net({ Q_m3h: 36 })).checks.find((c) => c.id === 'v-s1')?.level).toBe('ok');
    const lam = ok(net({ fluid: custom(900, 300), Q_m3h: 3 })); expect(lam.sections[0].regime).toBe('laminaire');
    const tr = ok(net({ fluid: custom(1000, 40), Q_m3h: 36 })); expect(tr.sections[0].regime).toBe('transition'); expect(tr.checks.some((c) => c.id === 're-s1' && c.level === 'warn')).toBe(true);
    const asp = ok(net({ aspiration: true, Q_m3h: 45 })); expect(asp.checks.find((c) => c.id === 'v-s1')?.level).toBe('warn'); // 1,59 m/s > 1,5
    const many = ok(net({ Q_m3h: 36 }, [sec({ L_m: 2, sings: [{ id: 'x', def: 'vanne-soupape', qty: 5 }] })])); expect(many.checks.find((c) => c.id === 'part')?.level).toBe('warn');
  });
  it('préréglages : tous calculables, sans erreur bloquante, formules produites', () => {
    for (const p of PRESETS) {
      const r = ok(p.net); expect(r.dpFrict).toBeGreaterThan(0); expect(r.formulas).toHaveLength(5);
      // Les repères de vitesse sont ceux du bâtiment : la conduite forcée du cours (8,5 m/s) les dépasse à juste titre.
      expect(r.checks.filter((c) => c.level === 'ko')).toHaveLength(p.id === 'conduite-forcee' ? 1 : 0);
    }
  });
});

describe('cas limites', () => {
  it('entrées invalides : erreurs explicites, jamais de NaN', () => {
    const bad = (n: Net) => { const r = compute(n); expect(isOk(r)).toBe(false); return (r as { errors: string[] }).errors.join(' '); };
    expect(bad(net({}, []))).toMatch(/au moins un tronçon/);
    expect(bad(net({}, [sec({ D_mm: 0 })]))).toMatch(/diamètre/);
    expect(bad(net({ Q_m3h: 0 }))).toMatch(/débit/);
    expect(bad(net({}, [sec({ L_m: -1 })]))).toMatch(/longueur/);
    expect(bad(net({ fluid: custom(0, 1) }))).toMatch(/masse volumique/i);
    expect(bad(net({}, [sec({ materiau: 'inconnu' })]))).toMatch(/matériau/);
  });
  it('longueur nulle : seules les singularités comptent', () => {
    const r = ok(net({}, [sec({ L_m: 0, sings: [{ id: 'x', def: 'vanne-sphere', qty: 1 }] })]));
    expect(r.dpLin).toBe(0); expect(r.dpSing).toBeGreaterThan(0); expect(Number.isFinite(r.sections[0].R)).toBe(true);
  });
  it('quantité zéro : aucune perte', () => { const r = ok(net({}, [sec({ L_m: 0, sings: [{ id: 'x', def: 'vanne-sphere', qty: 0 }] })])); expect(r.dpFrict).toBe(0); expect(r.shareSing).toBe(0); });
});
