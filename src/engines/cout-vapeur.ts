import { defineCalculator, type Quantity, type Warning } from '@/core/types';
import { fmtNum, tex } from '@/core/fmt';
import { saturationP, statePT } from '@/thermo/steam';
import { fuel } from '@/thermo/combustion';
import { barg, costFields, costFormula, guarded, K0, perMWh, pressureField, steamCost, type CostInput } from './shared/vapeur';

export type CoutVapeurInput = CostInput & { p: number; etat: 'saturee' | 'surchauffee'; T: number; production: number; heures: number };
export type CoutVapeurOutput = { costPerKg: number; fuelPerKg: number; co2PerKg: number; hSteam: number; hFeed: number };

export const coutVapeur = defineCalculator<CoutVapeurInput, CoutVapeurOutput>({
  id: 'cout-vapeur',
  title: 'Coût de production de la vapeur',
  category: 'vapeur',
  summary: 'Prix de revient combustible et contenu CO2 d’une tonne de vapeur, à partir de la pression, du rendement et du prix de l’énergie.',
  inputs: [
    pressureField('p', 'Pression de production', 1101325),
    { type: 'choice', key: 'etat', label: 'Vapeur produite', default: 'saturee', options: [{ value: 'saturee', label: 'Saturée sèche' }, { value: 'surchauffee', label: 'Surchauffée' }] },
    { type: 'number', key: 'T', label: 'Température de la vapeur', dimension: 'temperature', default: 250 + K0, min: K0, max: 800 + K0, showIf: { key: 'etat', in: ['surchauffee'] } },
    costFields.tAlim(),
    costFields.rendement(),
    costFields.combustible(),
    costFields.prixEnergie(),
    costFields.basePrix(),
    { type: 'number', key: 'production', label: 'Production moyenne de vapeur', dimension: 'massFlow', units: ['t/h', 'kg/h', 'kg/s'], default: 5000 / 3600, min: 0 },
    costFields.heures(),
  ],
  compute: (i) => guarded(() => {
    const sat = saturationP(i.p);
    const hSteam = i.etat === 'saturee' ? sat.hg : statePT(i.p, i.T).h;
    const warnings: Warning[] = [];
    if (i.etat === 'surchauffee' && i.T <= sat.T) {
      return { ok: false, errors: [{ key: 'T', message: `La vapeur n’est pas surchauffée : T doit dépasser Tsat = ${fmtNum(sat.T - K0)} °C.` }] };
    }
    if (i.tAlim >= sat.T) {
      return { ok: false, errors: [{ key: 'tAlim', message: `L’eau d’alimentation doit être plus froide que la saturation de la chaudière (${fmtNum(sat.T - K0)} °C).` }] };
    }
    const c = steamCost(i, hSteam);
    if (i.rendement > 1) warnings.push({ level: 'validity', message: 'Rendement sur PCI supérieur à 100 % : possible uniquement avec récupération de chaleur latente des fumées (condensation).' });
    const yearMass = i.production * i.heures;
    const f = fuel(i.combustible);

    const main: Quantity[] = [
      { key: 'cout', label: 'Coût de la vapeur', value: c.costPerKg, dimension: 'massPrice', unit: '€/t' },
      { key: 'energie', label: 'Énergie combustible par tonne', value: c.fuelPerKg * 1e3, dimension: 'energy', unit: 'kWh' },
      { key: 'co2', label: 'CO2 par tonne de vapeur', value: c.co2PerKg * 1e3, dimension: 'mass', unit: 'kg' },
    ];
    const intermediates: Quantity[] = [
      { key: 'hv', label: 'Enthalpie de la vapeur h_v', value: hSteam, dimension: 'specificEnergy' },
      { key: 'ha', label: 'Enthalpie de l’eau d’alimentation h_alim', value: c.hFeed, dimension: 'specificEnergy' },
      { key: 'dh', label: 'Chaleur fournie à l’eau h_v − h_alim', value: hSteam - c.hFeed, dimension: 'specificEnergy' },
      { key: 'Tsat', label: 'Température de saturation', value: sat.T, dimension: 'temperature' },
      { key: 'pPCI', label: 'Prix du combustible sur PCI', value: c.pricePCI, dimension: 'energyPrice' },
      { key: 'fe', label: 'Facteur d’émission (PCI)', value: c.co2PCI, dimension: 'emissionFactor' },
      { key: 'coutAn', label: 'Coût annuel de la vapeur (€/an)', value: yearMass * c.costPerKg, dimension: 'cost' },
      { key: 'energieAn', label: 'Combustible consommé par an', value: yearMass * c.fuelPerKg, dimension: 'energy', unit: 'MWh' },
      { key: 'co2An', label: 'CO2 émis par an', value: yearMass * c.co2PerKg, dimension: 'mass', unit: 't' },
    ];

    const etas = [0.8, 0.85, 0.88, 0.9, 0.92, 0.95];
    if (!etas.some((e) => Math.abs(e - i.rendement) < 1e-9)) etas.push(i.rendement);
    etas.sort((a, b) => a - b);
    const display = {
      type: 'table' as const,
      title: 'Sensibilité au rendement de la chaudière',
      columns: [
        { label: 'Rendement PCI', dimension: 'ratio' as const, unit: '%' },
        { label: 'Coût', dimension: 'massPrice' as const, unit: '€/t' },
        { label: 'Coût annuel', dimension: 'cost' as const, unit: '€' },
      ],
      rows: etas.map((e) => {
        const ce = steamCost({ ...i, rendement: e }, hSteam);
        return [e, ce.costPerKg, ce.costPerKg * yearMass];
      }),
      highlight: etas.indexOf(i.rendement),
      note: 'Chaque point de rendement gagné réduit directement le coût de toute la vapeur produite.',
    };

    return {
      ok: true, main, intermediates, warnings, display,
      formulas: [
        {
          label: 'Chaleur à fournir à l’eau',
          symbolic: '\\Delta h = h_v - h_{alim}',
          substituted: `\\Delta h = ${tex(hSteam / 1e3)} - ${tex(c.hFeed / 1e3)} = ${tex((hSteam - c.hFeed) / 1e3)}\\ \\mathrm{kJ/kg}`,
          legend: [
            { symbol: 'h_v', meaning: i.etat === 'saturee' ? 'enthalpie de la vapeur saturée sèche à la pression de production' : 'enthalpie de la vapeur surchauffée', unit: 'kJ/kg' },
            { symbol: 'h_{alim}', meaning: 'enthalpie de l’eau d’alimentation (liquide à sa température)', unit: 'kJ/kg' },
          ],
          note: 'Enthalpies calculées par IAPWS-IF97 (module vapeur).',
        },
        costFormula(c, hSteam, i),
        {
          label: 'Émissions de CO2 par tonne',
          symbolic: 'm_{CO_2} = \\dfrac{h_v - h_{alim}}{\\eta_{PCI}} \\times f_{CO_2}',
          substituted: `m_{CO_2} = ${tex(c.fuelPerKg / 3600)}\\ \\mathrm{kWh/t} \\times ${tex(c.co2PCI * 3.6e6)}\\ \\mathrm{kg/kWh} = ${tex(c.co2PerKg * 1e3)}\\ \\mathrm{kg/t}`,
          legend: [{ symbol: 'f_{CO_2}', meaning: `facteur d’émission de combustion du ${f.label.toLowerCase()} sur PCI`, unit: 'kg/kWh' }],
          note: 'Facteur GIEC 2006 (combustion seule, hors amont), voir combustibles.json.',
        },
      ],
      conclusion: `À ${barg(i.p)} et ${fmtNum(i.rendement * 100, 3)} % de rendement, une tonne de vapeur coûte ${fmtNum(c.costPerKg * 1e3, 3)} € de ${f.label.toLowerCase()} (à ${fmtNum(perMWh(c.pricePCI), 3)} €/MWh PCI) et émet ${fmtNum(c.co2PerKg * 1e3, 3)} kg de CO2.`,
      data: { costPerKg: c.costPerKg, fuelPerKg: c.fuelPerKg, co2PerKg: c.co2PerKg, hSteam, hFeed: c.hFeed },
    };
  }),
  method: [
    'Produire un kilogramme de vapeur, c’est porter l’eau d’alimentation jusqu’à l’état de vapeur à la pression de la chaudière. La chaleur à fournir est la différence d’enthalpie entre la vapeur et l’eau d’alimentation.',
    'La chaudière ne transmet à l’eau qu’une part de l’énergie du combustible : son rendement. L’énergie combustible nécessaire est donc la chaleur fournie divisée par le rendement.',
    'Le coût et les émissions s’en déduisent avec le prix et le facteur d’émission du combustible, tous deux ramenés au PCI pour rester cohérents avec le rendement.',
  ],
  scope: 'Coût combustible seul : n’inclut ni l’eau, ni le traitement d’eau, ni l’électricité des auxiliaires, ni la maintenance, ni l’amortissement. Pour le rendement réel de la chaudière, voir l’outil dédié.',
  related: ['rendement-chaudiere', 'proprietes-vapeur', 'purgeur-defaillant'],
  references: [
    { source: 'Bilan d’énergie sur la chaudière (relation générale)', section: 'pas de norme associée' },
    { source: 'IAPWS-IF97 pour les enthalpies', note: 'TODO: source à vérifier (année de la révision citée)' },
    { source: 'GIEC 2006, Guidelines for National GHG Inventories, vol. 2, chap. 2, tableau 2.2', section: 'facteurs d’émission CO2 par défaut' },
  ],
  assumptions: [
    'Eau d’alimentation assimilée à du liquide saturé à sa température (erreur ≈ 1 kJ/kg à 10 bar).',
    'Rendement saisi constant sur l’année (pas de modulation de charge).',
    'Rapports PCI/PCS issus de combustibles.json : ordres de grandeur à vérifier selon le contrat.',
  ],
  validity: ['Pression de 612 Pa à 16 MPa ; vapeur jusqu’à 800 °C (domaine du module vapeur).', 'Rendement saisi entre 30 et 110 % (au-delà de 100 % : chaudière à condensation).'],
});
