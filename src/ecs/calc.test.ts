import { describe, expect, it } from 'vitest';
import { commercialSplit, compute, costicPower, defaultInput, demandProfile, isOk, needs, powerForVolume, simulate, staticLossW, type EcsInput, type EcsResult } from './calc';

// Cas de référence : 100 logements T3, eau froide 9 °C, stockage 60 °C (conditions des formules COSTIC).
function t3(n = 100, over: Partial<EcsInput> = {}): EcsInput {
  const d = defaultInput();
  return { ...d, logements: { T1: 0, T2: 0, T3: n, T4: 0, T5: 0 }, Tfroide: 9, Tstock: 60, ...over };
}
const ok = (i: EcsInput): EcsResult => { const r = compute(i); if (!isOk(r)) throw new Error(r.errors.join(' ')); return r; };
const e = (1.163 * 51) / 1000; // kWh par litre à 60 °C, eau froide à 9 °C

describe('besoins', () => {
  it('100 T3 : Ns, énergie journalière et pointes COSTIC (calcul à la main)', () => {
    const n = needs(t3());
    expect(n.Ns).toBe(100);
    expect(n.V40).toBe(11000);
    // 11 000 L × 1,163 Wh/(L·K) × 31 K = 396,6 kWh/j
    expect(n.Ejour).toBeCloseTo(11000 * 1.163 * 31 / 1000, 6);
    // 61 × 100^0,503 = 618,5 L ; 83 × 100^0,708 = 2 163 L ; 294 × 100^0,762 = 9 825 L (à 60 °C, 9 °C)
    expect(n.V10).toBeCloseTo(61 * Math.pow(100, 0.503), 6);
    expect(n.V10).toBeGreaterThan(618); expect(n.V10).toBeLessThan(619);
    expect(n.V60).toBeGreaterThan(2150); expect(n.V60).toBeLessThan(2180);
    expect(n.V480).toBeGreaterThan(9800); expect(n.V480).toBeLessThan(9850);
    expect(n.E10).toBeCloseTo(n.V10 * e, 6);
  });
  it('conservation de l’énergie quand Tstock ou Tfroide changent', () => {
    const a = needs(t3()); const b = needs(t3(100, { Tstock: 55, Tfroide: 12 }));
    expect(b.V10 * b.eLitre).toBeCloseTo(a.V10 * a.eLitre, 6); // la pointe en énergie est inchangée…
    expect(b.V10).toBeGreaterThan(a.V10); // …mais plus de litres à 55 °C
    expect(b.Vjour).toBeCloseTo(11000 * 28 / 43, 6);
  });
  it('les usages tertiaires augmentent Ns par le besoin d’un T3', () => {
    const i = t3(0); i.tertiaire = { ...i.tertiaire, hopital: { n: 100, ratio: 90 } };
    const n = needs(i);
    expect(n.V40).toBe(9000);
    expect(n.Ns).toBeCloseTo(9000 / 110, 9);
  });
});

describe('profil et puissances', () => {
  it('profil cumulé : interpolation aux points d’ancrage, croissant', () => {
    const n = needs(t3()); const p = demandProfile(n, 8);
    expect(p.t.length).toBe(481);
    expect(p.D[10]).toBeCloseTo(n.V10, 9); expect(p.D[60]).toBeCloseTo(n.V60, 9); expect(p.D[480]).toBeCloseTo(n.V480, 9);
    for (let k = 1; k < p.D.length; k++) expect(p.D[k]).toBeGreaterThanOrEqual(p.D[k - 1]);
    expect(demandProfile(n, 2).t.length).toBe(121);
  });
  it('instantané : P = 6·E10 + Pboucle (10 min dimensionnant)', () => {
    const r = ok({ ...t3(), mode: 'instantane' });
    expect(r.modes.instantane.P).toBeCloseTo(6 * r.needs.E10 + r.Pboucle, 6);
    // 6 × 36,69 + 0,6 × 396,6/24 ≈ 230,0 kW
    expect(r.modes.instantane.P).toBeGreaterThan(229); expect(r.modes.instantane.P).toBeLessThan(231);
    expect(r.modes.instantane.pertesStatiques).toBe(0);
  });
  it('la puissance requise décroît avec le volume et s’annule au volume de couverture', () => {
    const n = needs(t3()); const p = demandProfile(n, 8);
    const P = [0, 300, 1000, 3000, 20000].map((V) => powerForVolume(V, 0.8, n, p, 0));
    for (let k = 1; k < P.length; k++) expect(P[k]).toBeLessThanOrEqual(P[k - 1]);
    expect(P[4]).toBe(0); // 0,8 × 20 000 L > 9 825 L de besoin sur 8 h
    // 1 000 L, a = 0,8 : pire instant vers 1 h → (2 163 − 800) × e / 1 h ≈ 80,8 kW
    expect(P[2]).toBeGreaterThan(75); expect(P[2]).toBeLessThan(90);
  });
  it('corrélation COSTIC : 100 logements, 1 000 L, circulateur permanent', () => {
    // 100 × 14 × 1000^-0,365 = 112,6 kW
    expect(costicPower(1000, 100, false)).toBeCloseTo(100 * 14 * Math.pow(1000, -0.365), 9);
    expect(costicPower(1000, 100, false)).toBeGreaterThan(112); expect(costicPower(1000, 100, false)).toBeLessThan(113);
    expect(costicPower(1000, 100, true)).toBeCloseTo(100 * 17 * Math.pow(1000, -0.385), 9);
  });
});

describe('modes', () => {
  it('accumulation : volume du besoin journalier / a, reconstitution 8 h, rendement 0,9', () => {
    const r = ok({ ...t3(), mode: 'accumulation' });
    // Vj = 396,6 / 0,059313 = 6 686 L à 60 °C ; /0,8 = 8 358 L → 2 ballons de 5 000 L
    expect(r.modes.accumulation.ballons).toBe(2);
    expect(r.modes.accumulation.V).toBe(10000);
    const P = (1.163 * 10000 * 51) / (8 * 1000) / 0.9 + r.Pboucle;
    expect(r.modes.accumulation.P).toBeCloseTo(P, 6);
    expect(r.sim.manque).toBe(0);
  });
  it('semi-instantané : volume automatique, puissance = max(bilan, corrélation), pointe couverte', () => {
    const r = ok({ ...t3(), mode: 'semi' });
    // V10/a = 618,5/0,8 = 773 L → 1 000 L
    expect(r.modes.semi.V).toBe(1000);
    expect(r.modes.semi.P).toBeGreaterThanOrEqual(112); // corrélation 112,6 kW
    expect(r.sim.manque).toBe(0);
    expect(r.checks.find((c) => c.id === 'pointe')?.level).toBe('ok');
    const c1000 = r.couples.find((c) => c.V === 1000)!;
    expect(c1000.P).toBeCloseTo(Math.max(c1000.Pbilan, c1000.Pcostic!), 9);
  });
  it('circulateur arrêtable : V1 impose un volume plus grand', () => {
    const r = ok({ ...t3(), mode: 'semi', circulateurArretable: true });
    expect(r.modes.semi.V).toBeGreaterThan(r.V1 - 1e-9);
    const r2 = ok({ ...t3(), mode: 'semi', circulateurArretable: true, volume: 500 });
    expect(r2.checks.some((c) => c.id === 'v1')).toBe(true);
  });
  it('un ballon trop petit avec une puissance trop faible laisse un déficit', () => {
    const n = needs(t3()); const p = demandProfile(n, 8);
    const s = simulate(500, 40, 0.8, n, p, 10);
    expect(s.manque).toBeGreaterThan(0); expect(s.premierManque).not.toBeNull();
    expect(Math.min(...s.stock)).toBeGreaterThanOrEqual(0);
    const full = simulate(1000, 300, 0.8, n, p, 10);
    expect(full.manque).toBe(0);
  });
});

describe('pertes et vérifications', () => {
  it('pertes statiques : règlement 814/2013, ramenées à l’écart de température', () => {
    // 1 000 L : 16,66 + 8,33 × 1000^0,4 = 16,66 + 8,33 × 15,849 = 148,7 W à 45 K
    expect(staticLossW(1000, 65, 20)).toBeCloseTo(16.66 + 8.33 * Math.pow(1000, 0.4), 9);
    expect(staticLossW(1000, 60, 20)).toBeCloseTo((16.66 + 8.33 * Math.pow(1000, 0.4)) * 40 / 45, 9);
  });
  it('découpe commerciale', () => {
    expect(commercialSplit(800)).toEqual({ V: 1000, n: 1 });
    expect(commercialSplit(5000)).toEqual({ V: 5000, n: 1 });
    expect(commercialSplit(5001)).toEqual({ V: 10000, n: 2 });
  });
  it('réglementation : stockage ≥ 400 L à 45 °C et retour de boucle à 45 °C sont refusés', () => {
    const r = ok({ ...t3(), Tstock: 45, TretourBoucle: 45, limitation50: false });
    expect(r.checks.find((c) => c.id === 'legio-stock')?.level).toBe('ko');
    expect(r.checks.find((c) => c.id === 'legio-boucle')?.level).toBe('ko');
    expect(r.checks.find((c) => c.id === 'brulure')?.level).toBe('warn');
    const good = ok(t3());
    expect(good.checks.filter((c) => c.level === 'ko')).toHaveLength(0);
  });
  it('puissance disponible insuffisante, pompe à chaleur en instantané', () => {
    const r = ok({ ...t3(), Pdispo: 20 });
    expect(r.checks.find((c) => c.id === 'puissance')?.level).toBe('ko');
    expect(ok({ ...t3(), mode: 'instantane', generateur: 'pac' }).checks.find((c) => c.id === 'pac-inst')?.level).toBe('ko');
  });
});

describe('cas limites', () => {
  it('aucun logement : erreur', () => { const r = compute(t3(0)); expect(isOk(r)).toBe(false); });
  it('températures incohérentes : erreur', () => {
    expect(isOk(compute(t3(100, { Tstock: 12, Tfroide: 10 })))).toBe(false);
    expect(isOk(compute(t3(100, { a: 1.5 })))).toBe(false);
    expect(isOk(compute(t3(100, { hPointe: 12 })))).toBe(false);
  });
  it('petit ensemble (Ns < 10) : calcul possible avec avertissement', () => {
    const r = ok(t3(5));
    expect(r.checks.some((c) => c.id === 'ns')).toBe(true);
    expect(Number.isFinite(r.retained.P)).toBe(true);
  });
  it('toutes les formules du dossier sont produites', () => { expect(ok(t3()).formulas.length).toBeGreaterThanOrEqual(8); });
});
