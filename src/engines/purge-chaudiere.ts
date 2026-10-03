import { defineCalculator, type Formula, type Quantity, type Warning } from '@/core/types';
import { fmtNum, tex } from '@/core/fmt';
import { blowdown, flashSteam } from '@/thermo/rules';
import { saturationP } from '@/thermo/steam';
import { barg, costFields, costFormula, guarded, P_ATM, perMWh, pressureField, steamCost, type CostInput } from './shared/vapeur';

export type PurgeInput = CostInput & {
  p: number; debitVapeur: number; tdsAlim: number; tdsMax: number; coutEau: number; heures: number;
  recup: 'aucune' | 'flash'; pFlash: number;
};
export type PurgeOutput = { purgePerSteam: number; mPurge: number; powerLost: number; costYear: number; recovered: number };

const RHO_EAU = 1000; // kg/m³ : volume d'eau d'appoint, eau froide assimilée à 1000 kg/m³
const kJ = (v: number) => tex(v / 1e3);

export const purgeChaudiere = defineCalculator<PurgeInput, PurgeOutput>({
  id: 'purge-chaudiere',
  title: 'Purge de déconcentration de chaudière',
  category: 'vapeur',
  summary: 'Débit de purge imposé par la salinité de l’eau, énergie et eau perdues, et gain d’une récupération par ballon flash.',
  inputs: [
    pressureField('p', 'Pression de la chaudière', 10e5 + P_ATM),
    { type: 'number', key: 'debitVapeur', label: 'Production de vapeur', dimension: 'massFlow', units: ['t/h', 'kg/h', 'kg/s'], default: 5000 / 3600, min: 0 },
    { type: 'number', key: 'tdsAlim', label: 'Salinité (TDS) de l’eau d’alimentation', dimension: 'concentration', default: 200e-6, min: 1e-9, help: 'Sels dissous totaux de l’eau entrant en chaudière (appoint + condensats).' },
    { type: 'number', key: 'tdsMax', label: 'TDS maximal admissible en chaudière', dimension: 'concentration', default: 3000e-6, min: 1e-9, help: 'Consigne du constructeur ou du traiteur d’eau.' },
    {
      type: 'choice', key: 'recup', label: 'Récupération sur la purge', default: 'aucune',
      options: [{ value: 'aucune', label: 'Aucune (purge à l’égout)' }, { value: 'flash', label: 'Ballon flash vers la bâche' }],
    },
    { ...pressureField('pFlash', 'Pression du ballon flash', 0.2e5 + P_ATM), showIf: { key: 'recup', in: ['flash'] } },
    costFields.heures(),
    costFields.tAlim(),
    costFields.rendement(),
    costFields.combustible(),
    costFields.prixEnergie(),
    costFields.basePrix(),
    { type: 'number', key: 'coutEau', label: 'Coût de l’eau d’appoint traitée', dimension: 'volumePrice', default: 3, min: 0, help: 'Eau, traitement et rejet, par m³. Estimation à adapter au site.' },
  ],
  compute: (i) => guarded(() => {
    const sat = saturationP(i.p);
    const cost = steamCost(i, sat.hg);
    const b = blowdown({ tdsFeed: i.tdsAlim, tdsBoiler: i.tdsMax, mSteam: i.debitVapeur, pBoiler: i.p, hFeed: cost.hFeed });
    const warnings: Warning[] = [];
    let recovered = 0;
    const formulas: Formula[] = [
      {
        label: 'Bilan des sels dissous',
        symbolic: '\\dfrac{\\dot m_p}{\\dot m_v} = \\dfrac{c_a}{c_c - c_a}',
        substituted: `\\dfrac{\\dot m_p}{\\dot m_v} = \\dfrac{${tex(i.tdsAlim * 1e6)}}{${tex(i.tdsMax * 1e6)} - ${tex(i.tdsAlim * 1e6)}} = ${tex(b.purgePerSteam, 4)}`,
        legend: [
          { symbol: 'c_a', meaning: 'TDS de l’eau d’alimentation', unit: 'ppm' },
          { symbol: 'c_c', meaning: 'TDS maintenu dans la chaudière', unit: 'ppm' },
          { symbol: '\\dot m_p', meaning: 'débit de purge', unit: 'kg/h' },
          { symbol: '\\dot m_v', meaning: 'débit de vapeur', unit: 'kg/h' },
        ],
        note: 'Les sels entrent avec l’eau d’alimentation (débit vapeur + purge) et ne sortent que par la purge, la vapeur étant supposée pure.',
      },
      {
        label: 'Débit de purge',
        symbolic: '\\dot m_p = \\dfrac{\\dot m_p}{\\dot m_v} \\cdot \\dot m_v',
        substituted: `\\dot m_p = ${tex(b.purgePerSteam, 4)} \\times ${tex(i.debitVapeur * 3600)} = ${tex(b.mPurge * 3600)}\\ \\mathrm{kg/h}`,
      },
      {
        label: 'Puissance évacuée avec la purge',
        symbolic: 'P_p = \\dot m_p \\, (h_f(p) - h_{alim})',
        substituted: `P_p = ${tex(b.mPurge)}\\ \\mathrm{kg/s} \\times (${kJ(sat.hf)} - ${kJ(cost.hFeed)})\\ \\mathrm{kJ/kg} = ${tex(b.powerLost / 1e3)}\\ \\mathrm{kW}`,
        legend: [
          { symbol: 'h_f(p)', meaning: 'enthalpie de l’eau saturée dans la chaudière', unit: 'kJ/kg' },
          { symbol: 'h_{alim}', meaning: 'enthalpie de l’eau d’alimentation', unit: 'kJ/kg' },
        ],
        note: 'L’eau purgée a été chauffée de la température d’alimentation jusqu’à la saturation de la chaudière, puis rejetée.',
      },
    ];

    if (i.recup === 'flash') {
      const f = flashSteam({ pHigh: i.p, pLow: i.pFlash });
      const mF = f.xFlash * b.mPurge;
      recovered = Math.max(0, mF * (f.low.hg - cost.hFeed));
      formulas.push({
        label: 'Récupération par ballon flash',
        symbolic: 'P_r = x \\, \\dot m_p \\, (h_g(p_f) - h_{alim}), \\quad x = \\dfrac{h_f(p) - h_f(p_f)}{h_{fg}(p_f)}',
        substituted: `\\begin{aligned} x &= \\dfrac{${kJ(sat.hf)} - ${kJ(f.low.hf)}}{${kJ(f.low.hfg)}} = ${tex(f.xFlash, 4)} \\\\ P_r &= ${tex(mF)}\\ \\mathrm{kg/s} \\times (${kJ(f.low.hg)} - ${kJ(cost.hFeed)})\\ \\mathrm{kJ/kg} = ${tex(recovered / 1e3)}\\ \\mathrm{kW} \\end{aligned}`,
        legend: [
          { symbol: 'p_f', meaning: 'pression du ballon flash', unit: 'bar' },
          { symbol: 'h_g(p_f)', meaning: 'enthalpie de la vapeur flash', unit: 'kJ/kg' },
        ],
        note: 'La vapeur flash est condensée dans la bâche alimentaire : elle restitue toute son enthalpie au-delà de celle de l’eau d’alimentation. Le liquide résiduel part à l’égout (sa chaleur pourrait encore être récupérée par échangeur).',
      });
    }

    const netPower = b.powerLost - recovered;
    const fuelYear = (netPower * i.heures) / i.rendement;
    const energyCost = fuelYear * cost.pricePCI;
    const waterYear = (b.mPurge * i.heures) / RHO_EAU;
    const waterCost = waterYear * i.coutEau;
    const costYear = energyCost + waterCost;

    formulas.push({
      label: 'Coût annuel de la purge',
      symbolic: 'C = \\dfrac{(P_p - P_r)\\, t}{\\eta_{PCI}}\\, p_{PCI} + \\dfrac{\\dot m_p\\, t}{\\rho}\\, c_{eau}',
      substituted: `\\begin{aligned} C &= \\dfrac{${tex(netPower / 1e3)}\\ \\mathrm{kW} \\times ${tex(i.heures / 3600)}\\ \\mathrm{h}}{${tex(i.rendement)}} \\times ${tex(perMWh(cost.pricePCI))}\\ \\text{€/MWh} + ${tex(waterYear)}\\ \\mathrm{m^3} \\times ${tex(i.coutEau)}\\ \\text{€/m}^3 \\\\ &= ${tex(energyCost)} + ${tex(waterCost)} = ${tex(costYear)}\\ \\text{€/an} \\end{aligned}`,
      legend: [
        { symbol: 'P_r', meaning: 'puissance récupérée (0 sans récupération)', unit: 'kW' },
        { symbol: 't', meaning: 'durée de fonctionnement annuelle', unit: 'h' },
        { symbol: 'c_{eau}', meaning: 'coût de l’eau d’appoint traitée', unit: '€/m³' },
        { symbol: '\\rho', meaning: 'masse volumique de l’eau, prise à 1000', unit: 'kg/m³' },
      ],
    });
    formulas.push(costFormula(cost, sat.hg, i));

    if (b.purgePerSteam > 0.1) warnings.push({ level: 'info', message: `Taux de purge supérieur à 10 % : traitement d’eau ou retour de condensats à examiner.` });

    const main: Quantity[] = [
      { key: 'taux', label: 'Taux de purge (rapporté à la vapeur)', value: b.purgePerSteam, dimension: 'ratio', unit: '%' },
      { key: 'mp', label: 'Débit de purge', value: b.mPurge, dimension: 'massFlow', unit: 'kg/h' },
      { key: 'cout', label: 'Coût annuel (€/an)', value: costYear, dimension: 'cost' },
    ];
    const intermediates: Quantity[] = [
      { key: 'Tsat', label: 'Température de saturation chaudière', value: sat.T, dimension: 'temperature' },
      { key: 'hf', label: 'Enthalpie eau chaudière h_f', value: sat.hf, dimension: 'specificEnergy' },
      { key: 'ha', label: 'Enthalpie eau d’alimentation', value: cost.hFeed, dimension: 'specificEnergy' },
      { key: 'Pp', label: 'Puissance évacuée par la purge', value: b.powerLost, dimension: 'power' },
      ...(i.recup === 'flash' ? [{ key: 'Pr', label: 'Puissance récupérée (flash)', value: recovered, dimension: 'power' as const }] : []),
      { key: 'Ppct', label: 'Part de la chaleur produite', value: netPower / (i.debitVapeur * (sat.hg - cost.hFeed) || 1), dimension: 'ratio', unit: '%' },
      { key: 'E', label: 'Combustible perdu par an', value: fuelYear, dimension: 'energy', unit: 'MWh' },
      { key: 'Ce', label: 'Coût énergie (€/an)', value: energyCost, dimension: 'cost' },
      { key: 'V', label: 'Eau purgée par an', value: waterYear, dimension: 'volume' },
      { key: 'Cw', label: 'Coût eau (€/an)', value: waterCost, dimension: 'cost' },
      { key: 'co2', label: 'CO2 émis par an', value: fuelYear * cost.co2PCI, dimension: 'mass', unit: 't' },
    ];

    const tdsList = [2000, 2500, 3000, 3500, 4000, 5000].map((v) => v * 1e-6).filter((v) => v > i.tdsAlim);
    if (!tdsList.some((v) => Math.abs(v - i.tdsMax) < 1e-12)) tdsList.push(i.tdsMax);
    tdsList.sort((a, b2) => a - b2);
    const display = {
      type: 'table' as const,
      title: 'Effet de la consigne de TDS en chaudière',
      columns: [
        { label: 'TDS chaudière', dimension: 'concentration' as const },
        { label: 'Taux de purge', dimension: 'ratio' as const, unit: '%' },
        { label: 'Débit de purge', dimension: 'massFlow' as const, unit: 'kg/h' },
        { label: 'Puissance perdue', dimension: 'power' as const },
      ],
      rows: tdsList.map((t) => {
        const r = blowdown({ tdsFeed: i.tdsAlim, tdsBoiler: t, mSteam: i.debitVapeur, pBoiler: i.p, hFeed: cost.hFeed });
        return [t, r.purgePerSteam, r.mPurge, r.powerLost];
      }),
      highlight: tdsList.findIndex((t) => Math.abs(t - i.tdsMax) < 1e-12),
      note: 'Une régulation automatique de purge permet de travailler au plus près de la consigne maximale.',
    };

    return {
      ok: true, main, intermediates, warnings, formulas, display,
      conclusion: `Avec ${fmtNum(i.tdsAlim * 1e6, 3)} ppm en alimentation et ${fmtNum(i.tdsMax * 1e6, 3)} ppm admis, il faut purger ${fmtNum(b.purgePerSteam * 100, 3)} % de la vapeur produite, soit ${fmtNum(b.mPurge * 3600, 3)} kg/h à ${barg(i.p)} : ${fmtNum(costYear, 3)} €/an d’énergie et d’eau${i.recup === 'flash' ? `, après récupération de ${fmtNum(recovered / 1e3, 3)} kW par ballon flash` : ''}.`,
      data: { purgePerSteam: b.purgePerSteam, mPurge: b.mPurge, powerLost: b.powerLost, costYear, recovered },
    };
  }),
  method: [
    'L’eau d’alimentation apporte des sels dissous qui ne partent pas avec la vapeur : ils se concentrent dans la chaudière. Pour rester sous la concentration admissible, on évacue en continu une partie de l’eau de chaudière : c’est la purge de déconcentration.',
    'Un bilan de matière sur les sels donne le débit de purge nécessaire. Cette eau a été portée à la température de saturation de la chaudière : sa chaleur part avec elle, ainsi que l’eau traitée qu’il faut remplacer.',
    'Une partie de cette chaleur peut être récupérée : la purge détendue dans un ballon flash produit de la vapeur basse pression, renvoyée à la bâche alimentaire.',
  ],
  scope: 'Ne traite pas la purge de fond (extractions ponctuelles des boues) ni le dimensionnement de la vanne ou du ballon. La salinité réelle se mesure le plus souvent par conductivité : la conversion conductivité → TDS dépend de l’eau.',
  related: ['vapeur-flash', 'retour-condensats', 'cout-vapeur'],
  references: [
    { source: 'Bilan de matière sur les sels dissous et bilan d’énergie (relations générales)', section: 'pas de norme associée' },
    { source: 'IAPWS-IF97 pour les enthalpies', note: 'TODO: source à vérifier (année de la révision citée)' },
  ],
  assumptions: [
    'Vapeur exempte de sels (pas d’entraînement de gouttelettes).',
    'Purge prélevée en eau saturée à la pression de la chaudière, rejetée sans autre récupération que celle choisie.',
    'Eau d’appoint comptée à 1000 kg/m³ ; coût de l’eau saisi comme estimation.',
  ],
  validity: ['TDS d’alimentation strictement inférieur au TDS admissible.', 'Pressions du domaine du module vapeur (612 Pa à 16 MPa).'],
});
