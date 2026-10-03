// Règles combustion et économie de l'énergie. SI strict : énergie en J (PCI sauf mention), prix en €/J,
// facteurs d'émission en kg CO2/J. Les valeurs tabulées viennent de src/data/combustibles.json.
import { combustibles } from '@/data';
import type { FuelEntry } from '@/data/schema';
import { RuleError } from './rules';

const need = (cond: boolean, msg: string) => {
  if (!cond) throw new RuleError(msg);
};

export function fuel(id: string): FuelEntry {
  const f = combustibles.combustibles[id];
  need(!!f, `Combustible inconnu : ${id}`);
  return f;
}

/** Facteur d'émission en kg CO2 par joule PCI (1 TJ = 10^12 J). */
export const co2PerJoulePCI = (id: string): number => fuel(id).co2_kg_par_TJ_PCI * 1e-12;

/**
 * Ramène un prix d'énergie à la base PCI. Une même quantité de combustible contient
 * E_PCI = ratio·E_PCS ; un prix exprimé par unité PCS vaut donc prix_PCS / ratio par unité PCI.
 */
export function priceOnPCI(price: number, base: 'PCI' | 'PCS', fuelId: string): number {
  need(Number.isFinite(price) && price >= 0, 'Prix de l’énergie invalide.');
  return base === 'PCI' ? price : price / fuel(fuelId).ratio_PCI_PCS;
}

/** Rendement sur PCS à partir du rendement sur PCI : η_PCS = η_PCI × PCI/PCS. */
export const etaOnPCS = (etaPCI: number, fuelId: string): number => etaPCI * fuel(fuelId).ratio_PCI_PCS;

/**
 * Perte par chaleur sensible des fumées, formule de Siegert (forme O2), en fraction du PCI :
 *   q = (T_fumées − T_air) · (A2 / (21 − O2) + B) / 100, O2 en % volume sur fumées sèches.
 * Coefficients A2, B par combustible : src/data/combustibles.json.
 */
export function siegertLoss(input: { fuelId: string; Tflue: number; Tair: number; O2: number }): { q: number; A2: number; B: number } {
  const s = fuel(input.fuelId).siegert;
  need(s !== null, 'La formule de Siegert n’est pas renseignée pour ce combustible (voir combustibles.json).');
  need(input.O2 >= 0 && input.O2 < 21, 'Teneur en O2 dans [0 ; 21[ %.');
  need(input.Tflue > input.Tair, 'La température des fumées doit dépasser celle de l’air comburant.');
  const q = ((input.Tflue - input.Tair) * (s!.A2 / (21 - input.O2) + s!.B)) / 100;
  return { q, A2: s!.A2, B: s!.B };
}

/**
 * Coût et contenu carbone d'un kilogramme de vapeur produit :
 *   énergie combustible (PCI) = (h_vapeur − h_alimentation) / η_PCI
 *   coût = énergie × prix_PCI ; CO2 = énergie × facteur d'émission PCI.
 */
export function steamUnitCost(input: { hSteam: number; hFeed: number; etaPCI: number; pricePCI: number; co2PCI: number }): { fuelPerKg: number; costPerKg: number; co2PerKg: number } {
  need(input.etaPCI > 0 && input.etaPCI <= 1.1, 'Rendement sur PCI dans ]0 ; 110 %] (au-delà de 100 % uniquement en condensation).');
  need(input.hSteam > input.hFeed, 'L’enthalpie de la vapeur doit dépasser celle de l’eau d’alimentation.');
  const fuelPerKg = (input.hSteam - input.hFeed) / input.etaPCI;
  return { fuelPerKg, costPerKg: fuelPerKg * input.pricePCI, co2PerKg: fuelPerKg * input.co2PCI };
}
