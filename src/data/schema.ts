// Types des fichiers JSON de src/data/. Les tests (data.test.ts) vérifient la forme des fichiers.

export type DataMeta = {
  titre: string;
  source: string;
  /** Date de saisie ou de relecture, AAAA-MM-JJ. */
  date: string;
  note: string;
};

export type FluidPoint = { T: number; cp: number; rho?: number };

export type FluidEntry = {
  label: string;
  phase: 'liquide' | 'gaz';
  /** Unité de la colonne T des points : « C » (°C) ou « K ». */
  T_unite: 'C' | 'K';
  /** Constante spécifique r = R/M en J/(kg·K) : si présente, ρ = p / (r·T) (gaz parfait). */
  R_specifique: number | null;
  points: FluidPoint[];
};

export type FluidesFile = { meta: DataMeta; fluides: Record<string, FluidEntry> };

export type FuelEntry = {
  label: string;
  /** PCI / PCS, sans unité. */
  ratio_PCI_PCS: number;
  /** Facteur d'émission CO2 de combustion, kg CO2 par TJ de PCI. */
  co2_kg_par_TJ_PCI: number;
  /** Coefficients de la formule de Siegert (O2), ou null si non définie. */
  siegert: { A2: number; B: number } | null;
};

export type CombustiblesFile = { meta: DataMeta; combustibles: Record<string, FuelEntry> };

export type ElectriqueFile = {
  meta: DataMeta;
  conducteurs: Record<'cuivre' | 'aluminium', { label: string; rho20: number; rhoService: number }>;
  /** Réactance linéique des câbles, mΩ/m. */
  reactanceLineique_mOhm_par_m: number;
  /** Facteur de tension c (court-circuit maximal). */
  facteurTension_c: number;
  /** Rapport R/X de l'impédance du réseau amont. */
  rapportRsurX_source: number;
  series: { sections_mm2: number[]; calibres_A: number[]; transformateurs_kVA: number[]; pouvoirsCoupure_kA: number[] };
};

type PowerLaw = { coef: number; exposant: number };

export type EcsFile = {
  meta: DataMeta;
  referenceStandard: { volume40_L_par_jour_T3: number; T_eauFroideReference_C: number; T_stockageReference_C: number; T_puisage_C: number };
  logements: Record<'T1' | 'T2' | 'T3' | 'T4' | 'T5', { label: string; ns: number; volume40_L_par_jour: number }>;
  tertiaire: Record<string, { label: string; unite: string; min: number; max: number; defaut: number }>;
  pointes: { min10: PowerLaw; h1: PowerLaw; h8: PowerLaw; Ns_minimal: number };
  semiInstantane: { circulateurPermanent: PowerLaw; circulateurArretable: PowerLaw; V1: { a: number; b: number }; domaineVolume_L: [number, number] };
  boucle: Record<'neuf' | 'ancien', { label: string; fraction_besoin_journalier: number }>;
  pertesStatiques: { a_W: number; b_W: number; exposant: number; dT_mesure_K: number; volumeMax_L: number };
  stratification: { min: number; defaut: number; max: number };
  rendementReconstitution: number;
  taillesCommerciales_L: number[];
  reglementation: { stockageSeuil_L: number; stockageTmin_C: number; bouclesTmin_C: number; puisageTmax_C: number };
  eau: { cp_Wh_par_L_K: number };
};

export type SuiviFile = {
  meta: DataMeta;
  dju: { poidsDebut: number; poidsPente: number; baseDefaut_C: number };
  seuils: { R2_min: number; CVRMSE_max_pct: number; NMBE_max_pct: number; t_min: number; facteurIncertitude: number; pointsMin: Record<'mois' | 'semaine' | 'jour' | 'brut', number> };
  student: { dof: number[]; '80': number[]; '90': number[]; '95': number[]; infini: { '80': number; '90': number; '95': number } };
};

export type SingularityKind = 'fixe' | 'coude-arrondi' | 'coude-vif' | 'elargissement' | 'retrecissement' | 'libre';
export type SingularityDef = { id: string; categorie: string; label: string; kind: SingularityKind; K?: number; Kmin?: number; Kmax?: number };

export type HydrauliqueFile = {
  meta: DataMeta;
  eau: { T_C: number[]; rho_kg_m3: number[]; mu_mPa_s: number[] };
  rugosites: Record<string, { label: string; eps_mm: number }>;
  criteres: { vitesseMin_m_s: number; vitesseMax_m_s: number; vitesseMaxAspiration_m_s: number; perteLineiqueMax_Pa_m: number; partSinguliereAlerte: number };
  singularites: SingularityDef[];
};
