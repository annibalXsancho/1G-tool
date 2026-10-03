'use client';
// Graphiques Plotly du modèle de site : Sankey, consommation par usage, achats par énergie.
import type { Data, Layout } from 'plotly.js';
import { fmtNum } from '@/core/fmt';
import { fromSI } from '@/core/units';
import { LOSS_NODE_ID, type SiteAnalysis } from '@/site/analyse';
import { STATUS_LABEL, type SiteModel } from '@/site/model';
import { alpha } from '../charts/theme';
import type { BuildChart } from '../charts/PlotlyChart';
import { carrierColors } from './carriers';

export type SankeyOptions = {
  unit: 'MWh' | 'GWh' | 'tep';
  /** Énergies masquées par la légende (« Pertes » compris). */
  hidden: string[];
};

const legendAnnotations = (items: { name: string; color: string }[], ink2: string): Partial<Layout>['annotations'] =>
  [{
    xref: 'paper', yref: 'paper', x: 0, y: 0, yshift: -10, xanchor: 'left', yanchor: 'top', showarrow: false, align: 'left',
    font: { size: 12, color: ink2 },
    text: items.map((i) => `<span style="color:${i.color}">■</span> ${i.name}`).join('    '),
  }];

export function buildSankey(model: SiteModel, a: SiteAnalysis, opts: SankeyOptions): BuildChart {
  // Index de chaque flux du modèle dans `a.links` (les pertes calculées n'en ont pas) : sert au clic → édition.
  const flowIndex = new Map(model.flows.map((f, i) => [f, i]));
  return (t, ctx) => {
    const links = a.hasCycle ? [] : a.links.filter((l) => !opts.hidden.includes(l.carrier));
    const ids = [...new Set(links.flatMap((l) => [l.from, l.to]))];
    const order = [...model.nodes.map((n) => n.id).filter((id) => ids.includes(id)), ...(ids.includes(LOSS_NODE_ID) ? [LOSS_NODE_ID] : [])];
    const idx = new Map(order.map((id, k) => [id, k]));
    const label = (id: string) => (id === LOSS_NODE_ID ? 'Pertes de transformation' : model.nodes.find((n) => n.id === id)?.label ?? id);
    const conv = (j: number) => fromSI(j, 'energy', opts.unit);
    const total = (id: string) => Math.max(
      links.filter((l) => l.to === id).reduce((s, l) => s + l.value, 0),
      links.filter((l) => l.from === id).reduce((s, l) => s + l.value, 0),
    );
    const carriers = [...new Set(a.links.map((l) => l.carrier))];
    const colors = carrierColors(carriers);
    const shown = carriers.filter((c) => links.some((l) => l.carrier === c));
    const title = [model.name || 'Site', model.year ? String(model.year) : ''].filter(Boolean).join(' — ');
    const f = (j: number) => `${fmtNum(conv(j), 3)} ${opts.unit}`;

    const data: Data[] = [{
      type: 'sankey',
      arrangement: 'snap',
      valueformat: ',.0f',
      valuesuffix: ` ${opts.unit}`,
      node: {
        label: order.map((id) => `${label(id)} · ${f(total(id))}`),
        color: order.map((id) => (id === LOSS_NODE_ID ? t.ink3 : t.ink2)),
        pad: 22, thickness: 14, line: { width: 0 },
        hovertemplate: '%{label}<extra></extra>',
      },
      link: {
        source: links.map((l) => idx.get(l.from)!),
        target: links.map((l) => idx.get(l.to)!),
        value: links.map((l) => conv(l.value)),
        color: links.map((l) => alpha(t.token(colors.get(l.carrier)!), 0.55)),
        customdata: links.map((l) => [
          l.carrier,
          l.loss ? 'Pertes calculées (entrées − sorties)' : `${STATUS_LABEL[l.status]}${l.meter ? ` · compteur ${l.meter}` : ''} · cliquer pour modifier`,
          l.loss ? -1 : flowIndex.get(l) ?? -1,
        ]),
        hovertemplate: '%{source.label} → %{target.label}<br>%{customdata[0]} · %{value}<br>%{customdata[1]}<extra></extra>',
      },
      textfont: { color: t.ink, size: 12 },
    } as Data];

    return {
      data,
      layout: {
        title: {
          text: `<b>Flux énergétiques — ${title}</b><br><span style="font-size:11px;color:${t.ink2}">Énergie achetée ${f(a.totals.purchased)} · usages finaux ${f(a.totals.final)} · pertes de transformation ${f(a.totals.losses)}${opts.hidden.length ? ` · masqué : ${opts.hidden.join(', ')}` : ''}</span>`,
          x: 0, xanchor: 'left', font: { size: 15, color: t.ink },
        },
        // À l'écran, la légende est une barre de filtres cliquable au-dessus du graphique ; à l'export, elle est dessinée.
        margin: { l: 8, r: 8, t: 80, b: ctx.export ? 40 : 12 },
        annotations: ctx.export ? legendAnnotations(shown.map((c) => ({ name: c, color: t.token(colors.get(c)!) })), t.ink2) : [],
      },
    };
  };
}

/** Consommation finale par usage, triée (barres horizontales, une seule série). */
export function buildUsageBars(model: SiteModel, a: SiteAnalysis): BuildChart {
  return (t) => {
    const rows = a.balances.filter((b) => b.node.kind === 'usage' && b.in > 0).sort((x, y) => x.in - y.in);
    const total = rows.reduce((s, b) => s + b.in, 0) || 1;
    const v = rows.map((b) => fromSI(b.in, 'energy', 'MWh'));
    return {
      data: [{
        type: 'bar', orientation: 'h',
        x: v, y: rows.map((b) => b.node.label),
        marker: { color: t.accent },
        text: rows.map((b) => `${fmtNum(fromSI(b.in, 'energy', 'MWh'), 3)} MWh · ${fmtNum((b.in / total) * 100, 2)} %`),
        textposition: 'outside', cliponaxis: false, textfont: { color: t.ink2, size: 11 },
        hovertemplate: '%{y}<br>%{x:,.0f} MWh/an<extra></extra>',
      } as Data],
      layout: {
        title: { text: `<b>Consommation finale par usage</b> <span style="font-size:11px;color:${t.ink2}">MWh/an — ${model.name}</span>`, x: 0, xanchor: 'left', font: { size: 14 } },
        xaxis: { title: { text: 'MWh/an' }, rangemode: 'tozero' },
        yaxis: { automargin: true },
        margin: { l: 8, r: 120, t: 48, b: 48 },
        bargap: 0.35,
      },
    };
  };
}

/** Énergie achetée par vecteur (couleur = identité de l'énergie). */
export function buildPurchaseBars(a: SiteAnalysis): BuildChart {
  return (t) => {
    const colors = carrierColors(a.links.map((l) => l.carrier));
    const rows = a.totals.byCarrier;
    return {
      data: [{
        type: 'bar',
        x: rows.map((r) => r.carrier),
        y: rows.map((r) => fromSI(r.value, 'energy', 'MWh')),
        marker: { color: rows.map((r) => t.token(colors.get(r.carrier) ?? '--series-other')) },
        text: rows.map((r) => `${fmtNum(fromSI(r.value, 'energy', 'MWh'), 3)} MWh`),
        textposition: 'outside', cliponaxis: false, textfont: { color: t.ink2, size: 11 },
        hovertemplate: '%{x}<br>%{y:,.0f} MWh/an<extra></extra>',
      } as Data],
      layout: {
        title: { text: '<b>Énergie achetée par vecteur</b>', x: 0, xanchor: 'left', font: { size: 14 } },
        yaxis: { title: { text: 'MWh/an' }, rangemode: 'tozero' },
        margin: { l: 56, r: 16, t: 48, b: 48 },
        bargap: 0.5,
      },
    };
  };
}
