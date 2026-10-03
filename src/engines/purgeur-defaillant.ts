import { defineCalculator, type Quantity, type Warning } from '@/core/types';
import { fmtNum, tex } from '@/core/fmt';
import { napierLeak, NAPIER_SI, STEAM_CRITICAL_RATIO } from '@/thermo/rules';
import { saturationP } from '@/thermo/steam';
import { barg, costFields, costFormula, guarded, P_ATM, pressureField, steamCost, type CostInput } from './shared/vapeur';

export type PurgeurInput = CostInput & { pAmont: number; pAval: number; d: number; cd: number; nombre: number; heures: number };
export type PurgeurOutput = { mLeak: number; costYear: number; co2Year: number; choked: boolean };

export const purgeurDefaillant = defineCalculator<PurgeurInput, PurgeurOutput>({
  id: 'purgeur-defaillant',
  title: 'Purgeur défaillant (fuite de vapeur)',
  category: 'vapeur',
  summary: 'Débit de vapeur perdu par un purgeur bloqué ouvert ou une fuite, par la formule de Napier, et son coût annuel.',
  inputs: [
    pressureField('pAmont', 'Pression de vapeur en amont', 10e5 + P_ATM),
    pressureField('pAval', 'Pression en aval (retour condensats)', P_ATM, '0 bar(g) = rejet ou retour à l’atmosphère.'),
    { type: 'number', key: 'd', label: 'Diamètre de l’orifice de fuite', dimension: 'length', units: ['mm', 'cm', 'm'], default: 3e-3, min: 0, max: 0.1, help: 'Orifice du siège du purgeur ou diamètre équivalent de la fuite.' },
    {
      type: 'number', key: 'cd', label: 'Coefficient d’ouverture', dimension: 'ratio', units: ['-', '%'], default: 1, min: 0.01, max: 1,
      help: '1 = purgeur bloqué grand ouvert (débit théorique de Napier) ; à réduire pour une fuite partielle.',
    },
    { type: 'number', key: 'nombre', label: 'Nombre de purgeurs concernés', dimension: 'count', default: 1, min: 0, max: 10000 },
    costFields.heures(),
    costFields.tAlim(),
    costFields.rendement(),
    costFields.combustible(),
    costFields.prixEnergie(),
    costFields.basePrix(),
  ],
  compute: (i) => guarded(() => {
    const leak = napierLeak({ pUp: i.pAmont, pDown: i.pAval, d: i.d, cd: i.cd });
    const n = Math.round(i.nombre);
    const mLeak = leak.m * n;
    const sat = saturationP(i.pAmont);
    const c = steamCost(i, sat.hg);
    const massYear = mLeak * i.heures;
    const costYear = massYear * c.costPerKg;
    const co2Year = massYear * c.co2PerKg;
    const ratio = i.pAval / i.pAmont;
    const warnings: Warning[] = [];
    if (!leak.choked) {
      warnings.push({
        level: 'validity',
        message: `Rapport p_aval/p_amont = ${fmtNum(ratio, 3)} > ${fmtNum(STEAM_CRITICAL_RATIO, 3)} : l’écoulement n’est pas critique, la formule de Napier surestime la fuite.`,
      });
    }
    if (n !== i.nombre) warnings.push({ level: 'info', message: `Nombre de purgeurs arrondi à ${n}.` });
    if (mLeak === 0) warnings.push({ level: 'info', message: 'Aucune fuite pour ces données.' });

    const pPsia = i.pAmont / 6894.757293168;
    const main: Quantity[] = [
      { key: 'm', label: 'Débit de vapeur perdu', value: mLeak, dimension: 'massFlow', unit: 'kg/h' },
      { key: 'cout', label: 'Coût annuel (€/an)', value: costYear, dimension: 'cost' },
      { key: 'co2', label: 'CO2 émis par an', value: co2Year, dimension: 'mass', unit: 't' },
    ];
    const intermediates: Quantity[] = [
      { key: 'A', label: 'Section de l’orifice', value: leak.area, dimension: 'area', unit: 'mm²' },
      { key: 'm1', label: 'Fuite par purgeur', value: leak.m, dimension: 'massFlow', unit: 'kg/h' },
      { key: 'Tsat', label: 'Température de la vapeur (saturée)', value: sat.T, dimension: 'temperature' },
      { key: 'r', label: 'Rapport p_aval / p_amont', value: ratio, dimension: 'ratio' },
      { key: 'mt', label: 'Vapeur perdue par an', value: massYear, dimension: 'mass', unit: 't' },
      { key: 'cv', label: 'Coût de la vapeur', value: c.costPerKg, dimension: 'massPrice' },
      { key: 'E', label: 'Combustible gaspillé par an', value: massYear * c.fuelPerKg, dimension: 'energy', unit: 'MWh' },
      { key: 'Pperdue', label: 'Puissance perdue (combustible)', value: mLeak * c.fuelPerKg, dimension: 'power' },
    ];

    const diam = [1, 2, 3, 4, 5, 6, 8, 10].map((x) => x * 1e-3);
    if (!diam.some((x) => Math.abs(x - i.d) < 1e-9)) diam.push(i.d);
    diam.sort((a, b) => a - b);
    const display = {
      type: 'table' as const,
      chartColumn: 1,
      title: `Fuite par purgeur selon le diamètre (à ${barg(i.pAmont)})`,
      columns: [
        { label: 'Diamètre', dimension: 'length' as const, unit: 'mm' },
        { label: 'Fuite', dimension: 'massFlow' as const, unit: 'kg/h' },
        { label: 'Coût', dimension: 'cost' as const, unit: '€' },
      ],
      rows: diam.map((x) => {
        const m = napierLeak({ pUp: i.pAmont, pDown: i.pAval, d: x, cd: i.cd }).m;
        return [x, m, m * i.heures * c.costPerKg];
      }),
      highlight: diam.findIndex((x) => Math.abs(x - i.d) < 1e-9),
      note: 'Coût annuel par purgeur. La fuite croît comme le carré du diamètre.',
    };

    return {
      ok: true, main, intermediates, warnings, display,
      formulas: [
        {
          label: 'Section de l’orifice',
          symbolic: 'A = \\dfrac{\\pi d^2}{4}',
          substituted: `A = \\dfrac{\\pi \\times (${tex(i.d * 1e3)}\\ \\mathrm{mm})^2}{4} = ${tex(leak.area * 1e6)}\\ \\mathrm{mm^2}`,
          legend: [{ symbol: 'd', meaning: 'diamètre de l’orifice', unit: 'mm' }],
        },
        {
          label: 'Débit critique de vapeur : formule de Napier',
          symbolic: 'W = \\dfrac{P \\cdot A}{70} \\quad\\Longleftrightarrow\\quad \\dot m = C_d \\, C_N \\, p \\, A',
          substituted: `\\begin{aligned} \\dot m &= ${tex(i.cd)} \\times ${tex(NAPIER_SI, 5)} \\times ${tex(i.pAmont)}\\ \\mathrm{Pa} \\times ${tex(leak.area, 4)}\\ \\mathrm{m^2} \\\\ &= ${tex(leak.m, 4)}\\ \\mathrm{kg/s} = ${tex(leak.m * 3600)}\\ \\mathrm{kg/h} \\end{aligned}`,
          legend: [
            { symbol: 'W', meaning: 'débit en lb/s (forme d’origine), avec P en psia et A en in²' },
            { symbol: 'C_N', meaning: 'constante de Napier convertie en SI', unit: 's/m' },
            { symbol: 'p', meaning: `pression absolue amont (${fmtNum(pPsia, 4)} psia)`, unit: 'Pa' },
            { symbol: 'C_d', meaning: 'coefficient d’ouverture (1 = orifice franc)' },
          ],
          note: `C_N = 0,45359237 / (6894,757 × 6,4516·10⁻⁴ × 70) ≈ 1,4568·10⁻³ s/m (conversions lb → kg, psi → Pa, in² → m²). Valable pour de la vapeur saturée sèche en écoulement critique : p_aval/p_amont ≤ ${fmtNum(STEAM_CRITICAL_RATIO, 3)}.`,
        },
        {
          label: 'Fuite totale',
          symbolic: '\\dot m_{tot} = n \\cdot \\dot m',
          substituted: `\\dot m_{tot} = ${n} \\times ${tex(leak.m * 3600)} = ${tex(mLeak * 3600)}\\ \\mathrm{kg/h}`,
          legend: [{ symbol: 'n', meaning: 'nombre de purgeurs défaillants' }],
        },
        costFormula(c, sat.hg, i),
        {
          label: 'Coût annuel de la fuite',
          symbolic: 'C = \\dot m_{tot} \\cdot t \\cdot c_v',
          substituted: `C = ${tex(mLeak * 3600)}\\ \\mathrm{kg/h} \\times ${tex(i.heures / 3600)}\\ \\mathrm{h} \\times ${tex(c.costPerKg * 1e3)}\\ \\text{€/t} \\div 1000 = ${tex(costYear)}\\ \\text{€/an}`,
          legend: [{ symbol: 't', meaning: 'durée de fonctionnement annuelle', unit: 'h' }],
        },
      ],
      conclusion: `${n > 1 ? `${n} purgeurs bloqués ouverts` : 'Un purgeur bloqué ouvert'} avec un orifice de ${fmtNum(i.d * 1e3, 3)} mm à ${barg(i.pAmont)} ${n > 1 ? 'perdent' : 'perd'} ${fmtNum(mLeak * 3600, 3)} kg/h de vapeur, soit ${fmtNum(costYear, 3)} €/an et ${fmtNum(co2Year / 1e3, 3)} t de CO2.`,
      data: { mLeak, costYear, co2Year, choked: leak.choked },
    };
  }),
  method: [
    'Un purgeur bloqué en position ouverte laisse passer de la vapeur vive vers le retour condensats ou l’atmosphère. Tant que la pression aval est assez basse, l’écoulement dans l’orifice est critique (sonique) : le débit ne dépend que de la pression amont et de la section.',
    'La formule empirique de Napier exprime ce débit critique pour de la vapeur saturée sèche. Elle est convertie ici en unités SI. Le coefficient d’ouverture permet de traduire une fuite partielle.',
    'La vapeur perdue doit être produite : son coût est celui du combustible nécessaire pour la générer, compte tenu du rendement de la chaudière.',
  ],
  scope: 'N’identifie pas l’état du purgeur (diagnostic par ultrasons ou température) et ne s’applique pas à de la vapeur surchauffée ni aux fuites de condensat. L’orifice réel d’un purgeur défaillant est souvent inférieur au siège : le coefficient d’ouverture doit être choisi avec prudence.',
  related: ['cout-vapeur', 'vapeur-flash', 'proprietes-vapeur'],
  references: [
    { source: 'Formule empirique de Napier (débit critique de vapeur saturée par un orifice)', section: 'forme impériale W = P·A/70', note: 'TODO: source à vérifier (ouvrage de référence et édition)' },
    { source: 'Rapport critique (2/(k+1))^(k/(k−1)) avec k = 1,135 pour la vapeur saturée', note: 'TODO: source à vérifier' },
  ],
  assumptions: [
    'Vapeur saturée sèche en amont, écoulement critique dans l’orifice.',
    'Coefficient d’ouverture saisi (1 par défaut, débit théorique maximal pour l’orifice donné).',
    'Fuite continue pendant toutes les heures de fonctionnement.',
    'Vapeur valorisée à son coût de production combustible (hors eau et traitement).',
  ],
  validity: [
    `Écoulement critique : p_aval/p_amont ≤ ${fmtNum(STEAM_CRITICAL_RATIO, 3)} ; au-delà, avertissement de validité.`,
    'Vapeur saturée sèche ; pressions du domaine du module vapeur.',
  ],
});
