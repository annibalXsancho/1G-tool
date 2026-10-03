// Installations fictives de démonstration. Aucune relation avec un site réel ; valeurs plausibles.
import type { Installation, UElement, UProject } from './model';

const e = (id: string, label: string, kind: UElement['kind'], parent: string | undefined, more: Partial<UElement> = {}): UElement => ({ id, label, kind, parent, ...more });
const cu = (section: number, length: number, parallel = 1) => ({ material: 'cuivre' as const, section, length, parallel });
const acb = (inA: number, icu: number) => ({ type: 'disjoncteur' as const, in: inA, icu });

const industrie: Installation = {
  id: 'poste-industriel', name: 'Poste HTA/BT — site industriel', site: 'Site industriel exemple', version: 'V1', author: '',
  elements: [
    e('RES', 'Réseau HTA 20 kV', 'reseau', undefined, { voltage: 20000, scc: 250 }),
    e('TR1', 'Transformateur TR1', 'transformateur', 'RES', { s: 1600, u2: 400, ukk: 6, pk: 16, coupling: 'Dyn11', breaker: { type: 'disjoncteur', in: 63, icu: 16 }, meter: { id: 'CF-HTA-01', status: 'existant-communicant' } }),
    e('TGBT', 'TGBT principal', 'tableau', 'TR1', { inBar: 2500, ks: 0.8, breaker: acb(2500, 50), cable: cu(300, 8, 4), meter: { id: 'CE-TGBT-01', status: 'existant-communicant', ct: '2500/5' } }),
    e('GF', 'Groupes froid', 'moteur', 'TGBT', { p: 250, cosphi: 0.85, eta: 0.95, breaker: acb(630, 50), cable: cu(240, 60, 1), meter: { id: 'CE-GF-01', status: 'existant-communicant', ct: '600/5' } }),
    e('COMP', 'Compresseurs d’air', 'moteur', 'TGBT', { p: 160, cosphi: 0.88, eta: 0.94, breaker: acb(400, 50), cable: cu(150, 80), meter: { id: 'CE-COMP-01', status: 'a-installer', ct: '400/5' } }),
    e('CTA', 'Centrales de traitement d’air', 'charge', 'TGBT', { p: 90, cosphi: 0.9, breaker: acb(200, 50), cable: cu(70, 120) }),
    e('TDA', 'Tableau atelier A', 'tableau', 'TGBT', { inBar: 630, ks: 0.7, breaker: acb(400, 36), cable: cu(185, 150), meter: { id: 'CE-TDA-01', status: 'a-installer', ct: '400/5' } }),
    e('POMPES', 'Pompes process', 'moteur', 'TDA', { p: 75, cosphi: 0.86, eta: 0.93, breaker: { type: 'disjoncteur', in: 160, icu: 36 }, cable: cu(70, 40) }),
    e('FOURS', 'Fours électriques', 'charge', 'TDA', { p: 60, cosphi: 1, breaker: { type: 'disjoncteur', in: 125, icu: 36 }, cable: cu(50, 35) }),
    e('ECL', 'Éclairage atelier', 'charge', 'TDA', { p: 30, cosphi: 0.92, breaker: { type: 'disjoncteur', in: 63, icu: 36 }, cable: cu(25, 90) }),
    e('COND', 'Compensation réactive 300 kvar', 'condensateurs', 'TGBT', { q: 300, breaker: acb(630, 50), cable: cu(120, 15) }),
    e('GE', 'Groupe électrogène 800 kVA', 'groupe', 'TGBT', { s: 800, breaker: { type: 'disjoncteur', in: 1250, icu: 36 }, cable: cu(240, 25, 2), meter: { id: 'CE-GE-01', status: 'existant-manuel' } }),
  ],
};

const tertiaire: Installation = {
  id: 'tertiaire', name: 'Tertiaire — un transformateur', site: 'Site exemple', version: 'V1', author: '',
  elements: [
    e('RES', 'Réseau HTA 20 kV', 'reseau', undefined, { voltage: 20000, scc: 250 }),
    e('TR', 'Transformateur', 'transformateur', 'RES', { s: 630, u2: 400, ukk: 4, breaker: { type: 'interrupteur', in: 63 }, meter: { id: 'CF-01', status: 'existant-communicant' } }),
    e('TGBT', 'TGBT', 'tableau', 'TR', { inBar: 1000, ks: 0.8, breaker: acb(1000, 25), cable: cu(240, 6, 2) }),
    e('CVC', 'Production de froid et CVC', 'charge', 'TGBT', { p: 140, cosphi: 0.88, breaker: acb(320, 25), cable: cu(120, 50), meter: { id: 'CE-CVC', status: 'existant-manuel' } }),
    e('ECL', 'Éclairage et prises', 'charge', 'TGBT', { p: 110, cosphi: 0.92, breaker: acb(250, 25), cable: cu(95, 70) }),
    e('ASC', 'Ascenseurs', 'moteur', 'TGBT', { p: 30, cosphi: 0.8, eta: 0.9, breaker: { type: 'disjoncteur', in: 80, icu: 25 }, cable: cu(25, 45) }),
    e('INFO', 'Salle informatique', 'charge', 'TGBT', { p: 60, cosphi: 0.95, breaker: acb(160, 25), cable: cu(50, 30), meter: { id: 'CE-INFO', status: 'a-installer' } }),
  ],
};

export const EXEMPLE_UNIFILAIRE: UProject = { name: 'Installations exemple', installations: [industrie, tertiaire] };
