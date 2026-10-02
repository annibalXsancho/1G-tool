import { defineCalculator, type Quantity, type Warning } from '@/core/types';
import { fluides } from '@/data';
import type { FluidEntry } from '@/data/schema';
import { interpTable } from '@/core/interp';
import { fmtNum, tex } from '@/core/fmt';

export type PuissanceFluideInput = {
  fluide: string; // clé de src/data/fluides.json, ou « autre »
  mode: 'massique' | 'volumique';
  qm: number; // kg/s
  qv: number; // m³/s, mesuré à la température d'entrée
  tIn: number; // K
  tOut: number; // K
  pression: number; // Pa, absolue (gaz et vapeur)
  cpManuel: number; // J/(kg·K)
  rhoManuel: number; // kg/m³
};

export type PuissanceFluideOutput = { P: number; qm: number; cp: number; rho?: number; dT: number; Tm: number };

const K0 = 273.15;
const P_ATM = 101325; // Pa, atmosphère normale (définition)

const kW = (w: number) => tex(w / 1000);

function property(f: FluidEntry, key: 'cp' | 'rho', T_K: number, p: number) {
  if (key === 'rho' && f.R_specifique !== null) return { value: p / (f.R_specifique * T_K), range: 'in' as const }; // gaz parfait ρ = p/(r·T)
  const x = f.T_unite === 'C' ? T_K - K0 : T_K;
  return interpTable(f.points, 'T', key, x);
}

export const puissanceFluide = defineCalculator<PuissanceFluideInput, PuissanceFluideOutput>({
  id: 'puissance-fluide',
  title: 'Puissance thermique d’un fluide',
  category: 'thermique',
  summary: 'Puissance échangée par un fluide qui chauffe ou refroidit : P = q_m · c_p · ΔT.',
  inputs: [
    {
      type: 'choice', key: 'fluide', label: 'Fluide', default: 'eau',
      options: [
        ...Object.entries(fluides.fluides).map(([value, f]) => ({ value, label: f.label })),
        { value: 'autre', label: 'Autre (cp et ρ saisis)' },
      ],
    },
    {
      type: 'choice', key: 'mode', label: 'Débit connu en', default: 'massique',
      options: [{ value: 'massique', label: 'Massique' }, { value: 'volumique', label: 'Volumique' }],
    },
    { type: 'number', key: 'qm', label: 'Débit massique', dimension: 'massFlow', default: 3, min: 0, showIf: { key: 'mode', in: ['massique'] } },
    {
      type: 'number', key: 'qv', label: 'Débit volumique', dimension: 'volFlow', default: 36 / 3600, min: 0,
      help: 'Mesuré à la température d’entrée (ρ évaluée à cette température).', showIf: { key: 'mode', in: ['volumique'] },
    },
    { type: 'number', key: 'tIn', label: 'Température d’entrée', dimension: 'temperature', default: 60 + K0, min: 1, max: 2000 },
    { type: 'number', key: 'tOut', label: 'Température de sortie', dimension: 'temperature', default: 80 + K0, min: 1, max: 2000 },
    {
      type: 'number', key: 'pression', label: 'Pression absolue', dimension: 'pressure', default: P_ATM, min: 1e3, max: 1e8,
      help: 'Sert à calculer la masse volumique du gaz ou de la vapeur.',
      showIf: { key: 'fluide', in: Object.entries(fluides.fluides).filter(([, f]) => f.R_specifique !== null).map(([k]) => k) },
    },
    { type: 'number', key: 'cpManuel', label: 'Chaleur massique cp', dimension: 'specificHeat', default: 4186, min: 1, showIf: { key: 'fluide', in: ['autre'] } },
    { type: 'number', key: 'rhoManuel', label: 'Masse volumique ρ', dimension: 'density', default: 1000, min: 1e-3, showIf: { key: 'fluide', in: ['autre'] } },
  ],
  compute(i) {
    const warnings: Warning[] = [];
    const finite = [i.tIn, i.tOut].every(Number.isFinite);
    if (!finite || i.tIn <= 0 || i.tOut <= 0) return { ok: false, errors: [{ message: 'Températures invalides (kelvin strictement positifs).' }] };

    const dT = i.tOut - i.tIn;
    const Tm = (i.tIn + i.tOut) / 2;
    const entry = i.fluide === 'autre' ? undefined : fluides.fluides[i.fluide];
    if (i.fluide !== 'autre' && !entry) return { ok: false, errors: [{ key: 'fluide', message: `Fluide inconnu : ${i.fluide}` }] };

    let cp: number;
    let rho: number | undefined;
    const formulas: { label: string; symbolic: string; substituted: string }[] = [];

    if (entry) {
      const c = property(entry, 'cp', Tm, i.pression);
      cp = c.value;
      const unit = entry.T_unite === 'C' ? '°C' : 'K';
      const lo = entry.points[0].T;
      const hi = entry.points[entry.points.length - 1].T;
      const probe = (T_K: number, what: string) => {
        const r = property(entry, 'cp', T_K, i.pression).range;
        if (r !== 'in') {
          warnings.push({
            level: 'validity',
            message: `${what} hors de la table « ${entry.label} » [${fmtNum(lo)} ; ${fmtNum(hi)}] ${unit} : propriétés bornées à l’extrémité de la table, résultat à prendre avec prudence.`,
          });
        }
      };
      probe(Tm, 'Température moyenne');
      probe(i.tIn, 'Température d’entrée');
      probe(i.tOut, 'Température de sortie');
      if (entry.R_specifique === null && Math.max(i.tIn, i.tOut) > 373.15) {
        warnings.push({ level: 'info', message: 'Au-dessus de 100 °C, l’eau est supposée liquide, donc maintenue sous pression suffisante (pas de vaporisation).' });
      }
      if (i.fluide === 'vapeur' && Math.abs(i.pression - P_ATM) > 0.1 * P_ATM) {
        warnings.push({ level: 'info', message: 'cp de la vapeur tabulé à pression atmosphérique ; l’effet de la pression sur cp est négligé. Vérifier que la vapeur est bien surchauffée (T > T de saturation à la pression donnée).' });
      }
    } else {
      cp = i.cpManuel;
    }

    let qm: number;
    let qv: number | undefined;
    if (i.mode === 'volumique') {
      qv = i.qv;
      rho = entry ? property(entry, 'rho', i.tIn, i.pression).value : i.rhoManuel;
      if (entry) {
        const r = property(entry, 'rho', i.tIn, i.pression).range;
        if (r !== 'in') warnings.push({ level: 'validity', message: 'Température d’entrée hors table : masse volumique bornée à l’extrémité de la table.' });
      }
      qm = rho * qv;
    } else {
      qm = i.qm;
    }

    if (![qm, cp, dT].every(Number.isFinite) || qm < 0 || cp <= 0) return { ok: false, errors: [{ message: 'Entrées incohérentes : débit négatif ou chaleur massique non positive.' }] };

    const P = qm * cp * dT;

    if (qm === 0) warnings.push({ level: 'info', message: 'Débit nul : puissance nulle.' });
    else if (dT === 0) warnings.push({ level: 'info', message: 'ΔT nul : puissance nulle.' });
    else if (dT < 0) warnings.push({ level: 'info', message: 'ΔT négatif : le fluide se refroidit, la puissance est négative (puissance cédée par le fluide).' });

    if (i.mode === 'volumique') {
      const isGas = entry?.R_specifique != null;
      formulas.push({
        label: isGas ? 'Masse volumique (gaz parfait) et débit massique' : 'Débit massique',
        symbolic: isGas ? '\\rho = \\dfrac{p}{r\\,T}, \\quad q_m = \\rho\\, q_v' : 'q_m = \\rho\\, q_v',
        substituted: isGas
          ? `\\rho = \\dfrac{${tex(i.pression)}}{${tex(entry!.R_specifique!)} \\times ${tex(i.tIn)}} = ${tex(rho!)}\\ \\mathrm{kg/m^3}, \\quad q_m = ${tex(rho!)} \\times ${tex(qv!, 5)} = ${tex(qm)}\\ \\mathrm{kg/s}`
          : `q_m = ${tex(rho!)} \\times ${tex(qv!, 5)} = ${tex(qm)}\\ \\mathrm{kg/s}`,
      });
    }
    formulas.push({
      label: 'Puissance thermique',
      symbolic: 'P = q_m \\, c_p \\, \\Delta T',
      substituted: `P = ${tex(qm)} \\times ${tex(cp / 1000)} \\times ${tex(dT)} = ${kW(P)}\\ \\mathrm{kW}`,
    });

    const main: Quantity[] = [{ key: 'P', label: 'Puissance thermique', value: P, dimension: 'power', unit: 'kW' }];
    const intermediates: Quantity[] = [
      { key: 'qm', label: 'Débit massique q_m', value: qm, dimension: 'massFlow' },
      ...(rho !== undefined ? [{ key: 'rho', label: 'Masse volumique ρ (à T entrée)', value: rho, dimension: 'density' as const }] : []),
      { key: 'Tm', label: 'Température moyenne', value: Tm, dimension: 'temperature' },
      { key: 'dT', label: 'Écart de température ΔT', value: dT, dimension: 'temperatureDelta' },
      { key: 'cp', label: 'Chaleur massique c_p (à T moyenne)', value: cp, dimension: 'specificHeat' },
      { key: 'E1h', label: 'Énergie échangée par heure', value: P * 3600, dimension: 'energy', unit: 'kWh' },
    ];
    return { ok: true, main, intermediates, warnings, formulas, data: { P, qm, cp, rho, dT, Tm } };
  },
  references: [
    { source: 'Bilan d’énergie sur un fluide sans changement de phase (Q̇ = ṁ·cp·ΔT)', section: 'Relation fondamentale de la thermodynamique appliquée, pas de norme associée' },
    { source: 'Incropera & DeWitt, Fundamentals of Heat and Mass Transfer', section: 'Annexe A, tables A.4 et A.6', note: 'TODO: source à vérifier (édition, numéro de table)' },
  ],
  assumptions: [
    'Régime permanent, pas de changement de phase, pas de pertes entre les deux points de mesure.',
    'cp évalué à la température moyenne (Tentrée + Tsortie)/2 par interpolation linéaire dans la table de src/data/fluides.json.',
    'En débit volumique, la masse volumique est évaluée à la température d’entrée (là où le débit est supposé mesuré).',
    'Gaz et vapeur : gaz parfait pour la masse volumique ; cp tabulé à pression atmosphérique.',
    'Valeurs de la table recopiées de l’ouvrage de référence et arrondies : source à vérifier (voir TODO dans le JSON).',
  ],
  validity: [
    'Eau liquide : 0 à 150 °C (au-dessus de 100 °C, liquide sous pression).',
    'Air : 250 à 600 K. Vapeur surchauffée : 380 à 600 K.',
    'Hors table, les propriétés sont bornées et un avertissement de validité est émis.',
  ],
});
