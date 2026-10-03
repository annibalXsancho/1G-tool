import { describe, expect, it } from 'vitest';
import { addElement, addInstallation, autoSizeBreakers, descendantsOf, removeElement, removeInstallation, uniqueElementId, updateElement } from './edit';
import { calculate } from './calc';
import { EXEMPLE_UNIFILAIRE } from './exemple';
import { electrique } from '@/data';

const P = EXEMPLE_UNIFILAIRE;
const id = 'poste-industriel';
const inst = (p = P, i = id) => p.installations.find((x) => x.id === i)!;

describe('édition des unifilaires', () => {
  it('ne mute jamais le projet d’origine', () => {
    const before = JSON.stringify(P);
    updateElement(P, id, 'GF', { p: 1 });
    addElement(P, id, 'charge', 'TGBT');
    removeElement(P, id, 'TDA');
    autoSizeBreakers(P, id, electrique.series.calibres_A);
    expect(JSON.stringify(P)).toBe(before);
  });
  it('ajouter un élément : identifiant unique, valeurs par défaut, protection de départ', () => {
    const { project, id: nid } = addElement(P, id, 'moteur', 'TGBT');
    const el = inst(project).elements.at(-1)!;
    expect(nid).toBe('MOTEUR');
    // Moteur 30 kW, η 0,92, cos φ 0,85 sous 400 V : IB ≈ 55 A → calibre usuel 63 A ; Icc ≈ 35 kA → pouvoir de coupure 36 kA ou plus.
    expect(el.breaker?.in).toBe(63);
    expect(el.breaker?.icu).toBeGreaterThanOrEqual(calculate(inst(project)).nodes.get('MOTEUR')!.iccUp!);
    expect(el.cable?.section).toBe(35);
    expect(uniqueElementId(inst(project), 'Moteur')).toBe('MOTEUR-2');
    expect(calculate(inst(project)).issues.filter((i) => i.level === 'erreur')).toEqual([]);
  });
  it('supprimer un élément supprime son sous-arbre', () => {
    const p = removeElement(P, id, 'TDA');
    expect(inst(p).elements.some((e) => ['TDA', 'POMPES', 'FOURS', 'ECL'].includes(e.id))).toBe(false);
    expect(inst(p).elements).toHaveLength(inst().elements.length - 4);
  });
  it('descendants : interdit les boucles', () => {
    const d = descendantsOf(inst(), 'TDA');
    expect(d.has('POMPES')).toBe(true);
    expect(d.has('TGBT')).toBe(false);
  });
  it('dimensionnement automatique : calibre usuel ≥ courant d’emploi, plus de calibre insuffisant', () => {
    const bad = updateElement(P, id, 'CTA', { breaker: { type: 'disjoncteur', in: 16, icu: 50 } });
    expect(calculate(inst(bad)).issues.some((i) => /calibre 16 A inférieur/.test(i.message))).toBe(true);
    const fixed = autoSizeBreakers(bad, id, electrique.series.calibres_A);
    const c = calculate(inst(fixed));
    expect(c.issues.some((i) => /calibre .* inférieur/.test(i.message))).toBe(false);
    const ib = c.nodes.get('CTA')!.ib;
    const cal = inst(fixed).elements.find((e) => e.id === 'CTA')!.breaker!.in!;
    expect(cal).toBeGreaterThanOrEqual(ib);
    expect(electrique.series.calibres_A.filter((x) => x >= ib)[0]).toBe(cal);
  });
  it('ajouter et supprimer une installation', () => {
    const r = addInstallation(P, 'Poste B');
    expect(r.id).toBe('poste-b');
    expect(addInstallation(r.project, 'Poste B').id).toBe('poste-b-2');
    expect(removeInstallation(r.project, r.id).installations).toHaveLength(2);
  });
});
