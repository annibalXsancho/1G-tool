// Mise en page automatique d'un plan de comptage : colonnes par niveau de l'arbre, postes terminaux alignés en
// lignes, postes parents centrés sur leurs enfants. Pur : retourne des coordonnées, aucun dessin.
import { buildTree, evaluate, type NodeState } from './analyse';
import { KIND_LABEL, KIND_ORDER, type Meter, type Plan, type PlanNode, type Scenario } from './model';

export const CARD_W = 214;
export const CARD_H = 56;
export const ROW = 72;
export const GUTTER = 132;
export const LEFT = 76;
export const TOP = 64;
export const BOTTOM = 28;
export const RIGHT = 24;

export type PlacedNode = {
  node: PlanNode;
  x: number; y: number; w: number; h: number;
  col: number;
  state: NodeState;
  /** Part du poids total (poste terminal actif), pour le survol. */
  share: number | null;
};

export type PlacedMeter = { meter: Meter; x: number; y: number };

export type PlacedLink = {
  to: string;
  from: string | null;
  points: [number, number][];
  secondary: boolean;
  meters: PlacedMeter[];
};

export type Layout = {
  width: number; height: number;
  nodes: PlacedNode[];
  links: PlacedLink[];
  columns: { x: number; w: number; label: string }[];
  scenario: Scenario;
  basis: 'annuel' | 'puissance' | 'nombre';
};

/** Coupe un libellé sur 2 lignes au plus, avec points de suspension. */
export function wrapLabel(label: string, maxChars = 28): string[] {
  const words = label.trim().split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if (!cur) cur = w;
    else if ((cur + ' ' + w).length <= maxChars) cur += ' ' + w;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  if (lines.length <= 2) return lines.map((l) => (l.length > maxChars + 4 ? l.slice(0, maxChars + 3) + '…' : l));
  const first = lines[0];
  const rest = lines.slice(1).join(' ');
  return [first, rest.length > maxChars + 4 ? rest.slice(0, maxChars + 3) + '…' : rest];
}

export function layoutPlan(plan: Plan, scenario: Scenario): Layout {
  const tree = buildTree(plan);
  const ev = evaluate(plan, scenario, tree);
  const pos = new Map<string, PlacedNode>();
  let slot = 0;

  const place = (n: PlanNode, depth: number, guard: Set<string>): void => {
    guard.add(n.id);
    const kids = (tree.children.get(n.id) ?? []).filter((c) => !guard.has(c.id));
    let cy: number;
    if (kids.length === 0) {
      cy = TOP + slot * ROW + CARD_H / 2;
      slot++;
    } else {
      kids.forEach((k) => place(k, depth + 1, guard));
      const first = pos.get(kids[0].id)!;
      const last = pos.get(kids[kids.length - 1].id)!;
      cy = (first.y + first.h / 2 + last.y + last.h / 2) / 2;
    }
    const w = ev.weight.get(n.id);
    pos.set(n.id, {
      node: n, x: LEFT + depth * (CARD_W + GUTTER), y: cy - CARD_H / 2, w: CARD_W, h: CARD_H, col: depth,
      state: ev.state.get(n.id) ?? 'inconnu',
      share: w !== undefined && ev.total > 0 ? w / ev.total : null,
    });
  };
  const guard = new Set<string>();
  for (const r of tree.roots) if (!guard.has(r.id)) place(r, 0, guard);

  const meterByNode = new Map<string, Meter[]>();
  for (const m of plan.meters) meterByNode.set(m.node, [...(meterByNode.get(m.node) ?? []), m]);

  const links: PlacedLink[] = [];
  const meterPositions = (cx0: number, cx1: number, y: number, ms: Meter[]): PlacedMeter[] => {
    const shown = ms.slice(0, 2);
    const span = cx1 - cx0;
    return shown.map((meter, i) => ({ meter, x: cx0 + (span * (i + 1)) / (shown.length + 1), y }));
  };

  for (const p of pos.values()) {
    const n = p.node;
    const parent = n.parent && !tree.broken.has(n.id) ? pos.get(n.parent) : undefined;
    const ms = meterByNode.get(n.id) ?? [];
    const cy = p.y + p.h / 2;
    if (parent) {
      const pcy = parent.y + parent.h / 2;
      const trunk = parent.x + parent.w + 26;
      links.push({
        to: n.id, from: parent.node.id, secondary: false,
        points: [[parent.x + parent.w, pcy], [trunk, pcy], [trunk, cy], [p.x, cy]],
        meters: meterPositions(trunk + 8, p.x - 8, cy, ms),
      });
    } else if (ms.length > 0 || n.kind === 'source') {
      // Arrivée : amorce à gauche de la carte, le compteur est posé dessus.
      links.push({ to: n.id, from: null, secondary: false, points: [[p.x - 60, cy], [p.x, cy]], meters: meterPositions(p.x - 56, p.x - 4, cy, ms) });
    }
    if (n.backup && pos.has(n.backup)) {
      const b = pos.get(n.backup)!;
      const bcy = b.y + b.h / 2;
      const xg = p.x - 18;
      links.push({ to: n.id, from: n.backup, secondary: true, points: [[b.x + b.w, bcy], [xg, bcy], [xg, cy + 12], [p.x, cy + 12]], meters: [] });
    }
  }

  const depthCount = Math.max(0, ...[...pos.values()].map((p) => p.col)) + 1;
  const columns = Array.from({ length: depthCount }, (_, d) => {
    const kinds = new Map<string, number>();
    for (const p of pos.values()) if (p.col === d) kinds.set(p.node.kind, (kinds.get(p.node.kind) ?? 0) + 1);
    const present = KIND_ORDER.filter((k) => kinds.has(k)).map((k) => KIND_LABEL[k]);
    return { x: LEFT + d * (CARD_W + GUTTER), w: CARD_W, label: present.slice(0, 3).join(' · ') };
  });

  const width = LEFT + depthCount * CARD_W + Math.max(0, depthCount - 1) * GUTTER + RIGHT;
  const height = TOP + Math.max(1, slot) * ROW - (ROW - CARD_H) + BOTTOM;
  return { width, height, nodes: [...pos.values()], links, columns, scenario, basis: ev.basis };
}
