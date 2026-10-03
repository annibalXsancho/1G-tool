'use client';
// Rendu SVG d'un plan de comptage. Deux variantes :
//  - « screen » : couleurs = variables CSS (thème clair/sombre), cartes cliquables ;
//  - « sheet »  : couleurs explicites (thème clair), avec légende et cartouche : pour les exports et l'impression A4.
import { forwardRef } from 'react';
import type { NodeState } from '@/metering/analyse';
import { CARD_H, CARD_W, wrapLabel, type Layout, type PlacedNode } from '@/metering/layout';
import { KIND_LABEL, STATUS_LABEL, type Meter, type Plan } from '@/metering/model';
import { fmtNum } from '@/core/fmt';

export type PlanColors = { ink: string; ink2: string; ink3: string; rule: string; surface: string; bg: string; accent: string; accentSoft: string; accentInk: string; warn: string; warnSoft: string };

export const SCREEN_COLORS: PlanColors = {
  ink: 'var(--ink)', ink2: 'var(--ink-2)', ink3: 'var(--ink-3)', rule: 'var(--rule)', surface: 'var(--surface)', bg: 'var(--bg)',
  accent: 'var(--accent)', accentSoft: 'var(--accent-soft)', accentInk: 'var(--accent-ink)', warn: 'var(--warn)', warnSoft: 'var(--warn-soft)',
};
export const LIGHT_COLORS: PlanColors = {
  ink: '#16181a', ink2: '#55595c', ink3: '#858a8d', rule: '#d9d5cc', surface: '#ffffff', bg: '#f4f2ee',
  accent: '#0f6b5c', accentSoft: '#dcebe7', accentInk: '#ffffff', warn: '#b45309', warnSoft: '#f6e7d2',
};

const FONT = "'IBM Plex Sans', Arial, sans-serif";
export const STATE_TEXT: Record<NodeState, string> = {
  mesure: 'MESURÉ', agrege: 'AGRÉGÉ', difference: 'PAR DIFFÉRENCE', inconnu: 'NON INSTRUMENTÉ', reserve: 'RÉSERVE / SANS CONSO.', exclu: 'HORS PÉRIMÈTRE',
};

function nodeStyle(state: NodeState, c: PlanColors) {
  switch (state) {
    case 'mesure': return { fill: c.accentSoft, stroke: c.accent, dash: undefined, stripe: c.accent, text: c.ink };
    case 'agrege': return { fill: c.surface, stroke: c.accent, dash: undefined, stripe: c.accent, text: c.ink };
    case 'difference': return { fill: c.surface, stroke: c.accent, dash: '5 3', stripe: c.accent, text: c.ink };
    case 'inconnu': return { fill: c.warnSoft, stroke: c.warn, dash: undefined, stripe: c.warn, text: c.ink };
    case 'reserve': return { fill: c.bg, stroke: c.ink3, dash: '5 3', stripe: c.ink3, text: c.ink2 };
    default: return { fill: c.surface, stroke: c.ink3, dash: '5 3', stripe: c.ink3, text: c.ink3 };
  }
}

function MeterSymbol({ m, x, y, c, selected, showId, onSelect }: { m: Meter; x: number; y: number; c: PlanColors; selected: boolean; showId: boolean; onSelect?: () => void }) {
  const planned = m.status === 'a-installer';
  const comm = m.status === 'existant-communicant';
  const stroke = planned ? c.warn : c.accent;
  return (
    <g style={onSelect ? { cursor: 'pointer' } : undefined} onClick={onSelect} role={onSelect ? 'button' : undefined} aria-label={`Compteur ${m.id}, ${STATUS_LABEL[m.status]}`}>
      <title>{`${m.id} — ${STATUS_LABEL[m.status]}${m.device ? ` — ${m.device}` : ''}${m.comm ? ` — ${m.comm}` : ''}`}</title>
      {selected && <circle cx={x} cy={y} r={15.5} fill="none" stroke={c.ink} strokeWidth={1.5} />}
      <circle cx={x} cy={y} r={11} fill={comm ? c.accent : c.surface} stroke={stroke} strokeWidth={1.8} strokeDasharray={planned ? '3 2' : undefined} />
      <text x={x} y={y + 4} textAnchor="middle" fontSize={11} fontWeight={700} fill={comm ? c.accentInk : stroke} style={{ pointerEvents: 'none' }}>{planned ? '+' : 'M'}</text>
      {showId && <text x={x} y={y + 25} textAnchor="middle" fontSize={9.5} fill={c.ink2} stroke={c.surface} strokeWidth={3} paintOrder="stroke" style={{ pointerEvents: 'none' }}>{m.id}</text>}
    </g>
  );
}

function Card({ p, plan, c, selected, onSelect }: { p: PlacedNode; plan: Plan; c: PlanColors; selected: boolean; onSelect?: () => void }) {
  const st = nodeStyle(p.state, c);
  const lines = wrapLabel(p.node.label);
  const rated = p.node.rated ? ` · ${fmtNum(p.node.rated, 4)} ${plan.ratedUnit}` : '';
  const sub = `${KIND_LABEL[p.node.kind]}${rated}`;
  return (
    <g transform={`translate(${p.x}, ${p.y})`} style={onSelect ? { cursor: 'pointer' } : undefined} onClick={onSelect} role={onSelect ? 'button' : undefined} aria-label={`${p.node.label}, ${STATE_TEXT[p.state].toLowerCase()}`}>
      <title>{`${p.node.label}\n${sub}\n${STATE_TEXT[p.state]}${p.share !== null ? ` — ${fmtNum(p.share * 100, 2)} % du total` : ''}${p.node.comment ? `\n${p.node.comment}` : ''}`}</title>
      <rect width={CARD_W} height={CARD_H} rx={3} fill={st.fill} stroke={selected ? c.ink : st.stroke} strokeWidth={selected ? 2.5 : 1.5} strokeDasharray={st.dash} />
      <rect width={5} height={CARD_H} rx={1.5} fill={st.stripe} opacity={p.state === 'exclu' || p.state === 'reserve' ? 0.5 : 1} />
      {lines.map((l, i) => (
        <text key={i} x={14} y={lines.length === 1 ? 20 : 16 + i * 14} fontSize={12} fontWeight={600} fill={st.text}>{l}</text>
      ))}
      <text x={14} y={CARD_H - 21 + (lines.length === 1 ? 2 : 4)} fontSize={10} fill={c.ink2}>{sub.length > 38 ? sub.slice(0, 37) + '…' : sub}</text>
      <text x={14} y={CARD_H - 7} fontSize={9} fontWeight={700} letterSpacing={0.6} fill={p.state === 'inconnu' ? c.warn : p.state === 'mesure' || p.state === 'agrege' || p.state === 'difference' ? c.accent : c.ink3}>{STATE_TEXT[p.state]}</text>
      {p.share !== null && <text x={CARD_W - 8} y={CARD_H - 7} textAnchor="end" fontSize={10} fill={c.ink2} style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtNum(p.share * 100, 2)} %</text>}
    </g>
  );
}

export type Selection = { node?: string; meter?: string } | null;

export type PlanInfo = { projectName: string; date: string; coveragePct: string; targetPct: string };

const PlanSvg = forwardRef<SVGSVGElement, {
  plan: Plan; layout: Layout; colors: PlanColors; variant: 'screen' | 'sheet';
  selection?: Selection; onSelect?: (s: Selection) => void; showMeterIds?: boolean; info?: PlanInfo; scale?: number;
}>(function PlanSvg({ plan, layout, colors: c, variant, selection, onSelect, showMeterIds = true, info, scale = 1 }, ref) {
  const sheet = variant === 'sheet';
  const EXTRA = sheet ? 166 : 0;
  const W = sheet ? Math.max(layout.width, 1000) : layout.width;
  const H = layout.height + EXTRA;
  const legendY = layout.height + 18;
  return (
    <svg ref={ref} xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${W} ${H}`} width={sheet ? undefined : Math.round(W * scale)} height={sheet ? undefined : Math.round(H * scale)}
      role="img" aria-label={`Plan de comptage : ${plan.name}`} style={{ fontFamily: FONT, display: 'block', ...(sheet ? { width: '100%', height: 'auto', maxHeight: '185mm' } : {}) }}>
      {sheet && <rect width={W} height={H} fill={c.surface} />}

      {layout.columns.map((col, i) => (
        <g key={i}>
          <text x={col.x} y={34} fontSize={10.5} fontWeight={700} letterSpacing={0.9} fill={c.ink3}>{col.label.toUpperCase()}</text>
          <line x1={col.x} x2={col.x + col.w} y1={42} y2={42} stroke={c.rule} />
        </g>
      ))}

      {layout.links.map((l, i) => (
        <polyline key={i} points={l.points.map((q) => q.join(',')).join(' ')} fill="none" stroke={l.secondary ? c.warn : c.ink2} strokeWidth={1.6}
          strokeDasharray={l.secondary ? '7 5' : undefined} strokeLinejoin="round" />
      ))}

      {layout.nodes.map((p) => (
        <Card key={p.node.id} p={p} plan={plan} c={c} selected={selection?.node === p.node.id} onSelect={onSelect ? () => onSelect({ node: p.node.id }) : undefined} />
      ))}

      {layout.links.flatMap((l) => l.meters.map((pm) => (
        <MeterSymbol key={pm.meter.id} m={pm.meter} x={pm.x} y={pm.y} c={c} showId={showMeterIds} selected={selection?.meter === pm.meter.id}
          onSelect={onSelect ? () => onSelect({ node: pm.meter.node, meter: pm.meter.id }) : undefined} />
      )))}

      {sheet && (
        <g transform={`translate(0, ${legendY})`}>
          <line x1={16} x2={W - 16} y1={0} y2={0} stroke={c.ink} strokeWidth={1.2} />
          {/* Légende */}
          <g transform="translate(24, 24)" fontSize={10.5} fill={c.ink2}>
            <text fontSize={10} fontWeight={700} letterSpacing={0.8} fill={c.ink3}>LÉGENDE</text>
            <g transform="translate(0, 20)">
              <circle cx={9} cy={0} r={9} fill={c.accent} stroke={c.accent} strokeWidth={1.5} /><text x={9} y={3.5} fontSize={9} fontWeight={700} textAnchor="middle" fill={c.accentInk}>M</text>
              <text x={24} y={4}>Compteur existant, communicant</text>
              <circle cx={9} cy={22} r={9} fill={c.surface} stroke={c.accent} strokeWidth={1.5} /><text x={9} y={25.5} fontSize={9} fontWeight={700} textAnchor="middle" fill={c.accent}>M</text>
              <text x={24} y={26}>Compteur existant, relevé manuel</text>
              <circle cx={9} cy={44} r={9} fill={c.surface} stroke={c.warn} strokeWidth={1.5} strokeDasharray="3 2" /><text x={9} y={47.5} fontSize={10} fontWeight={700} textAnchor="middle" fill={c.warn}>+</text>
              <text x={24} y={48}>Compteur à installer {layout.scenario === 'actuel' ? '(non compté dans l’état actuel)' : ''}</text>
            </g>
            <g transform="translate(300, 20)">
              {([['mesure', 'Mesuré directement'], ['agrege', 'Agrégé (somme des départs)'], ['difference', 'Déduit par différence'], ['inconnu', 'Non instrumenté']] as [NodeState, string][]).map(([s, t], i) => {
                const st = nodeStyle(s, c);
                return (
                  <g key={s} transform={`translate(0, ${i * 22 - 6})`}>
                    <rect width={26} height={14} rx={2} fill={st.fill} stroke={st.stroke} strokeWidth={1.5} strokeDasharray={st.dash} />
                    <text x={36} y={11}>{t}</text>
                  </g>
                );
              })}
            </g>
            <g transform="translate(560, 20)">
              {([['reserve', 'Réserve ou sans consommation'], ['exclu', 'Hors périmètre']] as [NodeState, string][]).map(([s, t], i) => {
                const st = nodeStyle(s, c);
                return (
                  <g key={s} transform={`translate(0, ${i * 22 - 6})`}>
                    <rect width={26} height={14} rx={2} fill={st.fill} stroke={st.stroke} strokeWidth={1.5} strokeDasharray={st.dash} />
                    <text x={36} y={11}>{t}</text>
                  </g>
                );
              })}
              <g transform="translate(0, 38)"><line x1={0} x2={26} y1={0} y2={0} stroke={c.warn} strokeWidth={1.6} strokeDasharray="7 5" /><text x={36} y={4}>Alimentation secondaire (secours / injection)</text></g>
            </g>
          </g>
          {/* Cartouche */}
          <g transform={`translate(${W - 436}, 14)`}>
            <rect width={420} height={118} fill={c.surface} stroke={c.ink} strokeWidth={1.2} />
            <line x1={0} x2={420} y1={34} y2={34} stroke={c.ink} /><line x1={210} x2={210} y1={34} y2={118} stroke={c.rule} />
            <text x={10} y={22} fontSize={14} fontWeight={700} fill={c.ink}>{plan.name.length > 40 ? plan.name.slice(0, 39) + '…' : plan.name}</text>
            {([
              ['Projet', info?.projectName || plan.site || '—'], ['Site', plan.site || '—'], ['Énergie', plan.carrier],
            ] as [string, string][]).map(([k, v], i) => (
              <g key={k} transform={`translate(10, ${54 + i * 22})`}><text fontSize={9.5} fill={c.ink3}>{k.toUpperCase()}</text><text x={58} fontSize={11} fill={c.ink}>{v.length > 20 ? v.slice(0, 19) + '…' : v}</text></g>
            ))}
            {([
              ['Version', plan.version || '—'], ['Date', info?.date ?? '—'], ['Auteur', plan.author || '—'],
            ] as [string, string][]).map(([k, v], i) => (
              <g key={k} transform={`translate(220, ${54 + i * 22})`}><text fontSize={9.5} fill={c.ink3}>{k.toUpperCase()}</text><text x={58} fontSize={11} fill={c.ink}>{v.length > 20 ? v.slice(0, 19) + '…' : v}</text></g>
            ))}
            <text x={10} y={112} fontSize={10.5} fill={c.ink2}>
              {layout.scenario === 'cible' ? 'Scénario cible' : 'État actuel'} · couverture {layout.scenario === 'cible' ? info?.targetPct : info?.coveragePct} · base {layout.basis}
            </text>
          </g>
        </g>
      )}
    </svg>
  );
});

export default PlanSvg;
