// Import / export Excel du modèle de site. Ce fichier ne lit pas les .xlsx lui-même : il travaille sur des
// feuilles déjà lues (tableaux de cellules), ce qui le rend pur et testable. La lecture/écriture binaire est faite
// dans l'interface avec read-excel-file / write-excel-file.
import { parseNumber } from '@/core/form';
import { fromSI, toSI, DIMENSIONS } from '@/core/units';
import { emptyModel, KIND_LABEL, norm, STATUS_LABEL, type FlowStatus, type NodeKind, type SiteModel, type SiteNode } from './model';
import type { Issue } from './analyse';

export type Cell = string | number | boolean | Date | null | undefined;
export type Sheet = { sheet: string; data: Cell[][] };

const SHEETS = {
  site: ['site', 'informations', 'infos'],
  nodes: ['postes', 'noeuds', 'nodes', 'equipements'],
  flows: ['flux', 'flows', 'consommations', 'bilan'],
};

const COLS = {
  id: ['identifiant', 'id', 'code', 'repere'],
  label: ['libelle', 'nom', 'designation', 'poste'],
  kind: ['type', 'categorie', 'nature'],
  zone: ['zone', 'atelier', 'batiment', 'secteur'],
  from: ['de', 'origine', 'depuis', 'from', 'amont'],
  to: ['vers', 'destination', 'to', 'aval'],
  carrier: ['energie', 'vecteur', 'fluide', 'type d’energie', "type d'energie"],
  value: ['quantite', 'valeur', 'consommation', 'volume'],
  unit: ['unite'],
  status: ['statut', 'origine de la donnee', 'nature de la donnee', 'donnee'],
  meter: ['compteur', 'point de comptage', 'repere compteur'],
  comment: ['commentaire', 'remarque', 'observations', 'note'],
};

/** Un en-tête correspond à un alias s'il lui est égal ou commence par lui suivi d'un espace ou d'une parenthèse. */
function matches(header: string, aliases: string[]): boolean {
  const h = norm(header);
  return aliases.some((a) => h === a || h.startsWith(`${a} `) || h.startsWith(`${a}(`));
}

function findSheet(sheets: Sheet[], aliases: string[]): Sheet | undefined {
  return sheets.find((s) => aliases.includes(norm(s.sheet)));
}

type Header = { row: number; col: Partial<Record<keyof typeof COLS, number>>; raw: string[] };

function findHeader(data: Cell[][], required: (keyof typeof COLS)[]): Header | null {
  for (let r = 0; r < Math.min(data.length, 15); r++) {
    const raw = (data[r] ?? []).map((c) => String(c ?? ''));
    const col: Header['col'] = {};
    (Object.keys(COLS) as (keyof typeof COLS)[]).forEach((k) => {
      const idx = raw.findIndex((h) => h && matches(h, COLS[k]));
      if (idx >= 0 && col[k] === undefined) col[k] = idx;
    });
    if (required.every((k) => col[k] !== undefined)) return { row: r, col, raw };
  }
  return null;
}

const ENERGY_UNITS = Object.keys(DIMENSIONS.energy.units);
function unitFrom(text: string): string | undefined {
  const t = norm(text).replace(/\s/g, '');
  return ENERGY_UNITS.find((u) => t === norm(u) || t.includes(`(${norm(u)}`) || t.includes(`${norm(u)}/an`));
}

function kindFrom(v: Cell): NodeKind | undefined {
  const t = norm(v);
  if (['source', 'achat', 'achats', 'approvisionnement', 'entree', 'production'].includes(t)) return 'source';
  if (['transformation', 'conversion', 'utilite', 'utilites', 'production utilite'].includes(t)) return 'transformation';
  if (['usage', 'consommateur', 'uses', 'utilisation', 'usage final'].includes(t)) return 'usage';
  return undefined;
}

function statusFrom(v: Cell): FlowStatus | undefined {
  const t = norm(v);
  if (['mesure', 'm', 'compte', 'comptage', 'mesuree'].includes(t)) return 'mesure';
  if (['estime', 'e', 'estimee', 'estimation', 'ratio'].includes(t)) return 'estime';
  if (['calcule', 'c', 'calculee', 'bilan', 'calcul'].includes(t)) return 'calcule';
  return undefined;
}

const str = (c: Cell) => (c === null || c === undefined ? '' : c instanceof Date ? c.toISOString().slice(0, 10) : String(c).trim());

export function parseWorkbook(sheets: Sheet[]): { model: SiteModel; issues: Issue[] } {
  const model = emptyModel();
  const issues: Issue[] = [];

  const siteSheet = findSheet(sheets, SHEETS.site);
  if (siteSheet) {
    for (const row of siteSheet.data) {
      const k = norm(row[0]);
      if (['nom', 'nom du site', 'site'].includes(k)) model.name = str(row[1]);
      if (['annee', 'annee de reference', 'periode'].includes(k)) {
        const y = typeof row[1] === 'number' ? row[1] : parseNumber(str(row[1]));
        model.year = Number.isFinite(y) ? Math.round(y) : null;
      }
    }
  }

  const nodeSheet = findSheet(sheets, SHEETS.nodes);
  const nodes = new Map<string, SiteNode>();
  const byLabel = new Map<string, string>();
  if (nodeSheet) {
    const h = findHeader(nodeSheet.data, ['label']);
    if (!h) issues.push({ level: 'erreur', sheet: nodeSheet.sheet, message: 'Colonne « Libellé » introuvable.' });
    else {
      for (let r = h.row + 1; r < nodeSheet.data.length; r++) {
        const row = nodeSheet.data[r] ?? [];
        const lab = str(row[h.col.label!]);
        if (!lab) continue;
        const id = h.col.id !== undefined && str(row[h.col.id]) ? str(row[h.col.id]) : lab;
        const kindCell = h.col.kind !== undefined ? row[h.col.kind] : undefined;
        const kind = kindFrom(kindCell);
        if (kindCell && !kind) issues.push({ level: 'avertissement', sheet: nodeSheet.sheet, row: r + 1, message: `Type « ${str(kindCell)} » non reconnu (source, transformation ou usage) : déduit des flux.` });
        if (nodes.has(id)) issues.push({ level: 'erreur', sheet: nodeSheet.sheet, row: r + 1, message: `Identifiant « ${id} » en double.` });
        nodes.set(id, { id, label: lab, kind: kind ?? ('' as NodeKind), zone: h.col.zone !== undefined ? str(row[h.col.zone]) || undefined : undefined });
        byLabel.set(norm(lab), id);
        byLabel.set(norm(id), id);
      }
    }
  }

  const flowSheet = findSheet(sheets, SHEETS.flows) ?? (sheets.length === 1 ? sheets[0] : undefined);
  if (!flowSheet) {
    issues.push({ level: 'erreur', message: 'Feuille « Flux » introuvable (colonnes attendues : De, Vers, Énergie, Quantité).' });
    return { model, issues };
  }
  const h = findHeader(flowSheet.data, ['from', 'to', 'value']);
  if (!h) {
    issues.push({ level: 'erreur', sheet: flowSheet.sheet, message: 'En-têtes « De », « Vers » et « Quantité » introuvables dans les 15 premières lignes.' });
    return { model, issues };
  }
  const defaultUnit = unitFrom(h.raw[h.col.value!]) ?? 'MWh';
  if (!unitFrom(h.raw[h.col.value!]) && h.col.unit === undefined) {
    issues.push({ level: 'info', sheet: flowSheet.sheet, message: 'Unité non précisée : quantités lues en MWh par an.' });
  }

  const resolve = (v: string): string => {
    const id = byLabel.get(norm(v));
    if (id) return id;
    // Poste absent de la feuille Postes : créé automatiquement, type déduit plus bas.
    nodes.set(v, { id: v, label: v, kind: '' as NodeKind });
    byLabel.set(norm(v), v);
    return v;
  };

  for (let r = h.row + 1; r < flowSheet.data.length; r++) {
    const row = flowSheet.data[r] ?? [];
    const fromTxt = str(row[h.col.from!]);
    const toTxt = str(row[h.col.to!]);
    const valCell = row[h.col.value!];
    if (!fromTxt && !toTxt && (valCell === null || valCell === undefined || valCell === '')) continue;
    const line = r + 1;
    if (!fromTxt || !toTxt) {
      issues.push({ level: 'erreur', sheet: flowSheet.sheet, row: line, message: 'Origine ou destination manquante : ligne ignorée.' });
      continue;
    }
    const v = typeof valCell === 'number' ? valCell : parseNumber(str(valCell));
    if (!Number.isFinite(v) || v < 0) {
      issues.push({ level: 'erreur', sheet: flowSheet.sheet, row: line, message: `Quantité « ${str(valCell)} » invalide : ligne ignorée.` });
      continue;
    }
    let unit = defaultUnit;
    if (h.col.unit !== undefined && str(row[h.col.unit])) {
      const u = ENERGY_UNITS.find((x) => norm(x) === norm(row[h.col.unit!]).replace(/\/an$/, ''));
      if (u) unit = u;
      else issues.push({ level: 'avertissement', sheet: flowSheet.sheet, row: line, message: `Unité « ${str(row[h.col.unit])} » non reconnue : ${defaultUnit} retenu.` });
    }
    const stCell = h.col.status !== undefined ? row[h.col.status] : undefined;
    let status = statusFrom(stCell);
    if (!status) {
      if (str(stCell)) issues.push({ level: 'avertissement', sheet: flowSheet.sheet, row: line, message: `Statut « ${str(stCell)} » non reconnu : « estimé » retenu.` });
      status = 'estime';
    }
    const carrier = h.col.carrier !== undefined ? str(row[h.col.carrier]) : '';
    if (!carrier) issues.push({ level: 'avertissement', sheet: flowSheet.sheet, row: line, message: 'Énergie non précisée : « Non précisé » retenu.' });
    model.flows.push({
      from: resolve(fromTxt),
      to: resolve(toTxt),
      carrier: carrier || 'Non précisé',
      value: toSI(v, 'energy', unit),
      status,
      meter: h.col.meter !== undefined ? str(row[h.col.meter]) || undefined : undefined,
      comment: h.col.comment !== undefined ? str(row[h.col.comment]) || undefined : undefined,
    });
  }

  // Type des postes non renseigné : déduit de la position dans le graphe.
  for (const n of nodes.values()) {
    if (n.kind) continue;
    const hasIn = model.flows.some((f) => f.to === n.id);
    const hasOut = model.flows.some((f) => f.from === n.id);
    n.kind = hasIn && hasOut ? 'transformation' : hasOut ? 'source' : 'usage';
  }
  model.nodes = [...nodes.values()];
  if (model.flows.length === 0) issues.push({ level: 'erreur', sheet: flowSheet.sheet, message: 'Aucun flux lu.' });
  return { model, issues };
}

const MWh = (j: number) => Number(fromSI(j, 'energy', 'MWh').toPrecision(10));

/** Classeur réimportable (Site, Postes, Flux) : sert d'export du modèle et de gabarit à remplir. */
export function modelToSheets(model: SiteModel): Sheet[] {
  return [
    { sheet: 'Site', data: [['Nom du site', model.name], ['Année', model.year]] },
    {
      sheet: 'Postes',
      data: [['Identifiant', 'Libellé', 'Type', 'Zone'], ...model.nodes.map((n) => [n.id, n.label, KIND_LABEL[n.kind].toLowerCase(), n.zone ?? null])],
    },
    {
      sheet: 'Flux',
      data: [
        ['De', 'Vers', 'Énergie', 'Quantité (MWh/an)', 'Statut', 'Compteur', 'Commentaire'],
        ...model.flows.map((f) => [f.from, f.to, f.carrier, MWh(f.value), STATUS_LABEL[f.status].toLowerCase(), f.meter ?? null, f.comment ?? null]),
      ],
    },
  ];
}
