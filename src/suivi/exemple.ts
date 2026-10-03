// Jeu d'exemple déterministe (graine fixe) : une usine à 350 kWh/DJU et 8 000 kWh/j de talon en semaine, 4 800 le
// week-end, relevée au jour du 01/01/2025 au 30/09/2026. Une action d'économie de 9 % démarre le 01/03/2026.
// Ces chiffres sont inventés pour la démonstration : ils retrouvent le test du tableau de bord (350 kWh/DJU).
import { addDays } from './aggregate';
import { heatingDegreeDay } from './dju';
import { defaultConfig, type Doc, type Row } from './model';

function lcg(seed: number) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

export const EXEMPLE_PENTE = 350;
export const EXEMPLE_BASE = 18;

export function exempleRows(): Row[] {
  const rnd = lcg(42);
  const rows: Row[] = [];
  const start = new Date(2025, 0, 1, 12);
  const end = new Date(2026, 8, 30, 12);
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const doy = Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 0, 12).getTime()) / 86400000);
    const tmean = 12 - 9 * Math.cos((2 * Math.PI * (doy - 15)) / 365) + (rnd() - 0.5) * 6;
    const half = 3.5 + rnd() * 1.5;
    const tmin = tmean - half; const tmax = tmean + half;
    const weekend = d.getDay() === 0 || d.getDay() === 6;
    let kwh = (weekend ? 4800 : 8000) + EXEMPLE_PENTE * heatingDegreeDay(tmin, tmax, EXEMPLE_BASE);
    kwh *= 1 + (rnd() - 0.5) * 0.04;
    if (d >= new Date(2026, 2, 1, 12)) kwh *= 0.91;
    const y = d.getFullYear(); const m = String(d.getMonth() + 1).padStart(2, '0'); const dd = String(d.getDate()).padStart(2, '0');
    rows.push({ date: `${y}-${m}-${dd}`, kwh: Math.round(kwh), tmin: Math.round(tmin * 10) / 10, tmax: Math.round(tmax * 10) / 10 });
  }
  return rows;
}

export function exempleDoc(): Doc {
  return {
    rows: exempleRows(),
    config: { ...defaultConfig(), nom: 'Usine (exemple)', grain: 'mois', base: EXEMPLE_BASE, baselineFrom: '2025-01-01', baselineTo: '2025-12-01', reportFrom: '2026-01-01', reportTo: '2026-09-01' },
  };
}
