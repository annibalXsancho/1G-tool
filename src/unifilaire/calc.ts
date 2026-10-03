// Calculs électriques d'un schéma unifilaire : tensions, puissances et courants d'emploi, courants de court-circuit
// triphasés maximaux (méthode des impédances), chutes de tension, et contrôles de cohérence. Pur, SI sauf mention
// (kW, kvar, kVA, A, kA, V, mm², m). Valeurs tabulées : src/data/electrique.json.
//
// Hypothèses (rappelées dans l'outil) : réseau triphasé équilibré ; court-circuit triphasé maximal avec résistivité
// à 20 °C ; réseau amont modélisé par sa puissance de court-circuit ; contribution des moteurs et des groupes
// ignorée ; transformateurs : pertes à vide ignorées ; chute de tension : régime permanent, résistivité en service.
import { electrique } from '@/data';
import type { UElement, Installation } from './model';
import { canHaveChildren } from './model';

export type Issue = { level: 'erreur' | 'avertissement' | 'info'; message: string; element?: string };

export type NodeCalc = {
  /** Tension au point de raccordement amont, V. */
  uUp: number;
  /** Tension de l'élément (secondaire pour un transformateur), V. */
  u: number;
  p: number; // kW
  q: number; // kvar
  s: number; // kVA
  /** Courant d'emploi à l'amont de l'élément (courant dans sa liaison), A. */
  ib: number;
  /** Courant d'emploi à la tension de l'élément (secondaire pour un transformateur), A. */
  ibOwn: number;
  /** Taux de charge : transformateur (S / Sn) ou barres (I / In). */
  loading?: number;
  /** Impédance cumulée à l'élément, Ω, ramenée à sa tension. */
  r: number;
  x: number;
  /** Icc triphasé maximal à l'élément, kA (Infinity si source considérée infinie). */
  icc: number;
  /** Icc à l'amont de la protection de la liaison, kA. */
  iccUp?: number;
  /** Chute de tension de la liaison (câble + transformateur), % de la tension amont. */
  duLink: number;
  /** Chute de tension cumulée depuis la racine, %. */
  du: number;
};

export type Calc = {
  byId: Map<string, UElement>;
  children: Map<string, UElement[]>;
  roots: UElement[];
  nodes: Map<string, NodeCalc>;
  issues: Issue[];
};

export type CalcOptions = { duLimit: number };
export const DEFAULT_CALC: CalcOptions = { duLimit: 5 };

const SQRT3 = Math.sqrt(3);
const kVAtoA = (kva: number, u: number) => (u > 0 ? (kva * 1000) / (SQRT3 * u) : 0);

const mat = (e: UElement) => electrique.conducteurs[e.cable?.material ?? 'cuivre'];

function cableZ(e: UElement, hot: boolean): { r: number; x: number } {
  const c = e.cable;
  if (!c || !(c.section && c.section > 0) || !(c.length && c.length > 0)) return { r: 0, x: 0 };
  const n = Math.max(1, c.parallel ?? 1);
  const rho = hot ? mat(e).rhoService : mat(e).rho20;
  return { r: (rho * c.length) / (c.section * n), x: (electrique.reactanceLineique_mOhm_par_m * c.length) / 1000 / n };
}

export function calculate(inst: Installation, opts: CalcOptions = DEFAULT_CALC): Calc {
  const issues: Issue[] = [];
  const byId = new Map<string, UElement>();
  for (const e of inst.elements) {
    if (byId.has(e.id)) issues.push({ level: 'erreur', element: e.id, message: `Identifiant « ${e.id} » défini plusieurs fois.` });
    else byId.set(e.id, e);
  }
  const children = new Map<string, UElement[]>(inst.elements.map((e) => [e.id, []]));
  const roots: UElement[] = [];
  for (const e of byId.values()) {
    if (e.parent && !byId.has(e.parent)) { issues.push({ level: 'erreur', element: e.id, message: `« ${e.label} » : élément amont « ${e.parent} » inconnu.` }); roots.push(e); }
    else if (e.parent === e.id) { issues.push({ level: 'erreur', element: e.id, message: `« ${e.label} » est son propre amont.` }); roots.push(e); }
    else if (e.parent) {
      const p = byId.get(e.parent)!;
      if (!canHaveChildren(p.kind)) issues.push({ level: 'erreur', element: e.id, message: `« ${p.label} » (${p.kind}) ne peut pas alimenter d'autres éléments.` });
      children.get(e.parent)!.push(e);
    } else roots.push(e);
  }

  // Ordre de parcours depuis les racines (détecte les boucles : éléments jamais atteints).
  const order: UElement[] = [];
  const seen = new Set<string>();
  const walk = (e: UElement) => {
    if (seen.has(e.id)) return;
    seen.add(e.id);
    order.push(e);
    for (const c of children.get(e.id) ?? []) walk(c);
  };
  roots.forEach(walk);
  const loop = [...byId.values()].filter((e) => !seen.has(e.id));
  if (loop.length) {
    issues.push({ level: 'erreur', message: `Boucle dans les liens amont : ${loop.map((e) => e.label).join(', ')}.` });
    for (const e of loop) { children.get(e.id)!.length = 0; roots.push(e); walk(e); }
  }
  if (roots.filter((r) => r.kind === 'reseau').length === 0 && inst.elements.length > 0) issues.push({ level: 'avertissement', message: 'Aucun élément « Réseau » en tête : les courants de court-circuit supposent alors une source infinie.' });

  const nodes = new Map<string, NodeCalc>();
  const get = (id: string) => nodes.get(id)!;
  const c = electrique.facteurTension_c;

  // 1. Tensions (descendant).
  const ownU = (e: UElement, uUp: number) => (e.kind === 'reseau' ? e.voltage ?? 400 : e.kind === 'transformateur' ? e.u2 ?? 400 : uUp);
  for (const e of order) {
    const parent = e.parent && byId.has(e.parent) && !loop.includes(e) ? get(e.parent) : undefined;
    const uUp = parent ? parent.u : e.voltage ?? 400;
    nodes.set(e.id, { uUp, u: ownU(e, uUp), p: 0, q: 0, s: 0, ib: 0, ibOwn: 0, r: 0, x: 0, icc: Infinity, duLink: 0, du: 0 });
    if (e.kind === 'reseau' && !e.voltage) issues.push({ level: 'avertissement', element: e.id, message: `« ${e.label} » : tension non renseignée, 400 V retenus.` });
  }

  // 2. Puissances et courants d'emploi (ascendant).
  for (const e of [...order].reverse()) {
    const n = get(e.id);
    const kids = (children.get(e.id) ?? []).filter((k) => k.kind !== 'groupe');
    if (e.kind === 'moteur' || e.kind === 'charge') {
      const pf = e.cosphi && e.cosphi > 0 && e.cosphi <= 1 ? e.cosphi : e.kind === 'moteur' ? 0.85 : 0.9;
      const eta = e.kind === 'moteur' ? (e.eta && e.eta > 0 && e.eta <= 1 ? e.eta : 0.9) : 1;
      n.p = (e.p ?? 0) / eta;
      n.q = n.p * Math.tan(Math.acos(pf));
      if (e.p === undefined) issues.push({ level: 'avertissement', element: e.id, message: `« ${e.label} » : puissance non renseignée.` });
    } else if (e.kind === 'condensateurs') {
      n.q = -(e.q ?? 0);
    } else if (e.kind !== 'groupe') {
      const ks = e.kind === 'tableau' && e.ks && e.ks > 0 ? e.ks : 1;
      n.p = ks * kids.reduce((a, k) => a + get(k.id).p, 0);
      n.q = ks * kids.reduce((a, k) => a + get(k.id).q, 0);
    }
    n.s = Math.hypot(n.p, n.q);
    n.ib = kVAtoA(n.s, n.uUp);
    n.ibOwn = kVAtoA(n.s, n.u);
    if (e.kind === 'transformateur') {
      if (e.s && e.s > 0) n.loading = n.s / e.s;
      else issues.push({ level: 'erreur', element: e.id, message: `« ${e.label} » : puissance assignée manquante.` });
    }
    if (e.kind === 'tableau' && e.inBar && e.inBar > 0) n.loading = n.ibOwn / e.inBar;
  }

  // 3. Impédances, Icc et chutes de tension (descendant).
  for (const e of order) {
    const n = get(e.id);
    const parent = e.parent && byId.has(e.parent) && !loop.includes(e) ? get(e.parent) : undefined;
    let r = 0, x = 0;
    if (e.kind === 'reseau' && !parent) {
      if (e.scc && e.scc > 0) {
        const z = (c * n.u * n.u) / (e.scc * 1e6);
        const rx = electrique.rapportRsurX_source;
        x = z / Math.sqrt(1 + rx * rx);
        r = rx * x;
      } else issues.push({ level: 'info', element: e.id, message: `« ${e.label} » : puissance de court-circuit non renseignée, source considérée infinie (Icc majorés).` });
    } else if (parent) {
      const cz = cableZ(e, false);
      r = parent.r + cz.r;
      x = parent.x + cz.x;
      n.iccUp = parent.icc;
      if (e.kind === 'transformateur') {
        const ratio = (n.u / n.uUp) ** 2;
        r *= ratio;
        x *= ratio;
        if (e.s && e.s > 0 && e.ukk && e.ukk > 0) {
          const zt = (e.ukk / 100) * (n.u * n.u) / (e.s * 1000);
          const rt = e.pk && e.pk > 0 ? (e.pk * 1000 * n.u * n.u) / (e.s * 1000) ** 2 : 0;
          r += rt;
          x += Math.sqrt(Math.max(0, zt * zt - rt * rt));
        } else issues.push({ level: 'avertissement', element: e.id, message: `« ${e.label} » : tension de court-circuit (ukk) manquante, impédance du transformateur ignorée.` });
      }
    }
    n.r = r;
    n.x = x;
    const z = Math.hypot(r, x);
    n.icc = z > 1e-9 ? (c * n.u) / (SQRT3 * z) / 1000 : Infinity;

    // Chute de tension de la liaison : câble puis transformateur.
    if (parent) {
      const pf = n.s > 0 ? Math.min(1, Math.abs(n.p) / n.s) : 0.9;
      const sin = Math.sqrt(Math.max(0, 1 - pf * pf));
      const cz = cableZ(e, true);
      let du = n.ib > 0 && n.uUp > 0 ? ((SQRT3 * n.ib * (cz.r * pf + cz.x * sin)) / n.uUp) * 100 : 0;
      if (e.kind === 'transformateur' && n.loading !== undefined && e.ukk && e.s) {
        const zt = (e.ukk / 100);
        const rt = e.pk && e.pk > 0 ? (e.pk / e.s) : 0;
        const ur = Math.min(zt, rt) * 100;
        const ux = Math.sqrt(Math.max(0, zt * zt - (ur / 100) ** 2)) * 100;
        du += n.loading * (ur * pf + ux * sin);
      }
      n.duLink = du;
      n.du = parent.du + du;
    }
  }

  // 4. Contrôles.
  const f = (v: number, d = 3) => Number(v.toPrecision(d)).toString().replace('.', ',');
  for (const e of order) {
    const n = get(e.id);
    const parentEl = e.parent ? byId.get(e.parent) : undefined;
    const b = e.breaker;
    if (parentEl && b) {
      if (b.in !== undefined && b.in > 0 && n.ib > b.in + 1e-9) issues.push({ level: 'erreur', element: e.id, message: `« ${e.label} » : calibre ${b.in} A inférieur au courant d'emploi ${f(n.ib)} A.` });
      if (b.in === undefined) issues.push({ level: 'info', element: e.id, message: `« ${e.label} » : calibre de la protection non renseigné (courant d'emploi ${f(n.ib)} A).` });
      if (n.iccUp !== undefined && Number.isFinite(n.iccUp)) {
        if (b.icu !== undefined && b.icu > 0 && b.icu < n.iccUp - 1e-9) issues.push({ level: 'erreur', element: e.id, message: `« ${e.label} » : pouvoir de coupure ${f(b.icu)} kA inférieur à l'Icc de ${f(n.iccUp)} kA à son point d'installation.` });
        if (b.icu === undefined) issues.push({ level: 'info', element: e.id, message: `« ${e.label} » : pouvoir de coupure non renseigné (Icc au point d'installation : ${f(n.iccUp)} kA).` });
      }
    } else if (parentEl && parentEl.kind === 'tableau' && e.kind !== 'groupe') {
      issues.push({ level: 'avertissement', element: e.id, message: `Départ « ${e.label} » sans protection.` });
    }
    if (e.kind === 'transformateur' && n.loading !== undefined) {
      if (n.loading > 1) issues.push({ level: 'erreur', element: e.id, message: `« ${e.label} » surchargé : ${f(n.loading * 100, 3)} % de sa puissance assignée.` });
      else if (n.loading > 0.8) issues.push({ level: 'avertissement', element: e.id, message: `« ${e.label} » chargé à ${f(n.loading * 100, 3)} % : peu de marge.` });
      else if (n.loading < 0.2 && n.s > 0) issues.push({ level: 'info', element: e.id, message: `« ${e.label} » faiblement chargé (${f(n.loading * 100, 2)} %) : pertes à vide proportionnellement élevées.` });
    }
    if (e.kind === 'tableau' && e.inBar && n.ibOwn > e.inBar + 1e-9) issues.push({ level: 'erreur', element: e.id, message: `« ${e.label} » : courant d'emploi ${f(n.ibOwn)} A supérieur au courant assigné des barres ${e.inBar} A.` });
    if (e.cable && (!e.cable.section || !e.cable.length)) issues.push({ level: 'info', element: e.id, message: `« ${e.label} » : câble sans section ou longueur, impédance ignorée.` });
    if ((children.get(e.id) ?? []).length === 0 && n.du > opts.duLimit + 1e-9) issues.push({ level: 'avertissement', element: e.id, message: `« ${e.label} » : chute de tension cumulée ${f(n.du)} % supérieure à la limite de ${opts.duLimit} %.` });
    if (e.kind === 'groupe') issues.push({ level: 'info', element: e.id, message: `« ${e.label} » : source de secours, non prise en compte dans les puissances ni les Icc.` });
  }
  return { byId, children, roots, nodes, issues };
}

/** Parcours d'affichage : profondeur et ordre (parents avant enfants). */
export function flatten(calc: Calc): { el: UElement; depth: number }[] {
  const out: { el: UElement; depth: number }[] = [];
  const seen = new Set<string>();
  const walk = (e: UElement, d: number) => {
    if (seen.has(e.id)) return;
    seen.add(e.id);
    out.push({ el: e, depth: d });
    for (const c of calc.children.get(e.id) ?? []) walk(c, d + 1);
  };
  calc.roots.forEach((r) => walk(r, 0));
  return out;
}
