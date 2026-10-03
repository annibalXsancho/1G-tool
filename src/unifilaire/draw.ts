// Dessin automatique d'un schéma unifilaire : l'arbre d'éléments est disposé de haut en bas (source en tête, charges
// en bas), les départs d'un tableau sont répartis le long du jeu de barres. Le module est pur : il produit des
// primitives (lignes, cercles, textes…) avec des rôles de couleur, rendues ensuite en SVG par l'interface.
// Symboles simplifiés, d'esprit CEI 60617 (TODO: conformité à la norme de symboles à vérifier avant diffusion).
import { calculate, type Calc, type CalcOptions, DEFAULT_CALC } from './calc';
import type { UElement } from './model';

export type Role = 'ink' | 'ink2' | 'ink3' | 'accent' | 'accentSoft' | 'accentInk' | 'warn' | 'warnSoft' | 'err' | 'surface';

export type Prim =
  | { t: 'line'; x1: number; y1: number; x2: number; y2: number; w?: number; role?: Role; dash?: string }
  | { t: 'rect'; x: number; y: number; w: number; h: number; rx?: number; fill?: Role | 'none'; stroke?: Role | 'none'; sw?: number; dash?: string }
  | { t: 'circle'; cx: number; cy: number; r: number; fill?: Role | 'none'; stroke?: Role | 'none'; sw?: number; dash?: string }
  | { t: 'path'; d: string; fill?: Role | 'none'; stroke?: Role | 'none'; sw?: number }
  | { t: 'text'; x: number; y: number; text: string; size?: number; weight?: number; anchor?: 'start' | 'middle' | 'end'; role?: Role };

export type Hit = { ref: string; x: number; y: number; w: number; h: number };
export type Drawing = { width: number; height: number; prims: Prim[]; hits: Hit[]; bounds: { x: number; y: number } };

export type DrawOptions = { calc?: Calc; calcOptions?: CalcOptions; showValues?: boolean };

const COL_MIN = 184;
const PAD = 34;
const textW = (s: string, size: number, weight = 400) => s.length * size * (weight >= 600 ? 0.6 : 0.55);

export function wrap(label: string, max = 24): string[] {
  const words = label.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if (!cur) cur = w;
    else if ((cur + ' ' + w).length <= max) cur += ' ' + w;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  if (lines.length <= 2) return lines;
  const rest = lines.slice(1).join(' ');
  return [lines[0], rest.length > max + 2 ? rest.slice(0, max + 1) + '…' : rest];
}

const num = (v: number, d = 3) => {
  if (!Number.isFinite(v)) return '∞';
  const t = Number(v.toPrecision(d));
  return String(t).replace('.', ',');
};

const SHORT: Record<string, string> = { disjoncteur: 'Disj.', interrupteur: 'Interr.', fusible: 'Fus.' };

export function drawInstallation(inst: { elements: UElement[] }, opts: DrawOptions = {}): Drawing {
  const calc = opts.calc ?? calculate({ id: '', name: '', site: '', elements: inst.elements }, opts.calcOptions);
  const duLimit = (opts.calcOptions ?? DEFAULT_CALC).duLimit;
  const showValues = opts.showValues ?? true;
  const prims: Prim[] = [];
  const hits: Hit[] = [];
  const P = (p: Prim) => prims.push(p);
  const line = (x1: number, y1: number, x2: number, y2: number, w = 1.6, role: Role = 'ink', dash?: string) => P({ t: 'line', x1, y1, x2, y2, w, role, dash });
  const text = (x: number, y: number, s: string, size = 10.5, weight = 400, role: Role = 'ink2', anchor: 'start' | 'middle' | 'end' = 'start') => P({ t: 'text', x, y, text: s, size, weight, role, anchor });

  const kids = (e: UElement) => calc.children.get(e.id) ?? [];
  const widthCache = new Map<string, number>();
  const measure = (e: UElement): number => {
    const hit = widthCache.get(e.id);
    if (hit !== undefined) return hit;
    widthCache.set(e.id, COL_MIN);
    const k = kids(e);
    const w = k.length === 0 ? COL_MIN : Math.max(COL_MIN, k.reduce((a, c) => a + measure(c), 0));
    widthCache.set(e.id, w);
    return w;
  };

  const linkNeeded = (e: UElement) => (e.parent ? 14 + (e.breaker ? 54 : 0) + (e.meter ? 44 : 0) + (e.cable && (e.cable.section || e.cable.length) ? 34 : 0) + 8 : 0);

  // ───────── symboles ─────────
  const breakerSymbol = (e: UElement, cx: number, y: number) => {
    const b = e.breaker!;
    const n = calc.nodes.get(e.id)!;
    const bad = (b.in !== undefined && n.ib > b.in + 1e-9) || (b.icu !== undefined && n.iccUp !== undefined && Number.isFinite(n.iccUp) && b.icu < n.iccUp - 1e-9);
    const role: Role = bad ? 'err' : 'ink';
    if (b.type === 'fusible') {
      line(cx, y, cx, y + 8, 1.6);
      P({ t: 'rect', x: cx - 5, y: y + 8, w: 10, h: 24, fill: 'surface', stroke: role, sw: 1.6 });
      line(cx, y + 8, cx, y + 32, 1.2, role);
      line(cx, y + 32, cx, y + 40, 1.6);
    } else {
      line(cx, y, cx, y + 10, 1.6);
      line(cx, y + 34, cx, y + 40, 1.6);
      line(cx, y + 34, cx + 11, y + 12, 1.8, role); // lame ouverte
      if (b.type === 'interrupteur') line(cx + 4, y + 22, cx + 12, y + 18, 1.6, role);
      if (b.type === 'disjoncteur') { line(cx - 4.5, y + 5.5, cx + 4.5, y + 14.5, 1.8, role); line(cx - 4.5, y + 14.5, cx + 4.5, y + 5.5, 1.8, role); }
    }
    const l1 = `${SHORT[b.type]} ${b.in !== undefined ? `${num(b.in)} A` : ''}${b.curve ? ` ${b.curve}` : ''}`.trim();
    text(cx + 18, y + 17, l1, 10, 600, bad ? 'err' : 'ink');
    if (b.icu !== undefined) text(cx + 18, y + 29, `Icu ${num(b.icu)} kA`, 9.5, 400, bad ? 'err' : 'ink2');
  };

  const meterSymbol = (e: UElement, cx: number, y: number) => {
    const m = e.meter!;
    const planned = m.status === 'a-installer';
    const comm = m.status === 'existant-communicant';
    const stroke: Role = planned ? 'warn' : 'accent';
    line(cx, y, cx, y + 4, 1.6);
    P({ t: 'rect', x: cx - 17, y: y + 4, w: 34, h: 20, rx: 2, fill: comm ? 'accent' : 'surface', stroke, sw: 1.6, dash: planned ? '4 3' : undefined });
    text(cx, y + 18, 'kWh', 10, 700, comm ? 'accentInk' : stroke, 'middle');
    line(cx, y + 24, cx, y + 30, 1.6);
    if (m.ct) { P({ t: 'circle', cx, cy: y + 36, r: 5, fill: 'surface', stroke, sw: 1.5, dash: planned ? '3 2' : undefined }); }
    text(cx + 24, y + 14, m.id, 9.5, 600, 'ink');
    text(cx + 24, y + 26, `${m.status === 'a-installer' ? 'à installer' : m.status === 'existant-manuel' ? 'relevé manuel' : 'communicant'}${m.ct ? ` · TC ${m.ct}` : ''}`, 9, 400, 'ink2');
  };

  const cableText = (e: UElement, cx: number, y: number) => {
    const c = e.cable!;
    const mat = c.material === 'aluminium' ? 'Al' : 'Cu';
    const sec = c.section ? `${(c.parallel ?? 1) > 1 ? `${c.parallel}×` : ''}${num(c.section)} mm²` : '';
    text(cx + 8, y + 12, `${mat} ${sec}`.trim(), 9.5, 400, 'ink2');
    if (c.length) text(cx + 8, y + 24, `${num(c.length)} m${c.designation ? ` · ${c.designation}` : ''}`, 9, 400, 'ink3');
  };

  const drawLink = (e: UElement, cx: number, y: number, h: number) => {
    // Liaison verticale + appareils, de haut en bas : protection, compteur, câble.
    line(cx, y, cx, y + h, 1.6);
    let cur = y + 6;
    if (e.breaker) { breakerSymbol(e, cx, cur); cur += 54; }
    if (e.meter) { meterSymbol(e, cx, cur); cur += 44; }
    if (e.cable && (e.cable.section || e.cable.length)) cableText(e, cx, y + h - 34);
    hits.push({ ref: e.id, x: cx - 24, y, w: 120, h });
  };

  const infoLines = (e: UElement): string[] => {
    const n = calc.nodes.get(e.id)!;
    const out: string[] = [];
    if (e.kind === 'moteur' || e.kind === 'charge') out.push(`${e.p !== undefined ? `${num(e.p)} kW` : ''}${e.cosphi ? ` · cos φ ${num(e.cosphi)}` : ''}`.trim());
    if (e.kind === 'condensateurs') out.push(`${num(e.q ?? 0)} kvar`);
    if (e.kind === 'groupe') out.push(`${num(e.s ?? 0)} kVA — secours`);
    if (showValues && n.ib > 0 && e.kind !== 'groupe') out.push(`IB ${num(n.ib)} A`);
    return out.filter(Boolean);
  };

  const duText = (e: UElement, cx: number, y: number) => {
    const n = calc.nodes.get(e.id)!;
    if (showValues && n.du > 0.005 && e.parent && (kids(e).length === 0)) text(cx, y, `ΔU ${num(n.du, 2)} %`, 9.5, n.du > duLimit ? 700 : 400, n.du > duLimit ? 'warn' : 'ink3', 'middle');
  };

  const belowLabel = (e: UElement, cx: number, y: number) => {
    const lines = wrap(e.label, 24);
    lines.forEach((l, i) => text(cx, y + i * 12.5, l, 11.5, 700, 'ink', 'middle'));
    let yy = y + lines.length * 12.5;
    for (const l of infoLines(e)) { text(cx, yy, l, 10, 400, 'ink2', 'middle'); yy += 12; }
    duText(e, cx, yy);
    return yy + 14;
  };

  /** Dessine l'élément e dont le fil d'arrivée part de (cx, y) ; retourne la coordonnée y du bas du sous-arbre. */
  const drawElement = (e: UElement, cx: number, y: number, linkH: number): number => {
    if (linkH > 0) drawLink(e, cx, y, linkH);
    const ys = y + linkH;
    const n = calc.nodes.get(e.id)!;
    const children = kids(e);
    let bottom = ys;
    let childTop = ys; // ordonnée où partent les départs
    const widths = children.map(measure);
    const total = widths.reduce((a, b) => a + b, 0);
    let xc = cx - total / 2;
    const centers = children.map((_, i) => { const c = xc + widths[i] / 2; xc += widths[i]; return c; });
    const common = Math.max(0, ...children.map(linkNeeded));
    const x0 = Math.min(cx, ...centers) - 16;
    const x1 = Math.max(cx + (children.length ? 0 : 50), ...centers) + 16;

    switch (e.kind) {
      case 'reseau': {
        P({ t: 'path', d: `M ${cx - 9} ${ys} L ${cx + 9} ${ys} L ${cx} ${ys + 14} Z`, fill: 'ink', stroke: 'ink', sw: 1 });
        line(cx, ys + 14, cx, ys + 26, 1.6);
        text(cx + 16, ys + 7, e.label, 11.5, 700, 'ink');
        text(cx + 16, ys + 19, `${num((e.voltage ?? 400) / 1000)} kV${e.scc ? ` · Scc ${num(e.scc)} MVA` : ''}`, 10, 400, 'ink2');
        hits.push({ ref: e.id, x: cx - 24, y: ys - 4, w: 220, h: 34 });
        childTop = ys + 26;
        bottom = childTop;
        break;
      }
      case 'transformateur': {
        const c1 = ys + 19, c2 = ys + 37;
        line(cx, ys, cx, c1 - 17, 1.6);
        P({ t: 'circle', cx, cy: c1, r: 17, fill: 'surface', stroke: 'ink', sw: 1.8 });
        P({ t: 'circle', cx, cy: c2, r: 17, fill: 'surface', stroke: 'ink', sw: 1.8 });
        line(cx, c2 + 17, cx, ys + 66, 1.6);
        const l = [`${num((n.uUp) / 1000)}/${num(n.u / 1000)} kV${e.coupling ? ` ${e.coupling}` : ''}`, `${num(e.s ?? 0)} kVA${e.ukk ? ` · ukk ${num(e.ukk)} %` : ''}`];
        if (showValues && Number.isFinite(n.icc)) l.push(`Icc secondaire ${num(n.icc)} kA`);
        if (showValues && n.loading !== undefined && n.s > 0) l.push(`Charge ${num(n.loading * 100, 3)} %`);
        text(cx + 26, ys + 12, e.label, 11.5, 700, 'ink');
        l.forEach((s, i) => text(cx + 26, ys + 25 + i * 12, s, 10, 400, n.loading !== undefined && n.loading > 1 && i === l.length - 1 ? 'err' : 'ink2'));
        hits.push({ ref: e.id, x: cx - 24, y: ys - 2, w: 230, h: 70 });
        childTop = ys + 66;
        bottom = childTop;
        break;
      }
      case 'tableau': {
        P({ t: 'rect', x: x0, y: ys, w: x1 - x0, h: 6, fill: 'ink', stroke: 'none' });
        const info = [`${num(n.u)} V${e.inBar ? ` · ${num(e.inBar)} A` : ''}`];
        if (showValues && n.ibOwn > 0) info.push(`IB ${num(n.ibOwn)} A${n.loading !== undefined ? ` (${num(n.loading * 100, 2)} %)` : ''}`);
        if (showValues && Number.isFinite(n.icc)) info.push(`Icc ${num(n.icc)} kA`);
        text(x0 - 8, ys - 2, e.label, 11.5, 700, 'ink', 'end');
        info.forEach((t2, i) => text(x0 - 8, ys + 10 + i * 11.5, t2, 10, 400, n.loading !== undefined && n.loading > 1 && i === 1 ? 'err' : 'ink2', 'end'));
        hits.push({ ref: e.id, x: x0 - 190, y: ys - 14, w: x1 - x0 + 190, h: 50 });
        childTop = ys + 3;
        bottom = ys + 6;
        break;
      }
      case 'moteur': {
        line(cx, ys, cx, ys + 2, 1.6);
        P({ t: 'circle', cx, cy: ys + 20, r: 18, fill: 'surface', stroke: 'ink', sw: 1.8 });
        text(cx, ys + 20, 'M', 14, 700, 'ink', 'middle');
        text(cx, ys + 31, '3~', 9, 400, 'ink2', 'middle');
        bottom = belowLabel(e, cx, ys + 50);
        hits.push({ ref: e.id, x: cx - 80, y: ys, w: 160, h: bottom - ys });
        break;
      }
      case 'charge': {
        P({ t: 'rect', x: cx - 22, y: ys + 4, w: 44, h: 28, rx: 2, fill: 'surface', stroke: 'ink', sw: 1.8 });
        line(cx - 22, ys + 32, cx + 22, ys + 4, 1.2, 'ink3');
        bottom = belowLabel(e, cx, ys + 50);
        hits.push({ ref: e.id, x: cx - 80, y: ys, w: 160, h: bottom - ys });
        break;
      }
      case 'condensateurs': {
        line(cx, ys, cx, ys + 12, 1.6);
        line(cx - 13, ys + 12, cx + 13, ys + 12, 2.2);
        line(cx - 13, ys + 21, cx + 13, ys + 21, 2.2);
        line(cx, ys + 21, cx, ys + 30, 1.6);
        bottom = belowLabel(e, cx, ys + 48);
        hits.push({ ref: e.id, x: cx - 80, y: ys, w: 160, h: bottom - ys });
        break;
      }
      case 'groupe': {
        line(cx, ys, cx, ys + 2, 1.6);
        P({ t: 'circle', cx, cy: ys + 20, r: 18, fill: 'surface', stroke: 'ink', sw: 1.8 });
        text(cx, ys + 20, 'G', 14, 700, 'ink', 'middle');
        text(cx, ys + 31, '3~', 9, 400, 'ink2', 'middle');
        bottom = belowLabel(e, cx, ys + 50);
        hits.push({ ref: e.id, x: cx - 80, y: ys, w: 160, h: bottom - ys });
        break;
      }
    }

    if (children.length > 0 && e.kind !== 'moteur' && e.kind !== 'charge') {
      const isBar = e.kind !== 'tableau' && children.length > 1;
      if (isBar) line(x0, childTop, x1, childTop, 1.8);
      let deepest = bottom;
      children.forEach((c, i) => {
        deepest = Math.max(deepest, drawElement(c, centers[i], childTop, common));
      });
      bottom = deepest;
    }
    return bottom;
  };

  // Disposition des racines côte à côte.
  const roots = calc.roots;
  let x = 0;
  for (const r of roots) {
    const w = measure(r);
    drawElement(r, x + w / 2, 18, 0);
    x += w + 40;
  }

  // Cadrage : boîte englobante (textes estimés) puis translation.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const grow = (x1: number, y1: number, x2: number, y2: number) => { minX = Math.min(minX, x1); minY = Math.min(minY, y1); maxX = Math.max(maxX, x2); maxY = Math.max(maxY, y2); };
  for (const p of prims) {
    if (p.t === 'line') grow(Math.min(p.x1, p.x2), Math.min(p.y1, p.y2), Math.max(p.x1, p.x2), Math.max(p.y1, p.y2));
    else if (p.t === 'rect') grow(p.x, p.y, p.x + p.w, p.y + p.h);
    else if (p.t === 'circle') grow(p.cx - p.r, p.cy - p.r, p.cx + p.r, p.cy + p.r);
    else if (p.t === 'text') {
      const w = textW(p.text, p.size ?? 10.5, p.weight);
      const x1 = p.anchor === 'end' ? p.x - w : p.anchor === 'middle' ? p.x - w / 2 : p.x;
      grow(x1, p.y - (p.size ?? 10.5), x1 + w, p.y + 3);
    }
  }
  if (!Number.isFinite(minX)) { minX = 0; minY = 0; maxX = 200; maxY = 100; }
  const dx = PAD - minX, dy = PAD - minY;
  const shifted: Prim[] = prims.map((p) => {
    switch (p.t) {
      case 'line': return { ...p, x1: p.x1 + dx, y1: p.y1 + dy, x2: p.x2 + dx, y2: p.y2 + dy };
      case 'rect': return { ...p, x: p.x + dx, y: p.y + dy };
      case 'circle': return { ...p, cx: p.cx + dx, cy: p.cy + dy };
      case 'text': return { ...p, x: p.x + dx, y: p.y + dy };
      case 'path': return { ...p, d: p.d.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (_, a, b) => `${Number(a) + dx} ${Number(b) + dy}`) };
    }
  });
  const shiftedHits = hits.map((h) => ({ ...h, x: h.x + dx, y: h.y + dy }));
  return { width: Math.ceil(maxX - minX + PAD * 2), height: Math.ceil(maxY - minY + PAD * 2), prims: shifted, hits: shiftedHits, bounds: { x: dx, y: dy } };
}
