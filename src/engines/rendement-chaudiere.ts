import { defineCalculator, type Formula, type Quantity, type Warning } from '@/core/types';
import { fmtNum, tex } from '@/core/fmt';
import { co2PerJoulePCI, fuel, priceOnPCI, siegertLoss } from '@/thermo/combustion';
import { steamPower } from '@/thermo/rules';
import { saturationP, saturationT } from '@/thermo/steam';
import { costFields, guarded, K0, P_ATM, perMWh, pressureField } from './shared/vapeur';

export type RendementInput = {
  methode: 'directe' | 'indirecte';
  combustible: string;
  // méthode directe
  p: number; debitVapeur: number; tAlim: number; puissanceComb: number; baseConso: 'PCS' | 'PCI';
  // méthode indirecte
  tFumees: number; tAir: number; O2: number; pertesAutres: number; puissanceUtile: number;
  // économie
  prixEnergie: number; basePrix: 'PCS' | 'PCI'; heures: number;
};
export type RendementOutput = { etaPCI: number; etaPCS: number; Q: number; gainPoint: number; co2Point: number };

const kJ = (v: number) => tex(v / 1e3);
const pct = (v: number) => tex(v * 100, 4);

export const rendementChaudiere = defineCalculator<RendementInput, RendementOutput>({
  id: 'rendement-chaudiere',
  title: 'Rendement de chaudière et pertes par les fumées',
  category: 'vapeur',
  summary: 'Rendement sur PCI et sur PCS par la méthode directe (bilan vapeur) ou indirecte (pertes fumées), et valeur d’un point de rendement en €/an et tCO2/an.',
  inputs: [
    {
      type: 'choice', key: 'methode', label: 'Méthode', default: 'indirecte',
      options: [{ value: 'indirecte', label: 'Indirecte (analyse des fumées)' }, { value: 'directe', label: 'Directe (vapeur / combustible)' }],
    },
    costFields.combustible(),
    { ...pressureField('p', 'Pression de la chaudière', 10e5 + P_ATM), showIf: { key: 'methode', in: ['directe'] } },
    { type: 'number', key: 'debitVapeur', label: 'Production de vapeur mesurée', dimension: 'massFlow', units: ['t/h', 'kg/h', 'kg/s'], default: 5000 / 3600, min: 0, showIf: { key: 'methode', in: ['directe'] } },
    { ...costFields.tAlim(), showIf: { key: 'methode', in: ['directe'] } },
    {
      type: 'number', key: 'puissanceComb', label: 'Consommation de combustible (en puissance)', dimension: 'power', units: ['kW', 'MW'], default: 3800e3, min: 1,
      help: 'Débit de combustible × pouvoir calorifique, sur la même période que la vapeur mesurée.', showIf: { key: 'methode', in: ['directe'] },
    },
    {
      type: 'choice', key: 'baseConso', label: 'Consommation exprimée sur', default: 'PCS', showIf: { key: 'methode', in: ['directe'] },
      options: [{ value: 'PCS', label: 'PCS (compteur gaz)' }, { value: 'PCI', label: 'PCI' }],
    },
    { type: 'number', key: 'tFumees', label: 'Température des fumées', dimension: 'temperature', default: 180 + K0, min: K0, max: 600 + K0, showIf: { key: 'methode', in: ['indirecte'] } },
    { type: 'number', key: 'tAir', label: 'Température de l’air comburant', dimension: 'temperature', default: 20 + K0, min: K0 - 30, max: 300 + K0, showIf: { key: 'methode', in: ['indirecte'] } },
    { type: 'number', key: 'O2', label: 'O2 dans les fumées (sec)', dimension: 'ratio', units: ['%'], default: 0.03, min: 0, max: 0.2, help: 'Lu à l’analyseur de combustion.', showIf: { key: 'methode', in: ['indirecte'] } },
    {
      type: 'number', key: 'pertesAutres', label: 'Autres pertes (parois, purges)', dimension: 'ratio', units: ['%', '-'], default: 0.01, min: 0, max: 0.3,
      help: 'Estimation à saisir : pertes par rayonnement et convection de l’enveloppe, purges.', showIf: { key: 'methode', in: ['indirecte'] },
    },
    {
      type: 'number', key: 'puissanceUtile', label: 'Puissance utile moyenne', dimension: 'power', units: ['kW', 'MW'], default: 3000e3, min: 0,
      help: 'Sert à chiffrer le gain d’un point de rendement.', showIf: { key: 'methode', in: ['indirecte'] },
    },
    costFields.prixEnergie(),
    costFields.basePrix(),
    costFields.heures(),
  ],
  compute: (i) => guarded(() => {
    const f = fuel(i.combustible);
    const ratio = f.ratio_PCI_PCS;
    const warnings: Warning[] = [];
    const formulas: Formula[] = [];
    let etaPCI: number;
    let Q: number;
    const extra: Quantity[] = [];

    if (i.methode === 'directe') {
      const sat = saturationP(i.p);
      const hFeed = saturationT(i.tAlim).hf;
      Q = steamPower({ m: i.debitVapeur, hSteam: sat.hg, hFeed });
      const firedPCI = i.baseConso === 'PCI' ? i.puissanceComb : i.puissanceComb * ratio;
      etaPCI = Q / firedPCI;
      formulas.push(
        {
          label: 'Puissance utile transmise à la vapeur',
          symbolic: 'Q = \\dot m_v \\, (h_v - h_{alim})',
          substituted: `Q = ${tex(i.debitVapeur)}\\ \\mathrm{kg/s} \\times (${kJ(sat.hg)} - ${kJ(hFeed)})\\ \\mathrm{kJ/kg} = ${tex(Q / 1e3)}\\ \\mathrm{kW}`,
          legend: [
            { symbol: '\\dot m_v', meaning: 'débit de vapeur', unit: 'kg/s' },
            { symbol: 'h_v', meaning: 'enthalpie de la vapeur saturée sèche à la pression de la chaudière', unit: 'kJ/kg' },
            { symbol: 'h_{alim}', meaning: 'enthalpie de l’eau d’alimentation', unit: 'kJ/kg' },
          ],
        },
        {
          label: 'Rendement direct sur PCI',
          symbolic: '\\eta_{PCI} = \\dfrac{Q}{P_{comb,PCI}}' + (i.baseConso === 'PCS' ? ', \\quad P_{comb,PCI} = P_{comb,PCS} \\cdot \\dfrac{PCI}{PCS}' : ''),
          substituted: (i.baseConso === 'PCS' ? `\\begin{aligned} P_{comb,PCI} &= ${tex(i.puissanceComb / 1e3)} \\times ${tex(ratio)} = ${tex(firedPCI / 1e3)}\\ \\mathrm{kW} \\\\ ` : '\\begin{aligned} ')
            + `\\eta_{PCI} &= \\dfrac{${tex(Q / 1e3)}}{${tex(firedPCI / 1e3)}} = ${pct(etaPCI)}\\ \\% \\end{aligned}`,
          legend: [{ symbol: 'P_{comb}', meaning: 'puissance du combustible consommé', unit: 'kW' }],
          note: 'Méthode directe : rapport de l’énergie utile à l’énergie entrante. Sensible à la précision des comptages vapeur et combustible.',
        },
      );
      extra.push(
        { key: 'Pc', label: 'Puissance combustible (PCI)', value: firedPCI, dimension: 'power' },
        { key: 'hv', label: 'Enthalpie de la vapeur', value: sat.hg, dimension: 'specificEnergy' },
        { key: 'ha', label: 'Enthalpie eau d’alimentation', value: hFeed, dimension: 'specificEnergy' },
      );
      if (etaPCI > 1) warnings.push({ level: 'validity', message: 'Rendement direct supérieur à 100 % sur PCI : vérifier les comptages (vapeur surévaluée ou combustible sous-évalué).' });
    } else {
      const s = siegertLoss({ fuelId: i.combustible, Tflue: i.tFumees, Tair: i.tAir, O2: i.O2 * 100 });
      etaPCI = 1 - s.q - i.pertesAutres;
      Q = i.puissanceUtile;
      formulas.push(
        {
          label: 'Pertes par les fumées (formule de Siegert)',
          symbolic: 'q_f = (T_f - T_a)\\left(\\dfrac{A_2}{21 - O_2} + B\\right)',
          substituted: `q_f = (${tex(i.tFumees - K0)} - ${tex(i.tAir - K0)}) \\times \\left(\\dfrac{${tex(s.A2)}}{21 - ${tex(i.O2 * 100)}} + ${tex(s.B)}\\right) = ${pct(s.q)}\\ \\%`,
          legend: [
            { symbol: 'T_f', meaning: 'température des fumées', unit: '°C' },
            { symbol: 'T_a', meaning: 'température de l’air comburant', unit: '°C' },
            { symbol: 'O_2', meaning: 'teneur en oxygène des fumées sèches', unit: '%' },
            { symbol: 'A_2,\\ B', meaning: `coefficients du ${f.label.toLowerCase()} (combustibles.json)` },
          ],
          note: 'Perte par chaleur sensible des fumées, en % du PCI. Plus l’excès d’air (O2) et la température des fumées sont élevés, plus la perte est grande.',
        },
        {
          label: 'Rendement indirect sur PCI',
          symbolic: '\\eta_{PCI} = 1 - q_f - q_{autres}',
          substituted: `\\eta_{PCI} = 100 - ${pct(s.q)} - ${pct(i.pertesAutres)} = ${pct(etaPCI)}\\ \\%`,
          legend: [{ symbol: 'q_{autres}', meaning: 'pertes par les parois, rayonnement et purges (estimation saisie)', unit: '%' }],
        },
      );
      extra.push({ key: 'qf', label: 'Pertes par les fumées', value: s.q, dimension: 'ratio', unit: '%' });
      if (i.tFumees < 60 + K0) {
        warnings.push({ level: 'validity', message: 'Fumées très froides : risque de condensation de la vapeur d’eau des fumées ; la formule de Siegert, qui ignore la chaleur latente, n’est plus représentative.' });
      }
    }

    if (!(etaPCI > 0)) return { ok: false, errors: [{ message: 'Rendement calculé nul ou négatif : vérifier les données saisies.' }] };
    const etaPCS = etaPCI * ratio;
    const pricePCI = priceOnPCI(i.prixEnergie, i.basePrix, i.combustible);
    const co2 = co2PerJoulePCI(i.combustible);
    const fuelYear = (Q * i.heures) / etaPCI;
    const saved = (deta: number) => Q * i.heures * (1 / etaPCI - 1 / (etaPCI + deta));
    const gainPoint = saved(0.01) * pricePCI;
    const co2Point = saved(0.01) * co2;

    formulas.push(
      {
        label: 'Rendement sur PCS',
        symbolic: '\\eta_{PCS} = \\eta_{PCI} \\cdot \\dfrac{PCI}{PCS}',
        substituted: `\\eta_{PCS} = ${pct(etaPCI)} \\times ${tex(ratio)} = ${pct(etaPCS)}\\ \\%`,
        note: `PCI/PCS = ${fmtNum(ratio)} pour le ${f.label.toLowerCase()} (combustibles.json, à vérifier selon le contrat de fourniture).`,
      },
      {
        label: 'Valeur d’un point de rendement',
        symbolic: '\\Delta E = Q \\, t \\left(\\dfrac{1}{\\eta} - \\dfrac{1}{\\eta + 0{,}01}\\right), \\quad G = \\Delta E \\cdot p_{PCI}',
        substituted: `\\begin{aligned} \\Delta E &= ${tex(Q / 1e3)}\\ \\mathrm{kW} \\times ${tex(i.heures / 3600)}\\ \\mathrm{h} \\times \\left(\\dfrac{1}{${tex(etaPCI, 4)}} - \\dfrac{1}{${tex(etaPCI + 0.01, 4)}}\\right) = ${tex(saved(0.01) / 3.6e9)}\\ \\mathrm{MWh} \\\\ G &= ${tex(saved(0.01) / 3.6e9)}\\ \\mathrm{MWh} \\times ${tex(perMWh(pricePCI))}\\ \\text{€/MWh} = ${tex(gainPoint)}\\ \\text{€/an} \\end{aligned}`,
        legend: [
          { symbol: 'Q', meaning: 'puissance utile moyenne', unit: 'kW' },
          { symbol: 't', meaning: 'durée de fonctionnement annuelle', unit: 'h' },
          { symbol: 'p_{PCI}', meaning: 'prix du combustible ramené au PCI', unit: '€/MWh' },
        ],
        note: 'À besoin utile constant, gagner un point de rendement réduit la consommation de combustible dans le rapport des inverses des rendements.',
      },
    );

    const main: Quantity[] = [
      { key: 'etaPCI', label: 'Rendement sur PCI', value: etaPCI, dimension: 'ratio', unit: '%' },
      { key: 'etaPCS', label: 'Rendement sur PCS', value: etaPCS, dimension: 'ratio', unit: '%' },
      { key: 'gain', label: 'Gain d’un point (€/an)', value: gainPoint, dimension: 'cost' },
    ];
    const intermediates: Quantity[] = [
      ...extra,
      { key: 'Q', label: 'Puissance utile', value: Q, dimension: 'power' },
      { key: 'E', label: 'Combustible consommé par an (PCI)', value: fuelYear, dimension: 'energy', unit: 'MWh' },
      { key: 'C', label: 'Facture combustible (€/an)', value: fuelYear * pricePCI, dimension: 'cost' },
      { key: 'co2p', label: 'CO2 évité par point gagné, par an', value: co2Point, dimension: 'mass', unit: 't' },
      { key: 'pPCI', label: 'Prix du combustible sur PCI', value: pricePCI, dimension: 'energyPrice' },
    ];

    const display = {
      type: 'table' as const,
      title: 'Gains selon l’amélioration du rendement',
      columns: [
        { label: 'Rendement PCI visé', dimension: 'ratio' as const, unit: '%' },
        { label: 'Combustible économisé', dimension: 'energy' as const, unit: 'MWh' },
        { label: 'Économie', dimension: 'cost' as const, unit: '€' },
        { label: 'CO2 évité', dimension: 'mass' as const, unit: 't' },
      ],
      rows: [0, 1, 2, 3, 5].map((k) => {
        const e = saved(k / 100);
        return [etaPCI + k / 100, e, e * pricePCI, e * co2];
      }),
      highlight: 0,
      note: 'Économies annuelles par rapport au rendement actuel, à puissance utile constante.',
    };

    return {
      ok: true, main, intermediates, warnings, formulas, display,
      conclusion: `Rendement de ${fmtNum(etaPCI * 100, 3)} % sur PCI (${fmtNum(etaPCS * 100, 3)} % sur PCS). Chaque point gagné économise ${fmtNum(gainPoint, 3)} €/an et ${fmtNum(co2Point / 1e3, 3)} t de CO2 par an, sur une facture de ${fmtNum(fuelYear * pricePCI, 3)} €/an.`,
      data: { etaPCI, etaPCS, Q, gainPoint, co2Point },
    };
  }),
  method: [
    'Le rendement d’une chaudière se mesure de deux façons. La méthode directe compare l’énergie reçue par la vapeur à l’énergie du combustible consommé : simple, mais elle exige des comptages fiables de la vapeur et du combustible.',
    'La méthode indirecte part de 100 % et retranche les pertes. La principale est la chaleur emportée par les fumées, estimée par la formule de Siegert à partir de la température des fumées et de leur teneur en oxygène (image de l’excès d’air), lus à l’analyseur.',
    'Le rendement est exprimé sur PCI (convention des constructeurs) et sur PCS (base des factures de gaz). La valeur d’un point de rendement chiffre l’intérêt d’un réglage de combustion, d’un économiseur ou d’une réduction de l’excès d’air.',
  ],
  scope: 'La méthode indirecte ne compte ni les imbrûlés (CO, suies) ni la chaleur latente des fumées (chaudières à condensation). Ne remplace pas un essai de réception normalisé.',
  related: ['cout-vapeur', 'purge-chaudiere', 'proprietes-vapeur'],
  references: [
    { source: 'Formule de Siegert (forme O2), coefficients A2 et B par combustible', section: '1. BImSchV (Allemagne)', note: 'TODO: source à vérifier (annexe et version exactes)' },
    { source: 'GIEC 2006, Guidelines for National GHG Inventories, vol. 2, chap. 2, tableau 2.2', section: 'facteurs d’émission CO2 par défaut' },
    { source: 'IAPWS-IF97 pour les enthalpies (méthode directe)', note: 'TODO: source à vérifier (année de la révision citée)' },
  ],
  assumptions: [
    'Méthode directe : vapeur saturée sèche, eau d’alimentation assimilée au liquide saturé à sa température.',
    'Méthode indirecte : pertes par imbrûlés négligées ; autres pertes saisies comme estimation.',
    'Rapports PCI/PCS issus de combustibles.json (à vérifier).',
  ],
  validity: [
    'Siegert : combustion sans condensation des fumées, O2 entre 0 et 20 %.',
    'Combustibles pour lesquels les coefficients de Siegert sont renseignés (pas le fioul lourd).',
  ],
});
