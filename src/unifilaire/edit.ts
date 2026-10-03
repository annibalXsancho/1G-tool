// Modifications d'un projet d'unifilaires : fonctions pures qui renvoient un nouveau projet.
import { calculate } from './calc';
import { emptyInstallation, slug, type Breaker, type Cable, type Installation, type Kind, type MeterRef, type UElement, type UProject } from './model';
import { norm } from '@/site/model';
import { electrique } from '@/data';

const mapInst = (p: UProject, id: string, fn: (i: Installation) => Installation): UProject => ({ ...p, installations: p.installations.map((i) => (i.id === id ? fn(i) : i)) });

export const updateInstallation = (p: UProject, id: string, patch: Partial<Omit<Installation, 'id' | 'elements'>>): UProject => mapInst(p, id, (i) => ({ ...i, ...patch }));

export function addInstallation(p: UProject, name: string): { project: UProject; id: string } {
  let id = slug(name);
  for (let k = 2; p.installations.some((x) => x.id === id); k++) id = `${slug(name)}-${k}`;
  return { project: { ...p, installations: [...p.installations, { ...emptyInstallation(name), id, site: p.name }] }, id };
}
export const removeInstallation = (p: UProject, id: string): UProject => ({ ...p, installations: p.installations.filter((i) => i.id !== id) });

export const updateElement = (p: UProject, instId: string, id: string, patch: Partial<Omit<UElement, 'id'>>): UProject =>
  mapInst(p, instId, (i) => ({ ...i, elements: i.elements.map((e) => (e.id === id ? { ...e, ...patch } : e)) }));

/** Modifie les attributs de la liaison amont (les champs `undefined` sont retirés). */
export const updateBreaker = (p: UProject, instId: string, id: string, b: Breaker | undefined) => updateElement(p, instId, id, { breaker: b });
export const updateCable = (p: UProject, instId: string, id: string, c: Cable | undefined) => updateElement(p, instId, id, { cable: c });
export const updateMeterRef = (p: UProject, instId: string, id: string, m: MeterRef | undefined) => updateElement(p, instId, id, { meter: m });

export function uniqueElementId(inst: Installation, label: string): string {
  const base = norm(label).toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 14) || 'EL';
  let id = base;
  for (let k = 2; inst.elements.some((e) => e.id === id); k++) id = `${base}-${k}`;
  return id;
}

const DEFAULTS: Record<Kind, Partial<UElement>> = {
  reseau: { voltage: 20000, scc: 250 },
  transformateur: { s: 1000, u2: 400, ukk: 6 },
  tableau: { ks: 1 },
  moteur: { p: 30, cosphi: 0.85, eta: 0.92 },
  charge: { p: 50, cosphi: 0.9 },
  condensateurs: { q: 100 },
  groupe: { s: 500 },
};

const LABELS: Record<Kind, string> = { reseau: 'Réseau', transformateur: 'Transformateur', tableau: 'Tableau', moteur: 'Moteur', charge: 'Charge', condensateurs: 'Condensateurs', groupe: 'Groupe électrogène' };

/** Ajoute un élément sous `parent`, avec des valeurs par défaut réalistes et une protection de départ. */
export function addElement(p: UProject, instId: string, kind: Kind, parent?: string): { project: UProject; id: string } {
  const inst = p.installations.find((i) => i.id === instId)!;
  const id = uniqueElementId(inst, LABELS[kind]);
  const el: UElement = { id, label: LABELS[kind], kind, parent: parent || undefined, ...DEFAULTS[kind] };
  if (parent && kind !== 'reseau') {
    el.breaker = { type: 'disjoncteur', in: 100, icu: 25 };
    if (kind !== 'transformateur') el.cable = { material: 'cuivre', section: 35, length: 30 };
  }
  const project = mapInst(p, instId, (i) => ({ ...i, elements: [...i.elements, el] }));
  if (el.breaker) {
    // Protection pré-dimensionnée : plus petit calibre usuel ≥ IB et plus petit pouvoir de coupure usuel ≥ Icc amont.
    const n = calculate(project.installations.find((i) => i.id === instId)!).nodes.get(id);
    const cal = n && n.ib > 0 ? electrique.series.calibres_A.find((x) => x >= n.ib) : undefined;
    const icu = n?.iccUp !== undefined && Number.isFinite(n.iccUp) ? electrique.series.pouvoirsCoupure_kA.find((x) => x >= n.iccUp!) : undefined;
    return { project: updateElement(project, instId, id, { breaker: { ...el.breaker, in: cal ?? el.breaker.in, icu: icu ?? el.breaker.icu } }), id };
  }
  return { project, id };
}

/** Descendants (y compris l'élément) : sert à interdire un rattachement qui créerait une boucle. */
export function descendantsOf(inst: Installation, id: string): Set<string> {
  const c = calculate(inst);
  const out = new Set<string>();
  const stack = [id];
  while (stack.length) {
    const x = stack.pop()!;
    if (out.has(x)) continue;
    out.add(x);
    for (const k of c.children.get(x) ?? []) stack.push(k.id);
  }
  return out;
}

/** Supprime un élément et tout son sous-arbre. */
export function removeElement(p: UProject, instId: string, id: string): UProject {
  return mapInst(p, instId, (i) => {
    const gone = descendantsOf(i, id);
    return { ...i, elements: i.elements.filter((e) => !gone.has(e.id)) };
  });
}

/** Dimensionne automatiquement les protections : calibre usuel immédiatement supérieur au courant d'emploi. */
export function autoSizeBreakers(p: UProject, instId: string, calibres: number[]): UProject {
  return mapInst(p, instId, (inst) => {
    const c = calculate(inst);
    return {
      ...inst,
      elements: inst.elements.map((e) => {
        const n = c.nodes.get(e.id);
        if (!e.breaker || !n || n.ib <= 0) return e;
        const cal = calibres.find((x) => x >= n.ib);
        return cal ? { ...e, breaker: { ...e.breaker, in: cal } } : e;
      }),
    };
  });
}
