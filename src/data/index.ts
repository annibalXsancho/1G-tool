import fluidesRaw from './fluides.json';
import combustiblesRaw from './combustibles.json';
import type { CombustiblesFile, FluidesFile } from './schema';

// Accès typé aux tables. La forme des JSON est vérifiée par data.test.ts.
export const fluides = fluidesRaw as FluidesFile;
export const combustibles = combustiblesRaw as CombustiblesFile;

/** Options de choix « combustible » dérivées du JSON (ajouter un combustible = éditer le JSON). */
export const fuelOptions = () => Object.entries(combustibles.combustibles).map(([value, f]) => ({ value, label: f.label }));
