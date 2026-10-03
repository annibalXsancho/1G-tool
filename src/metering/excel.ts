// Import / export Excel d'un projet de plans de comptage (plusieurs plans possibles dans un même classeur).
// Travaille sur des feuilles déjà lues : pur et testable. Lecture/écriture binaire : voir src/ui/metering.
import { findHeader, findSheet, str, type Cell, type Sheet } from '@/core/sheet';
import { parseNumber } from '@/core/form';
import { norm } from '@/site/model';
import {
  FLAG_LABEL, KIND_LABEL, STATUS_LABEL, emptyPlan, slug,
  type Meter, type MeterStatus, type NodeFlag, type NodeKind, type Plan, type PlanNode, type Project,
} from './model';
import type { Issue } from './analyse';

type PlanCol = 'plan' | 'site' | 'carrier' | 'unit' | 'version' | 'author';
type NodeCol = 'plan' | 'id' | 'label' | 'kind' | 'parent' | 'backup' | 'rated' | 'annual' | 'zone' | 'flag' | 'comment';
type MeterCol = 'plan' | 'id' | 'node' | 'status' | 'device' | 'quantity' | 'comm' | 'address' | 'ct' | 'accuracy' | 'location' | 'comment';

const PLAN_COLS: Record<PlanCol, string[]> = {
  plan: ['plan', 'nom du plan', 'nom'], site: ['site'], carrier: ['energie', 'vecteur'], unit: ['unite de capacite', 'unite'], version: ['version', 'indice'], author: ['auteur', 'redacteur'],
};
const NODE_COLS: Record<NodeCol, string[]> = {
  plan: ['plan'], id: ['identifiant', 'id', 'repere', 'code'], label: ['libelle', 'designation', 'nom', 'poste'],
  kind: ['type', 'nature', 'categorie'], parent: ['parent', 'poste amont', 'amont', 'alimente par', 'alimentation'],
  backup: ['secours', 'secours depuis', 'alimentation secondaire', 'secours / injection'],
  rated: ['capacite nominale', 'puissance', 'puissance nominale', 'capacite', 'puissance installee'],
  annual: ['consommation annuelle', 'conso annuelle', 'consommation', 'mwh/an'], zone: ['zone', 'batiment', 'atelier', 'secteur'],
  flag: ['statut', 'perimetre', 'etat'], comment: ['commentaire', 'remarque', 'observations', 'note'],
};
const METER_COLS: Record<MeterCol, string[]> = {
  plan: ['plan'], id: ['repere', 'identifiant', 'id', 'compteur', 'numero', 'n°', 'no'], node: ['poste mesure', 'poste', 'mesure', 'point de mesure', 'installation'],
  status: ['statut', 'etat'], device: ['appareil', 'type de compteur', 'equipement', 'materiel'], quantity: ['grandeur', 'grandeurs', 'grandeurs mesurees', 'mesures'],
  comm: ['communication', 'protocole', 'bus'], address: ['adresse'], ct: ['tc', 'rapport tc', 'transformateur de courant'],
  accuracy: ['classe', 'classe de precision', 'precision'], location: ['localisation', 'emplacement', 'implantation'], comment: ['commentaire', 'remarque', 'observations', 'note'],
};

const KINDS: [NodeKind, string[]][] = [
  ['source', ['source', 'arrivee', 'livraison', 'arrivee / livraison', 'poste de livraison', 'reseau']],
  ['transformation', ['transformation', 'transformateur', 'transfo', 'chaudiere', 'conversion']],
  ['distribution', ['distribution', 'tableau', 'tgbt', 'td', 'collecteur', 'jeu de barres', 'nourrice']],
  ['production', ['production', 'production locale', 'groupe', 'generateur', 'cogeneration', 'photovoltaique']],
  ['usage', ['usage', 'utilisation', 'depart', 'consommateur', 'charge']],
];
const FLAGS: [NodeFlag, string[]][] = [
  ['actif', ['actif', 'oui', 'normal', '']],
  ['hors-perimetre', ['hors perimetre', 'hors scope', 'exclu', 'hors etude']],
  ['reserve', ['reserve', 'reserve (disponible)', 'disponible', 'libre', 'spare']],
  ['sans-conso', ['sans consommation', 'sans conso', 'pas de consommation', 'non alimente']],
];
const STATUSES: [MeterStatus, string[]][] = [
  ['existant-communicant', ['existant communicant', 'communicant', 'existant, communicant', 'existant telereleve', 'telereleve']],
  ['existant-manuel', ['existant releve manuel', 'existant manuel', 'manuel', 'releve manuel', 'existant, releve manuel', 'existant']],
  ['a-installer', ['a installer', 'a poser', 'prevu', 'projet', 'cible']],
];
const pick = <T extends string>(table: [T, string[]][], v: Cell): T | undefined => {
  const t = norm(v).replace(/[’']/g, ' ').replace(/\s+/g, ' ');
  return table.find(([, al]) => al.some((a) => norm(a).replace(/[’']/g, ' ') === t))?.[0];
};

const num = (c: Cell): number | undefined => {
  if (typeof c === 'number') return Number.isFinite(c) ? c : undefined;
  const v = parseNumber(str(c));
  return Number.isFinite(v) ? v : undefined;
};
const opt = (c: Cell): string | undefined => str(c) || undefined;

export function parseProject(sheets: Sheet[]): { project: Project; issues: Issue[] } {
  const issues: Issue[] = [];
  const plans = new Map<string, Plan>();
  const getPlan = (name: string): Plan => {
    const key = slug(name || 'plan');
    let p = plans.get(key);
    if (!p) { p = { ...emptyPlan(name || 'Plan 1'), id: key }; plans.set(key, p); }
    return p;
  };

  const planSheet = findSheet(sheets, ['plans', 'plan', 'informations', 'cartouche']);
  if (planSheet) {
    const h = findHeader<PlanCol>(planSheet.data, PLAN_COLS, ['plan']);
    if (h) {
      for (let r = h.row + 1; r < planSheet.data.length; r++) {
        const row = planSheet.data[r] ?? [];
        const name = str(row[h.col.plan!]);
        if (!name) continue;
        const p = getPlan(name);
        if (h.col.site !== undefined) p.site = str(row[h.col.site]);
        if (h.col.carrier !== undefined && str(row[h.col.carrier])) p.carrier = str(row[h.col.carrier]);
        if (h.col.unit !== undefined && str(row[h.col.unit])) p.ratedUnit = str(row[h.col.unit]);
        if (h.col.version !== undefined) p.version = opt(row[h.col.version]);
        if (h.col.author !== undefined) p.author = opt(row[h.col.author]);
      }
    }
  }

  const nodeSheet = findSheet(sheets, ['postes', 'noeuds', 'installations', 'equipements', 'nodes']);
  if (!nodeSheet) {
    issues.push({ level: 'erreur', message: 'Feuille « Postes » introuvable (colonnes attendues : Identifiant, Libellé, Type, Parent).' });
    return { project: { name: '', plans: [...plans.values()] }, issues };
  }
  const nh = findHeader<NodeCol>(nodeSheet.data, NODE_COLS, ['id', 'label']);
  if (!nh) {
    issues.push({ level: 'erreur', message: 'Feuille « Postes » : en-têtes « Identifiant » et « Libellé » introuvables.' });
    return { project: { name: '', plans: [...plans.values()] }, issues };
  }
  for (let r = nh.row + 1; r < nodeSheet.data.length; r++) {
    const row = nodeSheet.data[r] ?? [];
    const id = str(row[nh.col.id!]);
    const label = str(row[nh.col.label!]);
    if (!id && !label) continue;
    const line = r + 1;
    if (!id) { issues.push({ level: 'erreur', message: `Postes, ligne ${line} : identifiant manquant, ligne ignorée.` }); continue; }
    const p = getPlan(nh.col.plan !== undefined ? str(row[nh.col.plan]) : '');
    let kind = nh.col.kind !== undefined ? pick(KINDS, row[nh.col.kind]) : undefined;
    if (!kind) {
      if (nh.col.kind !== undefined && str(row[nh.col.kind])) issues.push({ level: 'avertissement', message: `Postes, ligne ${line} : type « ${str(row[nh.col.kind])} » non reconnu : « usage » retenu.` });
      kind = 'usage';
    }
    let flag = nh.col.flag !== undefined ? pick(FLAGS, row[nh.col.flag]) : 'actif';
    if (!flag) {
      issues.push({ level: 'avertissement', message: `Postes, ligne ${line} : statut « ${str(row[nh.col.flag!])} » non reconnu : « actif » retenu.` });
      flag = 'actif';
    }
    const node: PlanNode = {
      id, label: label || id, kind, flag,
      parent: nh.col.parent !== undefined ? opt(row[nh.col.parent]) : undefined,
      backup: nh.col.backup !== undefined ? opt(row[nh.col.backup]) : undefined,
      rated: nh.col.rated !== undefined ? num(row[nh.col.rated]) : undefined,
      annualMWh: nh.col.annual !== undefined ? num(row[nh.col.annual]) : undefined,
      zone: nh.col.zone !== undefined ? opt(row[nh.col.zone]) : undefined,
      comment: nh.col.comment !== undefined ? opt(row[nh.col.comment]) : undefined,
    };
    p.nodes.push(node);
  }

  const meterSheet = findSheet(sheets, ['compteurs', 'comptage', 'meters', 'points de comptage']);
  if (!meterSheet) issues.push({ level: 'info', message: 'Feuille « Compteurs » absente : aucun compteur importé.' });
  else {
    const mh = findHeader<MeterCol>(meterSheet.data, METER_COLS, ['id', 'node']);
    if (!mh) issues.push({ level: 'erreur', message: 'Feuille « Compteurs » : en-têtes « Repère » et « Poste mesuré » introuvables.' });
    else {
      for (let r = mh.row + 1; r < meterSheet.data.length; r++) {
        const row = meterSheet.data[r] ?? [];
        const id = str(row[mh.col.id!]);
        const node = str(row[mh.col.node!]);
        if (!id && !node) continue;
        const line = r + 1;
        if (!id || !node) { issues.push({ level: 'erreur', message: `Compteurs, ligne ${line} : repère ou poste mesuré manquant, ligne ignorée.` }); continue; }
        let status = mh.col.status !== undefined ? pick(STATUSES, row[mh.col.status]) : undefined;
        if (!status) {
          if (mh.col.status !== undefined && str(row[mh.col.status])) issues.push({ level: 'avertissement', message: `Compteurs, ligne ${line} : statut « ${str(row[mh.col.status])} » non reconnu : « existant, relevé manuel » retenu.` });
          status = 'existant-manuel';
        }
        const planName = mh.col.plan !== undefined ? str(row[mh.col.plan]) : '';
        // Sans colonne Plan, on rattache le compteur au plan qui contient le poste.
        let p = planName ? getPlan(planName) : [...plans.values()].find((x) => x.nodes.some((n) => n.id === node)) ?? getPlan('');
        const get = (k: MeterCol) => (mh.col[k] !== undefined ? opt(row[mh.col[k]!]) : undefined);
        const m: Meter = { id, node, status, device: get('device'), quantity: get('quantity'), comm: get('comm'), address: get('address'), ct: get('ct'), accuracy: get('accuracy'), location: get('location'), comment: get('comment') };
        p.meters.push(m);
      }
    }
  }

  const list = [...plans.values()].filter((p) => p.nodes.length > 0 || p.meters.length > 0);
  if (list.length === 0) issues.push({ level: 'erreur', message: 'Aucun poste lu.' });
  return { project: { name: list[0]?.site ?? '', plans: list }, issues };
}

const cellOrNull = <T,>(v: T | undefined) => (v === undefined || v === '' ? null : v);

export function projectToSheets(project: Project): Sheet[] {
  return [
    {
      sheet: 'Plans',
      data: [['Plan', 'Site', 'Énergie', 'Unité de capacité', 'Version', 'Auteur'], ...project.plans.map((p) => [p.name, p.site, p.carrier, p.ratedUnit, cellOrNull(p.version), cellOrNull(p.author)])],
    },
    {
      sheet: 'Postes',
      data: [
        ['Plan', 'Identifiant', 'Libellé', 'Type', 'Parent', 'Secours', 'Capacité nominale', 'Consommation annuelle (MWh/an)', 'Zone', 'Statut', 'Commentaire'],
        ...project.plans.flatMap((p) => p.nodes.map((n) => [p.name, n.id, n.label, KIND_LABEL[n.kind], cellOrNull(n.parent), cellOrNull(n.backup), cellOrNull(n.rated), cellOrNull(n.annualMWh), cellOrNull(n.zone), FLAG_LABEL[n.flag], cellOrNull(n.comment)])),
      ],
    },
    {
      sheet: 'Compteurs',
      data: [
        ['Plan', 'Repère', 'Poste mesuré', 'Statut', 'Appareil', 'Grandeurs', 'Communication', 'Adresse', 'TC', 'Classe', 'Localisation', 'Commentaire'],
        ...project.plans.flatMap((p) => p.meters.map((m) => [p.name, m.id, m.node, STATUS_LABEL[m.status], cellOrNull(m.device), cellOrNull(m.quantity), cellOrNull(m.comm), cellOrNull(m.address), cellOrNull(m.ct), cellOrNull(m.accuracy), cellOrNull(m.location), cellOrNull(m.comment)])),
      ],
    },
  ];
}
