// Site fictif de démonstration (valeurs plausibles, sans rapport avec un site réel).
import type { FlowStatus, SiteModel } from './model';

const MWh = 3.6e9;
const f = (from: string, to: string, carrier: string, mwh: number, status: FlowStatus, meter?: string, comment?: string) =>
  ({ from, to, carrier, value: mwh * MWh, status, meter, comment });

export const EXEMPLE_SITE: SiteModel = {
  name: 'Site exemple — usine agroalimentaire',
  year: 2025,
  nodes: [
    { id: 'ELEC', label: 'Électricité réseau', kind: 'source' },
    { id: 'GAZ', label: 'Gaz naturel', kind: 'source' },
    { id: 'CHAUF', label: 'Chaufferie vapeur', kind: 'transformation', zone: 'Utilités' },
    { id: 'AIR', label: 'Centrale air comprimé', kind: 'transformation', zone: 'Utilités' },
    { id: 'ATA', label: 'Atelier A — cuisson', kind: 'usage', zone: 'Production' },
    { id: 'ATB', label: 'Atelier B — conditionnement', kind: 'usage', zone: 'Production' },
    { id: 'FOUR', label: 'Fours atelier B', kind: 'usage', zone: 'Production' },
    { id: 'FROID', label: 'Groupes froid', kind: 'usage', zone: 'Utilités' },
    { id: 'BAT', label: 'Bâtiments (chauffage, éclairage)', kind: 'usage', zone: 'Tertiaire' },
    { id: 'CTA', label: 'Ventilation (CTA)', kind: 'usage', zone: 'Tertiaire' },
    { id: 'FUITES', label: 'Fuites air comprimé', kind: 'usage', zone: 'Utilités' },
  ],
  flows: [
    f('ELEC', 'ATA', 'Électricité', 2400, 'mesure', 'TGBT-A'),
    f('ELEC', 'ATB', 'Électricité', 1800, 'mesure', 'TGBT-B'),
    f('ELEC', 'AIR', 'Électricité', 1900, 'mesure', 'TD-COMP'),
    f('ELEC', 'FROID', 'Électricité', 1300, 'estime', undefined, 'Puissance × heures de marche'),
    f('ELEC', 'BAT', 'Électricité', 600, 'estime'),
    f('ELEC', 'CTA', 'Électricité', 500, 'calcule', undefined, 'Calcul ventilateurs'),
    f('GAZ', 'CHAUF', 'Gaz naturel', 18000, 'mesure', 'GAZ-01'),
    f('GAZ', 'FOUR', 'Gaz naturel', 4000, 'mesure', 'GAZ-02'),
    f('CHAUF', 'ATA', 'Vapeur', 8500, 'estime'),
    f('CHAUF', 'ATB', 'Vapeur', 5000, 'estime'),
    f('CHAUF', 'BAT', 'Vapeur', 1800, 'estime'),
    f('AIR', 'ATA', 'Air comprimé', 700, 'estime', undefined, 'Électricité attribuée'),
    f('AIR', 'ATB', 'Air comprimé', 600, 'estime', undefined, 'Électricité attribuée'),
    f('AIR', 'FUITES', 'Air comprimé', 350, 'estime', undefined, 'Campagne de fuites'),
  ],
};
