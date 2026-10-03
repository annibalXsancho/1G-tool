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
