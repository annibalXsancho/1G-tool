// Modèle énergétique d'un site : postes (sources, transformations, usages) reliés par des flux annuels.
// Pur, sans React. Les quantités sont stockées en SI (J par an) ; conversions aux frontières (import/affichage).

/** source = énergie achetée ou produite sur site ; transformation = chaufferie, compresseurs… ; usage = consommateur final. */
export type NodeKind = 'source' | 'transformation' | 'usage';

export type SiteNode = { id: string; label: string; kind: NodeKind; zone?: string };

/** Origine de la donnée : mesurée par un compteur, estimée, ou calculée (bilan, calculateur). */
export type FlowStatus = 'mesure' | 'estime' | 'calcule';

export type SiteFlow = {
  from: string;
  to: string;
  /** Vecteur énergétique (électricité, gaz naturel, vapeur…). Texte libre. */
  carrier: string;
  /** Quantité annuelle, en J. */
  value: number;
  status: FlowStatus;
  meter?: string;
  comment?: string;
};

export type SiteModel = { name: string; year: number | null; nodes: SiteNode[]; flows: SiteFlow[] };

export const KIND_LABEL: Record<NodeKind, string> = { source: 'Source', transformation: 'Transformation', usage: 'Usage' };
export const STATUS_LABEL: Record<FlowStatus, string> = { mesure: 'Mesuré', estime: 'Estimé', calcule: 'Calculé' };

export const emptyModel = (): SiteModel => ({ name: '', year: null, nodes: [], flows: [] });

/** Normalisation pour comparer des libellés saisis à la main : minuscules, sans accents ni espaces superflus. */
export function norm(s: unknown): string {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}
