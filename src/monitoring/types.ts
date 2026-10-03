// Types du monitoring : mesures de puissance et leur lecture. Pur.

/** Une mesure : instant (ms, heure locale), compteur, puissance moyenne du pas en kW. L'énergie vaut kW × durée du pas. */
export type Measure = { t: number; site: string; kw: number };

export type Table = { header: string[]; rows: string[][] };
export type Unit = 'W' | 'kW' | 'MW';
export type Mapping = { timestamp: number; power: number[]; site: number; unit: Unit; siteName: string };
export type Freq = 'raw' | 'h' | 'D' | 'W' | 'M';
export const FREQ_LABEL: Record<Freq, string> = { raw: 'Pas natif', h: 'Heure', D: 'Jour', W: 'Semaine', M: 'Mois' };

export type Level = 'erreur' | 'avertissement' | 'info';
export type Issue = { level: Level; message: string };
