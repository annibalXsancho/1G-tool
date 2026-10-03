// Analyse de suivi : modèle de la situation de référence (signature), consommation attendue, économies évitées,
// CUSUM, IPÉ, incertitude, normalisation et contrôles de qualité. Pur : aucun import React/DOM.
//
// Démarche IPMVP option C (régression) / ISO 50001 : on ajuste sur la période de référence
//     E = a + b1·x1 (+ b2·x2)         x = DJU, DJR ou variable libre, par période
// puis on prédit, pour chaque période, ce que le site aurait consommé dans les mêmes conditions sans action.
// L'écart (attendu − mesuré) est l'économie évitée ; son cumul est le CUSUM.
import { suivi } from '@/data';
import { fmtNum, tex } from '@/core/fmt';
import type { Formula } from '@/core/types';
import { ols, predict, tCritical, type Fit } from './regress';
import { REGRESSOR_LABEL, type Config, type Period, type Regressor } from './model';

export type Level = 'ok' | 'warn' | 'ko';
export type Check = { id: string; label: string; level: Level; detail: string };

export type Line = {
  period: Period;
  role: 'reference' | 'suivi' | 'hors';
  expected: number;
  /** Mesuré − attendu (négatif = économie). */
  residual: number;
  /** Attendu − mesuré (positif = économie). */
  saving: number;
  /** CUSUM de l'économie depuis la première période, tous rôles confondus. */
  cusum: number;
  /** Mesuré / attendu (IPÉ du modèle). */
  ratio: number;
};

export type Savings = {
  m: number;
  expected: number;
  measured: number;
  total: number;
  pct: number;
  /** Incertitude absolue (kWh) au niveau de confiance choisi, et relative à l'économie. */
  U: number;
  Urel: number;
  significant: boolean;
};

export type Ipe = {
  label: string;
  reference: number;
  suivi: number;
  /** Variation en % (négatif = amélioration). */
  change: number;
  /** Rapport mesuré / attendu sur le suivi et gain correspondant. */
  modelRatio: number;
  modelGain: number;
};

export type Normalised = { reference: number; suivi: number | null; saving: number | null; ppy: number; basis: string };

export type Analysis = {
  regressors: Regressor[];
  fit: Fit;
  lines: Line[];
  referenceN: number;
  suiviN: number;
  savings: Savings | null;
  ipe: Ipe | null;
  normalised: Normalised | null;
  /** Répartition de la consommation de référence : part climatique (variables du modèle) et talon (ECS, process, veille). */
  parts: { climatique: number; talon: number; part: number };
  checks: Check[];
  formulas: Formula[];
  tCrit: number;
  conclusion: string;
};

const T = suivi.seuils;
const col = (p: Period, r: Regressor) => (r === 'dju' ? p.dju : r === 'djr' ? p.djr : p.x);
const inRange = (s: string, from: string, to: string) => (!from || s >= from) && (!to || s <= to);
const f = (v: number, s = 4) => fmtNum(v, s);

export function analyse(periods: Period[], cfg: Config): Analysis | { errors: string[] } {
  const errors: string[] = [];
  if (periods.length === 0) return { errors: ['Aucune période exploitable : importez un relevé ou chargez l’exemple.'] };
  if (cfg.regressors.length === 0) errors.push('Choisissez au moins une variable explicative.');
  if (cfg.regressors.length > 2) errors.push('Deux variables explicatives au plus.');
  const refPeriods = periods.filter((p) => inRange(p.start, cfg.baselineFrom, cfg.baselineTo));
  if (errors.length) return { errors };
  const X = refPeriods.map((p) => cfg.regressors.map((r) => col(p, r)));
  const fit = ols(X, refPeriods.map((p) => p.kwh), cfg.regressors.map((r) => REGRESSOR_LABEL[r]));
  if (!fit) {
    return { errors: [`La situation de référence compte ${refPeriods.length} période(s) : il en faut au moins ${cfg.regressors.length + 2} et des valeurs de variables non toutes identiques.`] };
  }

  const isRef = (p: Period) => inRange(p.start, cfg.baselineFrom, cfg.baselineTo);
  const isSuivi = (p: Period) => !!(cfg.reportFrom || cfg.reportTo) && inRange(p.start, cfg.reportFrom, cfg.reportTo) && !isRef(p);
  let cum = 0;
  const lines: Line[] = periods.map((p) => {
    const expected = predict(fit, cfg.regressors.map((r) => col(p, r)));
    const saving = expected - p.kwh;
    cum += saving;
    return { period: p, role: isRef(p) ? 'reference' : isSuivi(p) ? 'suivi' : 'hors', expected, residual: p.kwh - expected, saving, cusum: cum, ratio: expected > 0 ? p.kwh / expected : NaN };
  });
  const sl = lines.filter((l) => l.role === 'suivi');
  const rl = lines.filter((l) => l.role === 'reference');

  // Économies évitées et incertitude (ASHRAE Guideline 14 annexe B, formule de la fraction d'économie).
  const tc = tCritical(fit.dof, cfg.confidence);
  let savings: Savings | null = null;
  if (sl.length > 0) {
    const expected = sl.reduce((s, l) => s + l.expected, 0);
    const measured = sl.reduce((s, l) => s + l.period.kwh, 0);
    const total = expected - measured;
    const m = sl.length;
    const U = T.facteurIncertitude * tc * fit.rmse * Math.sqrt(m * (1 + 2 / fit.n));
    savings = { m, expected, measured, total, pct: expected !== 0 ? (total / expected) * 100 : NaN, U, Urel: total !== 0 ? Math.abs(U / total) : Infinity, significant: Math.abs(total) > U };
  }

  // IPÉ : indicateur simple (kWh / dénominateur) et indicateur de modèle (mesuré / attendu).
  let ipe: Ipe | null = null;
  if (sl.length > 0) {
    const den = (ls: Line[]) => ls.reduce((s, l) => s + (cfg.ipe === 'jours' ? l.period.days : cfg.ipe === 'dju' ? l.period.dju : cfg.ipe === 'x' ? l.period.x : 1), 0);
    const val = (ls: Line[]) => { const d = den(ls); return d > 0 ? ls.reduce((s, l) => s + l.period.kwh, 0) / d : NaN; };
    const ref = val(rl); const cur = val(sl);
    const meas = sl.reduce((s, l) => s + l.period.kwh, 0); const exp = sl.reduce((s, l) => s + l.expected, 0);
    ipe = { label: cfg.ipe === 'aucun' ? 'kWh / période' : cfg.ipe === 'jours' ? 'kWh / jour' : cfg.ipe === 'dju' ? 'kWh / DJU' : `kWh / ${cfg.unite}`, reference: ref, suivi: cur, change: ref !== 0 ? ((cur - ref) / ref) * 100 : NaN, modelRatio: exp > 0 ? meas / exp : NaN, modelGain: exp > 0 ? (1 - meas / exp) * 100 : NaN };
  }

  // Normalisation à des conditions annuelles typiques (IPMVP : économies « normalisées »).
  const ppy = cfg.grain === 'brut' ? cfg.periodsPerYear : { jour: 365.25, semaine: 365.25 / 7, mois: 12 }[cfg.grain];
  const typical = (r: Regressor): number => {
    const given = r === 'dju' ? cfg.djuTypique : r === 'djr' ? cfg.djrTypique : cfg.xTypique;
    if (given !== undefined && Number.isFinite(given)) return given;
    return (refPeriods.reduce((s, p) => s + col(p, r), 0) / refPeriods.length) * ppy; // climat de la référence, annualisé
  };
  const annual = (fi: Fit) => fi.coef[0] * ppy + cfg.regressors.reduce((s, r, j) => s + fi.coef[j + 1] * typical(r), 0);
  const usingGiven = cfg.regressors.every((r) => (r === 'dju' ? cfg.djuTypique : r === 'djr' ? cfg.djrTypique : cfg.xTypique) !== undefined);
  let normalised: Normalised | null = { reference: annual(fit), suivi: null, saving: null, ppy, basis: usingGiven ? 'conditions typiques saisies' : 'conditions moyennes de la période de référence' };
  const suiviPeriods = sl.map((l) => l.period);
  if (suiviPeriods.length >= cfg.regressors.length + 3) {
    const fit2 = ols(suiviPeriods.map((p) => cfg.regressors.map((r) => col(p, r))), suiviPeriods.map((p) => p.kwh), cfg.regressors.map((r) => REGRESSOR_LABEL[r]));
    if (fit2) { const s = annual(fit2); normalised = { ...normalised, suivi: s, saving: normalised.reference - s }; }
  }

  // Contrôles de qualité du modèle.
  const talon = fit.coef[0] * fit.n;
  const climatique = refPeriods.reduce((s, p) => s + cfg.regressors.reduce((t, r, j) => t + fit.coef[j + 1] * col(p, r), 0), 0);
  const parts = { climatique, talon, part: climatique + talon !== 0 ? (climatique / (climatique + talon)) * 100 : NaN };

  const checks: Check[] = [];
  const minN = T.pointsMin[cfg.grain];
  checks.push(fit.n >= minN
    ? { id: 'n', label: 'Nombre de périodes de référence', level: 'ok', detail: `${fit.n} périodes (au moins ${minN} usuellement pour ce grain).` }
    : { id: 'n', label: 'Nombre de périodes de référence', level: 'warn', detail: `${fit.n} périodes seulement : ${minN} sont usuelles pour ce grain (un cycle annuel complet pour le mois). Le modèle peut ignorer une saison.` });
  checks.push(fit.r2 >= T.R2_min
    ? { id: 'r2', label: 'Coefficient de détermination R²', level: 'ok', detail: `R² = ${f(fit.r2, 3)} ≥ ${f(T.R2_min, 3)}.` }
    : { id: 'r2', label: 'Coefficient de détermination R²', level: fit.r2 < 0.3 ? 'ko' : 'warn', detail: `R² = ${f(fit.r2, 3)} < ${f(T.R2_min, 3)} : les variables choisies expliquent mal la consommation${fit.r2 < 0.3 ? ' ; un nuage de ce type ne permet aucune conclusion d’économie.' : '.'}` });
  checks.push(fit.cvrmse * 100 <= T.CVRMSE_max_pct
    ? { id: 'cv', label: 'CV(RMSE)', level: 'ok', detail: `${f(fit.cvrmse * 100, 3)} % ≤ ${T.CVRMSE_max_pct} %.` }
    : { id: 'cv', label: 'CV(RMSE)', level: 'warn', detail: `${f(fit.cvrmse * 100, 3)} % > ${T.CVRMSE_max_pct} % : dispersion élevée autour du modèle, incertitude sur les économies importante.` });
  checks.push(Math.abs(fit.nmbe) * 100 <= T.NMBE_max_pct
    ? { id: 'nmbe', label: 'NMBE (biais)', level: 'ok', detail: `${f(Math.abs(fit.nmbe) < 1e-9 ? 0 : fit.nmbe * 100, 3)} % (limite ±${T.NMBE_max_pct} %). Nul par construction avec un talon ajusté sur la référence.` }
    : { id: 'nmbe', label: 'NMBE (biais)', level: 'warn', detail: `${f(fit.nmbe * 100, 3)} % hors de ±${T.NMBE_max_pct} %.` });
  cfg.regressors.forEach((r, j) => {
    const t = fit.t[j + 1]; const b = fit.coef[j + 1];
    const phys = (r === 'dju' || r === 'djr' || r === 'x') && b < 0;
    checks.push(phys
      ? { id: `sign-${r}`, label: `Sens de ${REGRESSOR_LABEL[r]}`, level: 'ko', detail: `Coefficient négatif (${f(b)} kWh par unité) : plus de ${REGRESSOR_LABEL[r].toLowerCase()}, moins de consommation. Le sens ou la variable choisie n’est pas le bon.` }
      : Math.abs(t) >= T.t_min
        ? { id: `t-${r}`, label: `Significativité de ${REGRESSOR_LABEL[r]}`, level: 'ok', detail: `t = ${f(t, 3)} ≥ ${T.t_min} : le coefficient (${f(b)} kWh par unité) est distinct de zéro.` }
        : { id: `t-${r}`, label: `Significativité de ${REGRESSOR_LABEL[r]}`, level: 'warn', detail: `t = ${f(t, 3)} < ${T.t_min} : le coefficient n’est pas distinct de zéro, la variable n’apporte rien de démontré.` });
  });
  if (sl.length === 0) checks.push({ id: 'suivi', label: 'Période de suivi', level: 'warn', detail: 'Aucune période de suivi : renseignez ses dates pour obtenir les économies, le CUSUM et l’IPÉ.' });
  else if (savings) checks.push(savings.significant
    ? { id: 'sig', label: 'Économie supérieure à l’incertitude', level: 'ok', detail: `Économie ${f(savings.total)} kWh > incertitude ±${f(savings.U)} kWh (confiance ${Math.round(cfg.confidence * 100)} %).` }
    : { id: 'sig', label: 'Économie supérieure à l’incertitude', level: 'warn', detail: `Économie ${f(savings.total)} kWh ≤ incertitude ±${f(savings.U)} kWh : l’écart n’est pas démontré au niveau de confiance ${Math.round(cfg.confidence * 100)} %.` });
  if (periods.length < 3) checks.push({ id: 'pts', label: 'Données', level: 'ko', detail: 'Trop peu de périodes.' });

  const nv = cfg.regressors.length;
  const eqSym = `E = a${cfg.regressors.map((r, j) => ` + b_${j + 1}\\,${r === 'dju' ? 'DJU' : r === 'djr' ? 'DJR' : 'x'}`).join('')}`;
  const eqNum = `E = ${tex(fit.coef[0], 4)}${cfg.regressors.map((r, j) => ` ${fit.coef[j + 1] < 0 ? '-' : '+'} ${tex(Math.abs(fit.coef[j + 1]), 4)}\\times ${r === 'dju' ? '\\text{DJU}' : r === 'djr' ? '\\text{DJR}' : 'x'}`).join('')}`;
  const formulas: Formula[] = [
    {
      label: 'Degrés-jours unifiés d’une journée (méthode Costic)',
      symbolic: 'DJU = \\begin{cases} 0 & T_{min} \\ge B \\\\ B - \\dfrac{T_{min}+T_{max}}{2} & T_{max} \\le B \\\\ (B - T_{min})\\left(0{,}08 + 0{,}42\\,\\dfrac{B - T_{min}}{T_{max} - T_{min}}\\right) & \\text{sinon} \\end{cases}',
      substituted: `B = ${tex(cfg.base, 3)}\\ ^\\circ\\text{C} \\quad \\Sigma\\text{DJU} = ${tex(refPeriods.reduce((s, p) => s + p.dju, 0), 4)}\\ \\text{sur la référence}`,
      legend: [{ symbol: 'B', meaning: 'température de base', unit: '°C' }, { symbol: 'T_{min}, T_{max}', meaning: 'températures extrêmes de la journée', unit: '°C' }],
      note: 'Cours « Optimisation énergétique des bâtiments » (ISTP 2026), p. 101 : méthode COSTIC, TNC = température de non-chauffage (18 à 20 °C). Le calcul reproduit les DJU du corrigé du TD n°5 (exercice 3).',
    },
    {
      label: 'Modèle de la situation de référence (signature énergétique)',
      symbolic: `${eqSym} \\qquad \\text{moindres carrés sur les } n \\text{ périodes de référence}`,
      substituted: `${eqNum} \\quad (n = ${fit.n}, \; R^2 = ${tex(fit.r2, 3)})`,
      legend: [{ symbol: 'a', meaning: 'talon : consommation indépendante des variables', unit: 'kWh/période' }, { symbol: 'b_1', meaning: 'sensibilité : kWh par unité de variable', unit: 'kWh/unité' }],
      note: 'La pente b₁ est le « ratio kWh/DJU » du cours (consommation de chauffage divisée par les DJU de l’année). Le grain (semaine ou mois) doit être choisi pour que le rythme hebdomadaire d’exploitation ne masque pas l’effet de la température.',
    },
    {
      label: 'Qualité du modèle',
      symbolic: 'R^2 = 1 - \\dfrac{SSE}{SST} \\qquad CV(RMSE) = \\dfrac{1}{\\bar y}\\sqrt{\\dfrac{SSE}{n-p}} \\qquad NMBE = \\dfrac{\\sum (y_i-\\hat y_i)}{(n-p)\\,\\bar y}',
      substituted: `R^2 = ${tex(fit.r2, 3)} \\quad CV(RMSE) = ${tex(fit.cvrmse * 100, 3)}\\ \\% \\quad NMBE = ${tex(Math.abs(fit.nmbe) < 1e-9 ? 0 : fit.nmbe * 100, 3)}\\ \\%`,
      legend: [{ symbol: 'p', meaning: `nombre de paramètres (${nv + 1})` }, { symbol: '\\bar y', meaning: 'consommation moyenne de la référence', unit: 'kWh' }],
      note: `Seuils usuels : R² ≥ ${T.R2_min}, CV(RMSE) ≤ ${T.CVRMSE_max_pct} %, |NMBE| ≤ ${T.NMBE_max_pct} %, t ≥ ${T.t_min}. TODO: source à vérifier (IPMVP, ASHRAE Guideline 14).`,
    },
  ];
  if (savings) {
    formulas.push({
      label: 'Économies évitées',
      symbolic: '\\Delta E = \\sum_{i \\in \\text{suivi}} \\left(\\hat E_i - E_i\\right)',
      substituted: `\\Delta E = ${tex(savings.expected, 5)} - ${tex(savings.measured, 5)} = ${tex(savings.total, 4)}\\ \\text{kWh} \;(${tex(savings.pct, 3)}\\ \\%)`,
      legend: [{ symbol: '\\hat E_i', meaning: 'consommation attendue (modèle de référence appliqué aux conditions de la période i)', unit: 'kWh' }, { symbol: 'E_i', meaning: 'consommation mesurée', unit: 'kWh' }],
      note: 'IPMVP option C : économies évitées, dans les conditions réelles de la période de suivi.',
    }, {
      label: 'Incertitude sur les économies',
      symbolic: 'U = 1{,}26\; t_{\\alpha,\\,n-p}\; RMSE\;\\sqrt{m\\left(1 + \\dfrac{2}{n}\\right)}',
      substituted: `U = 1{,}26 \\times ${tex(tc, 4)} \\times ${tex(fit.rmse, 4)} \\times \\sqrt{${savings.m}\\left(1 + \\tfrac{2}{${fit.n}}\\right)} = ${tex(savings.U, 4)}\\ \\text{kWh}`,
      legend: [{ symbol: 'm', meaning: 'nombre de périodes de suivi' }, { symbol: 'n', meaning: 'nombre de périodes de référence' }, { symbol: 't_{\\alpha,n-p}', meaning: `quantile de Student à ${Math.round(cfg.confidence * 100)} %` }],
      note: 'Le facteur 1,26 corrige l’autocorrélation des résidus mensuels (usage de l’ASHRAE Guideline 14, annexe B, pour des données mensuelles). TODO: source à vérifier ; pour des données plus fines ce facteur est à revoir.',
    }, {
      label: 'CUSUM',
      symbolic: 'S_k = \\sum_{i \\le k} \\left(\\hat E_i - E_i\\right)',
      substituted: `S_{fin} = ${tex(lines[lines.length - 1].cusum, 4)}\\ \\text{kWh}`,
      legend: [{ symbol: 'S_k', meaning: 'somme cumulée des écarts au modèle jusqu’à la période k', unit: 'kWh' }],
      note: 'Sur la période de référence la somme des résidus est nulle : la courbe y oscille et revient à 0. Une pente montante durable signale une économie, descendante une dérive.',
    });
  }
  if (ipe) {
    formulas.push({
      label: 'Indicateurs de performance énergétique (IPÉ)',
      symbolic: `IPE = \\dfrac{\\sum E}{\\sum D} \\qquad IPE_{mod} = \\dfrac{\\sum E_i}{\\sum \\hat E_i}`,
      substituted: `IPE_{ref} = ${tex(ipe.reference, 4)} \\to IPE_{suivi} = ${tex(ipe.suivi, 4)}\\ \\text{(${ipe.label})} \; (${tex(ipe.change, 3)}\\ \\%) \\qquad IPE_{mod} = ${tex(ipe.modelRatio, 4)}`,
      legend: [{ symbol: 'D', meaning: 'dénominateur choisi (jours, DJU, variable libre)' }, { symbol: 'IPE_{mod}', meaning: 'rapport mesuré / attendu : < 1 = mieux que la référence à conditions égales' }],
      note: 'Cours « Réseaux d’utilités » (D. Brun, VE 2026) : l’IPÉ relie l’énergie à l’usage ou à la production (ex. kWh/tonne) ; ne pas confondre efficacité (ISO 50001 §3.8) et performance (§3.12). L’IPÉ simple est trompé par les changements de climat ou d’activité, l’IPÉ de modèle les neutralise. TODO: ISO 50006 à vérifier.',
    });
  }

  const conclusion = savings
    ? `Sur ${savings.m} période(s) de suivi, la consommation est de ${f(savings.measured)} kWh pour ${f(savings.expected)} kWh attendus : ${savings.total >= 0 ? 'économie' : 'surconsommation'} de ${f(Math.abs(savings.total))} kWh (${f(Math.abs(savings.pct), 3)} %), ±${f(savings.U)} kWh à ${Math.round(cfg.confidence * 100)} % de confiance${savings.significant ? '' : ' : écart non démontré'}.`
    : `Modèle de référence : ${f(fit.coef[0])} kWh de talon par période${nv ? ` et ${fit.coef.slice(1).map((c, j) => `${f(c)} kWh par ${REGRESSOR_LABEL[cfg.regressors[j]].toLowerCase()}`).join(', ')}` : ''} (R² = ${f(fit.r2, 3)}).`;

  return { regressors: cfg.regressors, fit, lines, referenceN: rl.length, suiviN: sl.length, savings, ipe, normalised, parts, checks, formulas, tCrit: tc, conclusion };
}

export const isAnalysis = (a: Analysis | { errors: string[] }): a is Analysis => 'fit' in a;

/** Propose le jeu de variables qui explique le mieux la référence parmi DJU, DJR et DJU+DJR (pente positive exigée). */
export function suggestRegressors(periods: Period[], cfg: Config): Regressor[] {
  const refP = periods.filter((p) => inRange(p.start, cfg.baselineFrom, cfg.baselineTo));
  let best: { r: Regressor[]; r2: number } | null = null;
  for (const set of [['dju'], ['djr'], ['dju', 'djr']] as Regressor[][]) {
    const fit = ols(refP.map((p) => set.map((r) => col(p, r))), refP.map((p) => p.kwh), set);
    if (fit && fit.coef.slice(1).every((c) => c > 0)) {
      const adj = 1 - (1 - fit.r2) * ((fit.n - 1) / fit.dof); // R² ajusté : ne récompense pas une variable de plus
      if (!best || adj > best.r2) best = { r: set, r2: adj };
    }
  }
  return best?.r ?? ['dju'];
}
