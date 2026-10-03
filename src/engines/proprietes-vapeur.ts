import { defineCalculator, type Formula, type Quantity, type Warning } from '@/core/types';
import { tex } from '@/core/fmt';
import { saturationP, statePH, statePT, statePx, STEAM_DOMAIN, SteamDomainError, type Saturation, type SteamState } from '@/thermo/steam';

export type ProprietesVapeurInput = {
  entree: 'pT' | 'px' | 'ph';
  p: number; // Pa absolus
  T: number; // K
  x: number; // titre en vapeur
  h: number; // J/kg
};
export type ProprietesVapeurOutput = { state: SteamState; sat: Saturation };

const PHASE: Record<SteamState['phase'], string> = {
  liquide: 'Liquide sous-refroidi (eau comprimée)',
  'liquide-sature': 'Liquide saturé',
  'vapeur-humide': 'Mélange liquide-vapeur (vapeur humide)',
  'vapeur-saturee': 'Vapeur saturée sèche',
  'vapeur-surchauffee': 'Vapeur surchauffée',
};

export const proprietesVapeur = defineCalculator<ProprietesVapeurInput, ProprietesVapeurOutput>({
  id: 'proprietes-vapeur',
  title: 'Propriétés de l’eau et de la vapeur',
  category: 'utilites',
  summary: 'Enthalpie, entropie, volume massique et état de l’eau ou de la vapeur à partir de deux grandeurs (IAPWS-IF97).',
  inputs: [
    {
      type: 'choice', key: 'entree', label: 'État défini par', default: 'pT',
      options: [{ value: 'pT', label: 'Pression + T' }, { value: 'px', label: 'Pression + titre' }, { value: 'ph', label: 'Pression + h' }],
    },
    {
      type: 'number', key: 'p', label: 'Pression', dimension: 'pressure', units: ['bar(g)', 'bar', 'kPa', 'MPa'], default: 1101325,
      min: STEAM_DOMAIN.pMin, max: STEAM_DOMAIN.pMax,
      help: 'bar(g) = pression relative (manomètre) ; bar = pression absolue.',
    },
    { type: 'number', key: 'T', label: 'Température', dimension: 'temperature', default: 250 + 273.15, min: STEAM_DOMAIN.Tmin, max: STEAM_DOMAIN.Tmax, showIf: { key: 'entree', in: ['pT'] } },
    {
      type: 'number', key: 'x', label: 'Titre en vapeur x', dimension: 'ratio', units: ['-', '%'], default: 1, min: 0, max: 1,
      help: '0 = liquide saturé, 1 = vapeur saturée sèche.', showIf: { key: 'entree', in: ['px'] },
    },
    { type: 'number', key: 'h', label: 'Enthalpie massique', dimension: 'specificEnergy', default: 2800e3, min: 0, max: 4.5e6, showIf: { key: 'entree', in: ['ph'] } },
  ],
  compute(i) {
    let st: SteamState;
    let sat: Saturation;
    try {
      sat = saturationP(i.p);
      st = i.entree === 'pT' ? statePT(i.p, i.T) : i.entree === 'px' ? statePx(i.p, i.x) : statePH(i.p, i.h);
    } catch (e) {
      if (e instanceof SteamDomainError) return { ok: false, errors: [{ message: e.message }] };
      throw e;
    }

    const warnings: Warning[] = [{ level: 'info', message: `État : ${PHASE[st.phase]}.` }];
    if (i.entree === 'pT' && Math.abs(st.T - sat.T) < 1e-3) {
      warnings.push({ level: 'info', message: 'Température égale à la saturation : l’état (p, T) est ambigu entre liquide et vapeur. Utiliser « Pression + titre ».' });
    }

    const kJ = (v: number) => tex(v / 1000);
    const pBar = tex(i.p / 1e5);
    const formulas: Formula[] = [{
      label: 'Propriétés calculées par IAPWS-IF97',
      symbolic: '(h,\\ s,\\ v) = f_{\\mathrm{IF97}}(p,\\ T)',
      substituted:
        `h = ${kJ(st.h)}\\ \\mathrm{kJ/kg},\\quad s = ${kJ(st.s)}\\ \\mathrm{kJ/(kg\\cdot K)},\\quad v = ${tex(st.v)}\\ \\mathrm{m^3/kg}\\quad (p = ${pBar}\\ \\mathrm{bar},\\ T = ${tex(st.T - 273.15)}\\ °\\mathrm{C})`,
    }];
    if (st.phase === 'vapeur-humide' && st.x !== null) {
      formulas.push({
        label: 'Vapeur humide',
        symbolic: 'h = h_f + x\\, h_{fg}',
        substituted: `h = ${kJ(sat.hf)} + ${tex(st.x)} \\times ${kJ(sat.hfg)} = ${kJ(st.h)}\\ \\mathrm{kJ/kg}`,
      });
    }
    if (st.phase === 'vapeur-surchauffee' || st.phase === 'liquide') {
      formulas.push({
        label: st.phase === 'liquide' ? 'Sous-refroidissement' : 'Surchauffe',
        symbolic: '\\Delta T = T - T_{sat}(p)',
        substituted: `\\Delta T = ${tex(st.T)} - ${tex(sat.T)} = ${tex(st.dTsat)}\\ \\mathrm{K}`,
      });
    }

    const main: Quantity[] = [{ key: 'h', label: 'Enthalpie massique h', value: st.h, dimension: 'specificEnergy' }];
    const intermediates: Quantity[] = [
      { key: 'T', label: 'Température T', value: st.T, dimension: 'temperature' },
      { key: 'Tsat', label: 'Température de saturation', value: sat.T, dimension: 'temperature' },
      { key: 'dT', label: st.dTsat < 0 ? 'Sous-refroidissement' : 'Surchauffe', value: Math.abs(st.dTsat), dimension: 'temperatureDelta' },
      ...(st.x !== null ? [{ key: 'x', label: 'Titre en vapeur x', value: st.x, dimension: 'ratio' as const }] : []),
      { key: 's', label: 'Entropie massique s', value: st.s, dimension: 'specificEntropy' },
      { key: 'v', label: 'Volume massique v', value: st.v, dimension: 'specificVolume' },
      { key: 'rho', label: 'Masse volumique ρ', value: st.rho, dimension: 'density' },
      { key: 'u', label: 'Énergie interne u', value: st.u, dimension: 'specificEnergy' },
      ...(st.cp !== null ? [{ key: 'cp', label: 'Chaleur massique c_p', value: st.cp, dimension: 'specificHeat' as const }] : []),
      { key: 'hf', label: 'Enthalpie liquide saturé h_f', value: sat.hf, dimension: 'specificEnergy' },
      { key: 'hg', label: 'Enthalpie vapeur saturée h_g', value: sat.hg, dimension: 'specificEnergy' },
      { key: 'hfg', label: 'Chaleur latente h_fg', value: sat.hfg, dimension: 'specificEnergy' },
    ];
    return { ok: true, main, intermediates, warnings, formulas, data: { state: st, sat } };
  },
  references: [
    { source: 'IAPWS, Revised Release on the IAPWS Industrial Formulation 1997 for the Thermodynamic Properties of Water and Steam (IAPWS-IF97)', section: 'régions 1, 2 et 4', note: 'TODO: source à vérifier (année de la révision citée)' },
    { source: 'Implémentation : paquet npm iapws-if97 (MIT), contrôlé contre les valeurs de vérification publiées avec IF97 (src/thermo/steam.test.ts)' },
  ],
  assumptions: [
    'Pression « bar(g) » = pression relative ; pression absolue = relative + 101 325 Pa (atmosphère normale).',
    'Enthalpie et entropie rapportées à l’origine d’IAPWS-IF97 (liquide saturé au point triple) : seules leurs différences ont un sens physique.',
    'À la saturation, l’état (p, T) est ambigu : utiliser le titre.',
  ],
  validity: [
    `Pression de ${Math.round(STEAM_DOMAIN.pMin)} Pa à ${STEAM_DOMAIN.pMax / 1e6} MPa ; température de 0 à 800 °C (régions 1, 2 et 4 d’IF97).`,
    'Hors de ce domaine (région 3 et supercritique, région 5), le calcul est refusé et non extrapolé.',
  ],
});
