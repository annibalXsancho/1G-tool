// Modèle d'un schéma unifilaire : arbre d'éléments (réseau, transformateurs, tableaux, charges). Chaque élément
// (hors racine) peut porter, sur sa liaison amont, une protection, un câble et un compteur. Pur, sans React.
import type { MeterStatus } from '@/metering/model';
import { norm } from '@/site/model';

export type Kind = 'reseau' | 'transformateur' | 'tableau' | 'moteur' | 'charge' | 'condensateurs' | 'groupe';

export const KIND_LABEL: Record<Kind, string> = {
  reseau: 'Réseau (arrivée)',
  transformateur: 'Transformateur',
  tableau: 'Tableau / jeu de barres',
  moteur: 'Moteur',
  charge: 'Charge',
  condensateurs: 'Batterie de condensateurs',
  groupe: 'Groupe électrogène',
};
export const KIND_ORDER: Kind[] = ['reseau', 'transformateur', 'tableau', 'moteur', 'charge', 'condensateurs', 'groupe'];

export type BreakerType = 'disjoncteur' | 'interrupteur' | 'fusible';
export const BREAKER_LABEL: Record<BreakerType, string> = { disjoncteur: 'Disjoncteur', interrupteur: 'Interrupteur-sectionneur', fusible: 'Fusible' };

export type Breaker = {
  type: BreakerType;
  /** Calibre, A. */
  in?: number;
  /** Pouvoir de coupure, kA. */
  icu?: number;
  curve?: string;
};

export type Material = 'cuivre' | 'aluminium';
export type Cable = {
  material: Material;
  /** Section par conducteur, mm². */
  section?: number;
  /** Longueur, m. */
  length?: number;
  /** Nombre de câbles en parallèle. */
  parallel?: number;
  /** Désignation libre (ex. « U1000 R2V »). */
  designation?: string;
};

export type MeterRef = { id: string; status: MeterStatus; /** Rapport de TC, ex. « 2500/5 ». */ ct?: string };

export type UElement = {
  id: string;
  label: string;
  kind: Kind;
  /** Élément amont. Absent pour la racine. */
  parent?: string;
  // Réseau
  /** Tension composée, V (réseau) ; pour les autres éléments, déduite de l'amont. */
  voltage?: number;
  /** Puissance de court-circuit du réseau amont, MVA. */
  scc?: number;
  // Transformateur
  /** Puissance apparente, kVA (transformateur, groupe). */
  s?: number;
  /** Tension secondaire à vide, V. */
  u2?: number;
  /** Tension de court-circuit, %. */
  ukk?: number;
  /** Pertes dues à la charge à puissance nominale, kW. */
  pk?: number;
  coupling?: string;
  // Tableau
  /** Courant assigné des barres, A. */
  inBar?: number;
  /** Coefficient de simultanéité appliqué aux départs. */
  ks?: number;
  // Charges
  /** Puissance utile (moteur : puissance mécanique), kW. */
  p?: number;
  cosphi?: number;
  /** Rendement (moteur). */
  eta?: number;
  /** Puissance réactive des condensateurs, kvar. */
  q?: number;
  // Liaison amont
  breaker?: Breaker;
  cable?: Cable;
  meter?: MeterRef;
  comment?: string;
};

export type Installation = {
  id: string;
  name: string;
  site: string;
  version?: string;
  author?: string;
  elements: UElement[];
};

export type UProject = { name: string; installations: Installation[] };

export const emptyInstallation = (name = 'Nouvelle installation'): Installation => ({ id: slug(name), name, site: '', elements: [] });

export function slug(s: string): string {
  return norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'installation';
}

export const isLoad = (k: Kind) => k === 'moteur' || k === 'charge';
/** Éléments qui peuvent avoir des enfants. */
export const canHaveChildren = (k: Kind) => k === 'reseau' || k === 'transformateur' || k === 'tableau';
