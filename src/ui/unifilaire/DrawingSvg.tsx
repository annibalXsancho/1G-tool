'use client';
// Rendu SVG d'un dessin d'unifilaire. Variantes : « screen » (couleurs = variables CSS, éléments cliquables) et
// « sheet » (couleurs explicites en thème clair, légende et cartouche) pour les exports et l'impression A4.
import { forwardRef } from 'react';
import type { Drawing, Role } from '@/unifilaire/draw';
import type { Installation } from '@/unifilaire/model';
import { LIGHT_COLORS, SCREEN_COLORS } from '../metering/PlanSvg';

const FONT = "'IBM Plex Sans', Arial, sans-serif";

type Colors = typeof SCREEN_COLORS;
const color = (c: Colors, r: Role | 'none' | undefined, d: string): string => {
  switch (r) {
    case undefined: return d;
    case 'none': return 'none';
    case 'ink': return c.ink;
    case 'ink2': return c.ink2;
    case 'ink3': return c.ink3;
    case 'accent': return c.accent;
    case 'accentSoft': return c.accentSoft;
    case 'accentInk': return c.accentInk;
    case 'warn': return c.warn;
    case 'warnSoft': return c.warnSoft;
    case 'surface': return c.surface;
    case 'err': return c === SCREEN_COLORS ? 'var(--err)' : '#b3261e';
  }
};

export type SheetInfo = { projectName: string; date: string; summary: string };

const DrawingSvg = forwardRef<SVGSVGElement, {
  inst: Installation; drawing: Drawing; variant: 'screen' | 'sheet'; scale?: number; selected?: string | null; onSelect?: (id: string) => void; info?: SheetInfo;
}>(function DrawingSvg({ inst, drawing: d, variant, scale = 1, selected, onSelect, info }, ref) {
  const c = variant === 'sheet' ? LIGHT_COLORS : SCREEN_COLORS;
  const sheet = variant === 'sheet';
  const EXTRA = sheet ? 150 : 0;
  const W = sheet ? Math.max(d.width, 980) : d.width;
  const H = d.height + EXTRA;
  const sel = selected ? d.hits.filter((h) => h.ref === selected) : [];
  return (
    <svg ref={ref} xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${W} ${H}`} width={sheet ? undefined : Math.round(W * scale)} height={sheet ? undefined : Math.round(H * scale)}
      role="img" aria-label={`Schéma unifilaire : ${inst.name}`} style={{ fontFamily: FONT, display: 'block', ...(sheet ? { width: '100%', height: 'auto', maxHeight: '185mm' } : {}) }}>
      {sheet && <rect width={W} height={H} fill={c.surface} />}
      {sel.map((h, i) => <rect key={i} x={h.x} y={h.y} width={h.w} height={h.h} rx={4} fill={c.accentSoft} opacity={0.55} />)}
      {d.prims.map((p, i) => {
        switch (p.t) {
          case 'line': return <line key={i} x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2} stroke={color(c, p.role, c.ink)} strokeWidth={p.w ?? 1.6} strokeDasharray={p.dash} strokeLinecap="round" />;
          case 'rect': return <rect key={i} x={p.x} y={p.y} width={p.w} height={p.h} rx={p.rx} fill={color(c, p.fill, 'none')} stroke={color(c, p.stroke, c.ink)} strokeWidth={p.stroke === 'none' ? 0 : p.sw ?? 1.6} strokeDasharray={p.dash} />;
          case 'circle': return <circle key={i} cx={p.cx} cy={p.cy} r={p.r} fill={color(c, p.fill, 'none')} stroke={color(c, p.stroke, c.ink)} strokeWidth={p.sw ?? 1.6} strokeDasharray={p.dash} />;
          case 'path': return <path key={i} d={p.d} fill={color(c, p.fill, 'none')} stroke={color(c, p.stroke, c.ink)} strokeWidth={p.sw ?? 1.6} />;
          case 'text': return (
            <text key={i} x={p.x} y={p.y} fontSize={p.size ?? 10.5} fontWeight={p.weight ?? 400} textAnchor={p.anchor ?? 'start'} fill={color(c, p.role, c.ink2)}
              stroke={c.surface} strokeWidth={3} paintOrder="stroke" style={{ fontVariantNumeric: 'tabular-nums' }}>{p.text}</text>
          );
        }
      })}
      {onSelect && d.hits.map((h, i) => (
        <rect key={i} x={h.x} y={h.y} width={h.w} height={h.h} fill="transparent" style={{ cursor: 'pointer' }} onClick={() => onSelect(h.ref)} role="button" aria-label={`Sélectionner ${h.ref}`} />
      ))}
      {sheet && (
        <g transform={`translate(0, ${d.height + 8})`}>
          <line x1={16} x2={W - 16} y1={0} y2={0} stroke={c.ink} strokeWidth={1.2} />
          <g transform="translate(24, 24)" fontSize={10.5} fill={c.ink2}>
            <text fontSize={10} fontWeight={700} letterSpacing={0.8} fill={c.ink3}>LÉGENDE</text>
            <g transform="translate(0, 20)">
              <rect x={0} y={-8} width={26} height={6} fill={c.ink} /><text x={36} y={-2}>Jeu de barres / tableau</text>
              <circle cx={13} cy={14} r={8} fill={c.surface} stroke={c.ink} strokeWidth={1.5} /><circle cx={13} cy={22} r={8} fill={c.surface} stroke={c.ink} strokeWidth={1.5} /><text x={36} y={22}>Transformateur</text>
              <circle cx={13} cy={46} r={9} fill={c.surface} stroke={c.ink} strokeWidth={1.5} /><text x={13} y={50} textAnchor="middle" fontSize={10} fontWeight={700} fill={c.ink}>M</text><text x={36} y={50}>Moteur (G : groupe électrogène)</text>
            </g>
            <g transform="translate(290, 20)">
              <line x1={13} x2={13} y1={-6} y2={10} stroke={c.ink} strokeWidth={1.6} /><line x1={13} x2={24} y1={10} y2={-4} stroke={c.ink} strokeWidth={1.8} /><text x={36} y={4}>Disjoncteur (croix) / interrupteur / fusible</text>
              <rect x={0} y={20} width={26} height={14} rx={2} fill={c.accent} stroke={c.accent} /><text x={13} y={31} textAnchor="middle" fontSize={9} fontWeight={700} fill={c.accentInk}>kWh</text><text x={36} y={31}>Compteur existant, communicant</text>
              <rect x={0} y={42} width={26} height={14} rx={2} fill={c.surface} stroke={c.accent} /><text x={13} y={53} textAnchor="middle" fontSize={9} fontWeight={700} fill={c.accent}>kWh</text><text x={36} y={53}>Compteur existant, relevé manuel</text>
            </g>
            <g transform="translate(610, 20)">
              <rect x={0} y={-2} width={26} height={14} rx={2} fill={c.surface} stroke={c.warn} strokeDasharray="4 3" /><text x={13} y={9} textAnchor="middle" fontSize={9} fontWeight={700} fill={c.warn}>kWh</text><text x={36} y={9}>Compteur à installer</text>
              <text x={0} y={34} fill="#b3261e">Rouge : calibre ou pouvoir de coupure insuffisant</text>
              <text x={0} y={52}>Calculs : Icc triphasé maximal, méthode des impédances</text>
            </g>
          </g>
          <g transform={`translate(${W - 436}, 14)`}>
            <rect width={420} height={118} fill={c.surface} stroke={c.ink} strokeWidth={1.2} />
            <line x1={0} x2={420} y1={34} y2={34} stroke={c.ink} /><line x1={210} x2={210} y1={34} y2={118} stroke={c.rule} />
            <text x={10} y={22} fontSize={14} fontWeight={700} fill={c.ink}>{inst.name.length > 40 ? inst.name.slice(0, 39) + '…' : inst.name}</text>
            {([['Projet', info?.projectName || inst.site || '—'], ['Site', inst.site || '—'], ['Schéma', 'Unifilaire']] as [string, string][]).map(([k, v], i) => (
              <g key={k} transform={`translate(10, ${54 + i * 22})`}><text fontSize={9.5} fill={c.ink3}>{k.toUpperCase()}</text><text x={58} fontSize={11} fill={c.ink}>{v.length > 22 ? v.slice(0, 21) + '…' : v}</text></g>
            ))}
            {([['Version', inst.version || '—'], ['Date', info?.date ?? '—'], ['Auteur', inst.author || '—']] as [string, string][]).map(([k, v], i) => (
              <g key={k} transform={`translate(220, ${54 + i * 22})`}><text fontSize={9.5} fill={c.ink3}>{k.toUpperCase()}</text><text x={58} fontSize={11} fill={c.ink}>{v.length > 20 ? v.slice(0, 19) + '…' : v}</text></g>
            ))}
            <text x={10} y={112} fontSize={10.5} fill={c.ink2}>{info?.summary ?? ''}</text>
          </g>
        </g>
      )}
    </svg>
  );
});

export default DrawingSvg;
