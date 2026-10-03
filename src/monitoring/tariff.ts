// Modèle tarifaire : énergie (heures pleines / creuses), abonnement, dépassements de puissance souscrite. Pur.
// Le poste « dépassements » est un ordre de grandeur : le TURPE réel facture chaque dépassement selon une somme quadratique
// propre au contrat ; ici on facture le dépassement maximal constaté. TODO: source à vérifier (barème TURPE du contrat).
import type { Measure } from './types';

export type Tariff = { subscribedKw: number; priceHp: number; priceHc: number; hcStart: number; hcEnd: number; subscriptionMonthly: number; overrunPerKw: number };
export const DEFAULT_TARIFF: Tariff = { subscribedKw: 0, priceHp: 0.19, priceHc: 0.13, hcStart: 22, hcEnd: 6, subscriptionMonthly: 0, overrunPerKw: 12 };

/** Heures creuses, y compris une plage qui enjambe minuit (22 h → 6 h). */
export function isOffPeak(hour: number, t: Pick<Tariff, 'hcStart' | 'hcEnd'>): boolean {
  if (t.hcStart === t.hcEnd) return false;
  return t.hcStart < t.hcEnd ? hour >= t.hcStart && hour < t.hcEnd : hour >= t.hcStart || hour < t.hcEnd;
}

export function costs(rows: Measure[], stepHours: number, t: Tariff, spanDays: number) {
  let hp = 0; let hc = 0;
  for (const r of rows) { const e = r.kw * stepHours; if (isOffPeak(new Date(r.t).getHours(), t)) hc += e; else hp += e; }
  const energyCost = hp * t.priceHp + hc * t.priceHc;
  return { energyHp: hp, energyHc: hc, energyCost, subscription: (t.subscriptionMonthly * spanDays) / 30.44, total: energyCost + (t.subscriptionMonthly * spanDays) / 30.44 };
}

export function overruns(curve: { t: number; kw: number }[], stepHours: number, t: Tariff) {
  if (!t.subscribedKw) return null;
  let hours = 0; let maxOver = 0;
  for (const p of curve) { const o = p.kw - t.subscribedKw; if (o > 0) { hours += stepHours; if (o > maxOver) maxOver = o; } }
  return { hours, maxOver, cost: maxOver * t.overrunPerKw };
}

/** Puissance dépassée seulement `share` % du temps : la souscription visée pour ne plus payer de pénalités qu'exceptionnellement. */
export function optimalPower(ld: { share: number; kw: number }[], share = 1): number | null {
  if (!ld.length) return null;
  return ld[Math.min(ld.length - 1, Math.floor((share / 100) * ld.length))].kw;
}
