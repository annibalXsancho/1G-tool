// Jeu d'exemple déterministe (graine fixe) : 3 compteurs au pas de 30 min du 01/01/2025 au 31/08/2026 et leurs températures.
//   « Process »      : 3×8, indépendant de la météo, week-ends ralentis ;
//   « CVC »          : chauffage sous 16 °C et climatisation au-dessus de 24 °C, réduits la nuit ;
//   « Éclairage et bureautique » : plage d'occupation 8 h → 19 h en semaine.
// Une vraie action est incluse : à partir du 01/03/2026 la consigne de chauffage est optimisée et la CVC consomme 12 % de moins.
// L'économie correspondante est connue exactement (`trueSavingKwh`) : elle sert de vérité à la simulation IPMVP.
// Ces chiffres sont inventés pour la démonstration.
import { isoDate } from '@/suivi/aggregate';
import type { Temps } from './ipmvp';
import type { Measure } from './types';

export const EXEMPLE_ACTION_DATE = new Date(2026, 2, 1).getTime();
export const EXEMPLE_ACTION_PCT = 12;
export const EXEMPLE_SITES = { process: 'Process', cvc: 'CVC', eclairage: 'Éclairage et bureautique' } as const;

function lcg(seed: number) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }

export function exempleMonitoring(): { rows: Measure[]; temps: Temps; trueSavingKwh: number; stepHours: number } {
  const rnd = lcg(2026);
  const step = 0.5;
  const rows: Measure[] = [];
  const temps: Temps = new Map();
  let trueSaving = 0;
  const start = new Date(2025, 0, 1); const end = new Date(2026, 7, 31);
  let drift = 0;
  for (let d = new Date(start); d <= end; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    const doy = Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 0).getTime()) / 86400000);
    drift = drift * 0.7 + (rnd() - 0.5) * 3.2; // les écarts de température persistent quelques jours
    const tmean = 11.5 - 9.5 * Math.cos((2 * Math.PI * (doy - 15)) / 365) + drift;
    const half = 3.8 + rnd() * 1.8;
    temps.set(isoDate(d), { tmin: Math.round((tmean - half) * 10) / 10, tmax: Math.round((tmean + half) * 10) / 10 });
    const weekend = d.getDay() === 0 || d.getDay() === 6;
    for (let k = 0; k < 48; k++) {
      const h = k * step;
      const t = new Date(d.getFullYear(), d.getMonth(), d.getDate(), Math.floor(h), (h % 1) * 60).getTime();
      const temp = tmean - half * Math.cos((2 * Math.PI * (h - 3)) / 24); // minimum vers 3 h, maximum vers 15 h
      const occupied = !weekend && h >= 8 && h < 19;
      const shift = h >= 6 && h < 22 ? 1 : 0.45;
      const process = (150 + 120 * shift) * (weekend ? 0.6 : 1) * (1 + (rnd() - 0.5) * 0.05);
      const setback = occupied ? 1 : 0.35;
      const cvcRaw = (5 * Math.max(0, 16 - temp) + 3.5 * Math.max(0, temp - 24)) * setback * (1 + (rnd() - 0.5) * 0.08) + 4;
      const act = d.getTime() >= EXEMPLE_ACTION_DATE;
      const cvc = act ? cvcRaw * (1 - EXEMPLE_ACTION_PCT / 100) : cvcRaw;
      if (act) trueSaving += (cvcRaw - cvc) * step;
      const eclairage = (occupied ? 32 : 6) * (1 + (rnd() - 0.5) * 0.06);
      rows.push({ t, site: EXEMPLE_SITES.process, kw: Math.round(process * 10) / 10 }, { t, site: EXEMPLE_SITES.cvc, kw: Math.round(cvc * 10) / 10 }, { t, site: EXEMPLE_SITES.eclairage, kw: Math.round(eclairage * 10) / 10 });
    }
  }
  return { rows, temps, trueSavingKwh: trueSaving, stepHours: step };
}
