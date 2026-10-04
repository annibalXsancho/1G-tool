'use client';
// Coude arrondi interactif : on tire la poignée pour régler l'angle de déviation (0 à 180°), le curseur règle R/D ;
// K se recalcule en direct (Weisbach). Clavier : flèches ±1°, Maj ± 5°. Pointeur et tactile via les événements « pointer ».
import { useRef } from 'react';
import { fmtNum } from '@/core/fmt';
import { kBendRound, kBendSharp } from '@/hydraulique/singularities';

export default function BendWidget({ angle, rD, sharp, onChange }: { angle: number; rD: number; sharp?: boolean; onChange: (a: { angle?: number; rD?: number }) => void }) {
  const ref = useRef<SVGSVGElement>(null);
  const cx = 70; const cy = 110; const L = 80;
  const rad = (angle * Math.PI) / 180;
  // Jambe d'entrée : horizontale vers le coude ; jambe de sortie : tournée de `angle` par rapport au prolongement.
  const rr = sharp ? 0 : Math.min(60, 12 + rD * 14);
  const a0 = { x: cx - L, y: cy };
  const bendStart = { x: cx - rr * Math.tan(rad / 2) * 0, y: cy }; void bendStart;
  const ex = cx + L * Math.cos(rad); const ey = cy - L * Math.sin(rad);
  const hx = ex; const hy = ey;
  const path = sharp
    ? `M${a0.x} ${a0.y} L${cx} ${cy} L${ex} ${ey}`
    : (() => {
        const t = Math.min(40, rr * Math.tan(rad / 2)); // distance du coude au début de l'arc
        const p1 = { x: cx - t, y: cy }; const p2 = { x: cx + t * Math.cos(rad), y: cy - t * Math.sin(rad) };
        return `M${a0.x} ${a0.y} L${p1.x} ${p1.y} Q${cx} ${cy} ${p2.x} ${p2.y} L${ex} ${ey}`;
      })();
  const K = sharp ? kBendSharp(angle) : kBendRound(angle, rD);
  const fromPointer = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * 220; const py = ((e.clientY - r.top) / r.height) * 150;
    const a = (Math.atan2(cy - py, px - cx) * 180) / Math.PI;
    onChange({ angle: Math.max(0, Math.min(180, Math.round(a < -90 ? 180 : a < 0 ? 0 : a))) });
  };
  return (
    <div className="space-y-2">
      <svg ref={ref} viewBox="0 0 220 150" className="w-full max-w-xs touch-none select-none border bg-bg" role="group" aria-label="Coude : angle et rayon de courbure">
        <path d={path} fill="none" stroke="var(--ink)" strokeWidth={14} strokeLinejoin="round" opacity={0.18} />
        <path d={path} fill="none" stroke="var(--series-1)" strokeWidth={6} strokeLinejoin="round" />
        <path d={`M${cx + 30} ${cy} A30 30 0 0 0 ${cx + 30 * Math.cos(rad)} ${cy - 30 * Math.sin(rad)}`} fill="none" stroke="var(--ink-3)" strokeWidth={1.2} strokeDasharray="3 3" />
        <line x1={cx} y1={cy} x2={cx + 50} y2={cy} stroke="var(--ink-3)" strokeWidth={1} strokeDasharray="3 3" />
        <text x={cx + 34 + 12 * Math.cos(rad / 2)} y={cy - 8 - 14 * Math.sin(rad / 2)} fontSize={11} fill="var(--ink)">{angle}°</text>
        <g tabIndex={0} role="slider" aria-label="Angle de déviation" aria-valuemin={0} aria-valuemax={180} aria-valuenow={angle} style={{ cursor: 'grab' }}
          onPointerDown={(e) => { (e.currentTarget as Element).setPointerCapture(e.pointerId); fromPointer(e); }}
          onPointerMove={(e) => { if (e.buttons) fromPointer(e); }}
          onKeyDown={(e) => { const d = e.shiftKey ? 5 : 1; if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); onChange({ angle: Math.max(0, angle - d) }); } if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); onChange({ angle: Math.min(180, angle + d) }); } }}>
          <circle cx={hx} cy={hy} r={11} fill="var(--surface)" stroke="var(--accent)" strokeWidth={2.4} />
          <circle cx={hx} cy={hy} r={3.5} fill="var(--accent)" />
        </g>
        <text x={8} y={142} fontSize={10.5} fill="var(--ink-3)">Tirez la poignée</text>
      </svg>
      {!sharp && (
        <label className="block text-[12px] text-ink-2">Rayon de courbure R/D : <span className="num text-ink">{fmtNum(rD, 3)}</span>
          <input type="range" min={0.5} max={6} step={0.1} value={rD} className="block w-full max-w-xs accent-[var(--accent)]" onChange={(e) => onChange({ rD: Number(e.target.value) })} aria-label="Rapport R/D" />
        </label>
      )}
      <p className="num text-[13px]">K = <span className="font-semibold">{fmtNum(K, 3)}</span> <span className="text-ink-3">par coude</span></p>
    </div>
  );
}
