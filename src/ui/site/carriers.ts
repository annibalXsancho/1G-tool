// Couleur par vecteur énergétique : la couleur suit l'énergie, jamais son rang. Les énergies usuelles ont un
// emplacement fixe de la palette catégorielle ; les autres prennent les emplacements libres dans l'ordre d'apparition ;
// au-delà de 8, elles sont regroupées en « autre » (gris).
import { norm } from '@/site/model';
import { LOSS_CARRIER } from '@/site/analyse';

const FIXED: [RegExp, number][] = [
  [/electri/, 1],
  [/gaz/, 2],
  [/vapeur/, 3],
  [/fioul|fuel/, 4],
  [/air comprime/, 5],
  [/eau chaude|chaleur|surchauffee|chauffage/, 6],
  [/froid|eau glacee|glycol/, 7],
];

export type CarrierColor = { carrier: string; token: string };

export function carrierColors(carriers: string[]): Map<string, string> {
  const map = new Map<string, string>();
  const used = new Set<number>();
  const rest: string[] = [];
  for (const c of carriers) {
    if (c === LOSS_CARRIER) { map.set(c, '--series-loss'); continue; }
    const hit = FIXED.find(([re]) => re.test(norm(c)));
    if (hit && !used.has(hit[1])) { map.set(c, `--series-${hit[1]}`); used.add(hit[1]); } else rest.push(c);
  }
  for (const c of rest) {
    const slot = [8, 1, 2, 3, 4, 5, 6, 7].find((k) => !used.has(k));
    if (slot) { map.set(c, `--series-${slot}`); used.add(slot); } else map.set(c, '--series-other');
  }
  return map;
}

/** Valeurs du thème clair, utilisées pour les exports (rapports sur fond blanc). Miroir de globals.css. */
export const EXPORT_COLORS: Record<string, string> = {
  '--series-1': '#2a78d6', '--series-2': '#eb6834', '--series-3': '#1baf7a', '--series-4': '#eda100',
  '--series-5': '#e87ba4', '--series-6': '#008300', '--series-7': '#4a3aa7', '--series-8': '#e34948',
  '--series-other': '#8a8984', '--series-loss': '#c9c4b8',
  '--ink': '#16181a', '--ink-2': '#55595c', '--ink-3': '#858a8d', '--surface': '#ffffff', '--rule': '#d9d5cc',
};
