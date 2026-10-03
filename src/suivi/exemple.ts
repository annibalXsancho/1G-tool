// Jeu d'exemple déterministe (graine fixe) : une usine à 350 kWh/DJU et 8 000 kWh/j de talon en semaine, 4 800 le
// week-end, relevée au jour du 01/01/2025 au 30/09/2026. Une action d'économie de 9 % démarre le 01/03/2026.
// Ces chiffres sont inventés pour la démonstration : la pente à retrouver est connue (350 kWh/DJU).
import { addDays, isoDate } from './aggregate';
import { coolingDegreeDay, heatingDegreeDay } from './dju';
import { defaultConfig, type Doc, type Row } from './model';
import { TD2_EX6, TD5_EX3 } from './exemple-cours';

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

type DonneesCours = { debut: string; consommationsKwh: readonly number[]; meteo: readonly (readonly [number, number])[] };

/** Un relevé mensuel par mois civil à partir de consommations mensuelles et de températures journalières [Tmax, Tmin]. */
export function lignesMensuelles(d: DonneesCours, base: number): Row[] {
  const [y, m, j] = d.debut.split('-').map(Number);
  const rows: Row[] = [];
  let k = 0;
  for (let i = 0; i < d.consommationsKwh.length; i++) {
    const debut = new Date(y, m - 1 + i, 1, 12);
    const n = new Date(debut.getFullYear(), debut.getMonth() + 1, 0).getDate();
    let dju = 0; let djr = 0;
    for (let d2 = 0; d2 < n && k < d.meteo.length; d2++, k++) { const [tmax, tmin] = d.meteo[k]; dju += heatingDegreeDay(tmin, tmax, base); djr += coolingDegreeDay(tmin, tmax, base); }
    rows.push({ date: isoDate(debut), kwh: d.consommationsKwh[i], dju, djr, jours: n });
  }
  void j;
  return rows;
}

const docCours = (d: DonneesCours, nom: string, saison: { debut: number; fin: number }): Doc => {
  const rows = lignesMensuelles(d, 18);
  return { rows, config: { ...defaultConfig(), nom, grain: 'brut', base: 18, periodsPerYear: 12, baselineFrom: rows[0].date, baselineTo: rows[rows.length - 1].date, reportFrom: '', reportTo: '', saison } };
};

/** TD n°5 exercice 3 : réseau de chaleur 2023 (chauffage de novembre à avril : talon nul). */
export const exempleReseauChaleur = (): Doc => docCours(TD5_EX3, 'TD réseau de chaleur 2023', { debut: 11, fin: 4 });
/** TD n°2 exercice 6 : bâtiment au gaz juin 2022 → mai 2023 (chauffage d'octobre à mai, talon d'ECS toute l'année). */
export const exempleBatimentGaz = (): Doc => docCours(TD2_EX6, 'TD bâtiment gaz 2022-2023', { debut: 10, fin: 5 });
