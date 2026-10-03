// Règles métiers « vapeur et efficacité énergétique » : bilans de masse et d'énergie standards
// (thermodynamique appliquée, régime permanent). Fonctions pures, SI strict : Pa, K, J/kg, kg/s, W.
// Aucune de ces relations n'est normative : ce sont des bilans, justifiés ici en commentaire.
// Les propriétés de l'eau viennent exclusivement de steam.ts.
import { saturationP, statePH, statePS, type SteamState } from './steam';

export class RuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RuleError';
  }
}
const need = (cond: boolean, msg: string) => {
  if (!cond) throw new RuleError(msg);
};
const pos = (x: number) => Number.isFinite(x) && x > 0;

// ───────────────────────── Vapeur flash ─────────────────────────

export type FlashResult = {
  /** Enthalpie du condensat avant détente (J/kg). */
  hCondensate: number;
  /** Saturation à la pression basse. */
  low: ReturnType<typeof saturationP>;
  /** Fraction massique de vapeur flash dans le mélange après détente (0 si le condensat n'atteint pas la saturation). */
  xFlash: number;
};

/**
 * Détente d'un condensat de pHigh vers pLow (vanne ou ballon de détente), isenthalpique :
 *   h_cond = h_f(pLow) + x · h_fg(pLow)   ⇒   x = (h_cond − h_f(pLow)) / h_fg(pLow).
 * Par défaut le condensat est du liquide saturé à pHigh (cas d'un purgeur thermodynamique ou à flotteur).
 */
export function flashSteam(input: { pHigh: number; pLow: number; hCondensate?: number }): FlashResult {
  need(pos(input.pHigh) && pos(input.pLow), 'Pressions strictement positives requises.');
  need(input.pHigh > input.pLow, 'La pression haute doit dépasser la pression basse.');
  const high = saturationP(input.pHigh);
  const low = saturationP(input.pLow);
  const hCondensate = input.hCondensate ?? high.hf;
  const x = (hCondensate - low.hf) / low.hfg;
  return { hCondensate, low, xFlash: Math.min(1, Math.max(0, x)) };
}

// ───────────────────────── Détendeur (laminage) ─────────────────────────

/**
 * Laminage dans un détendeur de pression : détente adiabatique sans travail ⇒ h2 = h1 (isenthalpique).
 * La vapeur surchauffée en amont peut ressortir moins surchauffée, voire humide en aval.
 */
export function throttle(state1: SteamState, p2: number): SteamState {
  need(pos(p2) && p2 < state1.p, 'La pression aval doit être positive et inférieure à la pression amont.');
  return statePH(p2, state1.h);
}

// ───────────────────────── Désurchauffe ─────────────────────────

/**
 * Désurchauffeur par injection d'eau : bilan d'énergie  m_s·h_s + m_w·h_w = (m_s + m_w)·h_t
 *   ⇒  m_w / m_s = (h_s − h_t) / (h_t − h_w).
 * hTarget est l'enthalpie visée en sortie (calculée par l'appelant, p. ex. via statePT).
 */
export function desuperheat(input: { hSteam: number; hWater: number; hTarget: number }): { waterPerSteam: number } {
  const { hSteam, hWater, hTarget } = input;
  need([hSteam, hWater, hTarget].every(Number.isFinite), 'Enthalpies invalides.');
  need(hTarget < hSteam, 'L’enthalpie cible doit être inférieure à celle de la vapeur entrante (sinon rien à désurchauffer).');
  need(hTarget > hWater, 'L’enthalpie cible doit dépasser celle de l’eau d’injection.');
  return { waterPerSteam: (hSteam - hTarget) / (hTarget - hWater) };
}

// ───────────────────────── Chaudière ─────────────────────────

/** Puissance thermique absorbée par l'eau en chaudière : Q = ṁ_vapeur · (h_vapeur − h_eau d'alimentation). */
export function steamPower(input: { m: number; hSteam: number; hFeed: number }): number {
  need(Number.isFinite(input.m) && input.m >= 0, 'Débit de vapeur négatif ou invalide.');
  need(input.hSteam > input.hFeed, 'L’enthalpie de la vapeur doit dépasser celle de l’eau d’alimentation.');
  return input.m * (input.hSteam - input.hFeed);
}

/**
 * Rendement par la méthode directe, rapporté au PCI : η = Q_utile / (ṁ_combustible · PCI).
 * (Le rendement sur PCS s'en déduit avec le rapport PCI/PCS du combustible, voir src/data.)
 */
export function boilerEfficiencyDirect(input: { m: number; hSteam: number; hFeed: number; mFuel: number; pci: number }): { Q: number; fuelPower: number; eta: number } {
  need(pos(input.mFuel) && pos(input.pci), 'Débit de combustible et PCI strictement positifs requis.');
  const Q = steamPower(input);
  const fuelPower = input.mFuel * input.pci;
  return { Q, fuelPower, eta: Q / fuelPower };
}

/**
 * Déconcentration (purge) : bilan de matière sur les sels dissous, alimentation F = vapeur S + purge B,
 * F·c_alim = B·c_chaudière  ⇒  B/S = c_alim / (c_chaudière − c_alim).  (Entraînement de sels par la vapeur négligé.)
 * Perte d'énergie associée : B·(h_f,chaudière − h_alim).
 */
export function blowdown(input: { tdsFeed: number; tdsBoiler: number; mSteam: number; pBoiler: number; hFeed: number }): { purgePerSteam: number; mPurge: number; powerLost: number } {
  const { tdsFeed, tdsBoiler, mSteam, pBoiler, hFeed } = input;
  need(pos(tdsFeed) && tdsBoiler > tdsFeed, 'Il faut 0 < concentration d’alimentation < concentration admissible en chaudière.');
  need(Number.isFinite(mSteam) && mSteam >= 0, 'Débit de vapeur invalide.');
  const hf = saturationP(pBoiler).hf; // la purge est prélevée en liquide saturé à la pression de la chaudière
  need(hf > hFeed, 'L’eau d’alimentation est plus chaude que le liquide saturé de la chaudière.');
  const purgePerSteam = tdsFeed / (tdsBoiler - tdsFeed);
  const mPurge = purgePerSteam * mSteam;
  return { purgePerSteam, mPurge, powerLost: mPurge * (hf - hFeed) };
}

// ───────────────────────── Process et condensats ─────────────────────────

/**
 * Débit de vapeur nécessaire pour une puissance de chauffe Q : la vapeur cède (h_in − h_out).
 * Par défaut : vapeur saturée sèche à p entrante, condensat évacué en liquide saturé (chaleur latente seule).
 */
export function steamForDuty(input: { duty: number; p: number; hOut?: number; xIn?: number }): { m: number; hIn: number; hOut: number } {
  need(Number.isFinite(input.duty) && input.duty >= 0, 'Puissance de chauffe négative ou invalide.');
  const sat = saturationP(input.p);
  const x = input.xIn ?? 1;
  need(x > 0 && x <= 1, 'Titre d’entrée dans ]0 ; 1].');
  const hIn = sat.hf + x * sat.hfg;
  const hOut = input.hOut ?? sat.hf;
  need(hIn > hOut, 'La vapeur n’a pas d’énergie à céder (hOut ≥ hIn).');
  return { m: input.duty / (hIn - hOut), hIn, hOut };
}

/** Énergie récupérable dans des condensats renvoyés vs eau d'appoint : Q = ṁ · (h_cond − h_appoint). */
export function condensateReturnPower(input: { mReturn: number; hCondensate: number; hMakeup: number }): number {
  need(Number.isFinite(input.mReturn) && input.mReturn >= 0, 'Débit de condensats invalide.');
  return input.mReturn * (input.hCondensate - input.hMakeup);
}

// ───────────────────────── Turbine / contre-pression ─────────────────────────

/**
 * Détente en turbine de pression p2 avec rendement isentropique η_is = (h1 − h2) / (h1 − h2s),
 * h2s étant l'enthalpie après détente isentropique (s2s = s1). Travail massique w = h1 − h2.
 */
export function turbineExpansion(input: { state1: SteamState; p2: number; etaIs: number }): { w: number; h2s: number; state2: SteamState } {
  const { state1, p2, etaIs } = input;
  need(pos(p2) && p2 < state1.p, 'La pression de sortie doit être positive et inférieure à la pression d’entrée.');
  need(etaIs > 0 && etaIs <= 1, 'Rendement isentropique dans ]0 ; 1].');
  const h2s = statePS(p2, state1.s).h;
  const w = etaIs * (state1.h - h2s);
  return { w, h2s, state2: statePH(p2, state1.h - w) };
}

// ───────────────────────── Fuite de vapeur par un orifice (Napier) ─────────────────────────

/**
 * Formule empirique de Napier, débit critique de vapeur saturée sèche par un orifice :
 *   W [lb/s] = P [psia] · A [in²] / 70.
 * Conversion en SI (1 lb = 0,45359237 kg ; 1 psi = 6894,757 Pa ; 1 in² = 6,4516·10⁻⁴ m²) :
 *   ṁ [kg/s] = C_N · p [Pa] · A [m²], C_N = 0,45359237 / (6894,757 × 6,4516·10⁻⁴ × 70) ≈ 1,4568·10⁻³ s/m.
 */
export const NAPIER_SI = 0.45359237 / (6894.757293168 * 6.4516e-4 * 70);

/**
 * Rapport critique p_aval/p_amont sous lequel l'écoulement est bloqué (sonique) :
 *   (2/(k+1))^(k/(k−1)), avec k = 1,135 couramment retenu pour la vapeur saturée sèche (≈ 0,577).
 */
export const STEAM_CRITICAL_RATIO = (2 / (1.135 + 1)) ** (1.135 / (1.135 - 1));

export function napierLeak(input: { pUp: number; pDown: number; d: number; cd: number }): { m: number; area: number; choked: boolean } {
  const { pUp, pDown, d, cd } = input;
  need(pos(pUp) && Number.isFinite(pDown) && pDown >= 0 && pDown < pUp, 'Il faut 0 ≤ pression aval < pression amont.');
  need(Number.isFinite(d) && d >= 0, 'Diamètre invalide.');
  need(cd > 0 && cd <= 1, 'Coefficient de décharge dans ]0 ; 1].');
  const area = (Math.PI * d * d) / 4;
  return { m: cd * NAPIER_SI * pUp * area, area, choked: pDown / pUp <= STEAM_CRITICAL_RATIO };
}
