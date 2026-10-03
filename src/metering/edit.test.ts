import { describe, expect, it } from 'vitest';
import { addMeter, addNode, addPlan, applyRecommendations, descendantsOf, nextMeterId, removeNode, removePlan, updateMeter, updateNode } from './edit';
import { EXEMPLE_PROJET } from './exemple';
import { planStats, recommend } from './analyse';

const P = EXEMPLE_PROJET;
const id = 'electricite';
const plan = (p = P) => p.plans.find((x) => x.id === id)!;

describe('édition des plans', () => {
  it('ne mute jamais le projet d’origine', () => {
    const before = JSON.stringify(P);
    updateNode(P, id, 'GF', { rated: 1 });
    addMeter(P, id, 'CTA', 'a-installer');
    removeNode(P, id, 'TD-A');
    expect(JSON.stringify(P)).toBe(before);
  });
  it('identifiants de compteur par énergie et sans collision', () => {
    expect(nextMeterId(plan(), 'RADIO')).toBe('CE-RADIO');
    const a = addMeter(P, id, 'RADIO', 'a-installer');
    expect(nextMeterId(plan(a.project), 'RADIO')).toBe('CE-RADIO-2');
    expect(nextMeterId(P.plans[1], 'STER')).toBe('CG-STER');
  });
  it('supprimer un poste : enfants rattachés au poste amont, compteurs supprimés', () => {
    const p = removeNode(P, id, 'TD-A');
    expect(plan(p).nodes.find((n) => n.id === 'ECL-A')!.parent).toBe('TGBT-ORD');
    expect(plan(p).meters.some((m) => m.node === 'TD-A')).toBe(false);
    expect(plan(p).nodes.find((n) => n.id === 'TD-A')).toBeUndefined();
  });
  it('supprimer un poste de secours efface la référence', () => {
    expect(plan(removeNode(P, id, 'GE1')).nodes.find((n) => n.id === 'TGBT-PREF')!.backup).toBeUndefined();
  });
  it('ajouter un poste et un plan', () => {
    const { project, id: nid } = addNode(P, id, 'Atelier maintenance', 'usage', 'TGBT-ORD');
    expect(nid).toBe('ATELIER-MAINTENANCE');
    expect(plan(project).nodes.at(-1)!.parent).toBe('TGBT-ORD');
    const np = addPlan(P, 'Électricité — annexe');
    expect(np.id).toBe('electricite-annexe');
    expect(addPlan(np.project, 'Électricité — annexe').id).toBe('electricite-annexe-2');
    expect(removePlan(np.project, np.id).plans).toHaveLength(2);
  });
  it('descendants : sert à interdire les boucles', () => {
    const d = descendantsOf(plan(), 'TGBT-ORD');
    expect(d.has('ECL-A')).toBe(true);
    expect(d.has('TGBT-PREF')).toBe(false);
  });
  it('appliquer les recommandations atteint la couverture visée en scénario cible', () => {
    const recs = recommend(plan(), { target: 0.95 });
    const p = applyRecommendations(P, id, recs);
    expect(planStats(plan(p)).target.coverage).toBeGreaterThanOrEqual(0.95 - 1e-9);
    expect(plan(p).meters.length).toBe(plan().meters.length + recs.length);
    const q = updateMeter(p, id, plan(p).meters.at(-1)!.id, { status: 'existant-communicant' });
    expect(plan(q).meters.at(-1)!.status).toBe('existant-communicant');
  });
});
