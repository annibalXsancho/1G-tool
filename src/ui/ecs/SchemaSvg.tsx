'use client';
// Schéma de principe d'une production d'ECS collective : générateur → échangeur à plaques → ballon → boucle de distribution.
// Variante « screen » : couleurs = variables CSS, écoulements animés (classes .ecs-* de globals.css), éléments cliquables.
// Variante « sheet » : couleurs explicites en thème clair, sans animation, pour l'export SVG/PNG.
import { forwardRef } from 'react';
import { fmtNum } from '@/core/fmt';
import { GENERATOR_LABEL, MODE_LABEL, type EcsInput, type EcsResult } from '@/ecs/calc';
import { LIGHT_COLORS, SCREEN_COLORS } from '../metering/PlanSvg';

export type Part = 'generateur' | 'echangeur' | 'ballon' | 'boucle' | 'eau-froide';
export const PART_LABEL: Record<Part, string> = { generateur: 'Générateur', echangeur: 'Échangeur à plaques', ballon: 'Ballon de stockage', boucle: 'Boucle de distribution', 'eau-froide': 'Arrivée d’eau froide' };

const FONT = "'IBM Plex Sans', Arial, sans-serif";
const SCREEN = { ...SCREEN_COLORS, hot: 'var(--series-8)', warm: 'var(--series-2)', loop: 'var(--series-4)', cold: 'var(--series-1)', err: 'var(--err)' };
const LIGHT = { ...LIGHT_COLORS, hot: '#e34948', warm: '#eb6834', loop: '#eda100', cold: '#2a78d6', err: '#b3261e' };
type Pal = typeof SCREEN;

const W = 960; const H = 510;
const TANK = { x: 560, y: 70, w: 130, h: 290 };

/** Durée (s) d'un cycle de défilement : plus la puissance (ou le débit) relative est grande, plus c'est rapide. */
const dur = (x: number) => 2.4 - 1.7 * Math.max(0, Math.min(1, x));

function Pipe({ d, color, w = 5, speed, rev, animate, on = true, arrow }: { d: string; color: string; w?: number; speed: number; rev?: boolean; animate: boolean; on?: boolean; arrow?: string }) {
  return (
    <g>
      <path d={d} fill="none" stroke={color} strokeWidth={w} strokeLinejoin="round" strokeLinecap="round" opacity={animate ? 0.28 : 0.85} markerEnd={!animate && arrow ? `url(#${arrow})` : undefined} />
      {animate && on && <path className={`ecs-flow${rev ? ' rev' : ''}`} d={d} fill="none" stroke={color} strokeWidth={w - 1.5} strokeLinejoin="round" strokeLinecap="round" style={{ ['--dur' as string]: `${dur(speed).toFixed(2)}s` }} />}
    </g>
  );
}

function Pump({ x, y, c, animate, on }: { x: number; y: number; c: Pal; animate: boolean; on: boolean }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle r={12} fill={c.surface} stroke={c.ink} strokeWidth={1.6} />
      <g className={animate && on ? 'ecs-spin' : undefined} stroke={c.ink} strokeWidth={1.6} strokeLinecap="round">
        <line x1={-7} y1={0} x2={7} y2={0} /><line x1={-3.5} y1={-6} x2={3.5} y2={6} /><line x1={-3.5} y1={6} x2={3.5} y2={-6} />
      </g>
    </g>
  );
}

const Label = ({ x, y, children, c, size = 11, anchor = 'start', weight = 400, fill }: { x: number; y: number; children: React.ReactNode; c: Pal; size?: number; anchor?: 'start' | 'middle' | 'end'; weight?: number; fill?: string }) => (
  <text x={x} y={y} fontSize={size} fontWeight={weight} textAnchor={anchor} fill={fill ?? c.ink2} stroke={c.surface} strokeWidth={3} paintOrder="stroke" style={{ fontVariantNumeric: 'tabular-nums' }}>{children}</text>
);

type Props = {
  input: EcsInput; result: EcsResult;
  /** Minute courante de la simulation de pointe. */
  minute: number;
  animate?: boolean; paused?: boolean;
  selected?: Part | null; onSelect?: (p: Part) => void;
  variant: 'screen' | 'sheet';
};

const SchemaSvg = forwardRef<SVGSVGElement, Props>(function SchemaSvg({ input, result, minute, animate = true, paused = false, selected, onSelect, variant }, ref) {
  const sheet = variant === 'sheet';
  const c: Pal = sheet ? LIGHT : SCREEN;
  const anim = !sheet && animate;
  const uid = sheet ? 's' : 'a';
  const r = result.retained; const sim = result.sim;
  const k = Math.max(0, Math.min(sim.t.length - 1, Math.round(minute)));
  const U = input.a * r.V;
  const stock = sim.stock[k] ?? U;
  const fill = U > 0 ? Math.max(0, Math.min(1, stock / U)) : 0;
  const deficit = (sim.deficit[k] ?? 0) > 0;
  const demandNow = k > 0 ? sim.demande[k] - sim.demande[k - 1] : 0; // L/min à Tstock
  const peakRate = Math.max(1e-9, sim.demande[Math.min(10, sim.demande.length - 1)] / 10);
  const flowDemand = Math.min(1, demandNow / peakRate);
  const Pmax = Math.max(r.P, 1e-9);
  const loopOn = input.hCirculateur > 0;
  const noTank = r.V <= 0;
  const hotH = TANK.h * input.a * fill;
  const mixH = TANK.h * (1 - input.a);
  const coldH = TANK.h - hotH - mixH;
  const stockPct = U > 0 ? fill * 100 : 0;
  const sel = (p: Part) => selected === p;

  const hit = (p: Part, x: number, y: number, w: number, h: number) => (
    <rect className="ecs-hit" x={x} y={y} width={w} height={h} rx={6} fill="transparent" stroke={sel(p) ? c.accent : 'none'} strokeWidth={2} strokeDasharray={sel(p) ? undefined : '4 3'} />
  );
  const part = (p: Part, body: React.ReactNode, box: [number, number, number, number]) => (
    <g className={onSelect ? 'ecs-part' : undefined} role={onSelect ? 'button' : undefined} tabIndex={onSelect ? 0 : undefined} aria-label={onSelect ? `${PART_LABEL[p]} : modifier` : undefined}
      aria-pressed={onSelect ? sel(p) : undefined} onClick={onSelect ? () => onSelect(p) : undefined}
      onKeyDown={onSelect ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(p); } } : undefined}>
      {onSelect && hit(p, ...box)}
      {body}
    </g>
  );

  const arrowDefs = (['hot', 'warm', 'loop', 'cold'] as const).map((key) => (
    <marker key={key} id={`${uid}-arrow-${key}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill={c[key]} /></marker>
  ));
  const ar = (key: 'hot' | 'warm' | 'loop' | 'cold') => `${uid}-arrow-${key}`;

  return (
    <svg ref={ref} xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${W} ${H}`} role="img" className={paused ? 'ecs-paused' : undefined}
      aria-label={`Schéma de principe de la production d’ECS : ${GENERATOR_LABEL[input.generateur]}, échangeur à plaques${noTank ? '' : `, ballon de ${fmtNum(r.V, 4)} litres`}, boucle de distribution`}
      style={{ fontFamily: FONT, display: 'block', width: '100%', height: 'auto', background: sheet ? c.surface : undefined }}>
      <defs>
        {arrowDefs}
        <clipPath id={`${uid}-tank`}><rect x={TANK.x + 1.5} y={TANK.y + 1.5} width={TANK.w - 3} height={TANK.h - 3} rx={13} /></clipPath>
      </defs>
      {sheet && <rect width={W} height={H} fill={c.surface} />}

      {/* Lecture de la simulation */}
      <Label x={30} y={30} c={c} size={13} weight={600} fill={c.ink}>{MODE_LABEL[input.mode]}</Label>
      <Label x={30} y={47} c={c} size={11}>{noTank ? 'Production directe, sans stockage' : `Pointe : t = ${k} min · stock utile ${fmtNum(stock, 3)} / ${fmtNum(U, 3)} L (${fmtNum(stockPct, 3)} %)`}</Label>
      {deficit && <Label x={30} y={63} c={c} size={11} weight={600} fill={c.err}>Besoin non couvert à cet instant</Label>}

      {/* Tuyauteries : primaire, secondaire, boucle, eau froide */}
      <Pipe d="M180 190 H330" color={c.hot} speed={Pmax > 0 ? 1 : 0} animate={anim} arrow={ar('hot')} />
      <Pipe d="M330 250 H180" color={c.warm} speed={1} animate={anim} arrow={ar('warm')} />
      <Pipe d={`M380 190 H470 V112 H${TANK.x}`} color={c.hot} speed={1} animate={anim} arrow={ar('hot')} />
      <Pipe d={`M${TANK.x} 326 H430 V250 H380`} color={c.warm} speed={0.8} animate={anim} arrow={ar('warm')} />
      <Pipe d={`M625 432 V${TANK.y + TANK.h}`} color={c.cold} w={6} speed={0.25 + 0.75 * flowDemand} animate={anim} on={flowDemand > 0.02} arrow={ar('cold')} />
      <Pipe d={`M625 ${TANK.y} V36 H920`} color={c.hot} speed={0.3 + 0.7 * flowDemand} animate={anim} arrow={ar('hot')} />
      {[760, 840, 920].map((x) => <Pipe key={x} d={`M${x} 36 V400`} color={c.hot} w={4} speed={0.3 + 0.7 * flowDemand} animate={anim} on={loopOn} />)}
      <Pipe d={`M920 400 H730 V335 H${TANK.x + TANK.w}`} color={c.loop} speed={0.6} animate={anim} on={loopOn} arrow={ar('loop')} />
      <Pump x={470} y={326} c={c} animate={anim} on />
      <Pump x={830} y={400} c={c} animate={anim} on={loopOn} />

      {/* Générateur */}
      {part('generateur', (
        <g>
          <rect x={30} y={150} width={150} height={140} rx={6} fill={c.surface} stroke={c.ink} strokeWidth={1.8} />
          {input.generateur === 'chaudiere' && <path className={anim ? 'ecs-flame' : undefined} d="M105 262 C85 248 90 228 100 216 C102 226 108 228 112 224 C118 214 112 200 108 190 C128 204 134 238 124 254 C120 260 112 264 105 262 Z" fill={c.warm} stroke={c.ink} strokeWidth={1.4} />}
          {input.generateur === 'reseau' && <g stroke={c.ink} strokeWidth={2} fill="none"><path d="M80 200 H130 M80 214 H130 M80 228 H130 M80 242 H130" /><circle cx={70} cy={221} r={5} fill={c.hot} /><circle cx={140} cy={221} r={5} fill={c.warm} /></g>}
          {input.generateur === 'pac' && <g><circle cx={105} cy={222} r={30} fill="none" stroke={c.ink} strokeWidth={1.6} /><g className={anim ? 'ecs-spin slow' : undefined} stroke={c.ink} strokeWidth={2.4} strokeLinecap="round"><line x1={105} y1={202} x2={105} y2={242} /><line x1={85} y1={222} x2={125} y2={222} /></g></g>}
          <Label x={105} y={170} c={c} anchor="middle" size={12} weight={600} fill={c.ink}>{GENERATOR_LABEL[input.generateur]}</Label>
          <Label x={105} y={282} c={c} anchor="middle" size={11}>{input.Pdispo !== undefined ? `${fmtNum(input.Pdispo, 4)} kW disponibles` : 'puissance non limitée'}</Label>
        </g>
      ), [26, 146, 158, 148])}
      <Label x={255} y={182} c={c} anchor="middle" size={10.5}>primaire départ</Label>
      <Label x={255} y={268} c={c} anchor="middle" size={10.5}>primaire retour</Label>

      {/* Échangeur à plaques */}
      {part('echangeur', (
        <g>
          <rect x={330} y={150} width={50} height={140} rx={3} fill={c.surface} stroke={c.ink} strokeWidth={1.8} />
          {[0, 1, 2, 3, 4, 5].map((i) => <rect key={i} x={336 + i * 7} y={156} width={4} height={128} fill={i % 2 === 0 ? c.hot : c.warm} opacity={0.75} />)}
          <Label x={355} y={309} c={c} anchor="middle" size={11} weight={600} fill={c.ink}>Échangeur</Label>
          <Label x={355} y={324} c={c} anchor="middle" size={11}>{fmtNum(r.P, 4)} kW</Label>
        </g>
      ), [322, 142, 66, 192])}

      {/* Ballon stratifié */}
      {part('ballon', (
        <g>
          <g clipPath={`url(#${uid}-tank)`}>
            <rect x={TANK.x} y={TANK.y} width={TANK.w} height={TANK.h} fill={c.surface} />
            {!noTank && (
              <>
                <rect className="ecs-layer" x={TANK.x} y={TANK.y} width={TANK.w} height={hotH} fill={c.hot} opacity={0.82} />
                <rect className="ecs-layer" x={TANK.x} y={TANK.y + hotH} width={TANK.w} height={mixH} fill={c.loop} opacity={0.7} />
                <rect className="ecs-layer" x={TANK.x} y={TANK.y + hotH + mixH} width={TANK.w} height={coldH} fill={c.cold} opacity={0.75} />
                <line className="ecs-layer" x1={TANK.x} x2={TANK.x + TANK.w} y1={TANK.y + hotH} y2={TANK.y + hotH} stroke={c.surface} strokeWidth={1.5} />
                <line className="ecs-layer" x1={TANK.x} x2={TANK.x + TANK.w} y1={TANK.y + hotH + mixH} y2={TANK.y + hotH + mixH} stroke={c.surface} strokeWidth={1.5} />
              </>
            )}
          </g>
          <rect x={TANK.x} y={TANK.y} width={TANK.w} height={TANK.h} rx={14} fill="none" stroke={c.ink} strokeWidth={2} strokeDasharray={noTank ? '6 4' : undefined} />
          {noTank ? (
            <Label x={TANK.x + TANK.w / 2} y={TANK.y + TANK.h / 2} c={c} anchor="middle" size={11}>pas de stockage</Label>
          ) : (
            <>
              <Label x={TANK.x + TANK.w / 2} y={TANK.y + 22} c={c} anchor="middle" size={11} weight={600} fill={c.ink}>{fmtNum(input.Tstock, 3)} °C</Label>
              <Label x={TANK.x + TANK.w / 2} y={TANK.y + TANK.h / 2 - 8} c={c} anchor="middle" size={12} weight={600} fill={c.ink}>{r.ballons > 1 ? `${r.ballons} × ${fmtNum(r.V / r.ballons, 4)} L` : `${fmtNum(r.V, 4)} L`}</Label>
              <Label x={TANK.x + TANK.w / 2} y={TANK.y + TANK.h / 2 + 8} c={c} anchor="middle" size={10.5}>a = {fmtNum(input.a, 2)}</Label>
              {coldH > 20 && <Label x={TANK.x + TANK.w / 2} y={TANK.y + TANK.h - 12} c={c} anchor="middle" size={11} weight={600} fill={c.ink}>{fmtNum(input.Tfroide, 3)} °C</Label>}
            </>
          )}
        </g>
      ), [TANK.x - 6, TANK.y - 6, TANK.w + 12, TANK.h + 12])}
      {!noTank && <Label x={TANK.x + TANK.w + 8} y={TANK.y + hotH / 2 + 4} c={c} size={10}>utile</Label>}
      {!noTank && mixH > 12 && <Label x={TANK.x + TANK.w + 8} y={TANK.y + hotH + mixH / 2 + 4} c={c} size={10}>mélangé</Label>}

      {/* Eau froide */}
      {part('eau-froide', (
        <g>
          <Label x={625} y={450} c={c} anchor="middle" size={11} weight={600} fill={c.ink}>Eau froide</Label>
          <Label x={625} y={465} c={c} anchor="middle" size={11}>{fmtNum(input.Tfroide, 3)} °C</Label>
        </g>
      ), [570, 432, 110, 40])}

      {/* Boucle de distribution */}
      {part('boucle', (
        <g>
          {[760, 840, 920].map((x) => (
            <g key={x} transform={`translate(${x} 200)`}>
              <circle r={8} fill={c.surface} stroke={c.ink} strokeWidth={1.5} />
              <path d="M-4 -2 H4 M0 -2 V5" stroke={c.ink} strokeWidth={1.5} fill="none" />
            </g>
          ))}
          <Label x={840} y={238} c={c} anchor="middle" size={10.5}>points de puisage</Label>
          <Label x={830} y={430} c={c} anchor="middle" size={11} weight={600} fill={c.ink}>Boucle · retour {fmtNum(input.TretourBoucle, 3)} °C</Label>
          <Label x={830} y={445} c={c} anchor="middle" size={10.5} fill={c.warn}>pertes de boucle {fmtNum(result.Pboucle, 3)} kW</Label>
          <g className={anim && loopOn ? 'ecs-loss' : undefined} stroke={c.warn} strokeWidth={1.6} fill="none" strokeLinecap="round">
            {[760, 790, 880].map((x) => <path key={x} d={`M${x} 392 q4 -6 0 -12 q-4 -6 0 -12`} />)}
          </g>
        </g>
      ), [700, 20, 240, 440])}
      <Label x={780} y={26} c={c} size={10.5}>départ ECS · {fmtNum(input.Tstock, 3)} °C</Label>

      {/* Légende */}
      <g transform={`translate(30 ${H - 12})`} fontSize={10.5}>
        {([['hot', 'départ chaud'], ['warm', 'retour primaire / secondaire'], ['loop', 'retour de boucle'], ['cold', 'eau froide']] as const).map(([key, label], i) => (
          <g key={key} transform={`translate(${i * 170} 0)`}>
            <line x1={0} x2={22} y1={-3} y2={-3} stroke={c[key]} strokeWidth={4} strokeLinecap="round" />
            <text x={28} y={0} fill={c.ink2}>{label}</text>
          </g>
        ))}
      </g>
    </svg>
  );
});

export default SchemaSvg;
