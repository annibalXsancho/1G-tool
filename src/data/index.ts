import fluidesRaw from './fluides.json';
import combustiblesRaw from './combustibles.json';
import electriqueRaw from './electrique.json';
import ecsRaw from './ecs.json';
import suiviRaw from './suivi.json';
import hydrauliqueRaw from './hydraulique.json';
import type { CombustiblesFile, EcsFile, ElectriqueFile, FluidesFile, HydrauliqueFile, SuiviFile } from './schema';

// Accès typé aux tables. La forme des JSON est vérifiée par data.test.ts.
export const fluides = fluidesRaw as FluidesFile;
export const combustibles = combustiblesRaw as CombustiblesFile;
export const electrique = electriqueRaw as ElectriqueFile;
export const ecs = ecsRaw as unknown as EcsFile;
export const suivi = suiviRaw as unknown as SuiviFile;
export const hydraulique = hydrauliqueRaw as unknown as HydrauliqueFile;

/** Options de choix « combustible » dérivées du JSON (ajouter un combustible = éditer le JSON). */
export const fuelOptions = () => Object.entries(combustibles.combustibles).map(([value, f]) => ({ value, label: f.label }));
