// Réseaux préremplis : trois situations courantes en bâtiment et le cas de référence du cours (conduite forcée).
import { custom, water } from './fluid';
import type { Net } from './network';

export type Preset = { id: string; label: string; description: string; net: Net };

const s = (n: number) => `s${n}`;

export const PRESETS: Preset[] = [
  {
    id: 'chaudiere', label: 'Raccordement de chaudière', description: 'Départ de chaudière de 5 m³/h : coudes, vannes d’isolement, clapet, filtre.',
    net: { fluid: water(70), Q_m3h: 5, method: 'colebrook', kMode: 'defaut', sections: [
      { id: s(1), nom: 'Départ chaudière', D_mm: 40, L_m: 8, materiau: 'acier', dz_m: 2, sings: [
        { id: 'a', def: 'coude-rayon', qty: 4, angle: 90, rD: 1.5 }, { id: 'b', def: 'vanne-sphere', qty: 2 }, { id: 'c', def: 'clapet-ressort', qty: 1 }, { id: 'd', def: 'filtre-y', qty: 1 }, { id: 'e', def: 'te-direct', qty: 1 },
      ] },
    ] },
  },
  {
    id: 'aspiration', label: 'Aspiration de pompe', description: 'Conduite d’aspiration de 20 m³/h : la vitesse et la cavitation comptent plus que la perte elle-même.',
    net: { fluid: water(20), Q_m3h: 20, method: 'colebrook', kMode: 'defaut', aspiration: true, sections: [
      { id: s(1), nom: 'Aspiration', D_mm: 65, L_m: 4, materiau: 'acier', dz_m: -1.5, sings: [
        { id: 'a', def: 'entree-arrondie', qty: 1 }, { id: 'b', def: 'filtre-y', qty: 1 }, { id: 'c', def: 'coude-rayon', qty: 2, angle: 90, rD: 1.5 }, { id: 'd', def: 'vanne-opercule', qty: 1 },
      ] },
    ] },
  },
  {
    id: 'radiateurs', label: 'Boucle de radiateurs', description: 'Colonne montante puis départ de 2,4 m³/h avec changement de diamètre.',
    net: { fluid: water(60), Q_m3h: 2.4, method: 'colebrook', kMode: 'defaut', sections: [
      { id: s(1), nom: 'Colonne', D_mm: 26, L_m: 15, materiau: 'cuivre', dz_m: 6, sings: [
        { id: 'a', def: 'coude-rayon', qty: 4, angle: 90, rD: 1.5 }, { id: 'b', def: 'te-derivation', qty: 2 }, { id: 'c', def: 'vanne-papillon', qty: 1 }, { id: 'd', def: 'retrecissement', qty: 1, cone: 180 },
      ] },
      { id: s(2), nom: 'Départ radiateur', D_mm: 20, L_m: 10, materiau: 'cuivre', dz_m: 0, sings: [
        { id: 'e', def: 'coude-rayon', qty: 4, angle: 90, rD: 1.5 }, { id: 'f', def: 'te-direct', qty: 2 }, { id: 'g', def: 'vanne-sphere', qty: 1 },
      ] },
    ] },
  },
  {
    id: 'conduite-forcee', label: 'Conduite forcée (cours HYDRAULIQUE)', description: 'Cas de la feuille HYDRAULIQUE.xlsx : 60 m³/s dans une conduite de 3 m, ΣK = 2,8. Formule de Swamee-Jain.',
    net: { fluid: custom(1000, 1, 'Eau (ρ = 1 000 kg/m³, ν = 10⁻⁶ m²/s)'), Q_m3h: 8.49 * Math.PI * 1.5 * 1.5 * 3600, method: 'swamee-jain', kMode: 'defaut', sections: [
      { id: s(1), nom: 'Conduite forcée', D_mm: 3000, L_m: 400, materiau: 'libre', eps_mm: 0.045, dz_m: 0, sings: [
        { id: 'a', def: 'libre', qty: 1, K: 0.5 }, { id: 'b', def: 'libre', qty: 1, K: 0.6 }, { id: 'c', def: 'libre', qty: 1, K: 0.7 }, { id: 'd', def: 'libre', qty: 1, K: 0.2 }, { id: 'e', def: 'libre', qty: 1, K: 0.8 },
      ] },
    ] },
  },
];
