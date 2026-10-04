// Réseau hydraulique en série : pertes linéiques (Darcy-Weisbach) et singulières (K·ρv²/2), cumul le long du réseau,
// hauteur statique, contrôles de vitesse et de perte linéique, note de calcul. Pur, en SI (entrées ergonomiques : m³/h, mm, m).
import { hydraulique } from '@/data';
import { fmtNum, tex } from '@/core/fmt';
import type { Formula } from '@/core/types';
import { G, area, darcy, frictionFactor, reynolds, swameeJain, type Method, type Regime } from './friction';
import type { Fluid } from './fluid';
import { singularityK, type SingInput } from './singularities';

export type Section = {
  id: string;
  nom: string;
  D_mm: number;
  L_m: number;
  /** Clé de `hydraulique.rugosites`, ou 'libre' avec `eps_mm`. */
  materiau: string;
  eps_mm?: number;
  /** Débit propre au tronçon (m³/h) ; vide = débit du réseau. */
  Q_m3h?: number;
  /** Dénivelé : cote de fin − cote de début (m), positif en montée. */
  dz_m: number;
  sings: SingInput[];
};
export type Net = { fluid: Fluid; Q_m3h: number; method: Method; /** Coefficients : valeur par défaut, bas ou haut de la plage. */ kMode: 'defaut' | 'min' | 'max'; aspiration?: boolean; sections: Section[] };

export type Item = { name: string; qty: number; K: number; Kmin: number; Kmax: number; dp: number; warning?: string };
export type SectionResult = {
  section: Section;
  Q: number; v: number; Re: number; regime: Regime; f: number; eps: number;
  /** Perte linéique par mètre (Pa/m). */
  R: number;
  dpLin: number; dpSing: number; dpFrict: number; dpStatic: number;
  Ktot: number;
  /** Longueur équivalente des singularités (m) : ΣK·D/f. */
  Leq: number;
  items: Item[];
  /** Pression cumulée (frottement seul, Pa) au début et à la fin du tronçon. */
  cumStart: number; cumEnd: number;
  /** Fourchette de ΔP singulières (Pa) selon la plage des coefficients. */
  dpSingMin: number; dpSingMax: number;
};

export type Level = 'ok' | 'warn' | 'ko' | 'info';
export type Check = { id: string; label: string; level: Level; detail: string };
export type NetResult = {
  sections: SectionResult[];
  dpLin: number; dpSing: number; dpFrict: number; dpStatic: number; dpTotal: number;
  /** Hauteur manométrique de frottement (m de fluide) et totale. */
  hFrict: number; hTotal: number;
  /** Part des singularités dans les pertes de frottement (0 à 1). */
  shareSing: number;
  Ktot: number;
  /** Fourchette des pertes de frottement (Pa) selon la plage des K. */
  dpFrictMin: number; dpFrictMax: number;
  checks: Check[];
  formulas: Formula[];
  conclusion: string;
};

const C = hydraulique.criteres;
const f4 = (v: number, s = 4) => fmtNum(v, s);
export const epsOf = (s: Section): number => (s.materiau === 'libre' ? (s.eps_mm ?? 0) : hydraulique.rugosites[s.materiau]?.eps_mm ?? 0) / 1000;

export function validate(net: Net): string[] {
  const e: string[] = [];
  if (net.sections.length === 0) e.push('Ajoutez au moins un tronçon.');
  if (!(net.fluid.rho > 0) || !(net.fluid.nu > 0)) e.push('Masse volumique et viscosité du fluide doivent être strictement positives.');
  net.sections.forEach((s, i) => {
    const n = s.nom || `Tronçon ${i + 1}`;
    if (!(s.D_mm > 0)) e.push(`${n} : le diamètre intérieur doit être strictement positif.`);
    if (!(s.L_m >= 0)) e.push(`${n} : la longueur ne peut pas être négative.`);
    if (!((s.Q_m3h ?? net.Q_m3h) > 0)) e.push(`${n} : le débit doit être strictement positif.`);
    if (s.materiau === 'libre' && !((s.eps_mm ?? 0) >= 0)) e.push(`${n} : rugosité invalide.`);
    if (s.materiau !== 'libre' && !hydraulique.rugosites[s.materiau]) e.push(`${n} : matériau inconnu.`);
    s.sings.forEach((x) => { if (!(x.qty >= 0)) e.push(`${n} : quantité négative pour une singularité.`); });
  });
  return e;
}

export function compute(net: Net): NetResult | { errors: string[] } {
  const errors = validate(net);
  if (errors.length) return { errors };
  const rho = net.fluid.rho; const nu = net.fluid.nu;
  let cum = 0;
  const out: SectionResult[] = [];
  net.sections.forEach((s, i) => {
    const D = s.D_mm / 1000; const Q = (s.Q_m3h ?? net.Q_m3h) / 3600; const v = Q / area(D);
    const Re = reynolds(v, D, nu); const eps = epsOf(s);
    const { f, regime } = frictionFactor(Re, eps / D, net.method);
    const dNext = net.sections[i + 1] ? net.sections[i + 1].D_mm / 1000 : undefined;
    const dyn = (rho * v * v) / 2;
    const items: Item[] = []; let Ktot = 0; let Kmin = 0; let Kmax = 0;
    for (const x of s.sings) {
      const k = singularityK(x, D, dNext);
      const K = net.kMode === 'min' ? k.Kmin : net.kMode === 'max' ? k.Kmax : k.K;
      Ktot += K * x.qty; Kmin += k.Kmin * x.qty; Kmax += k.Kmax * x.qty;
      items.push({ name: k.label, qty: x.qty, K, Kmin: k.Kmin, Kmax: k.Kmax, dp: K * x.qty * dyn, warning: k.warning });
    }
    const dpLin = darcy(f, s.L_m, D, rho, v); const dpSing = Ktot * dyn;
    const start = cum; cum += dpLin + dpSing;
    out.push({ section: s, Q, v, Re, regime, f, eps, R: s.L_m > 0 ? dpLin / s.L_m : (f / D) * dyn, dpLin, dpSing, dpFrict: dpLin + dpSing, dpStatic: rho * G * s.dz_m, Ktot, Leq: Ktot * D / f, items, cumStart: start, cumEnd: cum, dpSingMin: Kmin * dyn, dpSingMax: Kmax * dyn });
  });

  const dpLin = out.reduce((a, r) => a + r.dpLin, 0); const dpSing = out.reduce((a, r) => a + r.dpSing, 0);
  const dpFrict = dpLin + dpSing; const dpStatic = out.reduce((a, r) => a + r.dpStatic, 0);
  const dpFrictMin = dpLin + out.reduce((a, r) => a + r.dpSingMin, 0); const dpFrictMax = dpLin + out.reduce((a, r) => a + r.dpSingMax, 0);
  const shareSing = dpFrict > 0 ? dpSing / dpFrict : 0;

  const checks: Check[] = [];
  out.forEach((r) => {
    const n = r.section.nom || 'Tronçon';
    const vmax = net.aspiration ? C.vitesseMaxAspiration_m_s : C.vitesseMax_m_s;
    if (r.v > 1.5 * vmax) checks.push({ id: `v-${r.section.id}`, label: `Vitesse · ${n}`, level: 'ko', detail: `${f4(r.v, 3)} m/s, plus de 1,5 fois le repère de ${vmax} m/s : bruit, érosion et coups de bélier probables.` });
    else if (r.v > vmax) checks.push({ id: `v-${r.section.id}`, label: `Vitesse · ${n}`, level: 'warn', detail: `${f4(r.v, 3)} m/s au-dessus du repère de ${vmax} m/s${net.aspiration ? ' à l’aspiration d’une pompe (risque de cavitation)' : ' (bruit)'}.` });
    else if (r.v < C.vitesseMin_m_s) checks.push({ id: `v-${r.section.id}`, label: `Vitesse · ${n}`, level: 'warn', detail: `${f4(r.v, 3)} m/s sous ${C.vitesseMin_m_s} m/s : dépôts et purge de l’air difficile.` });
    else checks.push({ id: `v-${r.section.id}`, label: `Vitesse · ${n}`, level: 'ok', detail: `${f4(r.v, 3)} m/s, dans la plage usuelle ${C.vitesseMin_m_s} à ${vmax} m/s.` });
    if (r.R > C.perteLineiqueMax_Pa_m) checks.push({ id: `r-${r.section.id}`, label: `Perte linéique · ${n}`, level: 'warn', detail: `${f4(r.R, 3)} Pa/m (${f4(r.R / 9.80665, 3)} mmCE/m) au-dessus du repère de ${C.perteLineiqueMax_Pa_m} Pa/m : diamètre sans doute trop petit.` });
    if (r.regime === 'transition') checks.push({ id: `re-${r.section.id}`, label: `Régime · ${n}`, level: 'warn', detail: `Re = ${f4(r.Re, 4)} : zone de transition 2 000 à 4 000, écoulement instable, le coefficient de frottement est incertain.` });
    if (r.regime === 'laminaire') checks.push({ id: `re-${r.section.id}`, label: `Régime · ${n}`, level: 'info', detail: `Re = ${f4(r.Re, 4)} : écoulement laminaire, f = 64/Re ; la rugosité n’intervient pas.` });
    if (r.eps / (r.section.D_mm / 1000) > 0.05) checks.push({ id: `rug-${r.section.id}`, label: `Rugosité · ${n}`, level: 'warn', detail: 'Rugosité relative supérieure à 5 % : hors du domaine de Colebrook et de Swamee-Jain.' });
    r.items.forEach((it, j) => { if (it.warning) checks.push({ id: `w-${r.section.id}-${j}`, label: `Singularité · ${n}`, level: 'warn', detail: it.warning }); });
  });
  if (dpFrict > 0 && shareSing > C.partSinguliereAlerte) checks.push({ id: 'part', label: 'Part des singularités', level: 'warn', detail: `Les singularités représentent ${f4(shareSing * 100, 3)} % des pertes : dans un réseau bien conçu elles pèsent plutôt 20 à 50 %. Revoir le nombre de coudes, de vannes ou le diamètre.` });
  else if (dpFrict > 0) checks.push({ id: 'part', label: 'Part des singularités', level: 'ok', detail: `${f4(shareSing * 100, 3)} % des pertes de frottement.` });
  if (dpFrictMax > dpFrictMin * 1.0001) checks.push({ id: 'plage', label: 'Incertitude des coefficients', level: 'info', detail: `Selon la plage des coefficients, les pertes de frottement varient de ${f4(dpFrictMin)} à ${f4(dpFrictMax)} Pa.` });

  const first = out[0]; const dyn1 = (rho * first.v * first.v) / 2;
  const formulas: Formula[] = [
    {
      label: 'Vitesse et nombre de Reynolds',
      symbolic: 'v = \\dfrac{4\\,Q}{\\pi D^2} \\qquad Re = \\dfrac{v\\,D}{\\nu}',
      substituted: `v = \\dfrac{4 \\times ${tex(first.Q, 4)}}{\\pi \\times ${tex(first.section.D_mm / 1000, 4)}^2} = ${tex(first.v, 4)}\\ \\text{m/s} \\qquad Re = ${tex(first.Re, 4)}`,
      legend: [{ symbol: 'Q', meaning: 'débit', unit: 'm³/s' }, { symbol: 'D', meaning: 'diamètre intérieur', unit: 'm' }, { symbol: '\\nu', meaning: `viscosité cinématique (${net.fluid.label})`, unit: 'm²/s' }],
      note: `Premier tronçon (« ${first.section.nom || 'Tronçon 1'} »). Régime : ${first.regime}.`,
    },
    {
      label: 'Coefficient de frottement de Darcy',
      symbolic: net.method === 'colebrook'
        ? '\\dfrac{1}{\\sqrt{f}} = -2\\log_{10}\\left(\\dfrac{\\varepsilon}{3{,}7\\,D} + \\dfrac{2{,}51}{Re\\sqrt{f}}\\right)'
        : 'f = \\dfrac{0{,}25}{\\left[\\log_{10}\\left(\\dfrac{\\varepsilon}{3{,}7\\,D} + \\dfrac{5{,}74}{Re^{0{,}9}}\\right)\\right]^2}',
      substituted: `\\varepsilon/D = ${tex(first.eps / (first.section.D_mm / 1000), 4)} \\Rightarrow f = ${tex(first.f, 4)}`,
      legend: [{ symbol: '\\varepsilon', meaning: 'rugosité absolue', unit: 'm' }, { symbol: 'f', meaning: 'coefficient de frottement de Darcy' }],
      note: `${net.method === 'colebrook' ? 'Colebrook-White résolu par itérations (Newton).' : 'Swamee-Jain, forme explicite de Colebrook, valable 5 000 < Re < 10⁸ et 10⁻⁶ < ε/D < 10⁻².'} Laminaire : f = 64/Re. Contrôle croisé : Swamee-Jain donne ${f4(swameeJain(first.Re, first.eps / (first.section.D_mm / 1000)), 4)}.`,
    },
    {
      label: 'Pertes de charge linéiques (Darcy-Weisbach)',
      symbolic: '\\Delta P_{lin} = f\\,\\dfrac{L}{D}\\,\\dfrac{\\rho\\,v^2}{2}',
      substituted: `\\Delta P_{lin} = ${tex(first.f, 4)} \\times \\dfrac{${tex(first.section.L_m, 4)}}{${tex(first.section.D_mm / 1000, 4)}} \\times ${tex(dyn1, 4)} = ${tex(first.dpLin, 4)}\\ \\text{Pa}`,
      legend: [{ symbol: '\\rho', meaning: 'masse volumique', unit: 'kg/m³' }, { symbol: 'L', meaning: 'longueur du tronçon', unit: 'm' }],
    },
    {
      label: 'Pertes de charge singulières',
      symbolic: '\\Delta P_{sing} = \\left(\\sum n_i K_i\\right)\\dfrac{\\rho\\,v^2}{2} \\qquad L_{eq} = \\dfrac{\\sum K\\,D}{f}',
      substituted: `\\sum K = ${tex(first.Ktot, 4)} \\Rightarrow \\Delta P_{sing} = ${tex(first.dpSing, 4)}\\ \\text{Pa} \\qquad L_{eq} = ${tex(first.Leq, 4)}\\ \\text{m}`,
      legend: [{ symbol: 'K_i', meaning: 'coefficient de la singularité i (catalogue, plage donnée)' }, { symbol: 'n_i', meaning: 'nombre de pièces' }],
      note: 'Coudes : Weisbach. Élargissement brusque : Borda-Carnot. Raccords coniques : Crane TP-410. Vannes, tés, clapets : ordres de grandeur d’Idel’chik et Crane. TODO: source à vérifier.',
    },
    {
      label: 'Total du réseau et hauteur manométrique',
      symbolic: '\\Delta P_{tot} = \\sum \\left(\\Delta P_{lin} + \\Delta P_{sing}\\right) + \\rho\\,g\\,\\Delta z \\qquad H = \\dfrac{\\Delta P_{tot}}{\\rho\\,g}',
      substituted: `\\Delta P_{tot} = ${tex(dpFrict, 5)} + ${tex(dpStatic, 4)} = ${tex(dpFrict + dpStatic, 5)}\\ \\text{Pa} \\qquad H = ${tex((dpFrict + dpStatic) / (rho * G), 4)}\\ \\text{m}`,
      legend: [{ symbol: '\\Delta z', meaning: 'dénivelé (cote de fin − cote de début)', unit: 'm' }, { symbol: 'g', meaning: 'pesanteur', unit: 'm/s²' }],
      note: 'C’est la pression que doit fournir la pompe (hors pression de service) : base du module « pompes et variation de vitesse ».',
    },
  ];

  const total = dpFrict + dpStatic;
  const conclusion = `Pertes de frottement ${f4(dpFrict)} Pa (${f4(dpFrict / 100, 4)} mbar, ${f4(dpFrict / (rho * G), 4)} m de fluide), dont ${f4(shareSing * 100, 3)} % de singularités${dpStatic !== 0 ? `, plus ${f4(dpStatic)} Pa de hauteur statique : ${f4(total)} Pa à fournir` : ''}.`;
  return { sections: out, dpLin, dpSing, dpFrict, dpStatic, dpTotal: total, hFrict: dpFrict / (rho * G), hTotal: total / (rho * G), shareSing, Ktot: out.reduce((a, r) => a + r.Ktot, 0), dpFrictMin, dpFrictMax, checks, formulas, conclusion };
}

export const isOk = (r: NetResult | { errors: string[] }): r is NetResult => 'sections' in r;
