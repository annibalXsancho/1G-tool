import { describe, expect, it } from 'vitest';
import type { Sheet } from '@/core/sheet';
import { parseProject, projectToSheets } from './excel';
import { EXEMPLE_PROJET } from './exemple';
import { toDrawio } from './drawio';
import { layoutPlan } from './layout';
import { checkPlan, planStats } from './analyse';

describe('Excel : plans de comptage', () => {
  it('aller-retour projet → feuilles → projet', () => {
    const { project, issues } = parseProject(projectToSheets(EXEMPLE_PROJET));
    expect(issues.filter((i) => i.level === 'erreur')).toEqual([]);
    expect(project.plans).toHaveLength(2);
    const [a, b] = project.plans;
    const [oa, ob] = EXEMPLE_PROJET.plans;
    expect(a.nodes).toEqual(oa.nodes.map((n) => ({ ...n, backup: n.backup, comment: n.comment })).map((n) => expect.objectContaining({ id: n.id, label: n.label, kind: n.kind, parent: n.parent, flag: n.flag, rated: n.rated })));
    expect(a.meters).toHaveLength(oa.meters.length);
    expect(b.meters).toHaveLength(ob.meters.length);
    expect(a.carrier).toBe('Électricité');
    expect(b.ratedUnit).toBe('kW');
    expect(planStats(a).actual.coverage).toBeCloseTo(planStats(oa).actual.coverage, 12);
  });

  it('en-têtes et valeurs approximatifs, rattachement des compteurs au plan du poste', () => {
    const sheets: Sheet[] = [
      { sheet: 'Postes', data: [['Titre du classeur'], [], ['Repère', 'Désignation', 'Nature', 'Alimenté par', 'Puissance (kVA)', 'Périmètre'],
        ['ARR', 'Arrivée EDF', 'Poste de livraison', null, null, 'actif'],
        ['TGBT', 'TGBT', 'tableau', 'ARR', '1 250', ''],
        ['CVC', 'CVC', 'départ', 'TGBT', 450, 'actif'],
        ['LIBRE', 'Départ libre', 'départ', 'TGBT', null, 'Disponible'],
        ['X', 'Client tiers', 'départ', 'TGBT', 30, 'hors scope'],
        ['Z', 'Inconnu', 'machin', 'TGBT', 10, 'bizarre']] },
      { sheet: 'Compteurs', data: [['N°', 'Poste', 'État', 'Protocole'], ['M1', 'TGBT', 'communicant', 'Modbus TCP'], ['M2', 'CVC', 'à poser', null], ['M3', 'CVC', '???', null], ['', '', '', '']] },
    ];
    const { project, issues } = parseProject(sheets);
    const p = project.plans[0];
    expect(p.nodes.map((n) => n.kind)).toEqual(['source', 'distribution', 'usage', 'usage', 'usage', 'usage']);
    expect(p.nodes[1].rated).toBe(1250);
    expect(p.nodes.find((n) => n.id === 'LIBRE')!.flag).toBe('reserve');
    expect(p.nodes.find((n) => n.id === 'X')!.flag).toBe('hors-perimetre');
    expect(p.meters.map((m) => m.status)).toEqual(['existant-communicant', 'a-installer', 'existant-manuel']);
    expect(issues.some((i) => /type « machin »/.test(i.message))).toBe(true);
    expect(issues.some((i) => /statut « bizarre »/.test(i.message))).toBe(true);
    expect(issues.some((i) => /statut « \?\?\? »/.test(i.message))).toBe(true);
  });

  it('plusieurs plans dans un classeur (colonne Plan)', () => {
    const { project } = parseProject([
      { sheet: 'Postes', data: [['Plan', 'Identifiant', 'Libellé', 'Type', 'Parent'], ['Site A', 'R', 'R', 'source', null], ['Site B', 'R', 'R', 'source', null], ['Site B', 'U', 'U', 'usage', 'R']] },
      { sheet: 'Compteurs', data: [['Plan', 'Repère', 'Poste mesuré', 'Statut'], ['Site B', 'M', 'U', 'existant']] },
    ]);
    expect(project.plans.map((p) => [p.name, p.nodes.length, p.meters.length])).toEqual([['Site A', 1, 0], ['Site B', 2, 1]]);
  });

  it('erreurs de format', () => {
    expect(parseProject([{ sheet: 'Autre', data: [['a']] }]).issues[0].level).toBe('erreur');
    expect(parseProject([{ sheet: 'Postes', data: [['x', 'y'], [1, 2]] }]).issues[0].level).toBe('erreur');
  });

  it('fichier .xlsx réel : écriture puis relecture', async () => {
    const { default: writeExcelFile } = await import('write-excel-file/node');
    const { default: readExcelFile } = await import('read-excel-file/node');
    const buf = await writeExcelFile(projectToSheets(EXEMPLE_PROJET).map((s) => ({ sheet: s.sheet, data: s.data })) as never).toBuffer();
    const { project, issues } = parseProject((await readExcelFile(buf)) as Sheet[]);
    expect(issues.filter((i) => i.level === 'erreur')).toEqual([]);
    expect(project.plans[0].nodes).toHaveLength(EXEMPLE_PROJET.plans[0].nodes.length);
    expect(checkPlan(project.plans[0]).filter((i) => i.level === 'erreur')).toEqual([]);
  });
});

describe('export draw.io', () => {
  const plan = EXEMPLE_PROJET.plans[0];
  const xml = toDrawio(plan, layoutPlan(plan, 'cible'));
  it('structure mxfile avec un sommet par poste et par compteur', () => {
    expect(xml.startsWith('<?xml')).toBe(true);
    expect((xml.match(/id="n-/g) ?? []).length).toBe(plan.nodes.length);
    expect((xml.match(/id="mt-/g) ?? []).length).toBe(plan.meters.length);
    expect(xml).toContain('<mxfile');
    expect(xml.trim().endsWith('</mxfile>')).toBe(true);
  });
  it('caractères spéciaux échappés, aucune balise orpheline dans les attributs', () => {
    const p = { ...plan, nodes: [{ ...plan.nodes[0], label: 'A & B <test> "q"' }], meters: [] };
    const out = toDrawio(p, layoutPlan(p, 'actuel'));
    expect(out).toContain('A &amp;amp; B');
    expect(out).not.toMatch(/value="[^"]*<[^"]*"/);
  });
});
