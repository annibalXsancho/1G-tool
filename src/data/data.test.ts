import { describe, expect, it } from 'vitest';
import type { CombustiblesFile, ElectriqueFile, FluidesFile } from './schema';

const files = import.meta.glob('./*.json', { eager: true, import: 'default' }) as Record<string, { meta?: unknown }>;

describe('fichiers JSON de src/data', () => {
  it('existent', () => expect(Object.keys(files).length).toBeGreaterThan(0));
  for (const [name, data] of Object.entries(files)) {
    it(`${name} : meta datée et sourcée`, () => {
      const m = data.meta as Record<string, unknown>;
      for (const k of ['titre', 'source', 'date', 'note']) expect(typeof m[k], `${name} meta.${k}`).toBe('string');
      expect(m.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect((m.source as string).length).toBeGreaterThan(5);
    });
  }

  it('fluides.json : forme, tri des températures, valeurs plausibles', async () => {
    const f = (await import('./fluides.json')).default as unknown as FluidesFile;
    for (const [id, fl] of Object.entries(f.fluides)) {
      expect(['liquide', 'gaz']).toContain(fl.phase);
      expect(['C', 'K']).toContain(fl.T_unite);
      expect(fl.R_specifique === null || fl.R_specifique > 0).toBe(true);
      expect(fl.points.length).toBeGreaterThan(1);
      fl.points.forEach((p, i) => {
        expect(p.cp, `${id} cp`).toBeGreaterThan(500);
        expect(p.cp).toBeLessThan(10000);
        if (i > 0) expect(p.T).toBeGreaterThan(fl.points[i - 1].T);
        if (fl.R_specifique === null) expect(p.rho, `${id} rho`).toBeGreaterThan(0);
      });
    }
  });

  it('combustibles.json : forme et ordres de grandeur', async () => {
    const f = (await import('./combustibles.json')).default as unknown as CombustiblesFile;
    expect(Object.keys(f.combustibles).length).toBeGreaterThan(0);
    for (const [id, c] of Object.entries(f.combustibles)) {
      expect(typeof c.label, id).toBe('string');
      expect(c.ratio_PCI_PCS, id).toBeGreaterThan(0.8);
      expect(c.ratio_PCI_PCS, id).toBeLessThanOrEqual(1);
      expect(c.co2_kg_par_TJ_PCI, id).toBeGreaterThan(40000);
      expect(c.co2_kg_par_TJ_PCI, id).toBeLessThan(120000);
      if (c.siegert !== null) {
        expect(c.siegert.A2, id).toBeGreaterThan(0.3);
        expect(c.siegert.A2, id).toBeLessThan(1);
        expect(c.siegert.B, id).toBeGreaterThan(0);
        expect(c.siegert.B, id).toBeLessThan(0.05);
      }
    }
  });

  it('electrique.json : forme, séries croissantes, ordres de grandeur', async () => {
    const f = (await import('./electrique.json')).default as unknown as ElectriqueFile;
    for (const m of ['cuivre', 'aluminium'] as const) {
      expect(f.conducteurs[m].rho20, m).toBeGreaterThan(0.015);
      expect(f.conducteurs[m].rho20, m).toBeLessThan(0.04);
      expect(f.conducteurs[m].rhoService, m).toBeGreaterThan(f.conducteurs[m].rho20);
    }
    expect(f.conducteurs.aluminium.rho20).toBeGreaterThan(f.conducteurs.cuivre.rho20);
    expect(f.reactanceLineique_mOhm_par_m).toBeGreaterThan(0.05);
    expect(f.reactanceLineique_mOhm_par_m).toBeLessThan(0.15);
    expect(f.facteurTension_c).toBeGreaterThanOrEqual(1);
    expect(f.facteurTension_c).toBeLessThanOrEqual(1.1);
    for (const [k, arr] of Object.entries(f.series)) {
      expect(arr.length, k).toBeGreaterThan(3);
      arr.forEach((v, i) => { if (i > 0) expect(v, k).toBeGreaterThan(arr[i - 1]); });
    }
  });
});
