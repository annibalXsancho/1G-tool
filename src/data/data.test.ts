import { describe, expect, it } from 'vitest';
import type { FluidesFile } from './schema';

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
});
