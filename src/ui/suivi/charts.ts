'use client';
// Graphiques Plotly du suivi : signature énergétique, série mesuré / attendu, CUSUM, économies par période.
import type { Data, Shape } from 'plotly.js';
import { fmtNum } from '@/core/fmt';
import type { Analysis } from '@/suivi/analyse';
import { REGRESSOR_LABEL, type Config } from '@/suivi/model';
import { alpha } from '../charts/theme';
import type { BuildChart } from '../charts/PlotlyChart';

const ROLE_NAME = { reference: 'Situation de référence', suivi: 'Période de suivi', hors: 'Hors fenêtres' } as const;
const roleColor = (role: keyof typeof ROLE_NAME, tok: (n: string) => string) => (role === 'reference' ? tok('--series-1') : role === 'suivi' ? tok('--series-3') : tok('--series-other'));

/** Signature : kWh par période en fonction de la variable (une seule) ; sinon mesuré en fonction de l'attendu. */
export function buildSignature(a: Analysis, cfg: Config): BuildChart {
  return (t) => {
    const one = a.regressors.length === 1;
    const r = a.regressors[0];
    const xOf = (l: Analysis['lines'][number]) => (one ? (r === 'dju' ? l.period.dju : r === 'djr' ? l.period.djr : l.period.x) : l.expected);
    const data: Data[] = (['reference', 'suivi', 'hors'] as const).flatMap((role) => {
      const ls = a.lines.filter((l) => l.role === role);
      if (ls.length === 0) return [];
      return [{
        type: 'scatter', mode: 'markers', name: ROLE_NAME[role], x: ls.map(xOf), y: ls.map((l) => l.period.kwh), text: ls.map((l) => l.period.start),
        marker: { size: 9, color: alpha(roleColor(role, t.token), 0.85), line: { color: t.surface, width: 1 } },
        hovertemplate: `%{text}<br>${one ? REGRESSOR_LABEL[r] : 'Attendu'} : %{x:,.1f}<br>Mesuré : %{y:,.0f} kWh<extra>${ROLE_NAME[role]}</extra>`,
      } as Data];
    });
    const xs = a.lines.map(xOf);
    const x0 = Math.min(...xs, 0); const x1 = Math.max(...xs);
    const line: [number, number][] = one ? [[x0, a.fit.coef[0] + a.fit.coef[1] * x0], [x1, a.fit.coef[0] + a.fit.coef[1] * x1]] : [[x0, x0], [x1, x1]];
    data.push({
      type: 'scatter', mode: 'lines', name: one ? `Modèle : ${fmtNum(a.fit.coef[0], 4)} + ${fmtNum(a.fit.coef[1], 4)} × ${r === 'dju' ? 'DJU' : r === 'djr' ? 'DJR' : 'x'} (R² ${fmtNum(a.fit.r2, 3)})` : 'Mesuré = attendu',
      x: line.map((p) => p[0]), y: line.map((p) => p[1]), line: { color: t.ink, width: 2, dash: 'dash' }, hoverinfo: 'skip',
    } as Data);
    return {
      data,
      layout: {
        xaxis: { title: { text: one ? `${REGRESSOR_LABEL[r]} par période` : 'Consommation attendue (kWh)' }, rangemode: 'tozero' },
        yaxis: { title: { text: `Énergie mesurée (kWh par ${cfg.grain === 'brut' ? 'période' : cfg.grain})` }, rangemode: 'tozero', tickformat: ',.0f' },
        legend: { orientation: 'h', x: 0, y: 1.14 }, margin: { l: 72, r: 16, t: 56, b: 56 },
      },
    };
  };
}

/** Mesuré (barres) et attendu (ligne), la situation de référence sur fond teinté. */
export function buildSeries(a: Analysis): BuildChart {
  return (t) => {
    const ls = a.lines;
    const ref = ls.filter((l) => l.role === 'reference');
    const shapes: Partial<Shape>[] = ref.length ? [{ type: 'rect', xref: 'x', yref: 'paper', x0: ref[0].period.start, x1: ref[ref.length - 1].period.start, y0: 0, y1: 1, fillcolor: alpha(t.token('--series-1'), 0.08), line: { width: 0 }, layer: 'below' }] : [];
    return {
      data: [
        { type: 'bar', name: 'Mesuré', x: ls.map((l) => l.period.start), y: ls.map((l) => l.period.kwh), marker: { color: ls.map((l) => alpha(roleColor(l.role, t.token), 0.7)) }, hovertemplate: '%{x}<br>Mesuré : %{y:,.0f} kWh<extra></extra>' } as Data,
        { type: 'scatter', mode: 'lines+markers', name: 'Attendu (modèle de référence)', x: ls.map((l) => l.period.start), y: ls.map((l) => l.expected), line: { color: t.ink, width: 2 }, marker: { size: 5, color: t.ink }, hovertemplate: '%{x}<br>Attendu : %{y:,.0f} kWh<extra></extra>' } as Data,
      ],
      layout: { shapes, yaxis: { title: { text: 'Énergie (kWh)' }, rangemode: 'tozero', tickformat: ',.0f' }, xaxis: { type: 'date' }, legend: { orientation: 'h', x: 0, y: 1.14 }, bargap: 0.25, margin: { l: 72, r: 16, t: 56, b: 48 } },
    };
  };
}

export function buildCusum(a: Analysis): BuildChart {
  return (t) => {
    const ls = a.lines;
    const sl = ls.filter((l) => l.role === 'suivi');
    const shapes: Partial<Shape>[] = sl.length ? [{ type: 'line', xref: 'x', yref: 'paper', x0: sl[0].period.start, x1: sl[0].period.start, y0: 0, y1: 1, line: { color: t.ink3, width: 1.5, dash: 'dot' } }] : [];
    return {
      data: [{
        type: 'scatter', mode: 'lines+markers', name: 'CUSUM des économies', x: ls.map((l) => l.period.start), y: ls.map((l) => l.cusum),
        line: { color: t.token('--series-3'), width: 2.5 }, marker: { size: 6, color: ls.map((l) => roleColor(l.role, t.token)) },
        hovertemplate: '%{x}<br>CUSUM : %{y:,.0f} kWh<extra></extra>',
      } as Data],
      layout: {
        shapes, showlegend: false,
        annotations: sl.length ? [{ x: sl[0].period.start, xref: 'x', y: 1, yref: 'paper', text: 'début du suivi', showarrow: false, yanchor: 'bottom', xanchor: 'left', font: { size: 11, color: t.ink3 } }] : [],
        xaxis: { type: 'date' }, yaxis: { title: { text: 'Économie cumulée (kWh)' }, tickformat: ',.0f', zeroline: true },
        margin: { l: 72, r: 16, t: 40, b: 48 },
      },
    };
  };
}

export function buildSavingsBars(a: Analysis): BuildChart {
  return (t) => {
    const ls = a.lines.filter((l) => l.role === 'suivi');
    return {
      data: [{
        type: 'bar', name: 'Économie', x: ls.map((l) => l.period.start), y: ls.map((l) => l.saving),
        marker: { color: ls.map((l) => (l.saving >= 0 ? t.token('--series-3') : t.token('--series-8'))) },
        hovertemplate: '%{x}<br>%{y:,.0f} kWh<extra></extra>',
      } as Data],
      layout: { showlegend: false, xaxis: { type: 'category' }, yaxis: { title: { text: 'Économie par période (kWh)' }, tickformat: ',.0f', zeroline: true }, margin: { l: 72, r: 16, t: 24, b: 48 }, bargap: 0.3 },
    };
  };
}
