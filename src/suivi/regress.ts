// Régression linéaire multiple par moindres carrés (1 à 3 variables explicatives) et quantiles de Student. Pur.
import { suivi } from '@/data';

export type Fit = {
  /** Noms des coefficients : « talon » puis les variables. */
  names: string[];
  /** Coefficients : talon en premier, puis un par variable. */
  coef: number[];
  se: number[];
  /** Statistique t de chaque coefficient (coef / erreur standard). */
  t: number[];
  n: number;
  /** Nombre de paramètres, talon compris. */
  p: number;
  dof: number;
  r2: number;
  rmse: number;
  /** CV(RMSE) = RMSE / moyenne mesurée, en fraction. */
  cvrmse: number;
  /** NMBE = Σ(y − ŷ) / ((n − p) · ȳ), en fraction. */
  nmbe: number;
  mean: number;
};

/** Inverse d'une matrice carrée par Gauss-Jordan avec pivot partiel ; null si singulière. */
export function invert(a: number[][]): number[][] | null {
  const n = a.length;
  const m = a.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  const scale = Math.max(...a.flat().map(Math.abs), 1e-300);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(m[r][c]) > Math.abs(m[piv][c])) piv = r;
    if (Math.abs(m[piv][c]) < 1e-12 * scale) return null;
    [m[c], m[piv]] = [m[piv], m[c]];
    const d = m[c][c];
    for (let j = 0; j < 2 * n; j++) m[c][j] /= d;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = m[r][c];
      if (f !== 0) for (let j = 0; j < 2 * n; j++) m[r][j] -= f * m[c][j];
    }
  }
  return m.map((row) => row.slice(n));
}

/** y = a + Σ bj·xj. `X` : une ligne par observation, une colonne par variable (sans le talon). */
export function ols(X: number[][], y: number[], varNames: string[]): Fit | null {
  const n = y.length;
  const k = varNames.length;
  const p = k + 1;
  if (n < p + 1 || X.length !== n) return null;
  const A = X.map((row) => [1, ...row]);
  const XtX = Array.from({ length: p }, () => Array<number>(p).fill(0));
  const Xty = Array<number>(p).fill(0);
  for (let i = 0; i < n; i++) {
    for (let a = 0; a < p; a++) {
      Xty[a] += A[i][a] * y[i];
      for (let b = 0; b < p; b++) XtX[a][b] += A[i][a] * A[i][b];
    }
  }
  const inv = invert(XtX);
  if (!inv) return null;
  const coef = inv.map((row) => row.reduce((s, v, j) => s + v * Xty[j], 0));
  const mean = y.reduce((s, v) => s + v, 0) / n;
  let sse = 0; let sst = 0; let sumRes = 0;
  for (let i = 0; i < n; i++) {
    const res = y[i] - A[i].reduce((s, v, j) => s + v * coef[j], 0);
    sse += res * res; sumRes += res; sst += (y[i] - mean) ** 2;
  }
  const dof = n - p;
  const sigma2 = sse / dof;
  const se = inv.map((row, i) => Math.sqrt(Math.max(0, sigma2 * row[i])));
  const rmse = Math.sqrt(sigma2);
  return {
    names: ['talon', ...varNames], coef, se, t: coef.map((c, i) => (se[i] > 0 ? c / se[i] : c === 0 ? 0 : Infinity)),
    n, p, dof, r2: sst > 0 ? 1 - sse / sst : 0, rmse, cvrmse: mean !== 0 ? rmse / Math.abs(mean) : Infinity,
    nmbe: mean !== 0 ? sumRes / (dof * mean) : 0, mean,
  };
}

export const predict = (fit: Fit, x: number[]) => fit.coef[0] + x.reduce((s, v, j) => s + fit.coef[j + 1] * v, 0);

export type Confidence = 0.8 | 0.9 | 0.95;

/** Quantile de Student bilatéral : table pour 1 à 30, 40, 60, 120 ddl, interpolation en 1/ddl, limite normale au-delà. */
export function tCritical(dof: number, conf: Confidence): number {
  const key = String(Math.round(conf * 100)) as '80' | '90' | '95';
  const tab = suivi.student;
  const d = tab.dof; const v = tab[key];
  const inf = tab.infini[key];
  if (!(dof >= 1)) return NaN;
  if (dof <= 30) return v[Math.round(dof) - 1];
  if (dof >= 120) {
    const w = (1 / 120 - 1 / dof) / (1 / 120);
    return v[v.length - 1] + (inf - v[v.length - 1]) * Math.min(1, Math.max(0, w));
  }
  let i = d.findIndex((x) => x >= dof);
  if (i <= 0) i = 1;
  const x0 = 1 / d[i - 1]; const x1 = 1 / d[i];
  return v[i - 1] + ((v[i] - v[i - 1]) * (1 / dof - x0)) / (x1 - x0);
}
