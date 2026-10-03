import { describe, expect, it } from 'vitest';
import { addFlow, addNode, flowsOfNode, removeFlow, removeNode, uniqueId, updateFlow, updateNode } from './edit';
import { EXEMPLE_SITE } from './exemple';
import { analyse } from './analyse';

const MWh = 3.6e9;

describe('édition du modèle', () => {
  it('modifier une quantité met à jour le bilan, sans muter l’original', () => {
    const before = EXEMPLE_SITE.flows[6].value;
    const m = updateFlow(EXEMPLE_SITE, 6, { value: 20000 * MWh }); // gaz → chaufferie
    expect(EXEMPLE_SITE.flows[6].value).toBe(before);
    expect(analyse(m).balances.find((b) => b.node.id === 'CHAUF')!.losses / MWh).toBeCloseTo(4700, 6);
  });
  it('ajouter puis supprimer un flux', () => {
    const m = addFlow(EXEMPLE_SITE);
    expect(m.flows).toHaveLength(EXEMPLE_SITE.flows.length + 1);
    const f = m.flows.at(-1)!;
    expect(m.nodes.find((n) => n.id === f.from)!.kind).toBe('source');
    expect(f.value).toBe(0);
    expect(removeFlow(m, m.flows.length - 1).flows).toEqual(EXEMPLE_SITE.flows);
  });
  it('ajouter un poste : identifiant unique', () => {
    const { model, id } = addNode(EXEMPLE_SITE, 'Atelier C — découpe', 'usage');
    expect(id).toBe('ATELIER-C-DECOUPE');
    expect(uniqueId(model, 'Atelier C — découpe')).toBe('ATELIER-C-DECOUPE-2');
  });
  it('supprimer un poste supprime ses flux', () => {
    expect(flowsOfNode(EXEMPLE_SITE, 'AIR')).toBe(4);
    const m = removeNode(EXEMPLE_SITE, 'AIR');
    expect(m.flows).toHaveLength(EXEMPLE_SITE.flows.length - 4);
    expect(analyse(m).issues.filter((i) => i.level === 'erreur')).toEqual([]);
  });
  it('renommer / retyper un poste', () => {
    const m = updateNode(EXEMPLE_SITE, 'FROID', { label: 'Froid industriel', kind: 'transformation' });
    expect(m.nodes.find((n) => n.id === 'FROID')).toMatchObject({ label: 'Froid industriel', kind: 'transformation' });
  });
});
