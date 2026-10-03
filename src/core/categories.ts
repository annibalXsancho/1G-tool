import type { Category } from './types';

export const CATEGORIES: { id: Category; label: string; blurb: string }[] = [
  { id: 'vapeur', label: 'Vapeur & chaufferie', blurb: 'Propriétés, chaudières, purges, condensats, purgeurs' },
  { id: 'thermique', label: 'Thermique', blurb: 'Puissances, déperditions, isolation' },
  { id: 'fluides', label: 'Fluides', blurb: 'Hydraulique et aéraulique' },
  { id: 'electricite', label: 'Électricité', blurb: 'Moteurs, variation de vitesse, réseaux' },
  { id: 'utilites', label: 'Utilités', blurb: 'Chaudières, vapeur, air comprimé' },
  { id: 'suivi', label: 'Suivi', blurb: 'Signatures, conversions, indicateurs' },
];
