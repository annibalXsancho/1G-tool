// Dimensionnement d'une production d'eau chaude sanitaire collective (stockage + échangeur). Pur : aucun import React/DOM.
// Unités : litres, °C, kW, kWh, minutes pour les profils. Les volumes « à Tstock » sont des litres d'eau chaude à la
// température de stockage, équivalents en énergie aux volumes mesurés à une autre température (conservation de l'énergie).
// Valeurs tabulées : src/data/ecs.json (sources et TODO dans son meta).
import { ecs } from '@/data';
import { fmtNum, tex } from '@/core/fmt';
import type { Formula } from '@/core/types';

export type DwellingType = 'T1' | 'T2' | 'T3' | 'T4' | 'T5';
export const DWELLING_TYPES: DwellingType[] = ['T1', 'T2', 'T3', 'T4', 'T5'];
export type Mode = 'accumulation' | 'semi' | 'instantane';
export const MODE_LABEL: Record<Mode, string> = { accumulation: 'Accumulation', semi: 'Semi-instantané', instantane: 'Instantané' };
export type Generator = 'chaudiere' | 'reseau' | 'pac';
export const GENERATOR_LABEL: Record<Generator, string> = { chaudiere: 'Chaudière', reseau: 'Réseau de chaleur', pac: 'Pompe à chaleur' };
export type LoopBasis = 'neuf' | 'ancien' | 'saisie';

export type EcsInput = {
  /** Nombre de logements par type. */
  logements: Record<DwellingType, number>;
  /** Besoin journalier à 40 °C par logement (L/j), modifiable. */
  volumes40: Record<DwellingType, number>;
  /** Usages tertiaires : quantité (unités) et ratio (L à 40 °C par unité et par jour). */
  tertiaire: Record<string, { n: number; ratio: number }>;
  Tfroide: number;
  Tstock: number;
  /** Durée de la fenêtre de pointe retenue (h), de 1 à 8. */
  hPointe: number;
  mode: Mode;
  generateur: Generator;
  /** Puissance disponible au générateur pour l'ECS (kW), vide = non limitée. */
  Pdispo: number | undefined;
  /** Coefficient de stratification a : volume utile = a × volume géométrique. */
  a: number;
  circulateurArretable: boolean;
  /** Durée de fonctionnement du circulateur de boucle (h/j). */
  hCirculateur: number;
  boucle: LoopBasis;
  /** Pertes de boucle saisies (kW), si boucle = 'saisie'. */
  PboucleSaisie: number;
  TretourBoucle: number;
  limitation50: boolean;
  /** Durée de reconstitution en accumulation (h). */
  tReconstitution: number;
  Tambiance: number;
  /** Volume géométrique retenu (L) pour le semi-instantané : 'auto' ou une valeur de la série commerciale. */
  volume: 'auto' | number;
};

export function defaultInput(): EcsInput {
  const vol = {} as Record<DwellingType, number>;
  const log = {} as Record<DwellingType, number>;
  for (const t of DWELLING_TYPES) { vol[t] = ecs.logements[t].volume40_L_par_jour; log[t] = { T1: 10, T2: 20, T3: 40, T4: 20, T5: 10 }[t]; }
  const ter: Record<string, { n: number; ratio: number }> = {};
  for (const [id, u] of Object.entries(ecs.tertiaire)) ter[id] = { n: 0, ratio: u.defaut };
  return {
    logements: log, volumes40: vol, tertiaire: ter, Tfroide: 10, Tstock: 60, hPointe: 8, mode: 'semi', generateur: 'chaudiere', Pdispo: undefined,
    a: ecs.stratification.defaut, circulateurArretable: false, hCirculateur: 24, boucle: 'neuf', PboucleSaisie: 10, TretourBoucle: 55, limitation50: true,
    tReconstitution: 8, Tambiance: 20, volume: 'auto',
  };
}

export type Level = 'ok' | 'warn' | 'ko';
export type Check = { id: string; label: string; level: Level; detail: string };

export type Couple = { V: number; Pbilan: number; Pcostic: number | null; P: number; valid: boolean };

export type Needs = {
  Ns: number; V40: number; nLogements: number;
  /** kWh utiles par litre à Tstock. */
  eLitre: number;
  Vjour: number; Ejour: number;
  V10: number; V60: number; V480: number;
  E10: number; E60: number; E480: number;
};

export type Profile = { t: number[]; D: number[] };

export type Sim = { t: number[]; demande: number[]; capacite: number[]; stock: number[]; deficit: number[]; manque: number; premierManque: number | null };

export type ModeResult = {
  mode: Mode;
  /** Volume géométrique total (L), nombre de ballons, puissance d'échangeur (kW). */
  V: number; ballons: number; P: number;
  Pbilan: number;
  pertesStatiques: number; pertesBoucle: number; pertesTotal: number;
};

export type EcsResult = {
  needs: Needs;
  Pboucle: number;
  V1: number;
  profile: Profile;
  couples: Couple[];
  modes: Record<Mode, ModeResult>;
  retained: ModeResult;
  sim: Sim;
  checks: Check[];
  formulas: Formula[];
  conclusion: string;
  errors: string[];
};

const CP = ecs.eau.cp_Wh_par_L_K;
const ref = ecs.referenceStandard;

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const powerLaw = (p: { coef: number; exposant: number }, x: number) => p.coef * Math.pow(x, p.exposant);

export function validate(i: EcsInput): string[] {
  const e: string[] = [];
  if (!(i.Tstock > i.Tfroide + 5)) e.push('La température de stockage doit dépasser la température d’eau froide d’au moins 5 K.');
  if (!(i.Tfroide >= 0 && i.Tfroide < 30)) e.push('Température d’eau froide hors plage (0 à 30 °C).');
  if (!(i.Tstock <= 95)) e.push('Température de stockage supérieure à 95 °C : hors domaine.');
  if (!(i.Tfroide < 40)) e.push('L’eau froide doit être plus froide que l’eau de puisage (40 °C).');
  if (!(i.a >= 0.3 && i.a <= 1)) e.push('Le coefficient de stratification doit être compris entre 0,3 et 1.');
  if (!(i.hPointe >= 1 && i.hPointe <= 8)) e.push('La fenêtre de pointe doit être comprise entre 1 et 8 h.');
  if (!(i.tReconstitution >= 1 && i.tReconstitution <= 24)) e.push('La durée de reconstitution doit être comprise entre 1 et 24 h.');
  if (!(i.hCirculateur >= 0 && i.hCirculateur <= 24)) e.push('Le fonctionnement du circulateur doit être compris entre 0 et 24 h/j.');
  return e;
}

/** Besoins : logement standard équivalent, volumes et énergies journalières et de pointe. */
export function needs(i: EcsInput): Needs {
  const nLog = sum(DWELLING_TYPES.map((t) => i.logements[t]));
  const V40log = sum(DWELLING_TYPES.map((t) => i.logements[t] * i.volumes40[t]));
  const V40ter = sum(Object.values(i.tertiaire).map((u) => u.n * u.ratio));
  const V40 = V40log + V40ter;
  // Ns : logements pondérés par les coefficients du tableau ; usages tertiaires ramenés au besoin d'un T3.
  // TODO: source à vérifier (équivalence tertiaire → logement standard par le besoin journalier).
  const Ns = sum(DWELLING_TYPES.map((t) => i.logements[t] * ecs.logements[t].ns)) + V40ter / ref.volume40_L_par_jour_T3;
  const dT = i.Tstock - i.Tfroide;
  const eLitre = (CP * dT) / 1000;
  const Ejour = (V40 * CP * (ref.T_puisage_C - i.Tfroide)) / 1000;
  const Vjour = Ejour / eLitre;
  // Pointes COSTIC : litres à 60 °C avec eau froide à 9 °C → énergie → litres à Tstock.
  const eRef = (CP * (ref.T_stockageReference_C - ref.T_eauFroideReference_C)) / 1000;
  const peak = (p: { coef: number; exposant: number }) => { const E = Ns > 0 ? powerLaw(p, Ns) * eRef : 0; return { E, V: E / eLitre }; };
  const p10 = peak(ecs.pointes.min10); const p60 = peak(ecs.pointes.h1); const p480 = peak(ecs.pointes.h8);
  return { Ns, V40, nLogements: nLog, eLitre, Vjour, Ejour, V10: p10.V, V60: p60.V, V480: p480.V, E10: p10.E, E60: p60.E, E480: p480.E };
}

export function loopLoss(i: EcsInput, n: Needs): number {
  if (i.boucle === 'saisie') return Math.max(0, i.PboucleSaisie);
  return (ecs.boucle[i.boucle].fraction_besoin_journalier * n.Ejour) / 24;
}

/** Besoin cumulé D(t) en litres à Tstock, interpolation linéaire entre 0, 10 min, 1 h et 8 h, minute par minute jusqu'à `hPointe`. */
export function demandProfile(n: Needs, hPointe: number): Profile {
  const A: [number, number][] = [[0, 0], [10, n.V10], [60, n.V60], [480, n.V480]];
  const T = Math.round(hPointe * 60);
  const t: number[] = []; const D: number[] = [];
  for (let m = 0; m <= T; m++) {
    let k = 1; while (k < A.length - 1 && m > A[k][0]) k++;
    const [t0, d0] = A[k - 1]; const [t1, d1] = A[k];
    t.push(m); D.push(d0 + ((d1 - d0) * (m - t0)) / (t1 - t0));
  }
  return { t, D };
}

/** Puissance d'échangeur (kW) pour qu'à chaque instant la production cumulée plus le stock utile couvre le besoin cumulé. */
export function powerForVolume(V: number, a: number, n: Needs, prof: Profile, Pboucle: number): number {
  const U = a * V;
  let worst = 0;
  for (let k = 1; k < prof.t.length; k++) {
    const deficit = prof.D[k] - U;
    if (deficit > 0) worst = Math.max(worst, (deficit * n.eLitre) / (prof.t[k] / 60));
  }
  return worst + Pboucle;
}

export function costicPower(V: number, Ns: number, stoppable: boolean): number {
  const law = stoppable ? ecs.semiInstantane.circulateurArretable : ecs.semiInstantane.circulateurPermanent;
  return Ns * powerLaw(law, V);
}

export function minVolumeV1(n: Needs, Pboucle: number): number {
  return n.V10 * (ecs.semiInstantane.V1.a + ecs.semiInstantane.V1.b * Pboucle);
}

export function staticLossW(V: number, Tstock: number, Tamb: number): number {
  const p = ecs.pertesStatiques;
  return (p.a_W + p.b_W * Math.pow(V, p.exposant)) * ((Tstock - Tamb) / p.dT_mesure_K);
}

/** Découpe un volume en ballons de la série commerciale : plus petit ballon unique suffisant, sinon n × plus grand. */
export function commercialSplit(V: number): { V: number; n: number } {
  const sizes = ecs.taillesCommerciales_L;
  const one = sizes.find((s) => s >= V - 1e-9);
  if (one !== undefined) return { V: one, n: 1 };
  const big = sizes[sizes.length - 1];
  const n = Math.ceil(V / big - 1e-9);
  return { V: n * big, n };
}

function annualLosses(i: EcsInput, V: number, n: number, Pboucle: number) {
  const perTank = V > 0 ? staticLossW(V / n, i.Tstock, i.Tambiance) : 0;
  const stat = (perTank * n * 8760) / 1000;
  const loop = Pboucle * i.hCirculateur * 365;
  return { stat, loop, total: stat + loop };
}

export function simulate(V: number, P: number, a: number, n: Needs, prof: Profile, Pboucle: number): Sim {
  const U = a * V;
  const net = ((P - Pboucle) / 60) / n.eLitre; // litres à Tstock produits par minute
  let S = U; let manque = 0; let premier: number | null = null;
  const stock = [U]; const capacite = [U]; const deficit = [0];
  for (let k = 1; k < prof.t.length; k++) {
    S = Math.min(U, S + net - (prof.D[k] - prof.D[k - 1]));
    let d = 0;
    if (S < 0) { d = -S; manque += d; S = 0; if (premier === null) premier = prof.t[k]; }
    stock.push(S); deficit.push(d); capacite.push(U + net * prof.t[k]);
  }
  return { t: prof.t, demande: prof.D, capacite, stock, deficit, manque, premierManque: premier };
}

const FM = (v: number, s = 4) => tex(v, s);

export function compute(i: EcsInput): EcsResult | { errors: string[] } {
  const errors = validate(i);
  const n = needs(i);
  if (n.V40 <= 0 || n.Ns <= 0) errors.push('Renseignez au moins un logement ou un usage tertiaire.');
  if (errors.length) return { errors };

  const Pboucle = loopLoss(i, n);
  const prof = demandProfile(n, i.hPointe);
  const V1 = minVolumeV1(n, Pboucle);
  const [vMin, vMax] = ecs.semiInstantane.domaineVolume_L;

  // Couples puissance-volume : bilan énergétique et corrélation COSTIC 2019, pour chaque taille commerciale.
  const couples: Couple[] = ecs.taillesCommerciales_L.map((V) => {
    const Pbilan = powerForVolume(V, i.a, n, prof, Pboucle);
    const inDomain = V >= vMin && V <= vMax;
    const Pcostic = inDomain && (!i.circulateurArretable || V > V1) ? costicPower(V, n.Ns, i.circulateurArretable) : null;
    return { V, Pbilan, Pcostic, P: Math.max(Pbilan, Pcostic ?? 0), valid: Pcostic !== null };
  });

  // Semi-instantané : volume choisi ou automatique (stocker au moins la pointe de 10 min, et V1 si circulateur arrêtable).
  const want = Math.max(n.V10 / i.a, i.circulateurArretable ? V1 : 0, vMin);
  const auto = ecs.taillesCommerciales_L.find((v) => v >= want - 1e-9 && v <= vMax) ?? vMax;
  const Vsemi = i.volume === 'auto' ? auto : i.volume;
  const cSemi = couples.find((c) => c.V === Vsemi) ?? (() => {
    const Pb = powerForVolume(Vsemi, i.a, n, prof, Pboucle);
    const inDomain = Vsemi >= vMin && Vsemi <= vMax && (!i.circulateurArretable || Vsemi > V1);
    const Pc = inDomain ? costicPower(Vsemi, n.Ns, i.circulateurArretable) : null;
    return { V: Vsemi, Pbilan: Pb, Pcostic: Pc, P: Math.max(Pb, Pc ?? 0), valid: Pc !== null };
  })();
  const lossSemi = annualLosses(i, Vsemi, 1, Pboucle);
  const semi: ModeResult = { mode: 'semi', V: Vsemi, ballons: 1, P: cSemi.P, Pbilan: cSemi.Pbilan, pertesStatiques: lossSemi.stat, pertesBoucle: lossSemi.loop, pertesTotal: lossSemi.total };

  // Accumulation : stocke le besoin journalier, reconstitué en `tReconstitution` heures.
  const accSplit = commercialSplit(n.Vjour / i.a);
  const Pacc = (CP * accSplit.V * (i.Tstock - i.Tfroide)) / (i.tReconstitution * 1000) / ecs.rendementReconstitution + Pboucle;
  const lossAcc = annualLosses(i, accSplit.V, accSplit.n, Pboucle);
  const acc: ModeResult = { mode: 'accumulation', V: accSplit.V, ballons: accSplit.n, P: Pacc, Pbilan: powerForVolume(accSplit.V, i.a, n, prof, Pboucle), pertesStatiques: lossAcc.stat, pertesBoucle: lossAcc.loop, pertesTotal: lossAcc.total };

  // Instantané : aucun stockage, la puissance couvre la pointe la plus exigeante (10 min en pratique) plus la boucle.
  const Pinst = powerForVolume(0, i.a, n, prof, Pboucle);
  const lossInst = annualLosses(i, 0, 1, Pboucle);
  const inst: ModeResult = { mode: 'instantane', V: 0, ballons: 0, P: Pinst, Pbilan: Pinst, pertesStatiques: 0, pertesBoucle: lossInst.loop, pertesTotal: lossInst.total };

  const modes = { accumulation: acc, semi, instantane: inst };
  const retained = modes[i.mode];
  const sim = simulate(retained.V, retained.P, i.a, n, prof, Pboucle);

  // Vérifications réglementaires et de cohérence.
  const checks: Check[] = [];
  const reg = ecs.reglementation;
  const hasStorage = retained.V > 0;
  const bigStorage = retained.V >= reg.stockageSeuil_L;
  checks.push(!hasStorage
    ? { id: 'legio-stock', label: 'Stockage ≥ 400 L maintenu à 55 °C', level: 'ok', detail: 'Sans objet : production instantanée, pas de volume de stockage.' }
    : bigStorage && i.Tstock < reg.stockageTmin_C
      ? { id: 'legio-stock', label: 'Stockage ≥ 400 L maintenu à 55 °C', level: 'ko', detail: `Volume de ${fmtNum(retained.V, 4)} L stocké à ${fmtNum(i.Tstock, 3)} °C : l’arrêté du 30/11/2005 impose au moins ${reg.stockageTmin_C} °C en permanence, ou un choc thermique quotidien (non pris en compte ici).` }
      : { id: 'legio-stock', label: 'Stockage ≥ 400 L maintenu à 55 °C', level: 'ok', detail: bigStorage ? `Stockage à ${fmtNum(i.Tstock, 3)} °C ≥ ${reg.stockageTmin_C} °C.` : 'Volume inférieur à 400 L : seuil non applicable.' });
  checks.push(i.TretourBoucle >= reg.bouclesTmin_C
    ? { id: 'legio-boucle', label: 'Boucle de distribution ≥ 50 °C en tout point', level: 'ok', detail: `Retour de boucle à ${fmtNum(i.TretourBoucle, 3)} °C ≥ ${reg.bouclesTmin_C} °C.` }
    : { id: 'legio-boucle', label: 'Boucle de distribution ≥ 50 °C en tout point', level: 'ko', detail: `Retour de boucle à ${fmtNum(i.TretourBoucle, 3)} °C < ${reg.bouclesTmin_C} °C : risque de développement de légionelles.` });
  checks.push(i.limitation50
    ? { id: 'brulure', label: 'Température aux points de puisage limitée à 50 °C', level: 'ok', detail: 'Limitation déclarée (mitigeurs thermostatiques) : protection contre les brûlures.' }
    : { id: 'brulure', label: 'Température aux points de puisage limitée à 50 °C', level: 'warn', detail: `Sans limitation, l’eau peut atteindre ${fmtNum(i.TretourBoucle, 3)} °C à ${fmtNum(i.Tstock, 3)} °C aux points de puisage : risque de brûlure (limite ${reg.puisageTmax_C} °C dans les pièces de toilette).` });
  if (i.TretourBoucle >= i.Tstock) checks.push({ id: 'boucle-incoh', label: 'Cohérence des températures', level: 'ko', detail: 'Le retour de boucle ne peut pas dépasser la température de stockage.' });
  if (i.Pdispo !== undefined) {
    checks.push(i.Pdispo >= retained.P - 1e-9
      ? { id: 'puissance', label: 'Puissance disponible suffisante', level: 'ok', detail: `${fmtNum(i.Pdispo, 4)} kW disponibles ≥ ${fmtNum(retained.P, 4)} kW requis.` }
      : { id: 'puissance', label: 'Puissance disponible suffisante', level: 'ko', detail: `${fmtNum(i.Pdispo, 4)} kW disponibles < ${fmtNum(retained.P, 4)} kW requis (mode ${MODE_LABEL[i.mode].toLowerCase()}) : augmenter le volume ou la puissance.` });
  }
  checks.push(sim.manque <= 1e-6
    ? { id: 'pointe', label: `Besoin de pointe couvert sur ${fmtNum(i.hPointe, 3)} h`, level: 'ok', detail: 'Le stock utile et la production couvrent le besoin cumulé à chaque instant.' }
    : { id: 'pointe', label: `Besoin de pointe couvert sur ${fmtNum(i.hPointe, 3)} h`, level: 'ko', detail: `Déficit de ${fmtNum(sim.manque, 3)} L à ${fmtNum(i.Tstock, 3)} °C, dès la minute ${sim.premierManque} : la puissance ou le volume retenu est insuffisant.` });
  if (n.Ns < ecs.pointes.Ns_minimal) checks.push({ id: 'ns', label: 'Taille minimale des formules de pointe', level: 'warn', detail: `Ns = ${fmtNum(n.Ns, 3)} < ${ecs.pointes.Ns_minimal} : les formules COSTIC de pointe sont établies pour des occupations plus importantes ; résultat indicatif.` });
  if (i.mode === 'semi') {
    if (Vsemi < vMin || Vsemi > vMax) checks.push({ id: 'abaque', label: 'Domaine de validité des abaques', level: 'warn', detail: `Volume ${fmtNum(Vsemi, 4)} L hors de ${vMin} à ${vMax} L : la corrélation COSTIC n’est pas appliquée, seul le bilan énergétique est retenu.` });
    if (i.circulateurArretable && Vsemi <= V1) checks.push({ id: 'v1', label: 'Volume minimal V1 (circulateur arrêtable)', level: 'warn', detail: `V = ${fmtNum(Vsemi, 4)} L ≤ V1 = ${fmtNum(V1, 4)} L : refroidissement possible à la remise en route du circulateur ; la corrélation à circulateur arrêtable n’est pas applicable.` });
    if (cSemi.Pcostic !== null && cSemi.Pbilan > cSemi.Pcostic * 1.0001) checks.push({ id: 'bilan', label: 'Bilan énergétique supérieur à la corrélation', level: 'warn', detail: `Le bilan énergétique (${fmtNum(cSemi.Pbilan, 4)} kW) dépasse la corrélation COSTIC (${fmtNum(cSemi.Pcostic, 4)} kW) : on retient le bilan.` });
  }
  if (i.mode === 'instantane' && i.generateur === 'pac') checks.push({ id: 'pac-inst', label: 'Pompe à chaleur en production instantanée', level: 'ko', detail: 'Une pompe à chaleur ne peut pas suivre la montée en puissance d’un puisage instantané : prévoir un stockage.' });
  if (i.mode === 'instantane' && i.generateur === 'chaudiere') checks.push({ id: 'cycles', label: 'Cyclage du générateur', level: 'warn', detail: 'En instantané, le générateur est sollicité à chaque puisage : vérifier sa plage de modulation pour éviter le cyclage court.' });
  if (i.mode === 'accumulation' && retained.V > ecs.taillesCommerciales_L[ecs.taillesCommerciales_L.length - 1]) checks.push({ id: 'multi', label: 'Plusieurs ballons', level: 'warn', detail: `Le besoin journalier impose ${retained.ballons} ballons de ${fmtNum(retained.V / retained.ballons, 4)} L en parallèle.` });
  if (hasStorage && retained.V / retained.ballons > ecs.pertesStatiques.volumeMax_L) checks.push({ id: 'erp', label: 'Pertes statiques hors du domaine du règlement 814/2013', level: 'warn', detail: `Le plafond de pertes (S = 16,66 + 8,33·V^0,4) est établi jusqu’à ${ecs.pertesStatiques.volumeMax_L} L ; il est extrapolé ici. TODO: source à vérifier.` });
  if (Object.values(i.tertiaire).some((u) => u.n > 0)) checks.push({ id: 'tertiaire', label: 'Usages tertiaires', level: 'warn', detail: 'Les formules de pointe sont celles du logement : les ratios et le profil réel des usages tertiaires sont à confirmer (valeurs modifiables).' });

  const e = n.eLitre;
  const formulas: Formula[] = [
    {
      label: 'Logement standard équivalent et besoin journalier',
      symbolic: 'N_s = \\sum_i n_i\\,c_i + \\frac{V_{40,\\mathrm{tert}}}{110} \\qquad E_j = \\frac{V_{40}\\,c_p\\,(40 - T_f)}{1000}',
      substituted: `N_s = ${FM(n.Ns, 4)} \\qquad E_j = \\frac{${FM(n.V40, 5)} \\times ${FM(CP, 4)} \\times (40 - ${FM(i.Tfroide)})}{1000} = ${FM(n.Ejour, 4)}\\ \\text{kWh/j}`,
      legend: [
        { symbol: 'n_i', meaning: 'nombre de logements du type i' }, { symbol: 'c_i', meaning: 'coefficient de logement standard (T3 = 1)' },
        { symbol: 'V_{40}', meaning: 'besoin journalier à 40 °C', unit: 'L/j' }, { symbol: 'c_p', meaning: 'capacité thermique de l’eau', unit: 'Wh/(L·K)' },
        { symbol: 'T_f', meaning: 'température d’eau froide', unit: '°C' }, { symbol: 'E_j', meaning: 'énergie utile journalière', unit: 'kWh/j' },
      ],
      note: 'Coefficients et besoins par type : COSTIC / ADEME 2016 (src/data/ecs.json). TODO: source à vérifier pour l’équivalence tertiaire → Ns.',
    },
    {
      label: 'Volume équivalent à la température de stockage',
      symbolic: 'V_{T_s} = V_{40}\\,\\frac{40 - T_f}{T_s - T_f}',
      substituted: `V_{T_s} = ${FM(n.V40, 5)} \\times \\frac{40 - ${FM(i.Tfroide)}}{${FM(i.Tstock)} - ${FM(i.Tfroide)}} = ${FM(n.Vjour, 4)}\\ \\text{L}`,
      legend: [{ symbol: 'T_s', meaning: 'température de stockage', unit: '°C' }],
      note: 'Équivalence en énergie : un litre à 40 °C vaut (40 − Tf)/(Ts − Tf) litre à Ts.',
    },
    {
      label: 'Besoins de pointe (formules COSTIC)',
      symbolic: 'V_{10} = 61\\,N_s^{0{,}503} \\quad V_{60} = 83\\,N_s^{0{,}708} \\quad V_{480} = 294\\,N_s^{0{,}762}',
      substituted: `\\begin{aligned} V_{10} &= ${FM(n.V10, 4)}\\ \\text{L} \\\\ V_{60} &= ${FM(n.V60, 4)}\\ \\text{L} \\\\ V_{480} &= ${FM(n.V480, 4)}\\ \\text{L} \\end{aligned}`,
      legend: [{ symbol: 'V_{10}, V_{60}, V_{480}', meaning: 'volumes de pointe sur 10 min, 1 h et 8 h, ramenés à Ts', unit: 'L' }],
      note: 'Formules en litres à 60 °C pour une eau froide à 9 °C, converties à Ts et Tf par conservation de l’énergie (src/data/ecs.json).',
    },
    {
      label: 'Pertes thermiques de la boucle',
      symbolic: 'P_{b} = k\\,\\frac{E_j}{24}',
      substituted: `P_{b} = ${i.boucle === 'saisie' ? `${FM(Pboucle, 4)}\\ \\text{kW (saisi)}` : `${FM(ecs.boucle[i.boucle].fraction_besoin_journalier, 2)} \\times \\frac{${FM(n.Ejour, 4)}}{24} = ${FM(Pboucle, 4)}\\ \\text{kW}`}`,
      legend: [{ symbol: 'k', meaning: '0,6 (neuf, SOCOL) ou 1 (ancien)' }, { symbol: 'P_b', meaning: 'pertes de boucle', unit: 'kW' }],
      note: 'Estimation forfaitaire de la page de référence. TODO: source à vérifier ; remplacer par un calcul sur le linéaire et l’isolation réels.',
    },
    {
      label: 'Puissance de l’échangeur pour un volume V (bilan des pointes)',
      symbolic: 'P(V) = P_b + \\max_t \\frac{\\left(D(t) - a\\,V\\right)^{+}\\,e}{t}',
      substituted: `P(${FM(semi.V, 4)}\\ \\text{L}) = ${FM(cSemi.Pbilan, 4)}\\ \\text{kW}`,
      legend: [
        { symbol: 'D(t)', meaning: 'besoin cumulé à l’instant t (interpolé entre 0, 10 min, 1 h, 8 h)', unit: 'L' }, { symbol: 'a', meaning: 'coefficient de stratification (volume utile / volume géométrique)' },
        { symbol: 'e', meaning: `énergie par litre à Ts : ${FM(e, 4)} kWh/L`, unit: 'kWh/L' }, { symbol: 't', meaning: 'durée écoulée', unit: 'h' },
      ],
      note: 'Bilan énergétique de la présente application : à chaque instant, stock utile + production cumulée ≥ besoin cumulé. Le ballon est supposé chargé au début de la pointe.',
    },
    {
      label: 'Semi-instantané : corrélation COSTIC 2019',
      symbolic: `P = N_s \\times ${i.circulateurArretable ? '17\\,V^{-0{,}385}' : '14\\,V^{-0{,}365}'} \\qquad V_1 = V_{10}\\,(2{,}4 + 0{,}18\\,P_b)`,
      substituted: `P = ${FM(n.Ns, 4)} \\times ${i.circulateurArretable ? '17' : '14'} \\times ${FM(semi.V, 4)}^{${i.circulateurArretable ? '-0{,}385' : '-0{,}365'}} = ${cSemi.Pcostic === null ? '\\text{non applicable}' : `${FM(cSemi.Pcostic, 4)}\\ \\text{kW}`} \\qquad V_1 = ${FM(V1, 4)}\\ \\text{L}`,
      legend: [{ symbol: 'V', meaning: 'volume géométrique du ballon', unit: 'L' }, { symbol: 'V_1', meaning: 'volume minimal anti-refroidissement (circulateur arrêtable)', unit: 'L' }],
      note: 'Valable de 300 à 4 000 L. Unité retenue : kW par logement standard. TODO: source à vérifier (unité exacte et expression de V1 à confirmer dans les publications COSTIC 2019). On retient le maximum entre la corrélation et le bilan énergétique.',
    },
    {
      label: 'Accumulation : puissance de reconstitution',
      symbolic: 'P = \\frac{1{,}163\\,V\\,(T_s - T_f)}{1000\\,t_r\\,\\eta} + P_b',
      substituted: `P = \\frac{${FM(CP, 4)} \\times ${FM(acc.V, 4)} \\times (${FM(i.Tstock)} - ${FM(i.Tfroide)})}{1000 \\times ${FM(i.tReconstitution)} \\times ${FM(ecs.rendementReconstitution, 2)}} + ${FM(Pboucle, 4)} = ${FM(acc.P, 4)}\\ \\text{kW}`,
      legend: [{ symbol: 't_r', meaning: 'durée de reconstitution', unit: 'h' }, { symbol: '\\eta', meaning: 'rendement de charge (pertes de charge) = 0,9' }],
      note: 'Le ballon est dimensionné sur le besoin journalier (V ≥ Vj/a). Les pertes de boucle sont ajoutées par prudence (non comprises dans la formule de la page de référence).',
    },
    {
      label: 'Instantané : puissance de pointe',
      symbolic: 'P = 6\\,E_{10} + P_b',
      substituted: `P = 6 \\times ${FM(n.E10, 4)} + ${FM(Pboucle, 4)} = ${FM(inst.P, 4)}\\ \\text{kW}`,
      legend: [{ symbol: 'E_{10}', meaning: 'énergie de la pointe de 10 min', unit: 'kWh' }],
      note: 'Pour t = 10 min, le bilan se ramène à 6·E10 + Pb ; le calcul prend le maximum sur toute la fenêtre.',
    },
    {
      label: 'Pertes annuelles',
      symbolic: 'Q = \\left(16{,}66 + 8{,}33\\,V^{0{,}4}\\right)\\frac{T_s - T_{amb}}{45}\\,\\frac{8760}{1000} + P_b\\,h_c\\,365',
      substituted: `Q = ${FM(retained.pertesStatiques, 4)} + ${FM(retained.pertesBoucle, 4)} = ${FM(retained.pertesTotal, 4)}\\ \\text{kWh/an}`,
      legend: [{ symbol: 'h_c', meaning: 'fonctionnement du circulateur', unit: 'h/j' }, { symbol: 'T_{amb}', meaning: 'température ambiante du local', unit: '°C' }],
      note: 'Pertes statiques : plafond du règlement (UE) 814/2013, ramené à l’écart de température réel. C’est un majorant, les ballons performants perdent moins. TODO: source à vérifier.',
    },
  ];

  const conclusion = `Mode ${MODE_LABEL[i.mode].toLowerCase()} : ${retained.V > 0 ? `${retained.ballons > 1 ? `${retained.ballons} ballons, soit ` : ''}${fmtNum(retained.V, 4)} L de stockage à ${fmtNum(i.Tstock, 3)} °C et ` : ''}${fmtNum(retained.P, 4)} kW d’échangeur pour ${fmtNum(n.Ns, 4)} logements standard (${fmtNum(n.Ejour, 4)} kWh/j utiles) ; pertes annuelles estimées ${fmtNum(retained.pertesTotal, 4)} kWh.`;

  return { needs: n, Pboucle, V1, profile: prof, couples, modes, retained, sim, checks, formulas, conclusion, errors: [] };
}

export function isOk(r: EcsResult | { errors: string[] }): r is EcsResult { return 'needs' in r; }
