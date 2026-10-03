// Types du suivi énergétique : relevés, périodes, configuration. Pur.
import { suivi } from '@/data';
import type { Confidence } from './regress';

/** Une ligne de relevé : une journée (avec températures) ou une période déjà agrégée (avec DJU). */
export type Row = {
  /** Début de la période, AAAA-MM-JJ. */
  date: string;
  kwh: number;
  tmin?: number;
  tmax?: number;
  /** DJU chauffage / DJR climatisation déjà calculés (prioritaires sur tmin et tmax). */
  dju?: number;
  djr?: number;
  /** Variable explicative libre : production, surface occupée, taux d'occupation… */
  x?: number;
  /** Durée de la période en jours (1 par défaut ; utile avec le grain « brut »). */
  jours?: number;
};

export type Grain = 'brut' | 'jour' | 'semaine' | 'mois';
export const GRAIN_LABEL: Record<Grain, string> = { brut: 'Périodes du fichier', jour: 'Jour', semaine: 'Semaine (lun. → dim.)', mois: 'Mois civil' };
export type Regressor = 'dju' | 'djr' | 'x' | 'we';
export const REGRESSOR_LABEL: Record<Regressor, string> = { dju: 'DJU chauffage', djr: 'DJR climatisation', x: 'Variable libre (production…)', we: 'Part de jours de week-end' };
export type IpeDenom = 'aucun' | 'jours' | 'dju' | 'x';
export const IPE_LABEL: Record<IpeDenom, string> = { aucun: 'kWh par période', jours: 'kWh par jour', dju: 'kWh par DJU', x: 'kWh par unité de la variable libre' };

export type Period = { id: string; start: string; days: number; kwh: number; dju: number; djr: number; x: number; /** Part de jours de week-end dans la période (0 à 1). */ we: number };

export type Config = {
  grain: Grain;
  /** Température de base des degrés-jours (°C). */
  base: number;
  regressors: Regressor[];
  /** Situation de référence (EnB) et période de suivi, bornes incluses (AAAA-MM-JJ, début de période). */
  baselineFrom: string;
  baselineTo: string;
  reportFrom: string;
  reportTo: string;
  confidence: Confidence;
  ipe: IpeDenom;
  /** Périodes par an, pour annualiser (grain « brut »). */
  periodsPerYear: number;
  /** Conditions annuelles typiques pour la normalisation ; vide = climat de la référence. */
  djuTypique?: number;
  djrTypique?: number;
  xTypique?: number;
  /** Mois (1 à 12) de début et de fin de la saison de chauffe ; hors saison les DJU sont nuls. Absent = toute l'année. */
  saison?: { debut: number; fin: number };
  unite: string;
  nom: string;
};

export type Doc = { rows: Row[]; config: Config };

export const defaultConfig = (): Config => ({
  grain: 'mois', base: suivi.dju.baseDefaut_C, regressors: ['dju'], baselineFrom: '', baselineTo: '', reportFrom: '', reportTo: '',
  confidence: 0.9, ipe: 'aucun', periodsPerYear: 12, unite: 'unité', nom: '',
});

export const PERIODS_PER_YEAR: Record<Grain, number> = { brut: 12, jour: 365.25, semaine: 365.25 / 7, mois: 12 };
