// Import / export Excel d'un projet d'unifilaires (plusieurs installations par classeur). Pur : travaille sur des
// feuilles déjà lues. Une ligne par élément, avec ses attributs de liaison amont (protection, câble, compteur).
import { findHeader, findSheet, str, type Cell, type Sheet } from '@/core/sheet';
import { parseNumber } from '@/core/form';
import { norm } from '@/site/model';
import { STATUS_LABEL, type MeterStatus } from '@/metering/model';
import { BREAKER_LABEL, KIND_LABEL, emptyInstallation, slug, type BreakerType, type Installation, type Kind, type Material, type UElement, type UProject } from './model';
import type { Issue } from './calc';

type Col =
  | 'inst' | 'id' | 'label' | 'kind' | 'parent' | 'voltage' | 'scc' | 's' | 'u2' | 'ukk' | 'pk' | 'coupling' | 'inBar' | 'ks'
  | 'p' | 'cosphi' | 'eta' | 'q' | 'brk' | 'in' | 'icu' | 'curve' | 'mat' | 'section' | 'length' | 'parallel' | 'meter' | 'mstatus' | 'ct' | 'comment';

const COLS: Record<Col, string[]> = {
  inst: ['installation', 'schema', 'plan'], id: ['identifiant', 'id', 'repere', 'code'], label: ['libelle', 'designation', 'nom'], kind: ['type', 'nature'],
  parent: ['parent', 'amont', 'alimente par', 'element amont'], voltage: ['tension reseau', 'tension (v)', 'tension'], scc: ['scc', 'puissance de court-circuit', 'pcc'],
  s: ['s (kva)', 'puissance apparente', 'puissance assignee', 'kva'], u2: ['tension secondaire', 'u2'], ukk: ['ukk', 'tension de court-circuit', 'ucc'],
  pk: ['pk', 'pertes en charge', 'pertes dues a la charge'], coupling: ['couplage'], inBar: ['barres', 'courant des barres', 'in barres'], ks: ['ks', 'simultaneite', 'coefficient de simultaneite'],
  p: ['p (kw)', 'puissance', 'puissance utile', 'kw'], cosphi: ['cos phi', 'cos φ', 'cosphi'], eta: ['rendement', 'eta'], q: ['q (kvar)', 'puissance reactive', 'kvar'],
  brk: ['protection', 'protection (type)', 'appareil de protection'], in: ['in (a)', 'calibre', 'in'], icu: ['icu', 'pouvoir de coupure', 'icu (ka)'], curve: ['courbe', 'declencheur'],
  mat: ['materiau cable', 'materiau', 'conducteur'], section: ['section', 'section (mm2)', 'section (mm²)'], length: ['longueur', 'longueur (m)'], parallel: ['parallele', 'nb cables', 'cables en parallele'],
  meter: ['compteur', 'compteur (repere)', 'repere compteur'], mstatus: ['statut compteur', 'compteur (statut)', 'etat compteur'], ct: ['tc', 'rapport tc'], comment: ['commentaire', 'remarque', 'observations'],
};

const KINDS: [Kind, string[]][] = [
  ['reseau', ['reseau', 'reseau (arrivee)', 'arrivee', 'source', 'poste de livraison']],
  ['transformateur', ['transformateur', 'transfo', 'tr']],
  ['tableau', ['tableau', 'tableau / jeu de barres', 'tgbt', 'td', 'jeu de barres', 'barres']],
  ['moteur', ['moteur', 'machine']],
  ['charge', ['charge', 'depart', 'utilisation', 'usage']],
  ['condensateurs', ['condensateurs', 'batterie de condensateurs', 'compensation', 'batterie']],
  ['groupe', ['groupe', 'groupe electrogene', 'generateur', 'ge']],
];
const BREAKERS: [BreakerType, string[]][] = [['disjoncteur', ['disjoncteur', 'disj', 'dj']], ['interrupteur', ['interrupteur', 'interrupteur-sectionneur', 'sectionneur', 'inter']], ['fusible', ['fusible', 'fus']]];
const STATUSES: [MeterStatus, string[]][] = [
  ['existant-communicant', ['existant communicant', 'existant, communicant', 'communicant', 'telereleve']],
  ['existant-manuel', ['existant releve manuel', 'existant, releve manuel', 'manuel', 'existant']],
  ['a-installer', ['a installer', 'a poser', 'prevu', 'projet']],
];
const pick = <T extends string>(table: [T, string[]][], v: Cell): T | undefined => {
  const t = norm(v).replace(/[’']/g, ' ').replace(/\s+/g, ' ');
  return t ? table.find(([, al]) => al.some((a) => norm(a).replace(/[’']/g, ' ') === t))?.[0] : undefined;
};
const num = (c: Cell): number | undefined => {
  if (typeof c === 'number') return Number.isFinite(c) ? c : undefined;
  const v = parseNumber(str(c));
  return Number.isFinite(v) ? v : undefined;
};
const opt = (c: Cell): string | undefined => str(c) || undefined;

export function parseUnifilaires(sheets: Sheet[]): { project: UProject; issues: Issue[] } {
  const issues: Issue[] = [];
  const insts = new Map<string, Installation>();
  const get = (name: string): Installation => {
    const key = slug(name || 'installation');
    let i = insts.get(key);
    if (!i) { i = { ...emptyInstallation(name || 'Installation 1'), id: key }; insts.set(key, i); }
    return i;
  };

  const meta = findSheet(sheets, ['installations', 'cartouche', 'informations']);
  if (meta) {
    const h = findHeader<'inst' | 'site' | 'version' | 'author'>(meta.data, { inst: ['installation', 'schema', 'plan', 'nom'], site: ['site'], version: ['version'], author: ['auteur'] }, ['inst']);
    if (h) for (let r = h.row + 1; r < meta.data.length; r++) {
      const row = meta.data[r] ?? [];
      const name = str(row[h.col.inst!]);
      if (!name) continue;
      const i = get(name);
      if (h.col.site !== undefined) i.site = str(row[h.col.site]);
      if (h.col.version !== undefined) i.version = opt(row[h.col.version]);
      if (h.col.author !== undefined) i.author = opt(row[h.col.author]);
    }
  }

  const sh = findSheet(sheets, ['elements', 'éléments', 'unifilaire', 'composants']) ?? (sheets.length === 1 ? sheets[0] : undefined);
  if (!sh) {
    issues.push({ level: 'erreur', message: 'Feuille « Éléments » introuvable (colonnes attendues : Identifiant, Libellé, Type, Parent…).' });
    return { project: { name: '', installations: [] }, issues };
  }
  const h = findHeader<Col>(sh.data, COLS, ['id', 'label']);
  if (!h) {
    issues.push({ level: 'erreur', message: 'Feuille « Éléments » : en-têtes « Identifiant » et « Libellé » introuvables.' });
    return { project: { name: '', installations: [] }, issues };
  }
  const g = (row: Cell[], k: Col) => (h.col[k] !== undefined ? row[h.col[k]!] : undefined);
  for (let r = h.row + 1; r < sh.data.length; r++) {
    const row = sh.data[r] ?? [];
    const id = str(g(row, 'id'));
    const label = str(g(row, 'label'));
    if (!id && !label) continue;
    const line = r + 1;
    if (!id) { issues.push({ level: 'erreur', message: `Éléments, ligne ${line} : identifiant manquant, ligne ignorée.` }); continue; }
    let kind = pick(KINDS, g(row, 'kind'));
    if (!kind) {
      if (str(g(row, 'kind'))) issues.push({ level: 'avertissement', message: `Éléments, ligne ${line} : type « ${str(g(row, 'kind'))} » non reconnu : « charge » retenu.` });
      kind = 'charge';
    }
    const el: UElement = { id, label: label || id, kind, parent: opt(g(row, 'parent')), comment: opt(g(row, 'comment')) };
    const set = <K extends keyof UElement>(k: K, c: Col) => { const v = num(g(row, c)); if (v !== undefined) (el as Record<string, unknown>)[k] = v; };
    set('voltage', 'voltage'); set('scc', 'scc'); set('s', 's'); set('u2', 'u2'); set('ukk', 'ukk'); set('pk', 'pk'); set('inBar', 'inBar'); set('ks', 'ks');
    set('p', 'p'); set('cosphi', 'cosphi'); set('eta', 'eta'); set('q', 'q');
    if (opt(g(row, 'coupling'))) el.coupling = opt(g(row, 'coupling'));
    const bt = pick(BREAKERS, g(row, 'brk'));
    if (str(g(row, 'brk')) && !bt) issues.push({ level: 'avertissement', message: `Éléments, ligne ${line} : protection « ${str(g(row, 'brk'))} » non reconnue.` });
    const inA = num(g(row, 'in')), icu = num(g(row, 'icu'));
    if (bt || inA !== undefined || icu !== undefined) el.breaker = { type: bt ?? 'disjoncteur', in: inA, icu, curve: opt(g(row, 'curve')) };
    const mt = norm(g(row, 'mat'));
    const sec = num(g(row, 'section')), len = num(g(row, 'length')), par = num(g(row, 'parallel'));
    if (mt || sec !== undefined || len !== undefined) {
      const material: Material = mt.startsWith('alu') ? 'aluminium' : 'cuivre';
      if (mt && !mt.startsWith('alu') && !mt.startsWith('cu')) issues.push({ level: 'avertissement', message: `Éléments, ligne ${line} : matériau « ${str(g(row, 'mat'))} » non reconnu : cuivre retenu.` });
      el.cable = { material, section: sec, length: len, parallel: par };
    }
    if (opt(g(row, 'meter'))) {
      let st = pick(STATUSES, g(row, 'mstatus'));
      if (!st) { if (str(g(row, 'mstatus'))) issues.push({ level: 'avertissement', message: `Éléments, ligne ${line} : statut de compteur « ${str(g(row, 'mstatus'))} » non reconnu : « existant, relevé manuel » retenu.` }); st = 'existant-manuel'; }
      el.meter = { id: str(g(row, 'meter')), status: st, ct: opt(g(row, 'ct')) };
    }
    get(h.col.inst !== undefined ? str(row[h.col.inst]) : '').elements.push(el);
  }
  const list = [...insts.values()].filter((i) => i.elements.length > 0);
  if (list.length === 0) issues.push({ level: 'erreur', message: 'Aucun élément lu.' });
  return { project: { name: list[0]?.site ?? '', installations: list }, issues };
}

const nn = <T,>(v: T | undefined) => (v === undefined || (v as unknown) === '' ? null : v);

export function unifilairesToSheets(project: UProject): Sheet[] {
  return [
    { sheet: 'Installations', data: [['Installation', 'Site', 'Version', 'Auteur'], ...project.installations.map((i) => [i.name, i.site, nn(i.version), nn(i.author)])] },
    {
      sheet: 'Éléments',
      data: [
        ['Installation', 'Identifiant', 'Libellé', 'Type', 'Parent', 'Tension réseau (V)', 'Scc (MVA)', 'S (kVA)', 'Tension secondaire (V)', 'ukk (%)', 'Pk (kW)', 'Couplage', 'Barres (A)', 'Ks',
          'P (kW)', 'cos φ', 'Rendement', 'Q (kvar)', 'Protection', 'In (A)', 'Icu (kA)', 'Courbe', 'Matériau câble', 'Section (mm²)', 'Longueur (m)', 'Parallèle', 'Compteur', 'Statut compteur', 'TC', 'Commentaire'],
        ...project.installations.flatMap((i) => i.elements.map((e) => [
          i.name, e.id, e.label, KIND_LABEL[e.kind], nn(e.parent), nn(e.voltage), nn(e.scc), nn(e.s), nn(e.u2), nn(e.ukk), nn(e.pk), nn(e.coupling), nn(e.inBar), nn(e.ks),
          nn(e.p), nn(e.cosphi), nn(e.eta), nn(e.q), e.breaker ? BREAKER_LABEL[e.breaker.type] : null, nn(e.breaker?.in), nn(e.breaker?.icu), nn(e.breaker?.curve),
          e.cable ? (e.cable.material === 'aluminium' ? 'Aluminium' : 'Cuivre') : null, nn(e.cable?.section), nn(e.cable?.length), nn(e.cable?.parallel),
          nn(e.meter?.id), e.meter ? STATUS_LABEL[e.meter.status] : null, nn(e.meter?.ct), nn(e.comment),
        ])),
      ],
    },
  ];
}
