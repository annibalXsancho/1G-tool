'use client';
// Graphiques Plotly de l'analyse de couverture : barres empilées actuel/cible et treemap de l'installation.
import type { Data } from 'plotly.js';
import { fmtNum } from '@/core/fmt';
import { buildTree, evaluate, type Evaluation, type NodeState } from '@/metering/analyse';
import type { Plan, Scenario } from '@/metering/model';
import { alpha } from '../charts/theme';
import type { BuildChart } from '../charts/PlotlyChart';

const BASIS_LABEL = { annuel: 'consommation annuelle estimée', puissance: 'puissance installée', nombre: 'nombre de postes terminaux' } as const;

export function buildCoverageBars(actual: Evaluation, target: Evaluation): BuildChart {
  return (t) => {
    const rows = [['Scénario cible', target], ['État actuel', actual]] as const;
    const pct = (e: Evaluation, k: 'mesure' | 'difference' | 'inconnu') => (e.total > 0 ? (e.byState[k] / e.total) * 100 : 0);
    const series = [
      { key: 'mesure' as const, name: 'Mesuré directement', color: t.accent },
      { key: 'difference' as const, name: 'Déduit par différence', color: alpha(t.accent, 0.45) },
      { key: 'inconnu' as const, name: 'Non instrumenté', color: t.token('--series-4') },
    ];
    return {
      data: series.map((s) => ({
        type: 'bar', orientation: 'h', name: s.name,
        y: rows.map((r) => r[0]), x: rows.map((r) => pct(r[1], s.key)),
        marker: { color: s.color, line: { color: t.surface, width: 2 } },
        text: rows.map((r) => (pct(r[1], s.key) >= 6 ? `${fmtNum(pct(r[1], s.key), 3)} %` : '')),
        textposition: 'inside', insidetextanchor: 'middle', textfont: { color: s.key === 'difference' ? t.ink : '#ffffff', size: 12 },
        hovertemplate: `${s.name}<br>%{y} : %{x:.1f} %<extra></extra>`,
      } as Data)),
      layout: {
        barmode: 'stack',
        xaxis: { range: [0, 100], title: { text: `Part du total (${BASIS_LABEL[actual.basis]}) en %` }, ticksuffix: ' %' },
        yaxis: { automargin: true },
        margin: { l: 8, r: 16, t: 40, b: 56 },
        bargap: 0.4,
        legend: { orientation: 'h', x: 0, y: 1.2 },
      },
    };
  };
}

const STATE_NAME: Record<NodeState, string> = {
  mesure: 'mesuré', agrege: 'agrégé', difference: 'par différence', inconnu: 'non instrumenté', reserve: 'réserve / sans conso.', exclu: 'hors périmètre',
};

export function buildTreemap(plan: Plan, scenario: Scenario): BuildChart {
  const tree = buildTree(plan);
  const ev = evaluate(plan, scenario, tree);
  return (t) => {
    // On ne garde que les postes qui portent du poids (eux-mêmes ou un descendant).
    const carries = new Map<string, boolean>();
    const visit = (id: string): boolean => {
      if (carries.has(id)) return carries.get(id)!;
      carries.set(id, false);
      const own = (ev.weight.get(id) ?? 0) > 0;
      const kids = (tree.children.get(id) ?? []).map((c) => visit(c.id));
      const r = own || kids.some(Boolean);
      carries.set(id, r);
      return r;
    };
    const nodes = [...tree.byId.values()].filter((n) => visit(n.id));
    const color = (s: NodeState) => (s === 'mesure' ? t.accent : s === 'agrege' ? alpha(t.accent, 0.6) : s === 'difference' ? alpha(t.accent, 0.4) : s === 'inconnu' ? t.token('--series-4') : t.ink3);
    return {
      data: [{
        type: 'treemap',
        branchvalues: 'remainder',
        ids: nodes.map((n) => n.id),
        labels: nodes.map((n) => n.label),
        parents: nodes.map((n) => (n.parent && carries.get(n.parent) && !tree.broken.has(n.id) ? n.parent : '')),
        values: nodes.map((n) => ev.weight.get(n.id) ?? 0),
        marker: { colors: nodes.map((n) => color(ev.state.get(n.id) ?? 'inconnu')), line: { color: t.surface, width: 2 } },
        customdata: nodes.map((n) => [STATE_NAME[ev.state.get(n.id) ?? 'inconnu'], ev.weight.get(n.id) ? `${fmtNum(((ev.weight.get(n.id) ?? 0) / (ev.total || 1)) * 100, 3)} %` : '']),
        texttemplate: '<b>%{label}</b><br>%{customdata[0]}',
        hovertemplate: '%{label}<br>%{customdata[0]}<br>%{customdata[1]} du total<extra></extra>',
        textfont: { color: nodes.map((n) => ['mesure', 'exclu', 'reserve'].includes(ev.state.get(n.id) ?? '') ? '#ffffff' : t.ink), size: 12 },
        pathbar: { visible: true },
        tiling: { pad: 3 },
      } as Data],
      layout: { margin: { l: 4, r: 4, t: 28, b: 4 } },
    };
  };
}
