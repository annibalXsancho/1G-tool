// Modèle d'un plan de comptage : arbre de distribution d'une énergie (électricité, gaz, vapeur, eau…) dont les
// postes sont reliés à leur poste amont, et compteurs rattachés au poste qu'ils mesurent (flux entrant).
// Pur, sans React.
import { norm } from '@/site/model';

/** Position dans la chaîne de distribution (vocabulaire volontairement générique : valable pour toute énergie). */
export type NodeKind = 'source' | 'transformation' | 'distribution' | 'production' | 'usage';

/**
 * - actif : poste normal ;
 * - hors-perimetre : exclu de l'analyse (client tiers, hors contrat…) ;
 * - reserve : départ disponible, sans charge raccordée ;
 * - sans-conso : raccordé mais sans consommation.
 */
export type NodeFlag = 'actif' | 'hors-perimetre' | 'reserve' | 'sans-conso';

export type MeterStatus = 'existant-communicant' | 'existant-manuel' | 'a-installer';

export type PlanNode = {
  id: string;
  label: string;
  kind: NodeKind;
  /** Poste amont (alimentation normale). Absent pour une arrivée ou une production indépendante. */
  parent?: string;
  /** Poste de secours (alimentation de remplacement), tracée en pointillés, hors analyse de couverture. */
  backup?: string;
  /** Capacité nominale, dans l'unité du plan (kVA, kW, m³/h, t/h…). */
  rated?: number;
  /** Consommation annuelle estimée, en MWh/an. */
  annualMWh?: number;
  zone?: string;
  flag: NodeFlag;
  comment?: string;
};

export type Meter = {
  /** Repère du compteur (ex. CE-TGBT-01). */
  id: string;
  /** Poste dont le compteur mesure le flux entrant. */
  node: string;
  status: MeterStatus;
  device?: string;
  quantity?: string;
  comm?: string;
  address?: string;
  /** Rapport de transformateur de courant, ex. « 400/5 » ; vide pour une mesure directe. */
  ct?: string;
  accuracy?: string;
  location?: string;
  comment?: string;
};

export type Plan = {
  id: string;
  name: string;
  site: string;
  carrier: string;
  ratedUnit: string;
  version?: string;
  author?: string;
  nodes: PlanNode[];
  meters: Meter[];
};

export type Project = { name: string; plans: Plan[] };

export type Scenario = 'actuel' | 'cible';

export const KIND_LABEL: Record<NodeKind, string> = {
  source: 'Arrivée / livraison',
  transformation: 'Transformation',
  distribution: 'Distribution',
  production: 'Production locale',
  usage: 'Usage',
};
export const KIND_ORDER: NodeKind[] = ['source', 'transformation', 'distribution', 'production', 'usage'];

export const FLAG_LABEL: Record<NodeFlag, string> = {
  actif: 'Actif',
  'hors-perimetre': 'Hors périmètre',
  reserve: 'Réserve (disponible)',
  'sans-conso': 'Sans consommation',
};

export const STATUS_LABEL: Record<MeterStatus, string> = {
  'existant-communicant': 'Existant, communicant',
  'existant-manuel': 'Existant, relevé manuel',
  'a-installer': 'À installer',
};

export const COMM_SUGGESTIONS = ['Modbus RTU', 'Modbus TCP', 'M-Bus', 'Impulsions', 'Ethernet / IP', 'LoRaWAN', 'Aucune (relevé manuel)'];
export const DEVICE_SUGGESTIONS = ['Compteur direct', 'Compteur sur TC', 'Centrale de mesure', 'Compteur de facturation', 'Compteur divisionnaire', 'Débitmètre', 'Compteur d’énergie thermique'];

export const emptyPlan = (name = 'Nouveau plan'): Plan => ({ id: slug(name), name, site: '', carrier: 'Électricité', ratedUnit: 'kVA', nodes: [], meters: [] });
export const emptyProject = (): Project => ({ name: '', plans: [] });

export function slug(s: string): string {
  return norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'plan';
}

/** Un compteur compte dans le scénario ? « actuel » : existants seulement ; « cible » : existants + à installer. */
export const counts = (m: Meter, scenario: Scenario): boolean => scenario === 'cible' || m.status !== 'a-installer';

export const isCommunicating = (m: Meter): boolean => m.status === 'existant-communicant';
