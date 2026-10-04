'use client';
// Schéma d'un réseau en série : chaque tronçon est un tube dont l'épaisseur suit le diamètre et dont l'écoulement défile
// à une vitesse proportionnelle à la vitesse réelle ; les singularités sont posées sur le tube et cliquables.
// Variante « screen » : couleurs = variables CSS, animation (classes .ecs-flow de globals.css). Variante « sheet » : export statique.
import { forwardRef } from 'react';
import { fmtNum } from '@/core/fmt';
import { hydraulique } from '@/data';
import type { NetResult } from '@/hydraulique/network';
import { defOf } from '@/hydraulique/singularities';
import { LIGHT_COLORS, SCREEN_COLORS } from '../metering/PlanSvg';

const FONT = "'IBM Plex Sans', Arial, sans-serif";
const SCREEN = { ...SCREEN_COLORS, ok: 'var(--series-1)', warn: 'var(--series-4)', ko: 'var(--series-8)', err: 'var(--err)' };
const LIGHT = { ...LIGHT_COLORS, ok: '#2a78d6', warn: '#eda100', ko: '#e34948', err: '#b3261e' };
type Pal = typeof SCREEN;

export type Sel = { sec: string; sing?: number } | null;

const dur = (v: number) => 2.6 - 2.1 * Math.max(0, Math.min(1, v / 4));

/** Pictogramme d'une singularité, centré sur (0,0), 26 px de côté. */
function Icon({ kind, id, c }: { kind: string; id: string; c: Pal }) {
  const st = { stroke: c.ink, strokeWidth: 1.7, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  if (id === 'te-direct' || id === 'te-derivation') return <g {...st}><path d="M-11 4 H11 M0 4 V-10" /></g>;
  if (kind === 'coude-arrondi') return <g {...st}><path d="M-11 4 H-3 A8 8 0 0 0 5 -4 V-11" /></g>;
  if (kind === 'coude-vif') return <g {...st}><path d="M-11 4 H4 V-11" /></g>;
  if (kind === 'elargissement') return <g {...st}><path d="M-11 -3 L-1 -3 L9 -9 V9 L-1 3 L-11 3 Z" /></g>;
  if (kind === 'retrecissement') return <g {...st}><path d="M-9 -9 V9 L1 3 H11 V-3 H1 Z" /></g>;
  if (id.startsWith('vanne-papillon')) return <g {...st}><path d="M0 -10 V10" /><ellipse cx="0" cy="0" rx="3" ry="9" /></g>;
  if (id.startsWith('vanne')) return <g {...st}><path d="M-10 -8 L0 0 L-10 8 Z M10 -8 L0 0 L10 8 Z" /></g>;
  if (id.startsWith('clapet')) return <g {...st}><path d="M-8 -9 V9 L6 0 Z M9 -9 V9" /></g>;
  if (id === 'filtre-y') return <g {...st}><path d="M-11 4 H4 M4 4 L10 -8 M-4 -2 L0 6" /></g>;
  if (id.startsWith('entree')) return <g {...st}><path d="M-11 -9 V9 M-11 0 H8 M3 -5 L8 0 L3 5" /></g>;
  if (id === 'sortie') return <g {...st}><path d="M-9 0 H8 M3 -5 L8 0 L3 5 M11 -9 V9" /></g>;
  return <text textAnchor="middle" y={5} fontSize={14} fontWeight={700} fill={c.ink}>K</text>;
}

type Props = { result: NetResult; selected: Sel; onSelect?: (s: Sel) => void; animate?: boolean; paused?: boolean; variant: 'screen' | 'sheet'; title?: string };

const PipeSvg = forwardRef<SVGSVGElement, Props>(function PipeSvg({ result, selected, onSelect, animate = true, paused = false, variant, title }, ref) {
  const sheet = variant === 'sheet'; const c: Pal = sheet ? LIGHT : SCREEN; const anim = !sheet && animate;
  const n = result.sections.length;
  const W = Math.max(960, 200 * n + 80); const H = 300; const x0 = 40; const y0 = 130;
  const weights = result.sections.map((r) => Math.max(8, r.section.L_m));
  const minW = 170; const avail = W - 2 * x0 - 30 * (n - 1);
  const raw = weights.map((w) => (w / weights.reduce((a, b) => a + b, 0)) * avail);
  const widths = raw.map((w) => Math.max(minW, w)); const scale = avail / widths.reduce((a, b) => a + b, 0);
  const wf = widths.map((w) => w * scale);
  const Dmax = Math.max(...result.sections.map((r) => r.section.D_mm));
  let x = x0;
  return (
    <svg ref={ref} xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${W} ${H}`} role="img" className={paused ? 'ecs-paused' : undefined}
      aria-label={`Schéma du réseau : ${n} tronçon(s), ${fmtNum(result.dpFrict, 4)} pascals de pertes de frottement`}
      style={{ fontFamily: FONT, display: 'block', width: '100%', height: 'auto', background: sheet ? c.surface : undefined }}>
      {sheet && <rect width={W} height={H} fill={c.surface} />}
      {title && <text x={x0} y={24} fontSize={13} fontWeight={600} fill={c.ink}>{title}</text>}
      {result.sections.map((r, i) => {
        const w = wf[i]; const xs = x; x += w + 30;
        const th = 16 + 26 * Math.sqrt(r.section.D_mm / Dmax); // épaisseur du tube
        const level = r.v > 3 || (r.R > 300) ? 'ko' : r.v > 2 || r.v < 0.3 ? 'warn' : 'ok';
        const col = c[level];
        const sel = selected?.sec === r.section.id;
        const d = `M${xs} ${y0} H${xs + w}`;
        const next = i < n - 1;
        const rep = r.items.flatMap((it, j) => Array.from({ length: Math.min(6, Math.max(1, Math.round(it.qty))) }, (_, k) => ({ j, k, it })));
        return (
          <g key={r.section.id}>
            {/* tube */}
            <rect x={xs} y={y0 - th / 2} width={w} height={th} rx={4} fill={c.surface} stroke={sel ? c.accent : c.ink} strokeWidth={sel ? 2.6 : 1.8}
              style={onSelect ? { cursor: 'pointer' } : undefined} onClick={onSelect ? () => onSelect({ sec: r.section.id }) : undefined} role={onSelect ? 'button' : undefined} aria-label={onSelect ? `Tronçon ${r.section.nom || i + 1} : modifier` : undefined} tabIndex={onSelect ? 0 : undefined}
              onKeyDown={onSelect ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect({ sec: r.section.id }); } } : undefined} />
            <path d={d} fill="none" stroke={col} strokeWidth={Math.max(4, th - 12)} strokeLinecap="butt" opacity={anim ? 0.25 : 0.55} />
            {anim && <path className="ecs-flow" d={d} fill="none" stroke={col} strokeWidth={Math.max(2.5, th - 15)} style={{ ['--dur' as string]: `${dur(r.v).toFixed(2)}s` }} />}
            {/* flèche de sens */}
            <path d={`M${xs + w - 8} ${y0 - 5} L${xs + w + 2} ${y0} L${xs + w - 8} ${y0 + 5}`} fill="none" stroke={c.ink2} strokeWidth={1.5} />
            {/* jonction avec le tronçon suivant */}
            {next && <path d={`M${xs + w} ${y0} H${xs + w + 30}`} stroke={c.ink2} strokeWidth={1.5} strokeDasharray="3 3" />}
            {/* singularités */}
            {rep.map((q, idx) => {
              const px = xs + ((idx + 1) / (rep.length + 1)) * w;
              const def = defOf(r.section.sings[q.it.name ? r.items.indexOf(q.it) : q.j]?.def ?? '');
              const isSel = selected?.sec === r.section.id && selected.sing === q.j;
              return (
                <g key={`${q.j}-${q.k}`} transform={`translate(${px} ${y0})`} style={onSelect ? { cursor: 'pointer' } : undefined} onClick={onSelect ? () => onSelect({ sec: r.section.id, sing: q.j }) : undefined}
                  role={onSelect ? 'button' : undefined} aria-label={onSelect ? `${q.it.name} : modifier` : undefined} tabIndex={onSelect ? 0 : undefined}
                  onKeyDown={onSelect ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect({ sec: r.section.id, sing: q.j }); } } : undefined}>
                  <circle r={15} fill={c.surface} stroke={isSel ? c.accent : c.ink3} strokeWidth={isSel ? 2.6 : 1.2} />
                  <Icon kind={def?.kind ?? 'libre'} id={def?.id ?? 'libre'} c={c} />
                  <title>{`${q.it.name} · K = ${fmtNum(q.it.K, 3)}`}</title>
                </g>
              );
            })}
            {/* légendes sous le tube */}
            <text x={xs} y={y0 + th / 2 + 22} fontSize={12} fontWeight={600} fill={c.ink}>{r.section.nom || `Tronçon ${i + 1}`}</text>
            <text x={xs} y={y0 + th / 2 + 38} fontSize={11} fill={c.ink2}>{`Ø ${fmtNum(r.section.D_mm, 4)} mm · ${fmtNum(r.section.L_m, 4)} m`}</text>
            <text x={xs} y={y0 + th / 2 + 53} fontSize={11} fill={c.ink2}>{`${fmtNum(r.v, 3)} m/s · Re ${fmtNum(r.Re, 3)}`}</text>
            <text x={xs} y={y0 + th / 2 + 68} fontSize={11} fontWeight={600} fill={c.ink}>{`ΔP ${fmtNum(r.dpFrict, 4)} Pa`}</text>
            <text x={xs} y={y0 + th / 2 + 83} fontSize={10.5} fill={c.ink3}>{`dont singulières ${fmtNum(r.dpSing, 3)} Pa`}</text>
            {/* règle de longueur */}
            <path d={`M${xs} ${y0 - th / 2 - 14} H${xs + w} M${xs} ${y0 - th / 2 - 19} V${y0 - th / 2 - 9} M${xs + w} ${y0 - th / 2 - 19} V${y0 - th / 2 - 9}`} stroke={c.ink3} strokeWidth={1} fill="none" />
            <text x={xs + w / 2} y={y0 - th / 2 - 22} fontSize={10.5} textAnchor="middle" fill={c.ink3}>{`${fmtNum(r.section.L_m, 4)} m`}</text>
          </g>
        );
      })}
      <text x={x0} y={H - 12} fontSize={10.5} fill={c.ink3}>{`Débit ${fmtNum(result.sections[0].Q * 3600, 4)} m³/h · couleur : vitesse (bleu usuel, ambre à surveiller, rouge excessive) · ${hydraulique.criteres.vitesseMin_m_s} à ${hydraulique.criteres.vitesseMax_m_s} m/s usuel`}</text>
    </svg>
  );
});

export default PipeSvg;
