'use client';
// Graphiques Plotly du monitoring. Un graphique = une fonction build(thème) ; un seul axe des ordonnées par graphique ;
// une couleur par compteur, attribuée dans l'ordre alphabétique (filtrer ne repeint jamais les séries restantes).
import type { Data, Shape } from 'plotly.js';
import { fmtNum } from '@/core/fmt';
import type { Analysis } from '@/suivi/analyse';
import type { Alarm, ControlChart, Detection, OptionResult } from '@/monitoring/ipmvp';
import type { Agg, Profile } from '@/monitoring/series';
import { alpha } from '../charts/theme';
import type { BuildChart } from '../charts/PlotlyChart';

const colorOf = (sites: string[], site: string, tok: (n: string) => string) => tok(`--series-${(Math.max(0, sites.indexOf(site)) % 8) + 1}`);

export function buildPower(agg: Agg[], sites: string[], unitLabel: string): BuildChart {
  return (t) => ({
    data: sites.filter((s) => agg.some((a) => a.site === s)).map((s) => {
      const rows = agg.filter((a) => a.site === s);
      return { type: 'scatter', mode: 'lines', name: s, x: rows.map((r) => new Date(r.t)), y: rows.map((r) => r.kw), line: { color: colorOf(sites, s, t.token), width: 1.4 }, hovertemplate: `${s}<br>%{x|%d/%m/%Y %H:%M}<br>%{y:,.1f} kW<extra></extra>` } as Data;
    }),
    layout: { xaxis: { type: 'date' }, yaxis: { title: { text: `Puissance ${unitLabel} (kW)` }, rangemode: 'tozero', tickformat: ',.0f' }, hovermode: 'x unified', legend: { orientation: 'h', x: 0, y: 1.12 }, margin: { l: 64, r: 16, t: 48, b: 40 } },
  });
}

export function buildEnergy(agg: Agg[], sites: string[]): BuildChart {
  return (t) => ({
    data: sites.filter((s) => agg.some((a) => a.site === s)).map((s) => {
      const rows = agg.filter((a) => a.site === s);
      return { type: 'bar', name: s, x: rows.map((r) => new Date(r.t)), y: rows.map((r) => r.kwh), marker: { color: colorOf(sites, s, t.token), line: { color: t.surface, width: 0.5 } }, hovertemplate: `${s}<br>%{x|%d/%m/%Y}<br>%{y:,.0f} kWh<extra></extra>` } as Data;
    }),
    layout: { barmode: 'stack', xaxis: { type: 'date' }, yaxis: { title: { text: 'Énergie (kWh)' }, tickformat: ',.0f' }, legend: { orientation: 'h', x: 0, y: 1.12 }, margin: { l: 64, r: 16, t: 48, b: 40 }, bargap: 0.1 },
  });
}

export function buildMonotone(ld: { share: number; kw: number }[], subscribed: number, optimal: number | null): BuildChart {
  return (t) => {
    const step = Math.max(1, Math.floor(ld.length / 1500)); const pts = ld.filter((_, i) => i % step === 0);
    const shapes: Partial<Shape>[] = subscribed ? [{ type: 'line', xref: 'paper', yref: 'y', x0: 0, x1: 1, y0: subscribed, y1: subscribed, line: { color: t.token('--series-8'), width: 1.5, dash: 'dash' } }] : [];
    return {
      data: [{ type: 'scatter', mode: 'lines', name: 'Puissance totale', x: pts.map((p) => p.share), y: pts.map((p) => p.kw), fill: 'tozeroy', fillcolor: alpha(t.accent, 0.15), line: { color: t.accent, width: 2 }, hovertemplate: 'Dépassée %{x:.1f} % du temps<br>%{y:,.1f} kW<extra></extra>' } as Data],
      layout: {
        shapes, showlegend: false, xaxis: { title: { text: 'Part du temps où la puissance est atteinte ou dépassée (%)' }, range: [0, 100] }, yaxis: { title: { text: 'Puissance (kW)' }, rangemode: 'tozero', tickformat: ',.0f' }, margin: { l: 64, r: 16, t: 32, b: 48 },
        annotations: [...(subscribed ? [{ x: 1, xref: 'paper' as const, y: subscribed, yref: 'y' as const, text: `souscrite ${fmtNum(subscribed, 4)} kW`, showarrow: false, xanchor: 'right' as const, yanchor: 'bottom' as const, font: { size: 11, color: t.token('--series-8') } }] : []), ...(optimal ? [{ x: 1, xref: 'paper' as const, y: optimal, yref: 'y' as const, text: `visée ${fmtNum(optimal, 4)} kW (dépassée 1 % du temps)`, showarrow: false, xanchor: 'right' as const, yanchor: 'top' as const, font: { size: 11, color: t.ink3 } }] : [])],
      },
    };
  };
}

export function buildHeat(m: { days: number[]; hours: number[]; z: (number | null)[][] }): BuildChart {
  return (t) => ({
    data: [{ type: 'heatmap', x: m.days.map((d) => new Date(d)), y: m.hours.map((h) => `${String(h).padStart(2, '0')} h`), z: m.z, zmin: 0, colorscale: [[0, alpha(t.accent, 0.04)], [1, t.accent]], xgap: m.days.length > 90 ? 0 : 2, ygap: 2, hovertemplate: '%{x|%d/%m} · %{y}<br>%{z:,.0f} kW<extra></extra>', colorbar: { title: { text: 'kW' }, thickness: 10, len: 0.9 } } as Data],
    layout: { xaxis: { showgrid: false, type: 'date' }, yaxis: { autorange: 'reversed', showgrid: false }, hovermode: 'closest', margin: { l: 56, r: 16, t: 24, b: 40 } },
  });
}

export function buildProfiles(ouvre: Profile, we: Profile): BuildChart {
  return (t) => {
    const mk = (p: Profile, name: string, tok: string): Data[] => [
      { type: 'scatter', mode: 'lines', x: p.hours, y: p.p90, line: { width: 0 }, hoverinfo: 'skip', showlegend: false } as Data,
      { type: 'scatter', mode: 'lines', x: p.hours, y: p.p10, fill: 'tonexty', fillcolor: alpha(t.token(tok), 0.18), line: { width: 0 }, hoverinfo: 'skip', showlegend: false } as Data,
      { type: 'scatter', mode: 'lines', name: `${name} (${p.days} j)`, x: p.hours, y: p.mean, line: { color: t.token(tok), width: 2.5 }, hovertemplate: `${name}<br>%{x} h : %{y:,.0f} kW<extra></extra>` } as Data,
    ];
    return { data: [...mk(ouvre, 'Jour ouvré', '--series-1'), ...mk(we, 'Week-end', '--series-4')], layout: { xaxis: { title: { text: 'Heure' }, dtick: 3, range: [0, 23] }, yaxis: { title: { text: 'Puissance totale (kW), moyenne et bande 10 %–90 %' }, rangemode: 'tozero', tickformat: ',.0f' }, legend: { orientation: 'h', x: 0, y: 1.12 }, margin: { l: 64, r: 16, t: 48, b: 48 } } };
  };
}

const ALARM_COLOR: Record<Alarm['kind'], string> = { '3 sigma': '--series-8', '2 sigma': '--series-4', série: '--series-5', 'CUSUM+': '--series-8', 'CUSUM−': '--series-3' };

/** Résidus normalisés (mesuré − attendu en écarts-types) avec limites ±2σ et ±3σ ; les alarmes sont marquées. */
export function buildControl(a: Analysis, cc: ControlChart): BuildChart {
  return (t) => {
    const x = a.lines.map((l) => new Date(l.period.start));
    const shapes: Partial<Shape>[] = [2, -2].map((v) => ({ type: 'line', xref: 'paper', yref: 'y', x0: 0, x1: 1, y0: v, y1: v, line: { color: t.token('--series-4'), width: 1, dash: 'dot' } } as Partial<Shape>)).concat([3, -3].map((v) => ({ type: 'line', xref: 'paper', yref: 'y', x0: 0, x1: 1, y0: v, y1: v, line: { color: t.token('--series-8'), width: 1.2, dash: 'dash' } } as Partial<Shape>)));
    const sl = a.lines.find((l) => l.role === 'suivi');
    if (sl) shapes.push({ type: 'line', xref: 'x', yref: 'paper', x0: sl.period.start, x1: sl.period.start, y0: 0, y1: 1, line: { color: t.ink3, width: 1.5, dash: 'dot' } });
    const kinds = ['3 sigma', '2 sigma', 'série'] as const;
    const marks: Data[] = kinds.map((k) => { const al = cc.alarms.filter((q) => q.kind === k); return { type: 'scatter', mode: 'markers', name: `Alarme ${k}`, x: al.map((q) => x[q.index]), y: al.map((q) => cc.z[q.index]), marker: { size: 9, color: t.token(ALARM_COLOR[k]), symbol: k === 'série' ? 'diamond' : 'circle', line: { color: t.surface, width: 1 } }, hovertemplate: `%{x|%d/%m/%Y}<br>${k} : %{y:.1f} σ<extra></extra>` } as Data; }).filter((d) => ((d as { x: unknown[] }).x).length > 0);
    return {
      data: [{ type: 'scatter', mode: 'lines', name: 'Écart au modèle', x, y: cc.z, line: { color: t.ink2, width: 1.2 }, hovertemplate: '%{x|%d/%m/%Y}<br>%{y:.2f} σ<extra></extra>' } as Data, ...marks],
      layout: { shapes, xaxis: { type: 'date' }, yaxis: { title: { text: 'Écart (écarts-types ; + = surconsommation)' }, zeroline: true }, legend: { orientation: 'h', x: 0, y: 1.16 }, margin: { l: 64, r: 16, t: 56, b: 40 } },
    };
  };
}

export function buildCusumTab(a: Analysis, cc: ControlChart): BuildChart {
  return (t) => {
    const x = a.lines.map((l) => new Date(l.period.start));
    return {
      data: [
        { type: 'scatter', mode: 'lines', name: 'CUSUM + (dérive à la hausse)', x, y: cc.cplus, line: { color: t.token('--series-8'), width: 2 }, hovertemplate: '%{x|%d/%m/%Y}<br>C⁺ = %{y:.2f} σ<extra></extra>' } as Data,
        { type: 'scatter', mode: 'lines', name: 'CUSUM − (économie)', x, y: cc.cminus.map((v) => -v), line: { color: t.token('--series-3'), width: 2 }, hovertemplate: '%{x|%d/%m/%Y}<br>C⁻ = %{y:.2f} σ<extra></extra>' } as Data,
      ],
      layout: { shapes: [{ type: 'line', xref: 'paper', yref: 'y', x0: 0, x1: 1, y0: 5, y1: 5, line: { color: t.ink3, width: 1, dash: 'dash' } }, { type: 'line', xref: 'paper', yref: 'y', x0: 0, x1: 1, y0: -5, y1: -5, line: { color: t.ink3, width: 1, dash: 'dash' } }], xaxis: { type: 'date' }, yaxis: { title: { text: 'CUSUM tabulaire (écarts-types)' }, zeroline: true }, legend: { orientation: 'h', x: 0, y: 1.16 }, margin: { l: 64, r: 16, t: 56, b: 40 } },
    };
  };
}

/** Vérité et estimations des options A, B, C avec leur incertitude (barres d'erreur). */
export function buildOptions(options: OptionResult[], truth: number): BuildChart {
  return (t) => ({
    data: [{ type: 'bar', x: options.map((o) => `Option ${o.option}`), y: options.map((o) => o.estimate), error_y: { type: 'data', array: options.map((o) => o.U), visible: true, color: t.ink, thickness: 1.5, width: 6 }, marker: { color: options.map((o) => (o.within ? t.token('--series-3') : t.token('--series-8'))) }, text: options.map((o) => `${fmtNum(o.estimate, 4)} kWh`), textposition: 'outside', cliponaxis: false, hovertemplate: '%{x}<br>%{y:,.0f} kWh<extra></extra>' } as Data],
    layout: {
      showlegend: false, shapes: [{ type: 'line', xref: 'paper', yref: 'y', x0: 0, x1: 1, y0: truth, y1: truth, line: { color: t.ink, width: 2, dash: 'dash' } }],
      annotations: [{ x: 1, xref: 'paper', y: truth, yref: 'y', text: `vérité ${fmtNum(truth, 5)} kWh`, showarrow: false, xanchor: 'right', yanchor: 'bottom', font: { size: 11, color: t.ink } }],
      yaxis: { title: { text: 'Économie estimée (kWh) et incertitude' }, rangemode: 'tozero', tickformat: ',.0f' }, margin: { l: 72, r: 16, t: 40, b: 40 }, bargap: 0.5,
    },
  });
}

export function buildDetection(d: Detection): BuildChart {
  return (t) => ({
    data: [{ type: 'scatter', mode: 'lines+markers', name: 'Probabilité de détection', x: d.fractions.map((f) => f * 100), y: d.power.map((p) => p * 100), line: { color: t.accent, width: 2.5 }, marker: { size: 7, color: t.accent }, hovertemplate: 'Économie vraie %{x:.1f} %<br>détectée dans %{y:.0f} % des cas<extra></extra>' } as Data],
    layout: {
      showlegend: false, shapes: [{ type: 'line', xref: 'x', yref: 'paper', x0: d.minDetectable * 100, x1: d.minDetectable * 100, y0: 0, y1: 1, line: { color: t.token('--series-4'), width: 1.5, dash: 'dash' } }, { type: 'line', xref: 'paper', yref: 'y', x0: 0, x1: 1, y0: 80, y1: 80, line: { color: t.ink3, width: 1, dash: 'dot' } }],
      annotations: [{ x: d.minDetectable * 100, xref: 'x', y: 1, yref: 'paper', text: `seuil ${fmtNum(d.minDetectable * 100, 3)} %`, showarrow: false, yanchor: 'bottom', xanchor: 'left', font: { size: 11, color: t.token('--series-4') } }],
      xaxis: { title: { text: 'Économie vraie (% de la consommation attendue)' }, rangemode: 'tozero' }, yaxis: { title: { text: 'Probabilité de détection (%)' }, range: [0, 102] }, margin: { l: 64, r: 16, t: 40, b: 48 },
    },
  });
}
