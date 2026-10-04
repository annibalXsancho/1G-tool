'use client';
// Graphiques Plotly du module hydraulique. Un seul axe des ordonnées par graphique.
import type { Data } from 'plotly.js';
import { fmtNum } from '@/core/fmt';
import type { NetResult } from '@/hydraulique/network';
import { alpha } from '../charts/theme';
import type { BuildChart } from '../charts/PlotlyChart';

/** Pression perdue le long du réseau : pente dans les tubes (frottement), marche à la fin de chaque tronçon (singularités du tronçon). */
export function buildProfile(r: NetResult, unit: 'Pa' | 'mbar' | 'mCE', rho: number): BuildChart {
  const k = unit === 'Pa' ? 1 : unit === 'mbar' ? 0.01 : 1 / (rho * 9.81);
  return (t) => {
    const xs: number[] = [0]; const ys: number[] = [0]; const ysSt: number[] = [0];
    let x = 0; let stat = 0; const hover: string[] = ['départ'];
    for (const s of r.sections) {
      x += s.section.L_m; stat += s.dpStatic;
      xs.push(x); ys.push((s.cumStart + s.dpLin) * k); ysSt.push((s.cumStart + s.dpLin) * k + (stat - s.dpStatic) * k + s.dpStatic * k); hover.push(`${s.section.nom || 'tronçon'} : fin du tube`);
      if (s.dpSing > 0) { xs.push(x); ys.push(s.cumEnd * k); ysSt.push(s.cumEnd * k + stat * k); hover.push(`singularités de « ${s.section.nom || 'tronçon'} » : ${s.items.map((i) => `${i.qty}× ${i.name}`).join(', ')}`); }
    }
    const data: Data[] = [{ type: 'scatter', mode: 'lines+markers', name: 'Pertes de frottement cumulées', x: xs, y: ys, text: hover, line: { color: t.accent, width: 2.5, shape: 'linear' }, marker: { size: 6, color: t.accent }, hovertemplate: `%{text}<br>x = %{x:,.1f} m<br>%{y:,.2f} ${unit}<extra></extra>` } as Data];
    if (r.dpStatic !== 0) data.push({ type: 'scatter', mode: 'lines', name: 'avec hauteur statique', x: xs, y: ysSt, line: { color: t.token('--series-2'), width: 2, dash: 'dash' }, hovertemplate: `%{x:,.1f} m<br>%{y:,.2f} ${unit}<extra></extra>` } as Data);
    return { data, layout: { xaxis: { title: { text: 'Distance le long du réseau (m)' }, rangemode: 'tozero' }, yaxis: { title: { text: `Pression à fournir (${unit})` }, rangemode: 'tozero', tickformat: unit === 'mCE' ? ',.2f' : ',.0f' }, legend: { orientation: 'h', x: 0, y: 1.14 }, margin: { l: 72, r: 16, t: 48, b: 48 } } };
  };
}

/** Pertes linéiques et singulières de chaque tronçon, empilées. */
export function buildSplit(r: NetResult): BuildChart {
  return (t) => {
    const names = r.sections.map((s, i) => s.section.nom || `Tronçon ${i + 1}`);
    return {
      data: [
        { type: 'bar', name: 'Linéiques (frottement dans le tube)', x: names, y: r.sections.map((s) => s.dpLin), marker: { color: t.token('--series-1') }, hovertemplate: '%{x}<br>%{y:,.0f} Pa<extra>linéiques</extra>' } as Data,
        { type: 'bar', name: 'Singulières (coudes, vannes…)', x: names, y: r.sections.map((s) => s.dpSing), marker: { color: alpha(t.token('--series-2'), 0.95) }, hovertemplate: '%{x}<br>%{y:,.0f} Pa<extra>singulières</extra>' } as Data,
      ],
      layout: { barmode: 'stack', yaxis: { title: { text: 'Perte de charge (Pa)' }, tickformat: ',.0f' }, legend: { orientation: 'h', x: 0, y: 1.16 }, margin: { l: 72, r: 16, t: 48, b: 48 }, bargap: 0.4, annotations: [{ xref: 'paper', yref: 'paper', x: 1, y: 1.14, showarrow: false, xanchor: 'right', text: `singularités : ${fmtNum(r.shareSing * 100, 3)} %`, font: { size: 12, color: t.ink2 } }] },
    };
  };
}

/** Répartition des pertes singulières par organe (tous tronçons confondus), du plus pénalisant au moins. */
export function buildItems(r: NetResult): BuildChart {
  return (t) => {
    const map = new Map<string, number>();
    r.sections.forEach((s) => s.items.forEach((i) => map.set(i.name, (map.get(i.name) ?? 0) + i.dp)));
    const rows = [...map.entries()].sort((a, b) => a[1] - b[1]);
    return { data: [{ type: 'bar', orientation: 'h', x: rows.map((q) => q[1]), y: rows.map((q) => q[0]), marker: { color: t.token('--series-2') }, hovertemplate: '%{y}<br>%{x:,.0f} Pa<extra></extra>' } as Data], layout: { showlegend: false, xaxis: { title: { text: 'Perte de charge (Pa)' }, tickformat: ',.0f' }, yaxis: { automargin: true }, margin: { l: 16, r: 16, t: 24, b: 48 }, bargap: 0.35 } };
  };
}
