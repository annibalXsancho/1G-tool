'use client';
// Thème des graphiques Plotly, lu dans les tokens CSS de la page (clair/sombre), ou thème clair fixe pour les exports.
import type { Layout } from 'plotly.js';
import { EXPORT_COLORS } from '../site/carriers';

export type ChartTheme = {
  ink: string; ink2: string; ink3: string; rule: string; surface: string; accent: string;
  /** Couleur résolue d'un token (--series-1…, --series-loss…). */
  token: (name: string) => string;
};

const TOKENS = ['--ink', '--ink-2', '--ink-3', '--rule', '--surface', '--accent',
  '--series-1', '--series-2', '--series-3', '--series-4', '--series-5', '--series-6', '--series-7', '--series-8', '--series-other', '--series-loss'];

function make(get: (name: string) => string): ChartTheme {
  return { ink: get('--ink'), ink2: get('--ink-2'), ink3: get('--ink-3'), rule: get('--rule'), surface: get('--surface'), accent: get('--accent'), token: get };
}

export function readTheme(): ChartTheme {
  const cs = getComputedStyle(document.documentElement);
  const cache = new Map(TOKENS.map((t) => [t, cs.getPropertyValue(t).trim()]));
  return make((n) => cache.get(n) || cs.getPropertyValue(n).trim() || '#888888');
}

export const exportTheme = (): ChartTheme => make((n) => EXPORT_COLORS[n] ?? (n === '--accent' ? '#0f6b5c' : '#888888'));

export const FONT = "'IBM Plex Sans', Arial, sans-serif";

/** Mise en page commune : fond transparent (fond de la page) ou blanc à l'export, grille discrète, séparateurs français. */
export function baseLayout(t: ChartTheme, forExport = false): Partial<Layout> {
  return {
    paper_bgcolor: forExport ? t.surface : 'rgba(0,0,0,0)',
    plot_bgcolor: forExport ? t.surface : 'rgba(0,0,0,0)',
    font: { family: FONT, size: 12, color: t.ink },
    separators: ', ',
    margin: { l: 56, r: 16, t: 48, b: 48 },
    colorway: [1, 2, 3, 4, 5, 6, 7, 8].map((k) => t.token(`--series-${k}`)),
    hoverlabel: { bgcolor: t.surface, bordercolor: t.rule, font: { family: FONT, color: t.ink, size: 12 } },
    xaxis: { gridcolor: t.rule, linecolor: t.rule, zerolinecolor: t.rule, tickfont: { color: t.ink2 }, automargin: true },
    yaxis: { gridcolor: t.rule, linecolor: t.rule, zerolinecolor: t.rule, tickfont: { color: t.ink2 }, automargin: true },
    legend: { orientation: 'h', x: 0, y: 1.08, font: { color: t.ink2 } },
  };
}

/** Couleur hexadécimale → rgba avec opacité. */
export function alpha(hex: string, a: number): string {
  const h = hex.replace('#', '');
  if (h.length !== 6) return hex;
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
