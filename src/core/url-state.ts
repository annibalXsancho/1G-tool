// Sérialisation de l'état brut en paramètres d'URL. Seules les valeurs qui
// diffèrent des défauts sont écrites : l'URL reste courte et lisible.
import { defaultRaw, type Raw } from './form';
import type { InputField } from './types';

function keysOf(fields: InputField[]): string[] {
  return fields.flatMap((f) => (f.type === 'choice' ? [f.key] : [f.key, `${f.key}~u`]));
}

export function rawToSearch(fields: InputField[], raw: Raw): string {
  const def = defaultRaw(fields);
  const p = new URLSearchParams();
  for (const k of keysOf(fields)) if (raw[k] !== undefined && raw[k] !== def[k]) p.set(k, raw[k]);
  return p.toString();
}

export function searchToRaw(fields: InputField[], params: URLSearchParams): Raw {
  const raw = defaultRaw(fields);
  for (const k of keysOf(fields)) {
    const v = params.get(k);
    if (v !== null) raw[k] = v;
  }
  return raw;
}
