'use client';
import { forwardRef, useMemo, useState } from 'react';
import { sankey, sankeyJustify, sankeyLinkHorizontal, type SankeyLink, type SankeyNode } from 'd3-sankey';
import { fmtNum } from '@/core/fmt';
import { fromSI } from '@/core/units';
import { LOSS_NODE_ID, type SiteAnalysis } from '@/site/analyse';
import { STATUS_LABEL, type SiteModel } from '@/site/model';
import { carrierColors } from './carriers';

type N = { id: string; label: string; total: number };
type L = { source: string; target: string; value: number; carrier: string; status: string; meter?: string; loss?: boolean };

export type SankeyOptions = { unit: 'MWh' | 'GWh' | 'tep'; showLosses: boolean };

const W = 1000;
const MARGIN = { top: 64, right: 8, bottom: 16, left: 8 };
const FONT = "'IBM Plex Sans', Arial, sans-serif";

/** Diagramme de Sankey du site. Les couleurs sont des variables CSS (résolues à l'export). */
const SankeyChart = forwardRef<SVGSVGElement, { model: SiteModel; analysis: SiteAnalysis; options: SankeyOptions }>(function SankeyChart({ model, analysis, options }, ref) {
  const [hover, setHover] = useState<{ x: number; y: number; html: string[] } | null>(null);
  const fmt = (j: number) => `${fmtNum(fromSI(j, 'energy', options.unit), 3)} ${options.unit}`;

  const graph = useMemo(() => {
    const links: L[] = analysis.links
      .filter((l) => options.showLosses || !l.loss)
      .map((l) => ({ source: l.from, target: l.to, value: l.value, carrier: l.carrier, status: STATUS_LABEL[l.status], meter: l.meter, loss: l.loss }));
    const ids = new Set(links.flatMap((l) => [l.source, l.target]));
    const nodes: N[] = model.nodes.filter((n) => ids.has(n.id)).map((n) => ({ id: n.id, label: n.label, total: 0 }));
    if (ids.has(LOSS_NODE_ID)) nodes.push({ id: LOSS_NODE_ID, label: 'Pertes de transformation', total: 0 });
    // Hauteur : assez d'espace pour deux lignes d'étiquette par poste dans la colonne la plus chargée (les puits).
    const sinks = nodes.filter((n) => !links.some((l) => l.source === n.id)).length;
    const sources = nodes.filter((n) => !links.some((l) => l.target === n.id)).length;
    const height = Math.max(440, Math.max(sinks, sources) * 50 + MARGIN.top + MARGIN.bottom);
    if (links.length === 0 || analysis.hasCycle) return { nodes: [], links: [], height };
    const layout = sankey<N, L>()
      .nodeId((d) => d.id)
      .nodeAlign(sankeyJustify)
      .nodeWidth(12)
      .nodePadding(26)
      .extent([[MARGIN.left, MARGIN.top], [W - MARGIN.right, height - MARGIN.bottom]]);
    const g = layout({ nodes: nodes.map((n) => ({ ...n })), links: links.map((l) => ({ ...l })) });
    return { ...g, height };
  }, [model, analysis, options.showLosses]);

  const carriers = useMemo(() => [...new Set(analysis.links.map((l) => l.carrier))], [analysis]);
  const colors = useMemo(() => carrierColors(carriers), [carriers]);
  const shown = carriers.filter((c) => graph.links.some((l) => l.carrier === c));
  const path = sankeyLinkHorizontal<N, L>();
  const title = [model.name || 'Site', model.year ? String(model.year) : ''].filter(Boolean).join(' — ');

  const nodeValue = (n: SankeyNode<N, L>) => n.value ?? 0;

  return (
    <div className="relative" onMouseLeave={() => setHover(null)}>
      <svg ref={ref} viewBox={`0 0 ${W} ${graph.height}`} className="h-auto w-full" role="img" aria-label={`Diagramme de Sankey des flux énergétiques : ${title}`} style={{ fontFamily: FONT }}>
        <text x={MARGIN.left} y={20} fontSize={16} fontWeight={600} fill="var(--ink)">Flux énergétiques — {title}</text>
        <text x={MARGIN.left} y={38} fontSize={11} fill="var(--ink-2)">
          Quantités annuelles en {options.unit}. Énergie achetée : {fmt(analysis.totals.purchased)} · usages finaux : {fmt(analysis.totals.final)} · pertes de transformation : {fmt(analysis.totals.losses)}
        </text>
        <g transform={`translate(${MARGIN.left}, 52)`}>
          {shown.map((c, i) => (
            <g key={c} transform={`translate(${i * 130}, 0)`}>
              <rect width={10} height={10} y={-9} rx={2} fill={`var(${colors.get(c)})`} />
              <text x={14} fontSize={11} fill="var(--ink-2)">{c}</text>
            </g>
          ))}
        </g>
        <g fill="none">
          {graph.links.map((l, i) => (
            <path
              key={i}
              d={path(l) ?? ''}
              stroke={`var(${colors.get(l.carrier)})`}
              strokeOpacity={hover?.html[0] === `link-${i}` ? 0.9 : 0.55}
              strokeWidth={Math.max(1, l.width ?? 1)}
              onMouseMove={(e) => {
                const s = l.source as SankeyNode<N, L>;
                const t = l.target as SankeyNode<N, L>;
                setHover({ x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY, html: [`link-${i}`, `${s.label} → ${t.label}`, `${l.carrier} · ${fmt(l.value)}`, l.loss ? 'Pertes calculées (entrées − sorties)' : `${l.status}${l.meter ? ` · compteur ${l.meter}` : ''}`] });
              }}
            />
          ))}
        </g>
        <g>
          {graph.nodes.map((n) => {
            const x0 = n.x0 ?? 0, x1 = n.x1 ?? 0, y0 = n.y0 ?? 0, y1 = n.y1 ?? 0;
            // Étiquette à gauche du poste pour la moitié droite (les puits sont alignés à droite par sankeyJustify).
            const right = x0 > W / 2;
            const tx = right ? x0 - 6 : x1 + 6;
            return (
              <g key={n.id}
                onMouseMove={(e) => setHover({ x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY, html: [`node-${n.id}`, n.label, fmt(nodeValue(n))] })}>
                <rect x={x0} y={y0} width={x1 - x0} height={Math.max(1, y1 - y0)} fill={n.id === LOSS_NODE_ID ? 'var(--ink-3)' : 'var(--ink-2)'} />
                <text x={tx} y={(y0 + y1) / 2} dy="-0.15em" fontSize={12} fontWeight={500} textAnchor={right ? 'end' : 'start'} fill="var(--ink)" stroke="var(--surface)" strokeWidth={3} paintOrder="stroke">{n.label}</text>
                <text x={tx} y={(y0 + y1) / 2} dy="1.05em" fontSize={11} textAnchor={right ? 'end' : 'start'} fill="var(--ink-2)" stroke="var(--surface)" strokeWidth={3} paintOrder="stroke" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(nodeValue(n))}</text>
              </g>
            );
          })}
        </g>
      </svg>
      {hover && (
        <div className="pointer-events-none absolute z-10 min-w-40 border border-rule-strong bg-surface px-2 py-1.5 text-[12px] shadow-none"
          style={{ left: Math.min(hover.x + 12, 9999), top: hover.y + 12 }}>
          <div className="font-medium">{hover.html[1]}</div>
          {hover.html.slice(2).map((t, i) => <div key={i} className="num text-ink-2">{t}</div>)}
        </div>
      )}
      {graph.links.length === 0 && <p className="p-4 text-[13px] text-ink-3">{analysis.hasCycle ? 'Diagramme impossible : le modèle contient une boucle (voir les contrôles).' : 'Aucun flux à représenter.'}</p>}
    </div>
  );
});

export default SankeyChart;
