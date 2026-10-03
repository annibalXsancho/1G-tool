import { describe, expect, it } from 'vitest';
import type { Sheet } from '@/core/sheet';
import { parseUnifilaires, unifilairesToSheets } from './excel';
import { EXEMPLE_UNIFILAIRE } from './exemple';
import { calculate } from './calc';

describe('Excel : unifilaires', () => {
  it('aller-retour projet → feuilles → projet, mêmes résultats de calcul', () => {
    const { project, issues } = parseUnifilaires(unifilairesToSheets(EXEMPLE_UNIFILAIRE));
    expect(issues.filter((i) => i.level === 'erreur')).toEqual([]);
    expect(project.installations).toHaveLength(2);
    for (const [a, b] of project.installations.map((x, k) => [x, EXEMPLE_UNIFILAIRE.installations[k]] as const)) {
      expect(a.elements).toHaveLength(b.elements.length);
      const ca = calculate(a), cb = calculate(b);
      for (const e of b.elements) {
        expect(ca.nodes.get(e.id)!.icc).toBeCloseTo(cb.nodes.get(e.id)!.icc, 9);
        expect(ca.nodes.get(e.id)!.ib).toBeCloseTo(cb.nodes.get(e.id)!.ib, 9);
      }
    }
    expect(project.installations[0].elements.find((e) => e.id === 'TR1')!.meter).toEqual({ id: 'CF-HTA-01', status: 'existant-communicant', ct: undefined });
  });
  it('en-têtes approximatifs, valeurs à la française, lignes invalides signalées', () => {
    const sheets: Sheet[] = [{ sheet: 'Feuil1', data: [
      ['Titre'], [],
      ['Repère', 'Désignation', 'Nature', 'Alimenté par', 'Puissance (kW)', 'cos φ', 'Protection', 'Calibre', 'Pouvoir de coupure', 'Matériau', 'Section', 'Longueur'],
      ['B', 'TGBT', 'TGBT', null, null, null, null, null, null, null, null, null],
      ['M1', 'Pompe', 'moteur', 'B', '37', '0,86', 'disjoncteur', 160, 36, 'Alu', 70, '45'],
      ['X', 'Inconnu', 'machin', 'B', 5, null, 'bidule', null, null, 'plomb', null, null],
      [null, 'Sans id', 'charge', 'B', 1, null, null, null, null, null, null, null],
    ] }];
    const { project, issues } = parseUnifilaires(sheets);
    const els = project.installations[0].elements;
    expect(els.map((e) => e.kind)).toEqual(['tableau', 'moteur', 'charge']);
    expect(els[1].p).toBe(37);
    expect(els[1].cosphi).toBe(0.86);
    expect(els[1].cable).toEqual({ material: 'aluminium', section: 70, length: 45, parallel: undefined });
    expect(els[1].breaker).toEqual({ type: 'disjoncteur', in: 160, icu: 36, curve: undefined });
    expect(issues.filter((i) => i.level !== 'erreur').length).toBeGreaterThanOrEqual(3);
    expect(issues.some((i) => i.level === 'erreur' && /identifiant manquant/.test(i.message))).toBe(true);
  });
  it('erreurs de format', () => {
    expect(parseUnifilaires([{ sheet: 'A', data: [['x']] }, { sheet: 'B', data: [['y']] }]).issues[0].level).toBe('erreur');
    expect(parseUnifilaires([{ sheet: 'Éléments', data: [['a', 'b'], [1, 2]] }]).issues[0].level).toBe('erreur');
  });
  it('fichier .xlsx réel : écriture puis relecture', async () => {
    const { default: writeExcelFile } = await import('write-excel-file/node');
    const { default: readExcelFile } = await import('read-excel-file/node');
    const buf = await writeExcelFile(unifilairesToSheets(EXEMPLE_UNIFILAIRE).map((s) => ({ sheet: s.sheet, data: s.data })) as never).toBuffer();
    const { project, issues } = parseUnifilaires((await readExcelFile(buf)) as Sheet[]);
    expect(issues.filter((i) => i.level === 'erreur')).toEqual([]);
    expect(project.installations[0].elements).toHaveLength(EXEMPLE_UNIFILAIRE.installations[0].elements.length);
  });
});
