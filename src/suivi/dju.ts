// Degrés-jours unifiés (méthode Costic) d'une journée à partir de ses températures minimale et maximale. Pur.
// Cours « Optimisation énergétique des bâtiments » (ISTP 2026), p. 101 : une journée à cheval sur la température de
// non-chauffage est pondérée (0,08 / 0,42), sans quoi l'entre-saison serait faussée par la simple moyenne.
import { suivi } from '@/data';

const { poidsDebut: A, poidsPente: B } = suivi.dju;

/** DJU de chauffage d'une journée (°C·j), base `base`. */
export function heatingDegreeDay(tmin: number, tmax: number, base: number): number {
  if (tmin >= base) return 0;
  if (tmax <= base) return base - (tmin + tmax) / 2;
  return (base - tmin) * (A + (B * (base - tmin)) / (tmax - tmin));
}

/** DJR (climatisation) : la même formule retournée. */
export function coolingDegreeDay(tmin: number, tmax: number, base: number): number {
  if (tmax <= base) return 0;
  if (tmin >= base) return (tmin + tmax) / 2 - base;
  return (tmax - base) * (A + (B * (tmax - base)) / (tmax - tmin));
}
