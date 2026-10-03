// Propriétés de l'eau et de la vapeur d'eau : couche d'adaptation SI autour d'une
// implémentation d'IAPWS-IF97 (paquet npm « iapws-if97 », licence MIT, sans dépendance).
//
//  • Entrées/sorties en SI strict : Pa, K, J/kg, J/(kg·K), m³/kg (le paquet travaille en MPa et kJ/kg).
//  • Origine des enthalpies et entropies : celle d'IF97 (u = s = 0 pour le liquide saturé au point triple).
//    Les différences d'enthalpie sont donc indépendantes de ce choix ; ne jamais comparer une valeur
//    absolue à une table qui utiliserait une autre origine.
//  • Le paquet est isolé dans CE fichier : le remplacer (ou le remplacer par du code maison) ne touche
//    qu'ici. Ses résultats sont contrôlés par steam.test.ts contre les valeurs de vérification publiées
//    avec IAPWS-IF97 (tables de vérification des régions 1, 2 et 4).
import { solvePH, solvePS, solvePT, solvePx, solveTx, Region, type SteamState as RawState } from 'iapws-if97';

/** Domaine industriel supporté : régions 1, 2 et 4 d'IF97 (pas de région 3 ni 5). */
export const STEAM_DOMAIN = {
  /** Pression du point triple ≈ 611,2 Pa. */
  pMin: 612,
  /** Au-delà de 16,5292 MPa, la frontière 2–3 (B23) apparaît : on s'arrête avant (vapeur industrielle). */
  pMax: 16e6,
  /** Région 2 d'IF97 jusqu'à 800 °C (en dessous de 50 MPa : ici toujours vrai). */
  Tmax: 1073.15,
  Tmin: 273.15,
} as const;

export type Phase = 'liquide' | 'liquide-sature' | 'vapeur-humide' | 'vapeur-saturee' | 'vapeur-surchauffee';

export type SteamState = {
  phase: Phase;
  p: number; // Pa
  T: number; // K
  h: number; // J/kg
  s: number; // J/(kg·K)
  u: number; // J/kg
  v: number; // m³/kg
  rho: number; // kg/m³
  /** Titre en vapeur : 0 liquide, 1 vapeur ; null hors saturation (liquide comprimé, vapeur surchauffée). */
  x: number | null;
  cp: number | null; // J/(kg·K), null en mélange diphasique
  /** T − Tsat à la même pression (K) ; 0 en diphasique, négatif pour un liquide sous-refroidi. */
  dTsat: number;
};

export type Saturation = {
  p: number; T: number;
  hf: number; hg: number; hfg: number; // J/kg
  sf: number; sg: number; // J/(kg·K)
  vf: number; vg: number; // m³/kg
  rhof: number; rhog: number; // kg/m³
};

export class SteamDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SteamDomainError';
  }
}

const MPa = 1e6;
const k = 1e3;

function checkP(p: number) {
  if (!Number.isFinite(p) || p < STEAM_DOMAIN.pMin || p > STEAM_DOMAIN.pMax) {
    throw new SteamDomainError(`Pression ${p} Pa hors du domaine supporté [${STEAM_DOMAIN.pMin} ; ${STEAM_DOMAIN.pMax}] Pa`);
  }
}
function checkT(T: number) {
  if (!Number.isFinite(T) || T < STEAM_DOMAIN.Tmin || T > STEAM_DOMAIN.Tmax) {
    throw new SteamDomainError(`Température ${T} K hors du domaine supporté [${STEAM_DOMAIN.Tmin} ; ${STEAM_DOMAIN.Tmax}] K`);
  }
}

function wrap<T>(f: () => T): T {
  try {
    return f();
  } catch (e) {
    if (e instanceof SteamDomainError) throw e;
    throw new SteamDomainError(e instanceof Error ? e.message : String(e));
  }
}

/** Saturation à la pression p. */
export function saturationP(p: number): Saturation {
  checkP(p);
  return wrap(() => {
    const l = solvePx(p / MPa, 0);
    const g = solvePx(p / MPa, 1);
    return {
      p, T: l.temperature,
      hf: l.enthalpy * k, hg: g.enthalpy * k, hfg: (g.enthalpy - l.enthalpy) * k,
      sf: l.entropy * k, sg: g.entropy * k,
      vf: l.specificVolume, vg: g.specificVolume,
      rhof: l.density, rhog: g.density,
    };
  });
}

/** Température de saturation à la pression p. */
export const Tsat = (p: number): number => saturationP(p).T;

/** Saturation à la température T. */
export function saturationT(T: number): Saturation {
  checkT(T);
  return wrap(() => {
    const l = solveTx(T, 0);
    const g = solveTx(T, 1);
    return {
      p: l.pressure * MPa, T,
      hf: l.enthalpy * k, hg: g.enthalpy * k, hfg: (g.enthalpy - l.enthalpy) * k,
      sf: l.entropy * k, sg: g.entropy * k,
      vf: l.specificVolume, vg: g.specificVolume,
      rhof: l.density, rhog: g.density,
    };
  });
}

function convert(r: RawState): SteamState {
  const p = r.pressure * MPa;
  const T = r.temperature;
  let phase: Phase;
  let x: number | null = null;
  let dTsat: number;
  if (r.region === Region.Region4) {
    x = r.quality;
    phase = x === 0 ? 'liquide-sature' : x === 1 ? 'vapeur-saturee' : 'vapeur-humide';
    dTsat = 0;
  } else {
    phase = r.region === Region.Region1 ? 'liquide' : 'vapeur-surchauffee';
    dTsat = T - Tsat(p);
  }
  return {
    phase, p, T, h: r.enthalpy * k, s: r.entropy * k, u: r.internalEnergy * k,
    v: r.specificVolume, rho: r.density, x,
    cp: r.cp === null ? null : r.cp * k,
    dTsat,
  };
}

function guard(state: SteamState): SteamState {
  if (state.T > STEAM_DOMAIN.Tmax + 1e-9) throw new SteamDomainError(`Température ${state.T} K hors du domaine supporté`);
  return state;
}

/** État (p, T). À la saturation exacte, utiliser statePx. */
export function statePT(p: number, T: number): SteamState {
  checkP(p); checkT(T);
  return guard(convert(wrap(() => solvePT(p / MPa, T))));
}
/** État (p, h). */
export function statePH(p: number, h: number): SteamState {
  checkP(p);
  return guard(convert(wrap(() => solvePH(p / MPa, h / k))));
}
/** État (p, s). */
export function statePS(p: number, s: number): SteamState {
  checkP(p);
  return guard(convert(wrap(() => solvePS(p / MPa, s / k))));
}
/** État saturé (p, x) : x = 0 liquide saturé, x = 1 vapeur saturée. */
export function statePx(p: number, x: number): SteamState {
  checkP(p);
  if (!(x >= 0 && x <= 1)) throw new SteamDomainError(`Titre ${x} hors de [0 ; 1]`);
  return convert(wrap(() => solvePx(p / MPa, x)));
}
