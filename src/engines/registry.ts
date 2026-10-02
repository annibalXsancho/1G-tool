// Registre central. Pour ajouter un calculateur : créer son fichier dans src/engines/
// puis l'ajouter à la liste ci-dessous. Rien d'autre à modifier.
import type { AnyCalculator, Category } from '@/core/types';
import { puissanceFluide } from './puissance-fluide';

export const calculators: AnyCalculator[] = [
  puissanceFluide,
];

export const byId = (id: string): AnyCalculator | undefined => calculators.find((c) => c.id === id);
export const byCategory = (cat: Category): AnyCalculator[] => calculators.filter((c) => c.category === cat);
