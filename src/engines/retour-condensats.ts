import { defineCalculator, type Quantity, type Warning } from '@/core/types';
import { fmtNum, tex } from '@/core/fmt';
import { condensateReturnPower } from '@/thermo/rules';
import { co2PerJoulePCI, fuel, priceOnPCI } from '@/thermo/combustion';
import { saturationT } from '@/thermo/steam';
import { costFields, guarded, K0, perMWh } from './shared/vapeur';

export type RetourCondensatsInput = {
  debit: number; tCond: number; tAppoint: number; coutEau: number; heures: number;
  rendement: number; combustible: string; prixEnergie: number; basePrix: 'PCS' | 'PCI';
};
export type RetourCondensatsOutput = { power: number; fuelYear: number; savingYear: number; waterYear: number };

const RHO_EAU = 1000; // kg/m³ : eau d'appoint froide assimilée à 1000 kg/m³
const kJ = (v: number) => tex(v / 1e3);

export const retourCondensats = defineCalculator<RetourCondensatsInput, RetourCondensatsOutput>({
  id: 'retour-condensats',
  title: 'Récupération des condensats',
  category: 'vapeur',
  summary: 'Économie d’énergie, d’eau et de CO2 obtenue en renvoyant les condensats chauds à la bâche plutôt qu’à l’égout.',
  inputs: [
    { type: 'number', key: 'debit', label: 'Débit de condensats récupérés', dimension: 'massFlow', units: ['t/h', 'kg/h', 'kg/s'], default: 3000 / 3600, min: 0 },
    { type: 'number', key: 'tCond', label: 'Température des condensats à la bâche', dimension: 'temperature', default: 80 + K0, min: K0 + 0.01, max: 150 + K0, help: 'Après pertes dans le réseau de retour et revaporisation.' },
    { type: 'number', key: 'tAppoint', label: 'Température de l’eau d’appoint', dimension: 'temperature', default: 15 + K0, min: K0 + 0.01, max: 100 + K0 },
    costFields.heures(),
    costFields.rendement(),
    costFields.combustible(),
    costFields.prixEnergie(),
    costFields.basePrix(),
    { type: 'number', key: 'coutEau', label: 'Coût de l’eau d’appoint traitée', dimension: 'volumePrice', default: 3, min: 0, help: 'Eau, adoucissement/osmose, réactifs et rejet, par m³. Estimation à adapter au site.' },
  ],
  compute: (i) => guarded(() => {
    if (i.rendement <= 0) return { ok: false, errors: [{ key: 'rendement', message: 'Rendement strictement positif requis.' }] };
    const hc = saturationT(i.tCond).hf;
    const ha = saturationT(i.tAppoint).hf;
    const power = condensateReturnPower({ mReturn: i.debit, hCondensate: hc, hMakeup: ha });
    const pricePCI = priceOnPCI(i.prixEnergie, i.basePrix, i.combustible);
    const co2 = co2PerJoulePCI(i.combustible);
    const fuelYear = (power * i.heures) / i.rendement;
    const energySaving = fuelYear * pricePCI;
    const waterYear = (i.debit * i.heures) / RHO_EAU;
    const waterSaving = waterYear * i.coutEau;
    const savingYear = energySaving + waterSaving;
    const warnings: Warning[] = [];
    if (i.tCond <= i.tAppoint) warnings.push({ level: 'info', message: 'Condensats plus froids que l’eau d’appoint : seul le gain sur l’eau subsiste.' });
    if (i.tCond > 100 + K0) warnings.push({ level: 'info', message: 'Au-delà de 100 °C, la bâche doit être pressurisée (dégazeur) pour éviter la revaporisation.' });

    const main: Quantity[] = [
      { key: 'gain', label: 'Économie totale (€/an)', value: savingYear, dimension: 'cost' },
      { key: 'E', label: 'Combustible économisé par an', value: fuelYear, dimension: 'energy', unit: 'MWh' },
      { key: 'V', label: 'Eau économisée par an', value: waterYear, dimension: 'volume' },
    ];
    const intermediates: Quantity[] = [
      { key: 'hc', label: 'Enthalpie des condensats', value: hc, dimension: 'specificEnergy' },
      { key: 'ha', label: 'Enthalpie de l’eau d’appoint', value: ha, dimension: 'specificEnergy' },
      { key: 'P', label: 'Puissance récupérée', value: power, dimension: 'power' },
      { key: 'pPCI', label: 'Prix du combustible sur PCI', value: pricePCI, dimension: 'energyPrice' },
      { key: 'Ge', label: 'Économie énergie (€/an)', value: energySaving, dimension: 'cost' },
      { key: 'Gw', label: 'Économie eau (€/an)', value: waterSaving, dimension: 'cost' },
      { key: 'co2', label: 'CO2 évité par an', value: fuelYear * co2, dimension: 'mass', unit: 't' },
    ];

    const temps = [40, 50, 60, 70, 80, 90].map((t) => t + K0).filter((t) => t > i.tAppoint);
    if (!temps.some((t) => Math.abs(t - i.tCond) < 1e-9)) temps.push(i.tCond);
    temps.sort((a, b) => a - b);
    const display = {
      type: 'table' as const,
      title: 'Économie selon la température de retour',
      columns: [
        { label: 'T condensats', dimension: 'temperature' as const, unit: '°C' },
        { label: 'Puissance récupérée', dimension: 'power' as const },
        { label: 'Économie totale', dimension: 'cost' as const, unit: '€' },
      ],
      rows: temps.map((t) => {
        const P = condensateReturnPower({ mReturn: i.debit, hCondensate: saturationT(t).hf, hMakeup: ha });
        return [t, P, ((P * i.heures) / i.rendement) * pricePCI + waterSaving];
      }),
      highlight: temps.findIndex((t) => Math.abs(t - i.tCond) < 1e-9),
      note: 'Calorifuger le réseau de retour maintient la température des condensats et donc le gain.',
    };

    return {
      ok: true, main, intermediates, warnings, display,
      formulas: [
        {
          label: 'Puissance récupérée',
          symbolic: 'P = \\dot m_c \\, (h_c - h_a)',
          substituted: `P = ${tex(i.debit)}\\ \\mathrm{kg/s} \\times (${kJ(hc)} - ${kJ(ha)})\\ \\mathrm{kJ/kg} = ${tex(power / 1e3)}\\ \\mathrm{kW}`,
          legend: [
            { symbol: '\\dot m_c', meaning: 'débit de condensats renvoyés', unit: 'kg/s' },
            { symbol: 'h_c', meaning: 'enthalpie des condensats à leur température', unit: 'kJ/kg' },
            { symbol: 'h_a', meaning: 'enthalpie de l’eau d’appoint froide', unit: 'kJ/kg' },
          ],
          note: 'Chaque kilogramme de condensat renvoyé remplace un kilogramme d’eau d’appoint qu’il aurait fallu chauffer depuis sa température.',
        },
        {
          label: 'Combustible économisé',
          symbolic: 'E = \\dfrac{P \\cdot t}{\\eta_{PCI}}',
          substituted: `E = \\dfrac{${tex(power / 1e3)}\\ \\mathrm{kW} \\times ${tex(i.heures / 3600)}\\ \\mathrm{h}}{${tex(i.rendement)}} = ${tex(fuelYear / 3.6e9)}\\ \\mathrm{MWh_{PCI}}`,
          legend: [{ symbol: '\\eta_{PCI}', meaning: 'rendement de la chaudière sur PCI' }],
        },
        {
          label: 'Économie annuelle',
          symbolic: 'G = E \\cdot p_{PCI} + \\dfrac{\\dot m_c \\, t}{\\rho} \\, c_{eau}',
          substituted: `G = ${tex(fuelYear / 3.6e9)} \\times ${tex(perMWh(pricePCI))} + ${tex(waterYear)}\\ \\mathrm{m^3} \\times ${tex(i.coutEau)} = ${tex(savingYear)}\\ \\text{€/an}`,
          legend: [
            { symbol: 'p_{PCI}', meaning: 'prix du combustible ramené au PCI', unit: '€/MWh' },
            { symbol: 'c_{eau}', meaning: 'coût de l’eau d’appoint traitée', unit: '€/m³' },
            { symbol: '\\rho', meaning: 'masse volumique de l’eau, prise à 1000', unit: 'kg/m³' },
          ],
          note: i.basePrix === 'PCS' ? `Prix ramené au PCI : ${fmtNum(perMWh(i.prixEnergie))} / ${fmtNum(fuel(i.combustible).ratio_PCI_PCS)} = ${fmtNum(perMWh(pricePCI))} €/MWh.` : undefined,
        },
      ],
      conclusion: `Renvoyer ${fmtNum(i.debit * 3.6, 3)} t/h de condensats à ${fmtNum(i.tCond - K0, 3)} °C économise ${fmtNum(fuelYear / 3.6e9, 3)} MWh de combustible et ${fmtNum(waterYear, 3)} m³ d’eau par an, soit ${fmtNum(savingYear, 3)} €/an et ${fmtNum((fuelYear * co2) / 1e3, 3)} t de CO2.`,
      data: { power, fuelYear, savingYear, waterYear },
    };
  }),
  method: [
    'Un condensat est de l’eau déjà chaude et déjà traitée. Le rejeter oblige à introduire autant d’eau d’appoint froide, à la traiter, puis à la réchauffer en chaudière.',
    'Le gain énergétique est la chaleur qu’il n’est plus nécessaire d’apporter : l’écart d’enthalpie entre condensat et eau d’appoint, divisé par le rendement de la chaudière pour remonter au combustible.',
    'S’y ajoute l’économie d’eau et de traitement. Le retour de condensats purs réduit aussi la salinité de l’eau d’alimentation, donc la purge (voir l’outil Purge de déconcentration).',
  ],
  scope: 'Ne dimensionne pas le réseau de retour ni les pompes de relevage. Ne chiffre pas la réduction de purge induite (à faire avec l’outil Purge) ni le coût d’investissement.',
  related: ['purge-chaudiere', 'vapeur-flash', 'cout-vapeur'],
  references: [
    { source: 'Bilan d’énergie sur la bâche alimentaire (relation générale)', section: 'pas de norme associée' },
    { source: 'IAPWS-IF97 pour les enthalpies de l’eau liquide', note: 'TODO: source à vérifier (année de la révision citée)' },
  ],
  assumptions: [
    'Eau liquide assimilée au liquide saturé à sa température (écart négligeable à ces pressions).',
    'La vapeur flash éventuelle est déjà déduite de la température saisie à la bâche.',
    'Rendement de chaudière constant ; eau comptée à 1000 kg/m³.',
  ],
  validity: ['Températures de 0 à 150 °C pour les condensats, 0 à 100 °C pour l’appoint.'],
});
