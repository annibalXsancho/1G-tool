import { describe, expect, it } from 'vitest';
import { calculate, flatten } from './calc';
import { EXEMPLE_UNIFILAIRE } from './exemple';
import type { Installation, UElement } from './model';

const inst = (elements: UElement[]): Installation => ({ id: 'i', name: 'i', site: '', elements });
const el = (id: string, kind: UElement['kind'], parent?: string, more: Partial<UElement> = {}): UElement => ({ id, label: id, kind, parent, ...more });
const SQ3 = Math.sqrt(3);

describe('courants et puissances', () => {
  // Transformateur 1000 kVA / 400 V : In = 1000 / (√3 × 0,4) = 1443,4 A.
  it('courant secondaire d’un transformateur chargé à 100 %', () => {
    const c = calculate(inst([el('R', 'reseau', undefined, { voltage: 20000 }), el('T', 'transformateur', 'R', { s: 1000, u2: 400, ukk: 6 }), el('L', 'charge', 'T', { p: 1000, cosphi: 1 })]));
    expect(c.nodes.get('T')!.ibOwn).toBeCloseTo(1443.38, 1);
    expect(c.nodes.get('T')!.loading).toBeCloseTo(1, 9);
    expect(c.nodes.get('T')!.ib).toBeCloseTo(1443.38 * 400 / 20000, 1); // côté HTA
  });
  // Moteur 75 kW, η = 0,93, cos φ = 0,86, 400 V : P = 80,65 kW ; S = 93,78 kVA ; I = 135,4 A.
  it('moteur : rendement et facteur de puissance', () => {
    const c = calculate(inst([el('B', 'tableau', undefined, { voltage: 400 }), el('M', 'moteur', 'B', { p: 75, eta: 0.93, cosphi: 0.86 })]));
    const n = c.nodes.get('M')!;
    expect(n.p).toBeCloseTo(75 / 0.93, 9);
    expect(n.s).toBeCloseTo(75 / 0.93 / 0.86, 6);
    expect(n.ib).toBeCloseTo((75 / 0.93 / 0.86) * 1000 / (SQ3 * 400), 6);
  });
  it('simultanéité, condensateurs (réactif compensé) et groupe exclu', () => {
    const c = calculate(inst([
      el('B', 'tableau', undefined, { voltage: 400, ks: 0.5 }),
      el('L1', 'charge', 'B', { p: 100, cosphi: 0.8 }), el('L2', 'charge', 'B', { p: 100, cosphi: 0.8 }),
      el('K', 'condensateurs', 'B', { q: 150 }), el('G', 'groupe', 'B', { s: 500 }),
    ]));
    const b = c.nodes.get('B')!;
    expect(b.p).toBeCloseTo(100, 9); // 0,5 × 200
    expect(b.q).toBeCloseTo(0.5 * (2 * 75 - 150), 9); // charges : 75 kvar chacune ; condensateurs −150
    expect(b.s).toBeCloseTo(100, 6);
  });
});

describe('court-circuit', () => {
  // Source infinie : Icc = In × 100 / ukk × (c = 1,05 pris en compte) → 1443,4 × 100 / 6 = 24,06 kA ; × 1,05 = 25,26 kA.
  it('secondaire d’un transformateur 1000 kVA, ukk 6 %, source infinie', () => {
    const c = calculate(inst([el('R', 'reseau', undefined, { voltage: 20000 }), el('T', 'transformateur', 'R', { s: 1000, u2: 400, ukk: 6 })]));
    expect(c.nodes.get('T')!.icc).toBeCloseTo((1443.38 * 100 / 6 / 1000) * 1.05, 2);
    expect(c.issues.some((i) => /infinie/.test(i.message))).toBe(true);
  });
  // Avec Scc = 500 MVA : Zq (réf. 20 kV) = 1,05 × 20000² / 500e6 = 0,84 Ω → ramené à 400 V : 0,84 × (400/20000)² = 0,336 mΩ.
  // Zt = 0,06 × 400² / 1e6 = 9,6 mΩ. Z = |0,336 mΩ (R/X = 0,1) + 9,6 mΩ en réactance|.
  it('prise en compte du réseau amont (puissance de court-circuit)', () => {
    const c = calculate(inst([el('R', 'reseau', undefined, { voltage: 20000, scc: 500 }), el('T', 'transformateur', 'R', { s: 1000, u2: 400, ukk: 6 })]));
    const zq = 0.84 * (400 / 20000) ** 2;
    const rx = 0.1;
    const xq = zq / Math.sqrt(1 + rx * rx);
    const r = rx * xq;
    const x = xq + 0.0096;
    expect(c.nodes.get('T')!.icc).toBeCloseTo((1.05 * 400) / (SQ3 * Math.hypot(r, x)) / 1000, 3);
    expect(c.nodes.get('T')!.icc).toBeLessThan(25.26);
  });
  // Câble Cu 185 mm², 100 m : R = 0,017241 × 100 / 185 = 9,32 mΩ ; X = 0,08 × 100 / 1000 = 8 mΩ.
  it('un câble réduit l’Icc ; le pouvoir de coupure est contrôlé à l’amont de la protection', () => {
    const base = [
      el('R', 'reseau', undefined, { voltage: 20000 }),
      el('T', 'transformateur', 'R', { s: 1000, u2: 400, ukk: 6 }),
      el('B', 'tableau', 'T', {}),
    ];
    const withCable = calculate(inst([...base, el('L', 'charge', 'B', { p: 10, breaker: { type: 'disjoncteur', in: 32, icu: 10 }, cable: { material: 'cuivre', section: 185, length: 100 } })]));
    const iccB = withCable.nodes.get('B')!.icc;
    const zb = (1.05 * 400) / (SQ3 * iccB * 1000);
    expect(zb).toBeCloseTo(0.0096, 4);
    const n = withCable.nodes.get('L')!;
    const rc = 0.017241 * 100 / 185;
    const xc = 0.008;
    expect(n.icc).toBeCloseTo((1.05 * 400) / (SQ3 * Math.hypot(rc, 0.0096 + xc)) / 1000, 3);
    expect(n.iccUp).toBeCloseTo(iccB, 9);
    // 25,3 kA à l'amont > Icu 10 kA : erreur
    expect(withCable.issues.some((i) => i.level === 'erreur' && /pouvoir de coupure/.test(i.message))).toBe(true);
  });
});

describe('chute de tension', () => {
  // I = 100 A, 50 m Cu 35 mm², cos φ = 0,85 : R = 0,0225 × 50 / 35 = 32,14 mΩ ; X = 4 mΩ ;
  // ΔU = √3 × 100 × (0,03214 × 0,85 + 0,004 × 0,5268) = 5,10 V = 1,27 %.
  it('calcul sur un départ', () => {
    const p = SQ3 * 400 * 100 * 0.85 / 1000; // kW donnant 100 A
    const c = calculate(inst([el('B', 'tableau', undefined, { voltage: 400 }), el('L', 'charge', 'B', { p, cosphi: 0.85, cable: { material: 'cuivre', section: 35, length: 50 } })]));
    const n = c.nodes.get('L')!;
    expect(n.ib).toBeCloseTo(100, 6);
    const du = SQ3 * 100 * ((0.0225 * 50 / 35) * 0.85 + 0.004 * Math.sqrt(1 - 0.85 ** 2)) / 400 * 100;
    expect(n.duLink).toBeCloseTo(du, 9);
    expect(n.duLink).toBeCloseTo(1.27, 1);
  });
  it('cumul le long de la chaîne et alerte au-delà de la limite', () => {
    const p = SQ3 * 400 * 100 * 0.85 / 1000;
    const c = calculate(inst([
      el('B', 'tableau', undefined, { voltage: 400 }),
      el('B2', 'tableau', 'B', { cable: { material: 'aluminium', section: 16, length: 300 } }),
      el('L', 'charge', 'B2', { p, cosphi: 0.85, cable: { material: 'cuivre', section: 35, length: 50 } }),
    ]));
    expect(c.nodes.get('L')!.du).toBeCloseTo(c.nodes.get('B2')!.duLink + c.nodes.get('L')!.duLink, 9);
    expect(c.issues.some((i) => /chute de tension cumulée/.test(i.message))).toBe(true);
  });
});

describe('contrôles', () => {
  it('calibre insuffisant, surcharge de transformateur, barres sous-dimensionnées', () => {
    const c = calculate(inst([
      el('R', 'reseau', undefined, { voltage: 20000 }),
      el('T', 'transformateur', 'R', { s: 100, u2: 400, ukk: 4 }),
      el('B', 'tableau', 'T', { inBar: 50 }),
      el('L', 'charge', 'B', { p: 120, cosphi: 1, breaker: { type: 'disjoncteur', in: 100, icu: 50 } }),
    ]));
    const m = c.issues.map((i) => i.message).join(' | ');
    expect(m).toMatch(/calibre 100 A inférieur/);
    expect(m).toMatch(/surchargé/);
    expect(m).toMatch(/barres/);
  });
  it('anomalies de structure sans exception', () => {
    const c = calculate(inst([el('A', 'charge', 'Z'), el('A', 'charge'), el('X', 'tableau', 'Y'), el('Y', 'tableau', 'X'), el('M', 'moteur', undefined), el('C', 'charge', 'M')]));
    const m = c.issues.map((i) => i.message).join(' | ');
    expect(m).toMatch(/inconnu/);
    expect(m).toMatch(/plusieurs fois/);
    expect(m).toMatch(/Boucle/);
    expect(m).toMatch(/ne peut pas alimenter/);
    expect(() => flatten(c)).not.toThrow();
  });
  it('installation vide', () => {
    const c = calculate(inst([]));
    expect(c.nodes.size).toBe(0);
    expect(c.issues).toEqual([]);
  });
});

describe('installations exemple', () => {
  for (const i of EXEMPLE_UNIFILAIRE.installations) {
    it(`${i.id} : aucune erreur de structure ni de dimensionnement`, () => {
      const c = calculate(i);
      expect(c.issues.filter((x) => x.level === 'erreur')).toEqual([]);
      expect(flatten(c)).toHaveLength(i.elements.length);
    });
  }
  it('poste industriel : ordres de grandeur', () => {
    const c = calculate(EXEMPLE_UNIFILAIRE.installations[0]);
    const tr = c.nodes.get('TR1')!;
    expect(tr.loading).toBeGreaterThan(0.3);
    expect(tr.loading).toBeLessThan(0.9);
    // 1600 kVA, ukk 6 %, Pk 16 kW, Scc 250 MVA, 4 × 300 mm² sur 8 m : environ 35 kA (source infinie : 40 kA).
    expect(c.nodes.get('TGBT')!.icc).toBeGreaterThan(33);
    expect(c.nodes.get('TGBT')!.icc).toBeLessThan(38);
  });
});
