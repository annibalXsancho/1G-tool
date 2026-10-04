// Fluide : eau (ρ et ν d'après le tableau en température) ou fluide saisi. Pur.
import { hydraulique } from '@/data';

export type Fluid = { label: string; rho: number; nu: number; T?: number };

function interp(xs: number[], ys: number[], x: number): number {
  if (x < xs[0] || x > xs[xs.length - 1]) throw new RangeError(`Température hors tableau (${xs[0]} à ${xs[xs.length - 1]} °C)`);
  let i = xs.findIndex((v) => v >= x);
  if (i <= 0) i = 1;
  return ys[i - 1] + ((ys[i] - ys[i - 1]) * (x - xs[i - 1])) / (xs[i] - xs[i - 1]);
}

/** Eau liquide à T (°C), 0 à 100 °C, interpolation linéaire ; ν = μ/ρ. */
export function water(T: number): Fluid {
  const e = hydraulique.eau;
  const rho = interp(e.T_C, e.rho_kg_m3, T);
  const mu = interp(e.T_C, e.mu_mPa_s, T) * 1e-3;
  return { label: `Eau à ${T} °C`, rho, nu: mu / rho, T };
}

/** Fluide saisi : masse volumique (kg/m³) et viscosité cinématique (mm²/s). */
export const custom = (rho: number, nuMm2s: number, label = 'Fluide saisi'): Fluid => ({ label, rho, nu: nuMm2s * 1e-6 });
