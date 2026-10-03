// Projet fictif de démonstration (centre hospitalier imaginaire). Aucune relation avec un site réel.
import type { Meter, Plan, PlanNode, Project } from './model';

const n = (id: string, label: string, kind: PlanNode['kind'], more: Partial<PlanNode> = {}): PlanNode => ({ id, label, kind, flag: 'actif', ...more });
const m = (id: string, node: string, status: Meter['status'], more: Partial<Meter> = {}): Meter => ({ id, node, status, ...more });

const electricite: Plan = {
  id: 'electricite', name: 'Électricité — bâtiment principal', site: 'Centre hospitalier exemple', carrier: 'Électricité', ratedUnit: 'kVA', version: 'V1', author: '',
  nodes: [
    n('HTA', 'Poste de livraison HTA 20 kV', 'source'),
    n('TR1', 'Transformateur TR1 — 1 600 kVA', 'transformation', { parent: 'HTA', rated: 1600 }),
    n('TR2', 'Transformateur TR2 — 800 kVA', 'transformation', { parent: 'HTA', rated: 800 }),
    n('GE1', 'Groupe électrogène — 800 kVA', 'production', { rated: 800, backup: 'TGBT-PREF' }),
    n('COGEN', 'Cogénérateur — 430 kVA', 'production', { rated: 430, backup: 'TGBT-ORD' }),
    n('TGBT-ORD', 'TGBT ordinaire', 'distribution', { parent: 'TR1', rated: 1600 }),
    n('GF', 'Groupes froid', 'usage', { parent: 'TGBT-ORD', rated: 350, annualMWh: 1300, zone: 'Utilités' }),
    n('CTA', 'Centrales de traitement d’air', 'usage', { parent: 'TGBT-ORD', rated: 220, annualMWh: 900, zone: 'Utilités' }),
    n('CUIS', 'Cuisine centrale', 'usage', { parent: 'TGBT-ORD', rated: 180, annualMWh: 420, zone: 'Logistique' }),
    n('BUAN', 'Buanderie', 'usage', { parent: 'TGBT-ORD', rated: 90, annualMWh: 210, zone: 'Logistique' }),
    n('TD-A', 'Tableau bâtiment A', 'distribution', { parent: 'TGBT-ORD', rated: 260, zone: 'Bâtiment A' }),
    n('ECL-A', 'Éclairage bâtiment A', 'usage', { parent: 'TD-A', rated: 80, annualMWh: 260, zone: 'Bâtiment A' }),
    n('PRI-A', 'Prises et informatique A', 'usage', { parent: 'TD-A', rated: 120, annualMWh: 330, zone: 'Bâtiment A' }),
    n('ASC-A', 'Ascenseurs A', 'usage', { parent: 'TD-A', rated: 60, annualMWh: 80, zone: 'Bâtiment A' }),
    n('RES1', 'Départ disponible', 'usage', { parent: 'TGBT-ORD', flag: 'reserve' }),
    n('TGBT-PREF', 'TGBT préférentiel (secouru)', 'distribution', { parent: 'TR2', rated: 800 }),
    n('BLOC', 'Bloc opératoire', 'usage', { parent: 'TGBT-PREF', rated: 220, annualMWh: 640, zone: 'Soins' }),
    n('REA', 'Réanimation et soins continus', 'usage', { parent: 'TGBT-PREF', rated: 180, annualMWh: 520, zone: 'Soins' }),
    n('RADIO', 'Imagerie', 'usage', { parent: 'TGBT-PREF', rated: 150, annualMWh: 380, zone: 'Soins' }),
    n('ONDUL', 'Onduleurs et informatique', 'usage', { parent: 'TGBT-PREF', rated: 120, annualMWh: 450, zone: 'Informatique' }),
    n('INCONNU', 'Départ non identifié', 'usage', { parent: 'TGBT-PREF', rated: 60, annualMWh: 120, comment: 'À identifier lors de la tournée des tableaux.' }),
    n('TIERS', 'Bâtiment loué à un tiers', 'usage', { parent: 'TGBT-ORD', flag: 'hors-perimetre', rated: 100, comment: 'Refacturé : hors périmètre de l’étude.' }),
  ],
  meters: [
    m('CF-HTA-01', 'HTA', 'existant-communicant', { device: 'Compteur de facturation', quantity: 'kWh, kvarh, kW', comm: 'Ethernet / IP', location: 'Poste de livraison', accuracy: '0,5S' }),
    m('CE-ORD-01', 'TGBT-ORD', 'existant-communicant', { device: 'Centrale de mesure', quantity: 'kWh, kW, kvar, U, I', comm: 'Modbus TCP', address: '12', ct: '2500/5', location: 'TGBT ordinaire, cellule arrivée', accuracy: '0,5S' }),
    m('CE-PREF-01', 'TGBT-PREF', 'existant-manuel', { device: 'Compteur sur TC', quantity: 'kWh', ct: '1250/5', comm: 'Aucune (relevé manuel)', location: 'TGBT préférentiel, arrivée', accuracy: '1' }),
    m('CE-GF-01', 'GF', 'existant-communicant', { device: 'Compteur sur TC', quantity: 'kWh, kW', comm: 'Modbus RTU', address: '4', ct: '600/5', location: 'Départ GF', accuracy: '1' }),
    m('CE-CUIS-01', 'CUIS', 'existant-manuel', { device: 'Compteur direct', quantity: 'kWh', comm: 'Aucune (relevé manuel)', location: 'Tableau cuisine' }),
    m('CE-CTA-01', 'CTA', 'a-installer', { device: 'Centrale de mesure', quantity: 'kWh, kW', comm: 'Modbus RTU', ct: '400/5', comment: 'Priorité 1 : poste le plus consommateur après les groupes froid.' }),
    m('CE-BLOC-01', 'BLOC', 'a-installer', { device: 'Compteur sur TC', quantity: 'kWh', comm: 'Modbus RTU', ct: '400/5' }),
    m('CE-TDA-01', 'TD-A', 'a-installer', { device: 'Compteur sur TC', quantity: 'kWh', comm: 'Modbus RTU', ct: '400/5' }),
    m('CE-GE1-01', 'GE1', 'existant-manuel', { device: 'Compteur direct', quantity: 'kWh', comm: 'Aucune (relevé manuel)' }),
  ],
};

const gaz: Plan = {
  id: 'gaz-vapeur', name: 'Gaz naturel et vapeur', site: 'Centre hospitalier exemple', carrier: 'Gaz naturel', ratedUnit: 'kW', version: 'V1', author: '',
  nodes: [
    n('GRDF', 'Poste de livraison gaz', 'source'),
    n('CHAUF', 'Chaufferie vapeur — 4 MW', 'transformation', { parent: 'GRDF', rated: 4000 }),
    n('COGE-G', 'Cogénérateur gaz', 'usage', { parent: 'GRDF', rated: 1100, annualMWh: 6500 }),
    n('CUIS-G', 'Cuisine (gaz)', 'usage', { parent: 'GRDF', rated: 250, annualMWh: 450 }),
    n('COLL', 'Collecteur vapeur 8 bar', 'distribution', { parent: 'CHAUF', rated: 3600 }),
    n('STER', 'Stérilisation', 'usage', { parent: 'COLL', rated: 900, annualMWh: 2200 }),
    n('BUAN-V', 'Buanderie (vapeur)', 'usage', { parent: 'COLL', rated: 800, annualMWh: 1900 }),
    n('ECH-CH', 'Échangeurs chauffage', 'usage', { parent: 'COLL', rated: 1500, annualMWh: 4200 }),
    n('ECS', 'Production d’eau chaude sanitaire', 'usage', { parent: 'COLL', rated: 400, annualMWh: 1500 }),
  ],
  meters: [
    m('CG-01', 'GRDF', 'existant-communicant', { device: 'Compteur de facturation', quantity: 'm³, kWh PCS', comm: 'Impulsions', location: 'Poste de livraison' }),
    m('CG-02', 'CHAUF', 'existant-manuel', { device: 'Compteur gaz', quantity: 'm³', comm: 'Aucune (relevé manuel)', location: 'Chaufferie' }),
    m('CV-01', 'COLL', 'a-installer', { device: 'Compteur d’énergie thermique', quantity: 'kWh, t', comm: 'M-Bus', comment: 'Débit vapeur et pression/température au collecteur.' }),
    m('CV-02', 'ECH-CH', 'a-installer', { device: 'Compteur d’énergie thermique', quantity: 'kWh', comm: 'M-Bus' }),
  ],
};

export const EXEMPLE_PROJET: Project = { name: 'Centre hospitalier exemple', plans: [electricite, gaz] };
