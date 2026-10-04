// Frottement en conduite pleine : Reynolds, coefficient de Darcy (laminaire, Colebrook-White, Swamee-Jain). Pur, en SI.

export const G = 9.81; // m/s², valeur de la feuille du cours ; TODO: 9,80665 pour un calcul normalisé

export const area = (D: number) => (Math.PI * D * D) / 4;
export const velocity = (Q: number, D: number) => Q / area(D);
export const reynolds = (v: number, D: number, nu: number) => (v * D) / nu;

/** Swamee-Jain (explicite) : f = 0,25 / [log10(ε/(3,7 D) + 5,74/Re^0,9)]². Valable 5 000 < Re < 10⁸ et 10⁻⁶ < ε/D < 10⁻². */
export function swameeJain(Re: number, rel: number): number {
  const x = Math.log10(rel / 3.7 + 5.74 / Math.pow(Re, 0.9));
  return 0.25 / (x * x);
}

/** Colebrook-White : 1/√f = −2 log10(ε/(3,7 D) + 2,51/(Re √f)), résolu par Newton sur x = 1/√f. */
export function colebrook(Re: number, rel: number): number {
  let x = 1 / Math.sqrt(swameeJain(Re, rel));
  for (let i = 0; i < 60; i++) {
    const arg = rel / 3.7 + (2.51 * x) / Re;
    const g = x + 2 * Math.log10(arg);
    const dg = 1 + (2 / Math.LN10) * ((2.51 / Re) / arg);
    const nx = x - g / dg;
    if (Math.abs(nx - x) < 1e-13) { x = nx; break; }
    x = nx;
  }
  return 1 / (x * x);
}

export type Method = 'colebrook' | 'swamee-jain';
export type Regime = 'laminaire' | 'transition' | 'turbulent';
export const RE_LAMINAR = 2000;
export const RE_TURBULENT = 4000;

/** Coefficient de Darcy selon le régime. La zone 2 000 – 4 000 est instable : on interpole entre les deux bornes et on la signale. */
export function frictionFactor(Re: number, rel: number, method: Method = 'colebrook'): { f: number; regime: Regime } {
  if (!(Re > 0)) throw new RangeError('Reynolds nul ou négatif');
  const turb = (r: number) => (method === 'colebrook' ? colebrook(r, rel) : swameeJain(r, rel));
  if (Re < RE_LAMINAR) return { f: 64 / Re, regime: 'laminaire' };
  if (Re > RE_TURBULENT) return { f: turb(Re), regime: 'turbulent' };
  const f0 = 64 / RE_LAMINAR; const f1 = turb(RE_TURBULENT);
  return { f: f0 + ((f1 - f0) * (Re - RE_LAMINAR)) / (RE_TURBULENT - RE_LAMINAR), regime: 'transition' };
}

/** Perte de charge linéique de Darcy-Weisbach, en pascals : ΔP = f (L/D) ρ v²/2. */
export const darcy = (f: number, L: number, D: number, rho: number, v: number) => f * (L / D) * (rho * v * v) / 2;
