'use client';
// Graphiques Plotly du module ECS : besoin cumulé et production, couples puissance-volume, comparaison des modes.
import type { Data, Shape } from 'plotly.js';
import { fmtNum } from '@/core/fmt';
import { MODE_LABEL, type EcsInput, type EcsResult, type Mode } from '@/ecs/calc';
import { alpha } from '../charts/theme';
import type { BuildChart } from '../charts/PlotlyChart';

export const MODE_TOKEN: Record<Mode, string> = { accumulation: '--series-1', semi: '--series-3', instantane: '--series-2' };

/** Besoin cumulé, capacité de production (stock utile + production) et stock restant, sur la fenêtre de pointe. */
export function buildCumulative(input: EcsInput, r: EcsResult, minute: number): BuildChart {
  return (t, ctx) => {
    const s = r.sim;
    const h = s.t.map((m) => m / 60);
    const cur = Math.max(0, Math.min(s.t.length - 1, Math.round(minute)));
    const shapes: Partial<Shape>[] = ctx.export ? [] : [{ type: 'line', xref: 'x', yref: 'paper', x0: h[cur], x1: h[cur], y0: 0, y1: 1, line: { color: t.ink, width: 1.5, dash: 'dot' } }];
    return {
      data: [
        { type: 'scatter', mode: 'lines', name: 'Stock utile restant', x: h, y: s.stock, line: { color: t.token('--series-3'), width: 0 }, fill: 'tozeroy', fillcolor: alpha(t.token('--series-3'), 0.28), hovertemplate: 'Stock restant : %{y:,.0f} L<extra></extra>' } as Data,
        { type: 'scatter', mode: 'lines', name: 'Besoin cumulé', x: h, y: s.demande, line: { color: t.token('--series-2'), width: 2.5 }, hovertemplate: 'Besoin cumulé : %{y:,.0f} L<extra></extra>' } as Data,
        { type: 'scatter', mode: 'lines', name: 'Stock utile + production', x: h, y: s.capacite, line: { color: t.token('--series-1'), width: 2.5, dash: 'dash' }, hovertemplate: 'Stock + production : %{y:,.0f} L<extra></extra>' } as Data,
      ],
      layout: {
        xaxis: { title: { text: 'Temps depuis le début de la pointe (h)' }, range: [0, Math.max(...h)], dtick: input.hPointe <= 2 ? 0.25 : 1 },
        yaxis: { title: { text: `Volume cumulé (L à ${fmtNum(input.Tstock, 3)} °C)` }, rangemode: 'tozero', tickformat: ',.0f' },
        shapes, hovermode: 'x unified',
        margin: { l: 72, r: 16, t: 48, b: 56 },
      },
    };
  };
}

/** Couples puissance-volume : bilan énergétique et corrélation COSTIC, tailles commerciales, couple retenu. */
export function buildCouples(input: EcsInput, r: EcsResult): BuildChart {
  return (t) => {
    const cs = r.couples;
    const semi = r.modes.semi;
    const data: Data[] = [
      { type: 'scatter', mode: 'lines+markers', name: 'Bilan énergétique des pointes', x: cs.map((c) => c.V), y: cs.map((c) => c.Pbilan), customdata: cs.map((c) => c.V) as unknown as never, line: { color: t.token('--series-1'), width: 2 }, marker: { size: 8, color: t.token('--series-1') }, hovertemplate: 'Ballon %{x:,.0f} L<br>Bilan : %{y:,.1f} kW<extra></extra>' } as Data,
      { type: 'scatter', mode: 'lines+markers', name: 'Corrélation COSTIC 2019', x: cs.filter((c) => c.Pcostic !== null).map((c) => c.V), y: cs.filter((c) => c.Pcostic !== null).map((c) => c.Pcostic as number), customdata: cs.filter((c) => c.Pcostic !== null).map((c) => c.V) as unknown as never, line: { color: t.token('--series-4'), width: 2, dash: 'dash' }, marker: { size: 8, symbol: 'diamond', color: t.token('--series-4') }, hovertemplate: 'Ballon %{x:,.0f} L<br>COSTIC : %{y:,.1f} kW<extra></extra>' } as Data,
      { type: 'scatter', mode: 'text+markers', name: 'Couple retenu', x: [semi.V], y: [semi.P], text: [`${fmtNum(semi.V, 4)} L · ${fmtNum(semi.P, 4)} kW`], textposition: 'top right', marker: { size: 15, color: 'rgba(0,0,0,0)', line: { color: t.ink, width: 2.5 } }, hovertemplate: 'Retenu : %{x:,.0f} L, %{y:,.1f} kW<extra></extra>' } as Data,
    ];
    const shapes: Partial<Shape>[] = [];
    if (input.circulateurArretable) shapes.push({ type: 'line', xref: 'x', yref: 'paper', x0: r.V1, x1: r.V1, y0: 0, y1: 1, line: { color: t.token('--series-8'), width: 1.5, dash: 'dot' } });
    if (input.Pdispo !== undefined) shapes.push({ type: 'line', xref: 'paper', yref: 'y', x0: 0, x1: 1, y0: input.Pdispo, y1: input.Pdispo, line: { color: t.ink3, width: 1.5, dash: 'dot' } });
    return {
      data,
      layout: {
        xaxis: { title: { text: 'Volume géométrique du ballon (L)' }, type: 'log', tickvals: cs.map((c) => c.V), ticktext: cs.map((c) => fmtNum(c.V, 4)), tickangle: 0 },
        yaxis: { title: { text: 'Puissance de l’échangeur (kW)' }, rangemode: 'tozero' },
        shapes, hovermode: 'closest',
        annotations: [
          ...(input.circulateurArretable ? [{ x: Math.log10(r.V1), xref: 'x' as const, y: 1, yref: 'paper' as const, text: 'V1', showarrow: false, yanchor: 'bottom' as const, font: { color: t.token('--series-8'), size: 11 } }] : []),
          ...(input.Pdispo !== undefined ? [{ x: 1, xref: 'paper' as const, y: input.Pdispo, yref: 'y' as const, text: 'disponible', showarrow: false, xanchor: 'right' as const, yanchor: 'bottom' as const, font: { color: t.ink3, size: 11 } }] : []),
        ],
        margin: { l: 64, r: 16, t: 48, b: 56 },
      },
    };
  };
}

export type CompareKey = 'V' | 'P' | 'pertesTotal';
const COMPARE_META: Record<CompareKey, { title: string; unit: string; fmt: string }> = {
  V: { title: 'Volume de stockage', unit: 'L', fmt: ',.0f' },
  P: { title: 'Puissance d’échangeur', unit: 'kW', fmt: ',.1f' },
  pertesTotal: { title: 'Pertes annuelles', unit: 'kWh/an', fmt: ',.0f' },
};

export function buildCompare(r: EcsResult, key: CompareKey, retained: Mode): BuildChart {
  const m = COMPARE_META[key];
  return (t) => {
    const modes: Mode[] = ['accumulation', 'semi', 'instantane'];
    const vals = modes.map((k) => r.modes[k][key]);
    return {
      data: [{
        type: 'bar', x: modes.map((k) => MODE_LABEL[k]), y: vals,
        marker: { color: modes.map((k) => (k === retained ? t.token(MODE_TOKEN[k]) : alpha(t.token(MODE_TOKEN[k]), 0.45))), line: { color: modes.map((k) => (k === retained ? t.ink : 'rgba(0,0,0,0)')), width: 2 } },
        text: vals.map((v) => `${fmtNum(v, 3)} ${m.unit}`), textposition: 'outside', cliponaxis: false,
        hovertemplate: `%{x}<br>%{y:${m.fmt}} ${m.unit}<extra></extra>`,
      } as Data],
      layout: {
        title: { text: m.title, x: 0, font: { size: 13 } },
        yaxis: { title: { text: m.unit }, rangemode: 'tozero', tickformat: m.fmt },
        xaxis: { automargin: true },
        margin: { l: 64, r: 16, t: 48, b: 40 }, showlegend: false, bargap: 0.4,
      },
    };
  };
}
