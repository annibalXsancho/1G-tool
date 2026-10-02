import fluidesRaw from './fluides.json';
import type { FluidesFile } from './schema';

// Accès typé aux tables. La forme des JSON est vérifiée par data.test.ts.
export const fluides = fluidesRaw as FluidesFile;
