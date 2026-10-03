'use client';
// Températures journalières depuis open-meteo.com (sans clé ni compte). Appel RÉSEAU explicite, déclenché par l'utilisateur :
// seuls partent une commune (ou ses coordonnées) et deux dates. Jamais une puissance, un nom de site ou un nom de fichier.
// Le reste de l'outil fonctionne hors ligne ; un relevé de températures importé en CSV remplace cet appel.
import type { Temps } from '@/monitoring/ipmvp';

const GEOCODE = 'https://geocoding-api.open-meteo.com/v1/search';
const ARCHIVE = 'https://archive-api.open-meteo.com/v1/archive';

export class MeteoError extends Error {}
export type Place = { label: string; lat: number; lon: number };

export async function searchPlace(name: string): Promise<Place[]> {
  try {
    const r = await fetch(`${GEOCODE}?name=${encodeURIComponent(name)}&count=5&language=fr&format=json`);
    if (!r.ok) throw new Error(`réponse ${r.status}`);
    const j = (await r.json()) as { results?: { name: string; admin1?: string; country?: string; country_code?: string; latitude: number; longitude: number }[] };
    return (j.results ?? []).map((h) => ({ label: [h.name, h.admin1, h.country_code !== 'FR' ? h.country : null].filter(Boolean).join(', '), lat: h.latitude, lon: h.longitude }));
  } catch (e) { throw new MeteoError(`Recherche impossible : ${e instanceof Error ? e.message : String(e)}`); }
}

/** Températures min/max du `from` au `to` (AAAA-MM-JJ, archives : s'arrêtent à la veille). */
export async function fetchTemperatures(p: Place, from: string, to: string): Promise<Temps> {
  const yesterday = new Date(Date.now() - 86400000); const y = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
  const end = to > y ? y : to;
  try {
    const r = await fetch(`${ARCHIVE}?latitude=${p.lat}&longitude=${p.lon}&start_date=${from}&end_date=${end}&daily=temperature_2m_max,temperature_2m_min&timezone=auto`);
    if (!r.ok) throw new Error(`réponse ${r.status}`);
    const j = (await r.json()) as { daily?: { time: string[]; temperature_2m_max: (number | null)[]; temperature_2m_min: (number | null)[] } };
    if (!j.daily?.time) throw new Error('réponse inattendue');
    const out: Temps = new Map();
    j.daily.time.forEach((d, i) => { const lo = j.daily!.temperature_2m_min[i]; const hi = j.daily!.temperature_2m_max[i]; if (typeof lo === 'number' && typeof hi === 'number') out.set(d, { tmin: lo, tmax: hi }); });
    return out;
  } catch (e) { throw new MeteoError(`Températures indisponibles : ${e instanceof Error ? e.message : String(e)}. L'outil reste utilisable sans elles ou avec un fichier de températures.`); }
}
