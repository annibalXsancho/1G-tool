import { defineCalculator, type Quantity, type Warning } from '@/core/types';
import { fmtNum, tex } from '@/core/fmt';
import { flashSteam } from '@/thermo/rules';
import { saturationP, statePT } from '@/thermo/steam';
import { barg, costFields, costFormula, guarded, K0, P_ATM, pressureField, steamCost, type CostInput } from './shared/vapeur';

export type VapeurFlashInput = CostInput & {
  pHaute: number; pBasse: number; debit: number;
  etat: 'sature' | 'sous-refroidi'; tCond: number; heures: number;
};
export type VapeurFlashOutput = { xFlash: number; mFlash: number; hCondensate: number; valueYear: number };

const kJ = (v: number) => tex(v / 1e3);

export const vapeurFlash = defineCalculator<VapeurFlashInput, VapeurFlashOutput>({
  id: 'vapeur-flash',
  title: 'Vapeur flash (revaporisation des condensats)',
  category: 'vapeur',
  summary: 'Part de vapeur libérée quand un condensat chaud est détendu à plus basse pression, et sa valeur annuelle si elle est récupérée.',
  inputs: [
    pressureField('pHaute', 'Pression des condensats (amont purgeur)', 10e5 + P_ATM, 'Pression de la vapeur dans l’équipement purgé.'),
    pressureField('pBasse', 'Pression du ballon flash / réseau retour', 0.5e5 + P_ATM, '0 bar(g) = retour à l’atmosphère.'),
    { type: 'number', key: 'debit', label: 'Débit de condensats', dimension: 'massFlow', units: ['kg/h', 't/h', 'kg/s'], default: 2000 / 3600, min: 0 },
    {
      type: 'choice', key: 'etat', label: 'Condensat en amont', default: 'sature',
      options: [{ value: 'sature', label: 'Saturé (purgeur flotteur, thermodynamique)' }, { value: 'sous-refroidi', label: 'Sous-refroidi (température connue)' }],
    },
    { type: 'number', key: 'tCond', label: 'Température du condensat', dimension: 'temperature', default: 160 + K0, min: K0 + 0.01, max: 350 + K0, showIf: { key: 'etat', in: ['sous-refroidi'] } },
    costFields.heures(),
    costFields.tAlim(),
    costFields.rendement(),
    costFields.combustible(),
    costFields.prixEnergie(),
    costFields.basePrix(),
  ],
  compute: (i) => guarded(() => {
    const high = saturationP(i.pHaute);
    if (i.etat === 'sous-refroidi' && i.tCond > high.T) {
      return { ok: false, errors: [{ key: 'tCond', message: `Un condensat liquide à ${barg(i.pHaute)} ne peut dépasser ${fmtNum(high.T - K0)} °C.` }] };
    }
    const hCondensate = i.etat === 'sature' ? high.hf : statePT(i.pHaute, i.tCond).h;
    const r = flashSteam({ pHigh: i.pHaute, pLow: i.pBasse, hCondensate });
    const { low } = r;
    const mFlash = r.xFlash * i.debit;
    const mLiquid = i.debit - mFlash;
    const latent = mFlash * low.hfg;
    // Valeur : la vapeur flash remplace de la vapeur vive produite à la pression basse.
    const c = steamCost(i, low.hg);
    const valueYear = mFlash * i.heures * c.costPerKg;
    const warnings: Warning[] = [];
    if (r.xFlash === 0) warnings.push({ level: 'info', message: 'Le condensat est déjà sous la température de saturation à la pression basse : pas de revaporisation.' });
    if (i.pBasse < P_ATM) warnings.push({ level: 'info', message: 'Pression basse inférieure à l’atmosphère : ballon sous vide.' });
    if (i.debit === 0) warnings.push({ level: 'info', message: 'Débit nul : aucune vapeur flash.' });

    const main: Quantity[] = [
      { key: 'x', label: 'Fraction de vapeur flash', value: r.xFlash, dimension: 'ratio', unit: '%' },
      { key: 'mFlash', label: 'Débit de vapeur flash', value: mFlash, dimension: 'massFlow', unit: 'kg/h' },
      { key: 'valeur', label: 'Valeur annuelle (€/an)', value: valueYear, dimension: 'cost' },
    ];
    const intermediates: Quantity[] = [
      { key: 'Th', label: 'Température de saturation amont', value: high.T, dimension: 'temperature' },
      { key: 'Tl', label: 'Température de saturation aval', value: low.T, dimension: 'temperature' },
      { key: 'hc', label: 'Enthalpie du condensat h_c', value: hCondensate, dimension: 'specificEnergy' },
      { key: 'hfl', label: 'Enthalpie liquide saturé aval h_f', value: low.hf, dimension: 'specificEnergy' },
      { key: 'hfgl', label: 'Chaleur latente aval h_fg', value: low.hfg, dimension: 'specificEnergy' },
      { key: 'mLiq', label: 'Débit de condensat restant liquide', value: mLiquid, dimension: 'massFlow', unit: 'kg/h' },
      { key: 'Q', label: 'Puissance latente de la vapeur flash', value: latent, dimension: 'power' },
      { key: 'cv', label: 'Coût de la vapeur basse pression', value: c.costPerKg, dimension: 'massPrice' },
      { key: 'E', label: 'Combustible évité par an', value: mFlash * i.heures * c.fuelPerKg, dimension: 'energy', unit: 'MWh' },
      { key: 'co2', label: 'CO2 évité par an', value: mFlash * i.heures * c.co2PerKg, dimension: 'mass', unit: 't' },
    ];

    const levels = [0, 0.5, 1, 2, 3, 4, 5, 7].map((b) => b * 1e5 + P_ATM).filter((p) => p < i.pHaute);
    if (!levels.some((p) => Math.abs(p - i.pBasse) < 1)) levels.push(i.pBasse);
    levels.sort((a, b) => a - b);
    const display = {
      type: 'table' as const,
      chartColumn: 2,
      title: 'Fraction flash selon la pression basse',
      columns: [
        { label: 'Pression basse', dimension: 'pressure' as const, unit: 'bar(g)' },
        { label: 'T saturation', dimension: 'temperature' as const, unit: '°C' },
        { label: 'Fraction flash', dimension: 'ratio' as const, unit: '%' },
        { label: 'Débit flash', dimension: 'massFlow' as const, unit: 'kg/h' },
      ],
      rows: levels.map((p) => {
        const f = flashSteam({ pHigh: i.pHaute, pLow: p, hCondensate });
        return [p, f.low.T, f.xFlash, f.xFlash * i.debit];
      }),
      highlight: levels.findIndex((p) => Math.abs(p - i.pBasse) < 1),
      note: 'Plus la pression du ballon flash est basse, plus la revaporisation est forte, mais moins la vapeur récupérée est utile (température plus basse).',
    };

    return {
      ok: true, main, intermediates, warnings, display,
      formulas: [
        {
          label: 'Bilan d’énergie de la détente (isenthalpique)',
          symbolic: 'x = \\dfrac{h_c - h_f(p_2)}{h_{fg}(p_2)}',
          substituted: `x = \\dfrac{${kJ(hCondensate)} - ${kJ(low.hf)}}{${kJ(low.hfg)}} = ${tex(r.xFlash, 4)}${r.xFlash === 0 ? '\\quad(\\text{numérateur} \\le 0 \\Rightarrow x = 0)' : ''}`,
          legend: [
            { symbol: 'h_c', meaning: i.etat === 'sature' ? 'enthalpie du condensat, liquide saturé à la pression amont' : 'enthalpie du condensat sous-refroidi', unit: 'kJ/kg' },
            { symbol: 'h_f(p_2)', meaning: 'enthalpie du liquide saturé à la pression basse', unit: 'kJ/kg' },
            { symbol: 'h_{fg}(p_2)', meaning: 'chaleur latente de vaporisation à la pression basse', unit: 'kJ/kg' },
            { symbol: 'x', meaning: 'fraction massique de vapeur après détente' },
          ],
          note: 'La détente dans le purgeur ou la vanne est adiabatique et sans travail : l’enthalpie se conserve. L’excédent d’enthalpie par rapport au liquide saturé aval vaporise une partie du condensat.',
        },
        {
          label: 'Débit de vapeur flash',
          symbolic: '\\dot m_{flash} = x \\cdot \\dot m_c',
          substituted: `\\dot m_{flash} = ${tex(r.xFlash, 4)} \\times ${tex(i.debit * 3600)}\\ \\mathrm{kg/h} = ${tex(mFlash * 3600)}\\ \\mathrm{kg/h}`,
          legend: [{ symbol: '\\dot m_c', meaning: 'débit de condensats', unit: 'kg/h' }],
        },
        costFormula(c, low.hg, i),
        {
          label: 'Valeur annuelle de la vapeur flash récupérée',
          symbolic: 'V = \\dot m_{flash} \\cdot t \\cdot c_v',
          substituted: `V = ${tex(mFlash * 3600)}\\ \\mathrm{kg/h} \\times ${tex(i.heures / 3600)}\\ \\mathrm{h} \\times ${tex(c.costPerKg * 1e3)}\\ \\text{€/t} \\div 1000 = ${tex(valueYear)}\\ \\text{€/an}`,
          legend: [
            { symbol: 't', meaning: 'durée de fonctionnement annuelle', unit: 'h' },
            { symbol: 'c_v', meaning: 'coût de la vapeur basse pression qu’elle remplace', unit: '€/t' },
          ],
        },
      ],
      conclusion: `Détendu de ${barg(i.pHaute)} à ${barg(i.pBasse)}, le condensat libère ${fmtNum(r.xFlash * 100, 3)} % de vapeur flash, soit ${fmtNum(mFlash * 3600, 3)} kg/h. Récupérée, elle vaut ${fmtNum(valueYear, 3)} €/an.`,
      data: { xFlash: r.xFlash, mFlash, hCondensate, valueYear },
    };
  }),
  method: [
    'Un condensat évacué par un purgeur est de l’eau à la température de saturation de la vapeur qu’il a quittée. Quand il passe à une pression plus basse, sa température de saturation chute : il contient plus de chaleur que ce que le liquide peut garder à la nouvelle pression.',
    'Cet excédent vaporise instantanément une partie du condensat : c’est la vapeur flash (ou de revaporisation). La détente étant adiabatique et sans travail, l’enthalpie totale se conserve, ce qui donne directement la fraction vaporisée.',
    'Récupérée dans un ballon flash et réinjectée dans un réseau basse pression, cette vapeur remplace de la vapeur vive : sa valeur est celle de la vapeur qu’on n’a pas à produire.',
  ],
  scope: 'Ne dimensionne pas le ballon flash ni les tuyauteries (vitesse de la vapeur, entraînement d’eau). Suppose qu’un besoin basse pression existe pour toute la vapeur récupérée.',
  related: ['retour-condensats', 'purgeur-defaillant', 'cout-vapeur'],
  references: [
    { source: 'Bilan d’énergie d’une détente isenthalpique (thermodynamique appliquée)', section: 'pas de norme associée' },
    { source: 'IAPWS-IF97 pour les enthalpies de saturation', note: 'TODO: source à vérifier (année de la révision citée)' },
  ],
  assumptions: [
    'Détente adiabatique, sans travail ni pertes thermiques : h conservée.',
    'Séparation parfaite de la vapeur et du liquide dans le ballon flash.',
    'Vapeur flash valorisée au coût de production d’une vapeur saturée à la pression basse (eau d’alimentation et rendement saisis).',
  ],
  validity: ['Pressions de 612 Pa à 16 MPa (domaine du module vapeur).', 'Condensat liquide en amont (non surchauffé).'],
});
