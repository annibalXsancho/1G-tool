// Éléments partagés par les calculateurs vapeur : champs de coût de la vapeur, calcul du coût
// et étape de justification correspondante, conversion des erreurs métier en Result.
// Ce n'est pas un framework : juste ce que plusieurs outils vapeur saisissent à l'identique.
import type { ChoiceField, Formula, NumberField, Result } from '@/core/types';
import { fmtNum, tex } from '@/core/fmt';
import { fuelOptions } from '@/data';
import { co2PerJoulePCI, fuel, priceOnPCI, steamUnitCost } from '@/thermo/combustion';
import { RuleError } from '@/thermo/rules';
import { saturationT, STEAM_DOMAIN, SteamDomainError } from '@/thermo/steam';

export const P_ATM = 101325; // Pa, atmosphère normale (définition)
export const K0 = 273.15;

/** Champ pression avec bar(g) par défaut. `def` en Pa absolus. */
export const pressureField = (key: string, label: string, def: number, help?: string): NumberField => ({
  type: 'number', key, label, dimension: 'pressure', units: ['bar(g)', 'bar', 'kPa', 'MPa'], default: def,
  min: STEAM_DOMAIN.pMin, max: STEAM_DOMAIN.pMax, help,
});

export const costFields = {
  combustible: (): ChoiceField => ({ type: 'choice', key: 'combustible', label: 'Combustible de la chaufferie', options: fuelOptions(), default: 'gaz-naturel' }),
  prixEnergie: (): NumberField => ({
    type: 'number', key: 'prixEnergie', label: 'Prix du combustible', dimension: 'energyPrice', default: 50 / 3.6e9, min: 0,
    help: 'Prix moyen rendu chaufferie, toutes taxes et acheminement compris.',
  }),
  basePrix: (): ChoiceField => ({
    type: 'choice', key: 'basePrix', label: 'Prix exprimé sur', default: 'PCS',
    options: [{ value: 'PCS', label: 'PCS (factures gaz)' }, { value: 'PCI', label: 'PCI' }],
  }),
  rendement: (): NumberField => ({ type: 'number', key: 'rendement', label: 'Rendement chaudière (sur PCI)', dimension: 'ratio', units: ['%', '-'], default: 0.9, min: 0.3, max: 1.1 }),
  tAlim: (): NumberField => ({
    type: 'number', key: 'tAlim', label: 'Température eau d’alimentation', dimension: 'temperature', default: 90 + K0, min: K0 + 0.01, max: 200 + K0,
    help: 'Eau entrant dans la chaudière (sortie bâche ou dégazeur).',
  }),
  heures: (): NumberField => ({ type: 'number', key: 'heures', label: 'Heures de fonctionnement par an', dimension: 'time', units: ['h'], default: 6000 * 3600, min: 0, max: 8784 * 3600 }),
};

export type CostInput = { combustible: string; prixEnergie: number; basePrix: 'PCS' | 'PCI'; rendement: number; tAlim: number };

export type SteamCost = ReturnType<typeof steamUnitCost> & { hFeed: number; pricePCI: number; co2PCI: number };

/**
 * Coût de production d'un kg de vapeur d'enthalpie hSteam. L'eau d'alimentation est assimilée à du
 * liquide saturé à sa température (écart avec le liquide comprimé : de l'ordre de v·Δp, ≈ 1 kJ/kg à 10 bar).
 */
export function steamCost(i: CostInput, hSteam: number): SteamCost {
  const hFeed = saturationT(i.tAlim).hf;
  const pricePCI = priceOnPCI(i.prixEnergie, i.basePrix, i.combustible);
  const co2PCI = co2PerJoulePCI(i.combustible);
  return { ...steamUnitCost({ hSteam, hFeed, etaPCI: i.rendement, pricePCI, co2PCI }), hFeed, pricePCI, co2PCI };
}

const kJ = (v: number) => tex(v / 1e3);
export const perMWh = (pricePerJ: number) => pricePerJ * 3.6e9;

export function costFormula(c: SteamCost, hSteam: number, i: CostInput): Formula {
  const kWhPerT = c.fuelPerKg / 3600;
  const f = fuel(i.combustible);
  return {
    label: 'Coût de production d’une tonne de vapeur',
    symbolic: 'c_v = \\dfrac{h_v - h_{alim}}{\\eta_{PCI}} \\times p_{PCI}',
    substituted: `\\begin{aligned} c_v &= \\dfrac{${kJ(hSteam)} - ${kJ(c.hFeed)}}{${tex(i.rendement)}}\\ \\mathrm{kJ/kg} = ${tex(kWhPerT)}\\ \\mathrm{kWh_{PCI}/t} \\\\ &= ${tex(kWhPerT)} \\times ${tex(perMWh(c.pricePCI))}\\ \\text{€/MWh} \\div 1000 = ${tex(c.costPerKg * 1e3)}\\ \\text{€/t} \\end{aligned}`,
    legend: [
      { symbol: 'h_v', meaning: 'enthalpie de la vapeur produite', unit: 'kJ/kg' },
      { symbol: 'h_{alim}', meaning: 'enthalpie de l’eau d’alimentation', unit: 'kJ/kg' },
      { symbol: '\\eta_{PCI}', meaning: 'rendement de la chaudière sur PCI' },
      { symbol: 'p_{PCI}', meaning: 'prix du combustible ramené au PCI', unit: '€/MWh' },
    ],
    note: i.basePrix === 'PCS'
      ? `Prix saisi sur PCS, ramené au PCI : p_PCI = p_PCS / (PCI/PCS) = ${fmtNum(perMWh(i.prixEnergie))} / ${fmtNum(f.ratio_PCI_PCS)} = ${fmtNum(perMWh(c.pricePCI))} €/MWh (${f.label}, combustibles.json).`
      : undefined,
  };
}

/** Pression absolue (Pa) → texte « x bar(g) ». */
export const barg = (p: number) => `${fmtNum((p - P_ATM) / 1e5, 3)} bar(g)`;

/** Exécute un calcul et convertit les erreurs métier (règles, domaine vapeur) en Result d'erreur. */
export function guarded<O>(fn: () => Result<O>): Result<O> {
  try {
    return fn();
  } catch (e) {
    if (e instanceof RuleError || e instanceof SteamDomainError) return { ok: false, errors: [{ message: e.message }] };
    throw e;
  }
}
