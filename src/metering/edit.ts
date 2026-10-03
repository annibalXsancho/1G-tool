// Modifications d'un projet de plans de comptage : fonctions pures qui renvoient un nouveau projet.
import { buildTree, type Recommendation } from './analyse';
import { norm } from '@/site/model';
import { emptyPlan, slug, type Meter, type MeterStatus, type NodeKind, type Plan, type PlanNode, type Project } from './model';

const mapPlan = (p: Project, planId: string, fn: (pl: Plan) => Plan): Project => ({ ...p, plans: p.plans.map((pl) => (pl.id === planId ? fn(pl) : pl)) });

export const updatePlan = (p: Project, planId: string, patch: Partial<Omit<Plan, 'id' | 'nodes' | 'meters'>>): Project => mapPlan(p, planId, (pl) => ({ ...pl, ...patch }));

export function addPlan(p: Project, name: string): { project: Project; id: string } {
  let id = slug(name);
  for (let k = 2; p.plans.some((x) => x.id === id); k++) id = `${slug(name)}-${k}`;
  return { project: { ...p, plans: [...p.plans, { ...emptyPlan(name), id, site: p.name }] }, id };
}

export const removePlan = (p: Project, planId: string): Project => ({ ...p, plans: p.plans.filter((x) => x.id !== planId) });

// ───────────── postes ─────────────

export const updateNode = (p: Project, planId: string, id: string, patch: Partial<Omit<PlanNode, 'id'>>): Project =>
  mapPlan(p, planId, (pl) => ({ ...pl, nodes: pl.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) }));

export function uniqueNodeId(plan: Plan, label: string): string {
  const base = norm(label).toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 20) || 'POSTE';
  let id = base;
  for (let k = 2; plan.nodes.some((n) => n.id === id); k++) id = `${base}-${k}`;
  return id;
}

export function addNode(p: Project, planId: string, label: string, kind: NodeKind, parent?: string): { project: Project; id: string } {
  const plan = p.plans.find((x) => x.id === planId)!;
  const id = uniqueNodeId(plan, label);
  const node: PlanNode = { id, label, kind, parent: parent || undefined, flag: 'actif' };
  return { project: mapPlan(p, planId, (pl) => ({ ...pl, nodes: [...pl.nodes, node] })), id };
}

/** Supprime un poste et ses compteurs ; ses enfants sont rattachés au poste amont du poste supprimé. */
export function removeNode(p: Project, planId: string, id: string): Project {
  return mapPlan(p, planId, (pl) => {
    const target = pl.nodes.find((n) => n.id === id);
    return {
      ...pl,
      nodes: pl.nodes.filter((n) => n.id !== id).map((n) => ({
        ...n,
        parent: n.parent === id ? target?.parent : n.parent,
        backup: n.backup === id ? undefined : n.backup,
      })),
      meters: pl.meters.filter((m) => m.node !== id),
    };
  });
}

/** Descendants (y compris le poste) : sert à interdire un rattachement qui créerait une boucle. */
export function descendantsOf(plan: Plan, id: string): Set<string> {
  const t = buildTree(plan);
  const out = new Set<string>();
  const stack = [id];
  while (stack.length) {
    const x = stack.pop()!;
    if (out.has(x)) continue;
    out.add(x);
    for (const c of t.children.get(x) ?? []) stack.push(c.id);
  }
  return out;
}

// ───────────── compteurs ─────────────

const PREFIX: [RegExp, string][] = [[/electri/, 'CE'], [/gaz/, 'CG'], [/vapeur/, 'CV'], [/eau/, 'CW'], [/froid|glac/, 'CF'], [/air/, 'CA']];

export function nextMeterId(plan: Plan, nodeId: string): string {
  const prefix = PREFIX.find(([re]) => re.test(norm(plan.carrier)))?.[1] ?? 'C';
  const base = `${prefix}-${nodeId}`;
  let id = base;
  for (let k = 2; plan.meters.some((m) => m.id === id); k++) id = `${base}-${k}`;
  return id;
}

export function addMeter(p: Project, planId: string, nodeId: string, status: MeterStatus, more: Partial<Meter> = {}): { project: Project; id: string } {
  const plan = p.plans.find((x) => x.id === planId)!;
  const id = nextMeterId(plan, nodeId);
  return { project: mapPlan(p, planId, (pl) => ({ ...pl, meters: [...pl.meters, { id, node: nodeId, status, ...more }] })), id };
}

export const updateMeter = (p: Project, planId: string, id: string, patch: Partial<Omit<Meter, 'id'>>): Project =>
  mapPlan(p, planId, (pl) => ({ ...pl, meters: pl.meters.map((m) => (m.id === id ? { ...m, ...patch } : m)) }));

export const removeMeter = (p: Project, planId: string, id: string): Project => mapPlan(p, planId, (pl) => ({ ...pl, meters: pl.meters.filter((m) => m.id !== id) }));

/** Transforme les recommandations en compteurs « à installer ». */
export function applyRecommendations(p: Project, planId: string, recs: Recommendation[]): Project {
  let cur = p;
  for (const r of recs) cur = addMeter(cur, planId, r.node, 'a-installer', { comment: 'Recommandé par l’analyse de couverture.' }).project;
  return cur;
}
