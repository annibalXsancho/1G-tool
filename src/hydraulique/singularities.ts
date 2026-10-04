// Coefficients de pertes singulières K (ΔP = K ρ v²/2). Pur. Chaque K est rapporté à la vitesse dans la conduite du tronçon.
// Sources : voir src/data/hydraulique.json (Weisbach, Borda-Carnot, Crane TP-410, Idel'chik). TODO: source à vérifier.
import { hydraulique } from '@/data';
import type { SingularityDef } from '@/data/schema';

export const CATALOG: SingularityDef[] = hydraulique.singularites;
export const defOf = (id: string): SingularityDef | undefined => CATALOG.find((d) => d.id === id);
export const CATEGORIES = [...new Set(CATALOG.map((d) => d.categorie))];

export type SingInput = {
  id: string;
  /** Identifiant du catalogue. */
  def: string;
  qty: number;
  /** Coude : angle de déviation (°) et rapport R/D du rayon de courbure au diamètre. */
  angle?: number;
  rD?: number;
  /** Raccord de section : angle total du cône (°), 180 = brusque. Le diamètre aval est celui du tronçon suivant. */
  cone?: number;
  /** Coefficient saisi (kind « libre »). */
  K?: number;
};

const rad = (deg: number) => (deg * Math.PI) / 180;

/** Weisbach, coude arrondi : K = (α/90)·[0,131 + 1,847·(D/2R)^3,5]. Pour R/D = 1,5 et α = 90° : 0,17. */
export const kBendRound = (alpha: number, rD: number) => (alpha / 90) * (0.131 + 1.847 * Math.pow(1 / (2 * rD), 3.5));
/** Weisbach, coude vif (équerre) : K = 0,946 sin²(α/2) + 2,05 sin⁴(α/2). 0,99 à 90°. */
export const kBendSharp = (alpha: number) => { const s = Math.sin(rad(alpha) / 2); return 0.946 * s * s + 2.05 * s ** 4; };
/** Élargissement, rapporté à la vitesse de la petite section. Brusque : Borda-Carnot (1 − β²)² ; conique (θ ≤ 45°) : 2,6 sin(θ/2)(1 − β²)² (Crane). */
export const kEnlarge = (beta: number, theta: number) => (theta <= 45 ? 2.6 * Math.sin(rad(theta) / 2) : 1) * (1 - beta * beta) ** 2;
/** Rétrécissement, rapporté à la vitesse de la petite section : conique θ ≤ 45° : 0,8 sin(θ/2)(1 − β²) ; au-delà : 0,5 (1 − β²) √sin(θ/2) (Crane). */
export const kContract = (beta: number, theta: number) => (theta <= 45 ? 0.8 * Math.sin(rad(theta) / 2) * (1 - beta * beta) : 0.5 * (1 - beta * beta) * Math.sqrt(Math.sin(rad(theta) / 2)));

export type KResult = { K: number; Kmin: number; Kmax: number; label: string; note?: string; warning?: string };

/** K d'une singularité (par pièce), rapporté à la vitesse du tronçon de diamètre D (m). `dNext` : diamètre du tronçon suivant (m). */
export function singularityK(s: SingInput, D: number, dNext?: number): KResult {
  const def = defOf(s.def);
  if (!def) throw new RangeError(`Singularité inconnue : ${s.def}`);
  switch (def.kind) {
    case 'fixe': return { K: def.K!, Kmin: def.Kmin ?? def.K!, Kmax: def.Kmax ?? def.K!, label: def.label };
    case 'libre': { const K = s.K ?? 0; return { K, Kmin: K, Kmax: K, label: def.label }; }
    case 'coude-arrondi': {
      const a = s.angle ?? 90; const rD = s.rD ?? 1.5;
      const K = kBendRound(a, rD);
      return { K, Kmin: K, Kmax: K, label: `${def.label} ${a}°, R/D = ${rD}`, warning: rD < 0.5 ? 'R/D < 0,5 : hors du domaine de la formule de Weisbach' : undefined };
    }
    case 'coude-vif': { const a = s.angle ?? 90; const K = kBendSharp(a); return { K, Kmin: K, Kmax: K, label: `${def.label} ${a}°` }; }
    case 'elargissement':
    case 'retrecissement': {
      if (dNext === undefined) return { K: 0, Kmin: 0, Kmax: 0, label: def.label, warning: 'Aucun tronçon suivant : le raccord de section est ignoré.' };
      const theta = s.cone ?? 180;
      const enlarge = def.kind === 'elargissement';
      if (enlarge ? dNext <= D : dNext >= D) return { K: 0, Kmin: 0, Kmax: 0, label: def.label, warning: enlarge ? 'Le tronçon suivant n’est pas plus grand : pas d’élargissement.' : 'Le tronçon suivant n’est pas plus petit : pas de rétrécissement.' };
      const beta = enlarge ? D / dNext : dNext / D;
      const kSmall = enlarge ? kEnlarge(beta, theta) : kContract(beta, theta);
      // Ramené à la vitesse du tronçon amont : pour un rétrécissement, la petite section est l'aval (v_aval = v (D/d)²).
      const K = enlarge ? kSmall : kSmall * Math.pow(D / dNext, 4);
      return { K, Kmin: K, Kmax: K, label: `${def.label}, cône ${theta === 180 ? 'brusque' : `${theta}°`}, β = ${beta.toFixed(2).replace('.', ',')}` };
    }
  }
}
