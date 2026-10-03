// Modifications du modèle de site : fonctions pures qui renvoient un nouveau modèle (jamais de mutation).
import { norm, type NodeKind, type SiteFlow, type SiteModel, type SiteNode } from './model';

export function updateFlow(m: SiteModel, index: number, patch: Partial<SiteFlow>): SiteModel {
  return { ...m, flows: m.flows.map((f, i) => (i === index ? { ...f, ...patch } : f)) };
}

export function addFlow(m: SiteModel, flow?: Partial<SiteFlow>): SiteModel {
  const source = m.nodes.find((n) => n.kind === 'source') ?? m.nodes[0];
  const target = m.nodes.find((n) => n.kind === 'usage' && n.id !== source?.id) ?? m.nodes.find((n) => n.id !== source?.id);
  const f: SiteFlow = {
    from: source?.id ?? '', to: target?.id ?? '', carrier: m.flows[0]?.carrier ?? 'Électricité', value: 0, status: 'estime',
    ...flow,
  };
  return { ...m, flows: [...m.flows, f] };
}

export const removeFlow = (m: SiteModel, index: number): SiteModel => ({ ...m, flows: m.flows.filter((_, i) => i !== index) });

export function updateNode(m: SiteModel, id: string, patch: Partial<Omit<SiteNode, 'id'>>): SiteModel {
  return { ...m, nodes: m.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) };
}

/** Identifiant unique dérivé du libellé (majuscules, sans accents ni espaces). */
export function uniqueId(m: SiteModel, label: string): string {
  const base = norm(label).toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'POSTE';
  let id = base;
  for (let k = 2; m.nodes.some((n) => n.id === id); k++) id = `${base}-${k}`;
  return id;
}

export function addNode(m: SiteModel, label: string, kind: NodeKind, zone?: string): { model: SiteModel; id: string } {
  const id = uniqueId(m, label);
  return { model: { ...m, nodes: [...m.nodes, { id, label, kind, zone }] }, id };
}

/** Supprime un poste et tous les flux qui le touchent. */
export function removeNode(m: SiteModel, id: string): SiteModel {
  return { ...m, nodes: m.nodes.filter((n) => n.id !== id), flows: m.flows.filter((f) => f.from !== id && f.to !== id) };
}

export const flowsOfNode = (m: SiteModel, id: string) => m.flows.filter((f) => f.from === id || f.to === id).length;
