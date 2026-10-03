// Contrôles de cohérence, bilans par poste et données du diagramme de Sankey.
import { STATUS_LABEL, type FlowStatus, type SiteFlow, type SiteModel, type SiteNode } from './model';

export type Issue = { level: 'erreur' | 'avertissement' | 'info'; message: string; sheet?: string; row?: number };

export type NodeBalance = {
  node: SiteNode;
  in: number; // J/an
  out: number; // J/an
  /** Pertes d'une transformation = entrées − sorties (0 si négatif). */
  losses: number;
  /** Rendement apparent d'une transformation : sorties / entrées. */
  efficiency: number | null;
};

export type SiteAnalysis = {
  issues: Issue[];
  balances: NodeBalance[];
  totals: { purchased: number; final: number; losses: number; byCarrier: { carrier: string; value: number }[]; byStatus: Record<FlowStatus, number> };
  /** Flux utilisables (références valides, valeurs positives), y compris les pertes calculées. */
  links: (SiteFlow & { loss?: boolean })[];
  hasCycle: boolean;
};

export const LOSS_NODE_ID = '__pertes__';
export const LOSS_CARRIER = 'Pertes';

/** Détection de cycle (le diagramme de Sankey exige un graphe sans boucle). */
function findCycle(nodes: string[], flows: SiteFlow[]): string[] | null {
  const adj = new Map<string, string[]>(nodes.map((n) => [n, []]));
  for (const f of flows) adj.get(f.from)?.push(f.to);
  const state = new Map<string, 0 | 1 | 2>();
  const stack: string[] = [];
  const dfs = (n: string): string[] | null => {
    state.set(n, 1);
    stack.push(n);
    for (const m of adj.get(n) ?? []) {
      if (state.get(m) === 1) return [...stack.slice(stack.indexOf(m)), m];
      if (!state.get(m)) {
        const c = dfs(m);
        if (c) return c;
      }
    }
    stack.pop();
    state.set(n, 2);
    return null;
  };
  for (const n of nodes) if (!state.get(n)) {
    const c = dfs(n);
    if (c) return c;
  }
  return null;
}

export function analyse(model: SiteModel): SiteAnalysis {
  const issues: Issue[] = [];
  const byId = new Map(model.nodes.map((n) => [n.id, n]));
  const label = (id: string) => byId.get(id)?.label ?? id;

  const seen = new Set<string>();
  for (const n of model.nodes) {
    if (seen.has(n.id)) issues.push({ level: 'erreur', message: `Poste « ${n.id} » défini plusieurs fois.` });
    seen.add(n.id);
  }

  const valid: SiteFlow[] = [];
  model.flows.forEach((f, k) => {
    const where = `Flux ${k + 1} (${label(f.from)} → ${label(f.to)})`;
    if (!byId.has(f.from)) return issues.push({ level: 'erreur', message: `${where} : poste d’origine « ${f.from} » inconnu.` });
    if (!byId.has(f.to)) return issues.push({ level: 'erreur', message: `${where} : poste de destination « ${f.to} » inconnu.` });
    if (f.from === f.to) return issues.push({ level: 'erreur', message: `${where} : un flux ne peut pas boucler sur le même poste.` });
    if (!Number.isFinite(f.value) || f.value < 0) return issues.push({ level: 'erreur', message: `${where} : quantité invalide.` });
    if (f.value === 0) issues.push({ level: 'info', message: `${where} : quantité nulle, ignorée dans le diagramme.` });
    if (byId.get(f.from)!.kind === 'usage') issues.push({ level: 'avertissement', message: `${where} : un usage ne devrait pas alimenter un autre poste (le passer en transformation ?).` });
    if (byId.get(f.to)!.kind === 'source') issues.push({ level: 'avertissement', message: `${where} : une source ne devrait pas recevoir d’énergie (la passer en transformation ?).` });
    if (f.value > 0) valid.push(f);
  });

  const cycle = findCycle(model.nodes.map((n) => n.id), valid);
  if (cycle) issues.push({ level: 'erreur', message: `Boucle de flux : ${cycle.map(label).join(' → ')}. Le diagramme de Sankey n’accepte pas les boucles (ex. retour condensats : le représenter comme une moindre consommation).` });

  const balances: NodeBalance[] = model.nodes.map((node) => {
    const inn = valid.filter((f) => f.to === node.id).reduce((s, f) => s + f.value, 0);
    const out = valid.filter((f) => f.from === node.id).reduce((s, f) => s + f.value, 0);
    const isT = node.kind === 'transformation';
    const losses = isT ? Math.max(0, inn - out) : 0;
    if (isT && inn === 0 && out > 0) issues.push({ level: 'erreur', message: `Transformation « ${node.label} » : sorties sans aucune entrée.` });
    if (isT && inn > 0 && out > inn * (1 + 1e-9)) {
      issues.push({ level: 'avertissement', message: `Transformation « ${node.label} » : sorties supérieures aux entrées (rendement ${Math.round((out / inn) * 100)} %). Possible pour une pompe à chaleur ou une récupération, sinon vérifier les données.` });
    }
    if (node.kind === 'source' && out === 0) issues.push({ level: 'info', message: `Source « ${node.label} » sans flux sortant.` });
    if (node.kind === 'usage' && inn === 0) issues.push({ level: 'info', message: `Usage « ${node.label} » sans flux entrant.` });
    return { node, in: inn, out, losses, efficiency: isT && inn > 0 ? out / inn : null };
  });

  const links: SiteAnalysis['links'] = [...valid];
  for (const b of balances) {
    if (b.losses > 0) links.push({ from: b.node.id, to: LOSS_NODE_ID, carrier: LOSS_CARRIER, value: b.losses, status: 'calcule', loss: true, comment: 'Entrées − sorties' });
  }

  const purchased = balances.filter((b) => b.node.kind === 'source').reduce((s, b) => s + b.out, 0);
  const final = balances.filter((b) => b.node.kind === 'usage').reduce((s, b) => s + b.in, 0);
  const lossTotal = balances.reduce((s, b) => s + b.losses, 0);
  const carriers = new Map<string, number>();
  for (const f of valid) if (byId.get(f.from)?.kind === 'source') carriers.set(f.carrier, (carriers.get(f.carrier) ?? 0) + f.value);
  const byStatus: Record<FlowStatus, number> = { mesure: 0, estime: 0, calcule: 0 };
  for (const f of valid) byStatus[f.status] += f.value;

  return {
    issues,
    balances,
    totals: {
      purchased, final, losses: lossTotal,
      byCarrier: [...carriers].map(([carrier, value]) => ({ carrier, value })).sort((a, b) => b.value - a.value),
      byStatus,
    },
    links,
    hasCycle: !!cycle,
  };
}

export const statusLabel = (s: FlowStatus) => STATUS_LABEL[s];
