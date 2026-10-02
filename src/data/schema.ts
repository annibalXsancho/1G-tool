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
