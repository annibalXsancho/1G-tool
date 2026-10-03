import { describe, expect, it } from 'vitest';
import { carrierColors } from './carriers';

describe('couleurs des énergies', () => {
  it('emplacements fixes, doublons sans effet, couleur stable quel que soit l’ordre', () => {
    const a = carrierColors(['Électricité', 'Électricité', 'Gaz naturel', 'Vapeur', 'Biomasse']);
    expect(a.get('Électricité')).toBe('--series-1');
    expect(a.get('Gaz naturel')).toBe('--series-2');
    expect(a.get('Vapeur')).toBe('--series-3');
    expect(a.get('Biomasse')).toBe('--series-8');
    const b = carrierColors(['Vapeur', 'Gaz naturel', 'Électricité']);
    expect(b.get('Gaz naturel')).toBe('--series-2');
  });
  it('au-delà de 8 énergies : regroupement en « autre »', () => {
    const m = carrierColors(Array.from({ length: 10 }, (_, k) => `E${k}`));
    expect([...m.values()].filter((v) => v === '--series-other')).toHaveLength(2);
  });
});
