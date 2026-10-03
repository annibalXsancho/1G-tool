// Analyse d'un plan de comptage : arbre, état de chaque poste (mesuré, agrégé, par différence, inconnu), taux de
// couverture, contrôles de cohérence et recommandations d'instrumentation. Pur, sans React.
import { counts, type Meter, type Plan, type PlanNode, type Scenario } from './model';

export type NodeState = 'mesure' | 'agrege' | 'difference' | 'inconnu' | 'reserve' | 'exclu';

export type Issue = { level: 'erreur' | 'avertissement' | 'info'; message: string; node?: string; meter?: string };

export type Tree = {
  byId: Map<string, PlanNode>;
  children: Map<string, PlanNode[]>;
  roots: PlanNode[];
  /** Postes dont la chaîne amont boucle ou est rompue : écartés de l'analyse. */
  broken: Set<string>;
  depth: Map<string, number>;
  issues: Issue[];
};

/** Construit l'arbre à partir des liens `parent`. Ne lève jamais : les anomalies sont rapportées dans `issues`. */
export function buildTree(plan: Plan): Tree {
  const issues: Issue[] = [];
  const byId = new Map<string, PlanNode>();
  for (const n of plan.nodes) {
    if (byId.has(n.id)) issues.push({ level: 'erreur', node: n.id, message: `Poste « ${n.id} » défini plusieurs fois.` });
    else byId.set(n.id, n);
  }
  const children = new Map<string, PlanNode[]>(plan.nodes.map((n) => [n.id, []]));
  const roots: PlanNode[] = [];
  for (const n of byId.values()) {
    if (n.parent && !byId.has(n.parent)) {
      issues.push({ level: 'erreur', node: n.id, message: `« ${n.label} » : poste amont « ${n.parent} » inconnu.` });
      roots.push(n);
    } else if (n.parent && n.parent === n.id) {
      issues.push({ level: 'erreur', node: n.id, message: `« ${n.label} » est son propre poste amont.` });
      roots.push(n);
    } else if (n.parent) children.get(n.parent)!.push(n);
    else roots.push(n);
    if (n.backup && !byId.has(n.backup)) issues.push({ level: 'erreur', node: n.id, message: `« ${n.label} » : poste de secours « ${n.backup} » inconnu.` });
  }

  // Profondeur par parcours depuis les racines ; les postes non atteints appartiennent à une boucle.
  const depth = new Map<string, number>();
  const stack = roots.map((r) => ({ n: r, d: 0 }));
  while (stack.length) {
    const { n, d } = stack.pop()!;
    if (depth.has(n.id)) continue;
    depth.set(n.id, d);
    for (const c of children.get(n.id) ?? []) stack.push({ n: c, d: d + 1 });
  }
  const broken = new Set<string>();
  for (const n of byId.values()) if (!depth.has(n.id)) broken.add(n.id);
  if (broken.size) {
    issues.push({ level: 'erreur', message: `Boucle dans les liens amont : ${[...broken].map((id) => byId.get(id)!.label).join(', ')}.` });
    for (const id of broken) { children.get(id)!.length = 0; depth.set(id, 0); }
    // Les postes en boucle sont traités comme racines isolées (sans enfants) pour que l'affichage reste possible.
    for (const id of broken) roots.push(byId.get(id)!);
  }
  return { byId, children, roots, broken, depth, issues };
}

const excluded = (n: PlanNode) => n.flag === 'hors-perimetre';
const neutral = (n: PlanNode) => n.flag === 'reserve' || n.flag === 'sans-conso';

export type Evaluation = {
  state: Map<string, NodeState>;
  /** Pour un poste « par différence » : poste amont dont il se déduit. */
  derivedFrom: Map<string, string>;
  meterOf: Map<string, Meter[]>;
  /** Poids de chaque poste terminal (feuille active) dans la couverture. */
  weight: Map<string, number>;
  basis: 'annuel' | 'puissance' | 'nombre';
  total: number;
  coverage: number;
  byState: Record<'mesure' | 'difference' | 'inconnu', number>;
};

/**
 * État de chaque poste pour un scénario.
 * - mesuré : un compteur compté sur son flux entrant ;
 * - agrégé : pas de compteur, mais tous ses enfants actifs sont connus (somme) ;
 * - par différence : poste amont connu et tous les autres enfants actifs connus (reste = amont − Σ autres) ;
 * - inconnu : aucune des trois.
 * La différence englobe les pertes du poste amont (câbles, transformateur) : c'est signalé dans les contrôles.
 */
export function evaluate(plan: Plan, scenario: Scenario, tree: Tree = buildTree(plan)): Evaluation {
  const meterOf = new Map<string, Meter[]>();
  for (const m of plan.meters) if (counts(m, scenario)) meterOf.set(m.node, [...(meterOf.get(m.node) ?? []), m]);

  const state = new Map<string, NodeState>();
  const derivedFrom = new Map<string, string>();
  const active = (id: string) => !excluded(tree.byId.get(id)!);
  const activeChildren = (id: string) => (tree.children.get(id) ?? []).filter((c) => !excluded(c));
  // Les postes sans consommation ou en réserve n'ont pas besoin de mesure : ils comptent comme connus (nuls).
  const isKnown = (id: string) => ['mesure', 'agrege', 'difference', 'reserve'].includes(state.get(id) ?? 'inconnu');

  for (const n of tree.byId.values()) {
    if (excluded(n)) state.set(n.id, 'exclu');
    else if (neutral(n)) state.set(n.id, 'reserve');
    else if (meterOf.has(n.id)) state.set(n.id, 'mesure');
    else state.set(n.id, 'inconnu');
  }

  for (let changed = true; changed; ) {
    changed = false;
    for (const n of tree.byId.values()) {
      if (state.get(n.id) !== 'inconnu') continue;
      const kids = activeChildren(n.id);
      if (kids.length > 0 && kids.every((k) => isKnown(k.id))) { state.set(n.id, 'agrege'); changed = true; continue; }
      const p = n.parent && tree.byId.has(n.parent) && !tree.broken.has(n.id) ? n.parent : undefined;
      if (p && isKnown(p) && state.get(p) !== 'reserve') {
        const others = activeChildren(p).filter((k) => k.id !== n.id);
        if (others.every((k) => isKnown(k.id))) { state.set(n.id, 'difference'); derivedFrom.set(n.id, p); changed = true; }
      }
    }
  }

  // Poids des postes terminaux actifs.
  // Seuls les postes consommateurs pèsent dans la couverture : une production locale (groupe, cogénération) ou une
  // arrivée sans départ n'est pas une consommation à mesurer ; leur comptage est vérifié dans les contrôles.
  const leaves = [...tree.byId.values()].filter((n) => !excluded(n) && !neutral(n) && n.kind !== 'production' && n.kind !== 'source' && activeChildren(n.id).length === 0);
  const hasAll = (f: (n: PlanNode) => number | undefined) => leaves.length > 0 && leaves.every((n) => (f(n) ?? 0) > 0);
  const basis: Evaluation['basis'] = hasAll((n) => n.annualMWh) ? 'annuel' : hasAll((n) => n.rated) ? 'puissance' : 'nombre';
  const weight = new Map<string, number>();
  for (const n of leaves) weight.set(n.id, basis === 'annuel' ? n.annualMWh! : basis === 'puissance' ? n.rated! : 1);
  const total = [...weight.values()].reduce((a, b) => a + b, 0);
  const byState = { mesure: 0, difference: 0, inconnu: 0 };
  for (const [id, w] of weight) {
    const s = state.get(id)!;
    byState[s === 'mesure' ? 'mesure' : s === 'difference' ? 'difference' : 'inconnu'] += w;
  }
  const covered = byState.mesure + byState.difference;
  return { state, derivedFrom, meterOf, weight, basis, total, coverage: total > 0 ? covered / total : 0, byState };
}

// ───────────────────────── Contrôles de cohérence ─────────────────────────

export type CheckOptions = {
  /** Part minimale du total à partir de laquelle un poste terminal non instrumenté est signalé comme significatif. */
  significance: number;
};
export const DEFAULT_CHECKS: CheckOptions = { significance: 0.05 };

export function checkPlan(plan: Plan, opts: CheckOptions = DEFAULT_CHECKS): Issue[] {
  const tree = buildTree(plan);
  const issues: Issue[] = [...tree.issues];
  const label = (id: string) => tree.byId.get(id)?.label ?? id;

  const seen = new Set<string>();
  for (const m of plan.meters) {
    if (seen.has(m.id)) issues.push({ level: 'erreur', meter: m.id, message: `Repère de compteur « ${m.id} » en double.` });
    seen.add(m.id);
    const n = tree.byId.get(m.node);
    if (!n) { issues.push({ level: 'erreur', meter: m.id, message: `Compteur « ${m.id} » : poste mesuré « ${m.node} » inconnu.` }); continue; }
    if (n.flag === 'hors-perimetre') issues.push({ level: 'info', meter: m.id, node: n.id, message: `Compteur « ${m.id} » sur un poste hors périmètre (« ${n.label} ») : ignoré dans la couverture.` });
    if (n.flag === 'reserve') issues.push({ level: 'info', meter: m.id, node: n.id, message: `Compteur « ${m.id} » sur un départ en réserve (« ${n.label} »).` });
    if (m.status === 'existant-communicant' && !m.comm) issues.push({ level: 'avertissement', meter: m.id, message: `Compteur « ${m.id} » déclaré communicant sans protocole renseigné.` });
    if (m.status === 'existant-communicant' && /modbus|m-bus|mbus/i.test(m.comm ?? '') && !m.address) issues.push({ level: 'info', meter: m.id, message: `Compteur « ${m.id} » : adresse de communication non renseignée.` });
    if (/\btc\b/i.test(m.device ?? '') && !m.ct) issues.push({ level: 'avertissement', meter: m.id, message: `Compteur « ${m.id} » sur TC sans rapport de transformation (ex. 400/5).` });
  }

  const actual = evaluate(plan, 'actuel', tree);
  const target = evaluate(plan, 'cible', tree);

  for (const n of tree.byId.values()) {
    if (n.flag !== 'actif') continue;
    const kids = (tree.children.get(n.id) ?? []).filter((c) => !excluded(c));
    const direct = actual.meterOf.has(n.id);
    if (n.kind === 'source' && !direct && !target.meterOf.has(n.id)) {
      issues.push({ level: 'avertissement', node: n.id, message: `Point de livraison « ${n.label} » sans compteur : pas de rapprochement possible avec la facture.` });
    }
    if (n.kind === 'transformation' && !direct && kids.length > 0 && !target.meterOf.has(n.id)) {
      issues.push({ level: 'info', node: n.id, message: `« ${n.label} » : pas de compteur en entrée, les pertes de transformation ne seront pas isolées.` });
    }
    if (n.kind === 'production' && !direct && !target.meterOf.has(n.id)) {
      issues.push({ level: 'avertissement', node: n.id, message: `Production locale « ${n.label} » sans compteur : production non mesurée.` });
    }
    if (n.kind === 'distribution' && kids.length > 0 && !direct) {
      const unknownKids = kids.filter((k) => actual.state.get(k.id) === 'inconnu');
      if (unknownKids.length > 1 && actual.state.get(n.id) === 'inconnu') {
        issues.push({ level: 'info', node: n.id, message: `« ${n.label} » : ni compteur d'entrée ni départs tous instrumentés, son bilan ne se ferme pas.` });
      }
    }
    const st = actual.state.get(n.id);
    if (st === 'difference') {
      const from = actual.derivedFrom.get(n.id)!;
      const p = tree.byId.get(from)!;
      issues.push({ level: 'info', node: n.id, message: `« ${n.label} » déduit par différence depuis « ${label(from)} »${p.kind === 'transformation' ? ' (pertes du transformateur incluses)' : ''} : incertitude cumulée des autres compteurs.` });
    }
  }

  // Postes terminaux significatifs non instrumentés.
  const total = actual.total;
  if (total > 0) {
    for (const [id, w] of actual.weight) {
      if (actual.state.get(id) === 'inconnu' && w / total >= opts.significance) {
        issues.push({ level: 'avertissement', node: id, message: `« ${label(id)} » : poste significatif non instrumenté (${Math.round((w / total) * 100)} % du total, base ${actual.basis}).` });
      }
    }
  }
  return issues;
}

// ───────────────────────── Recommandations ─────────────────────────

export type Recommendation = {
  node: string;
  /** Gain de couverture apporté par ce compteur (fraction du total). */
  gain: number;
  /** Couverture après ajout de ce compteur et des précédents. */
  coverageAfter: number;
};

/**
 * Plan d'instrumentation recommandé : on ajoute, un par un, le compteur qui améliore le plus la couverture
 * (à égalité, celui qui rend le plus de postes connus, puis le plus proche de la racine), jusqu'à atteindre la cible.
 * Part du scénario « cible » (les compteurs déjà prévus sont conservés).
 */
export function recommend(plan: Plan, opts: { target: number; max?: number } = { target: 0.95 }): Recommendation[] {
  const tree = buildTree(plan);
  let working: Plan = { ...plan, meters: [...plan.meters] };
  const out: Recommendation[] = [];
  const max = opts.max ?? 40;
  let current = evaluate(working, 'cible', tree);
  const knownCount = (e: Evaluation) => [...e.state.values()].filter((s) => s === 'mesure' || s === 'agrege' || s === 'difference').length;

  while (current.coverage < opts.target - 1e-9 && out.length < max) {
    let best: { id: string; cov: number; known: number; depth: number; ev: Evaluation } | null = null;
    for (const n of tree.byId.values()) {
      if (n.flag !== 'actif' || tree.broken.has(n.id) || current.meterOf.has(n.id)) continue;
      const trial: Plan = { ...working, meters: [...working.meters, { id: `__reco-${n.id}`, node: n.id, status: 'a-installer' }] };
      const ev = evaluate(trial, 'cible', tree);
      const cand = { id: n.id, cov: ev.coverage, known: knownCount(ev), depth: tree.depth.get(n.id) ?? 0, ev };
      if (
        !best || cand.cov > best.cov + 1e-12 ||
        (Math.abs(cand.cov - best.cov) <= 1e-12 && (cand.known > best.known || (cand.known === best.known && cand.depth < best.depth)))
      ) best = cand;
    }
    if (!best || (best.cov <= current.coverage + 1e-12 && best.known <= knownCount(current))) break;
    out.push({ node: best.id, gain: best.cov - current.coverage, coverageAfter: best.cov });
    working = { ...working, meters: [...working.meters, { id: `__reco-${best.id}`, node: best.id, status: 'a-installer' }] };
    current = best.ev;
  }
  return out;
}

// ───────────────────────── Indicateurs ─────────────────────────

export type PlanStats = {
  meters: Record<'existant-communicant' | 'existant-manuel' | 'a-installer', number>;
  nodes: number;
  active: number;
  actual: Evaluation;
  target: Evaluation;
  issues: Issue[];
};

export function planStats(plan: Plan, opts?: CheckOptions): PlanStats {
  const tree = buildTree(plan);
  const meters = { 'existant-communicant': 0, 'existant-manuel': 0, 'a-installer': 0 };
  for (const m of plan.meters) meters[m.status]++;
  return {
    meters,
    nodes: plan.nodes.length,
    active: plan.nodes.filter((n) => n.flag === 'actif').length,
    actual: evaluate(plan, 'actuel', tree),
    target: evaluate(plan, 'cible', tree),
    issues: checkPlan(plan, opts),
  };
}

/** Chemin lisible d'un poste depuis la racine : « Arrivée › Transformateur › TGBT ». */
export function pathOf(tree: Tree, id: string): string {
  const parts: string[] = [];
  let n = tree.byId.get(id);
  for (let guard = 0; n && guard < 50; guard++) {
    parts.unshift(n.label);
    n = n.parent ? tree.byId.get(n.parent) : undefined;
  }
  return parts.join(' › ');
}
