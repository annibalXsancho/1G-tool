// Interpolation linéaire dans une table triée par abscisse croissante.

export type Interp = { value: number; range: 'in' | 'below' | 'above' };

/** Hors table : la valeur est bornée à l'extrémité la plus proche (pas d'extrapolation) et `range` le signale. */
export function interpTable<T extends Record<string, number>>(points: T[], xKey: keyof T, yKey: keyof T, x: number): Interp {
  const n = points.length;
  if (n === 0) throw new Error('Table vide');
  const first = points[0];
  const last = points[n - 1];
  if (x < first[xKey]) return { value: first[yKey], range: 'below' };
  if (x > last[xKey]) return { value: last[yKey], range: 'above' };
  for (let i = 1; i < n; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (x <= b[xKey]) {
      const t = (x - a[xKey]) / (b[xKey] - a[xKey]);
      return { value: a[yKey] + t * (b[yKey] - a[yKey]), range: 'in' };
    }
  }
  return { value: last[yKey], range: 'in' };
}
