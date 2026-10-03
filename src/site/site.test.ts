import { describe, expect, it } from 'vitest';
import { analyse, LOSS_NODE_ID } from './analyse';
import { modelToSheets, parseWorkbook, type Sheet } from './excel';
import { EXEMPLE_SITE } from './exemple';
import type { SiteModel } from './model';

const MWh = 3.6e9;

describe('analyse du site exemple', () => {
  const a = analyse(EXEMPLE_SITE);
  it('aucune erreur', () => expect(a.issues.filter((i) => i.level === 'erreur')).toEqual([]));
  // Achats : électricité 8 500 + gaz 22 000 = 30 500 MWh.
  it('total acheté', () => expect(a.totals.purchased / MWh).toBeCloseTo(30500, 6));
  // Pertes : chaufferie 18 000 − 15 300 = 2 700 ; air comprimé 1 900 − 1 650 = 250.
  it('pertes de transformation', () => {
    expect(a.balances.find((b) => b.node.id === 'CHAUF')!.losses / MWh).toBeCloseTo(2700, 6);
    expect(a.balances.find((b) => b.node.id === 'CHAUF')!.efficiency).toBeCloseTo(0.85, 9);
    expect(a.totals.losses / MWh).toBeCloseTo(2950, 6);
    expect(a.links.filter((l) => l.to === LOSS_NODE_ID)).toHaveLength(2);
  });
  // Conservation : achats = usages finaux + pertes.
  it('bilan bouclé', () => expect(a.totals.final + a.totals.losses).toBeCloseTo(a.totals.purchased, 0));
  it('répartition par statut', () => {
    const s = a.totals.byStatus;
    expect((s.mesure + s.estime + s.calcule) / MWh).toBeCloseTo(8500 + 22000 + 15300 + 1650, 6);
  });
});

describe('contrôles', () => {
  const base: SiteModel = {
    name: '', year: null,
    nodes: [{ id: 'A', label: 'A', kind: 'source' }, { id: 'B', label: 'B', kind: 'transformation' }, { id: 'C', label: 'C', kind: 'transformation' }],
    flows: [],
  };
  it('boucle détectée', () => {
    const r = analyse({ ...base, flows: [
      { from: 'A', to: 'B', carrier: 'x', value: 1, status: 'mesure' },
      { from: 'B', to: 'C', carrier: 'x', value: 1, status: 'mesure' },
      { from: 'C', to: 'B', carrier: 'x', value: 1, status: 'mesure' },
    ] });
    expect(r.hasCycle).toBe(true);
    expect(r.issues.some((i) => /Boucle/.test(i.message))).toBe(true);
  });
  it('poste inconnu, quantité négative, sorties > entrées', () => {
    const r = analyse({ ...base, flows: [
      { from: 'A', to: 'Z', carrier: 'x', value: 1, status: 'mesure' },
      { from: 'A', to: 'B', carrier: 'x', value: -1, status: 'mesure' },
      { from: 'A', to: 'C', carrier: 'x', value: 1, status: 'mesure' },
      { from: 'C', to: 'B', carrier: 'x', value: 2, status: 'mesure' },
    ] });
    expect(r.issues.filter((i) => i.level === 'erreur')).toHaveLength(2);
    expect(r.issues.some((i) => /supérieures aux entrées/.test(i.message))).toBe(true);
  });
  it('modèle vide', () => {
    const r = analyse({ name: '', year: null, nodes: [], flows: [] });
    expect(r.totals.purchased).toBe(0);
    expect(r.links).toEqual([]);
  });
});

describe('Excel', () => {
  it('aller-retour modèle → feuilles → modèle', () => {
    const { model, issues } = parseWorkbook(modelToSheets(EXEMPLE_SITE));
    expect(issues.filter((i) => i.level === 'erreur')).toEqual([]);
    expect(model.name).toBe(EXEMPLE_SITE.name);
    expect(model.year).toBe(2025);
    expect(model.nodes).toHaveLength(EXEMPLE_SITE.nodes.length);
    expect(model.flows).toHaveLength(EXEMPLE_SITE.flows.length);
    expect(model.flows[0].value).toBeCloseTo(EXEMPLE_SITE.flows[0].value, 0);
    expect(model.nodes.find((n) => n.id === 'CHAUF')!.kind).toBe('transformation');
  });

  it('feuille de flux seule, en-têtes approximatifs, libellés, unités par ligne, statuts tolérants', () => {
    const sheets: Sheet[] = [{
      sheet: 'Feuil1',
      data: [
        ['Bilan 2025'],
        [],
        ['Origine', 'Destination', 'Type d’énergie', 'Consommation', 'Unité', 'Statut'],
        ['EDF', 'Chaufferie', 'Électricité', 100, 'MWh', 'Mesuré'],
        ['GRDF', 'Chaufferie', 'Gaz', '1 000,5', 'MWh', 'E'],
        ['Chaufferie', 'Atelier', 'Vapeur', 900000, 'kWh', 'calcul'],
        ['', '', '', null, null, null],
        ['Chaufferie', 'Atelier', 'Vapeur', 'beaucoup', 'MWh', 'mesuré'],
      ],
    }];
    const { model, issues } = parseWorkbook(sheets);
    expect(model.flows).toHaveLength(3);
    expect(model.flows[1].value).toBeCloseTo(1000.5 * MWh, 0);
    expect(model.flows[2].value).toBeCloseTo(900 * MWh, 0);
    expect(model.flows.map((f) => f.status)).toEqual(['mesure', 'estime', 'calcule']);
    expect(model.nodes.find((n) => n.id === 'EDF')!.kind).toBe('source');
    expect(model.nodes.find((n) => n.id === 'Chaufferie')!.kind).toBe('transformation');
    expect(model.nodes.find((n) => n.id === 'Atelier')!.kind).toBe('usage');
    expect(issues.some((i) => i.row === 8 && i.level === 'erreur')).toBe(true);
  });

  it('unité lue dans l’en-tête', () => {
    const { model } = parseWorkbook([{ sheet: 'Flux', data: [['De', 'Vers', 'Énergie', 'Quantité (kWh/an)'], ['A', 'B', 'Électricité', 1000]] }]);
    expect(model.flows[0].value).toBeCloseTo(1000 * 3.6e6, 3);
  });

  it('fichier sans en-têtes reconnaissables', () => {
    const { model, issues } = parseWorkbook([{ sheet: 'Flux', data: [['a', 'b'], [1, 2]] }]);
    expect(model.flows).toEqual([]);
    expect(issues[0].level).toBe('erreur');
  });
});

describe('Excel : fichier .xlsx réel (écriture puis relecture)', () => {
  it('le gabarit exporté se réimporte à l’identique', async () => {
    const { default: writeExcelFile } = await import('write-excel-file/node');
    const { default: readExcelFile } = await import('read-excel-file/node');
    const sheets = modelToSheets(EXEMPLE_SITE).map((s) => ({ sheet: s.sheet, data: s.data.map((r) => r.map((c) => (c === undefined ? null : c))) }));
    const buffer = await writeExcelFile(sheets as never).toBuffer();
    const read = (await readExcelFile(buffer)) as Sheet[];
    const { model, issues } = parseWorkbook(read);
    expect(issues.filter((i) => i.level === 'erreur')).toEqual([]);
    expect(model.flows).toHaveLength(EXEMPLE_SITE.flows.length);
    expect(analyse(model).totals.purchased / MWh).toBeCloseTo(30500, 6);
  });
});
