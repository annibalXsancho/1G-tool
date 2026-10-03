import { describe, expect, it } from 'vitest';
import { buildTree, checkPlan, evaluate, planStats, recommend } from './analyse';
import { EXEMPLE_PROJET } from './exemple';
import { layoutPlan, wrapLabel } from './layout';
import type { Meter, Plan, PlanNode } from './model';

const node = (id: string, parent?: string, more: Partial<PlanNode> = {}): PlanNode => ({ id, label: id, kind: parent ? 'usage' : 'source', flag: 'actif', parent, ...more });
const meter = (id: string, nodeId: string, status: Meter['status'] = 'existant-communicant'): Meter => ({ id, node: nodeId, status });
const plan = (nodes: PlanNode[], meters: Meter[]): Plan => ({ id: 'p', name: 'p', site: '', carrier: 'Électricité', ratedUnit: 'kVA', nodes, meters });

describe('couverture : règles de calcul', () => {
  // R (compteur) → A, B, C non instrumentés : seul R connu → aucune feuille connue.
  const base = [node('R'), node('A', 'R'), node('B', 'R'), node('C', 'R')];
  it('un parent compté ne suffit pas tant que 2 enfants ou plus sont inconnus', () => {
    const e = evaluate(plan(base, [meter('mR', 'R')]), 'actuel');
    expect(e.coverage).toBe(0);
    expect(e.state.get('A')).toBe('inconnu');
  });
  it('un seul enfant inconnu se déduit par différence', () => {
    const e = evaluate(plan(base, [meter('mR', 'R'), meter('mA', 'A'), meter('mB', 'B')]), 'actuel');
    expect(e.state.get('C')).toBe('difference');
    expect(e.derivedFrom.get('C')).toBe('R');
    expect(e.coverage).toBe(1);
    expect(e.byState).toEqual({ mesure: 2, difference: 1, inconnu: 0 });
  });
  it('tous les enfants comptés : le parent est agrégé sans compteur propre', () => {
    const e = evaluate(plan(base, [meter('a', 'A'), meter('b', 'B'), meter('c', 'C')]), 'actuel');
    expect(e.state.get('R')).toBe('agrege');
    expect(e.coverage).toBe(1);
  });
  it('scénario cible : les compteurs à installer comptent, pas dans l’actuel', () => {
    const p = plan(base, [meter('mR', 'R'), meter('mA', 'A'), meter('mB', 'B', 'a-installer')]);
    expect(evaluate(p, 'actuel').coverage).toBe(1 / 3);
    expect(evaluate(p, 'cible').coverage).toBe(1);
  });
  it('hors périmètre exclu ; réserve et sans consommation comptent comme connus', () => {
    const nodes = [node('R'), node('A', 'R'), node('B', 'R', { flag: 'hors-perimetre' }), node('C', 'R', { flag: 'reserve' })];
    const e = evaluate(plan(nodes, [meter('mR', 'R')]), 'actuel');
    expect(e.state.get('B')).toBe('exclu');
    expect(e.state.get('A')).toBe('difference');
    expect(e.coverage).toBe(1);
  });
  it('pondération : annuel, sinon puissance, sinon nombre', () => {
    const w = (more: Partial<PlanNode>[]) => evaluate(plan([node('R'), node('A', 'R', more[0]), node('B', 'R', more[1])], [meter('mA', 'A')]), 'actuel');
    expect(w([{ annualMWh: 30, rated: 1 }, { annualMWh: 70, rated: 1 }]).basis).toBe('annuel');
    expect(w([{ annualMWh: 30, rated: 1 }, { annualMWh: 70, rated: 1 }]).coverage).toBeCloseTo(0.3, 12);
    expect(w([{ rated: 10 }, { rated: 30 }]).basis).toBe('puissance');
    expect(w([{ rated: 10 }, { rated: 30 }]).coverage).toBeCloseTo(0.25, 12);
    expect(w([{}, {}]).basis).toBe('nombre');
  });
  it('une production locale ne pèse pas dans la couverture de consommation', () => {
    const nodes = [node('R'), node('A', 'R', { rated: 100 }), node('GE', undefined, { kind: 'production', rated: 900 })];
    const e = evaluate(plan(nodes, [meter('mA', 'A')]), 'actuel');
    expect(e.total).toBe(100);
    expect(e.coverage).toBe(1);
    expect(e.weight.has('GE')).toBe(false);
  });
  it('arbre vide ou sans feuille', () => {
    expect(evaluate(plan([], []), 'actuel').coverage).toBe(0);
  });
});

describe('anomalies de structure', () => {
  it('parent inconnu, doublon, boucle : rapportés sans exception', () => {
    const p = plan([node('A', 'Z'), node('A'), node('X', 'Y'), node('Y', 'X')], []);
    const t = buildTree(p);
    expect(t.issues.some((i) => /inconnu/.test(i.message))).toBe(true);
    expect(t.issues.some((i) => /plusieurs fois/.test(i.message))).toBe(true);
    expect(t.broken.size).toBe(2);
    expect(() => evaluate(p, 'actuel', t)).not.toThrow();
    expect(() => layoutPlan(p, 'actuel')).not.toThrow();
  });
  it('compteur sur poste inconnu et repère en double', () => {
    const i = checkPlan(plan([node('R')], [meter('m', 'Z'), meter('m', 'R')]));
    expect(i.filter((x) => x.level === 'erreur').length).toBeGreaterThanOrEqual(2);
  });
  it('communicant sans protocole, TC sans rapport', () => {
    const p = plan([node('R'), node('A', 'R')], [{ id: 'm1', node: 'A', status: 'existant-communicant', device: 'Compteur sur TC' }]);
    const msgs = checkPlan(p).map((x) => x.message).join(' | ');
    expect(msgs).toMatch(/protocole/);
    expect(msgs).toMatch(/rapport de transformation/);
  });
  it('poste significatif non instrumenté signalé selon le seuil', () => {
    const p = plan([node('R'), node('A', 'R', { annualMWh: 90 }), node('B', 'R', { annualMWh: 10 })], [meter('mR', 'R')]);
    const i = checkPlan(p, { significance: 0.5 });
    expect(i.some((x) => x.node === 'A' && /significatif/.test(x.message))).toBe(true);
    expect(i.some((x) => x.node === 'B' && /significatif/.test(x.message))).toBe(false);
  });
});

describe('recommandations', () => {
  it('3 feuilles sous un parent : 2 compteurs suffisent (le troisième se déduit)', () => {
    const p = plan([node('R'), node('A', 'R'), node('B', 'R'), node('C', 'R')], [meter('mR', 'R')]);
    const r = recommend(p, { target: 1 });
    expect(r).toHaveLength(2);
    expect(r.at(-1)!.coverageAfter).toBe(1);
  });
  it('arbre non instrumenté : atteint la cible avec un minimum de compteurs', () => {
    const p = plan([node('R'), node('A', 'R'), node('B', 'R'), node('C', 'R')], []);
    const r = recommend(p, { target: 1 });
    expect(r.length).toBeLessThanOrEqual(3);
    expect(r.at(-1)!.coverageAfter).toBe(1);
  });
  it('déjà couvert : aucune recommandation', () => {
    const p = plan([node('R'), node('A', 'R')], [meter('mA', 'A')]);
    expect(recommend(p, { target: 0.9 })).toEqual([]);
  });
});

describe('projet exemple', () => {
  const [elec, gaz] = EXEMPLE_PROJET.plans;
  it('aucune erreur de structure', () => {
    for (const p of EXEMPLE_PROJET.plans) expect(checkPlan(p).filter((i) => i.level === 'erreur')).toEqual([]);
  });
  it('couverture électrique : actuel < cible, états attendus', () => {
    const s = planStats(elec);
    expect(s.actual.coverage).toBeGreaterThan(0.3);
    expect(s.target.coverage).toBeGreaterThan(s.actual.coverage);
    expect(s.actual.state.get('GF')).toBe('mesure');
    expect(s.actual.state.get('TIERS')).toBe('exclu');
    expect(s.actual.state.get('RES1')).toBe('reserve');
    expect(s.meters).toEqual({ 'existant-communicant': 3, 'existant-manuel': 3, 'a-installer': 3 });
  });
  it('recommandations cohérentes avec le scénario cible', () => {
    const r = recommend(elec, { target: 0.95 });
    let prev = planStats(elec).target.coverage;
    for (const x of r) { expect(x.coverageAfter).toBeGreaterThan(prev - 1e-12); prev = x.coverageAfter; }
  });
  it('plan gaz et vapeur : analysable', () => {
    expect(planStats(gaz).actual.total).toBeGreaterThan(0);
  });
});

describe('mise en page', () => {
  it('chaque poste placé une fois, sans chevauchement vertical dans une colonne', () => {
    for (const p of EXEMPLE_PROJET.plans) {
      const l = layoutPlan(p, 'actuel');
      expect(l.nodes).toHaveLength(p.nodes.length);
      const byCol = new Map<number, number[]>();
      for (const n of l.nodes) byCol.set(n.col, [...(byCol.get(n.col) ?? []), n.y]);
      for (const ys of byCol.values()) {
        const s = [...ys].sort((a, b) => a - b);
        for (let i = 1; i < s.length; i++) expect(s[i] - s[i - 1]).toBeGreaterThanOrEqual(56);
      }
      expect(l.links.filter((k) => !k.secondary && k.from).length).toBe(p.nodes.filter((n) => n.parent).length);
      expect(l.width).toBeGreaterThan(0);
      expect(l.height).toBeGreaterThan(0);
    }
  });
  it('liens secondaires tracés pour groupes et cogénération', () => {
    expect(layoutPlan(EXEMPLE_PROJET.plans[0], 'actuel').links.filter((k) => k.secondary)).toHaveLength(2);
  });
  it('wrapLabel : 2 lignes maximum, jamais vide', () => {
    expect(wrapLabel('Court')).toEqual(['Court']);
    expect(wrapLabel('Centrales de traitement d’air du bâtiment principal et annexes').length).toBe(2);
    expect(wrapLabel('Centrales de traitement d’air du bâtiment principal et annexes')[1].endsWith('…')).toBe(true);
    expect(wrapLabel('')).toEqual([]);
  });
});
