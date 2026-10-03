// Briques communes à l'import de classeurs Excel : feuilles déjà lues (tableaux de cellules) et reconnaissance
// tolérante des en-têtes. Pur et testable sans fichier.
import { norm } from '@/site/model';

export type Cell = string | number | boolean | Date | null | undefined;
export type Sheet = { sheet: string; data: Cell[][] };

export const str = (c: Cell): string => (c === null || c === undefined ? '' : c instanceof Date ? c.toISOString().slice(0, 10) : String(c).trim());

/** Un en-tête correspond à un alias s'il lui est égal ou commence par lui suivi d'un espace ou d'une parenthèse. */
export function matches(header: string, aliases: string[]): boolean {
  const h = norm(header);
  return aliases.some((a) => h === a || h.startsWith(`${a} `) || h.startsWith(`${a}(`));
}

export const findSheet = (sheets: Sheet[], aliases: string[]): Sheet | undefined => sheets.find((s) => aliases.includes(norm(s.sheet)));

export type Header<K extends string> = { row: number; col: Partial<Record<K, number>>; raw: string[] };

/** Cherche, dans les 15 premières lignes, la ligne d'en-têtes contenant toutes les colonnes `required`. */
export function findHeader<K extends string>(data: Cell[][], cols: Record<K, string[]>, required: K[]): Header<K> | null {
  for (let r = 0; r < Math.min(data.length, 15); r++) {
    const raw = (data[r] ?? []).map((c) => String(c ?? ''));
    const col: Partial<Record<K, number>> = {};
    (Object.keys(cols) as K[]).forEach((k) => {
      const idx = raw.findIndex((h) => h && matches(h, cols[k]));
      if (idx >= 0 && col[k] === undefined) col[k] = idx;
    });
    if (required.every((k) => col[k] !== undefined)) return { row: r, col, raw };
  }
  return null;
}
