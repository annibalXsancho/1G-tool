// Export d'un plan de comptage au format draw.io (diagrams.net) : le plan généré reste modifiable à la main.
// Format : mxfile non compressé. Les coordonnées viennent de la mise en page automatique.
import type { NodeState } from './analyse';
import { CARD_H, CARD_W, type Layout } from './layout';
import { FLAG_LABEL, KIND_LABEL, STATUS_LABEL, type Plan } from './model';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Couleurs du thème clair (les exports sont destinés aux rapports). */
const FILL: Record<NodeState, { fill: string; stroke: string; dashed?: boolean }> = {
  mesure: { fill: '#dcebe7', stroke: '#0f6b5c' },
  agrege: { fill: '#eef5f3', stroke: '#0f6b5c' },
  difference: { fill: '#eef5f3', stroke: '#0f6b5c', dashed: true },
  inconnu: { fill: '#f6e7d2', stroke: '#b45309' },
  reserve: { fill: '#f4f2ee', stroke: '#858a8d', dashed: true },
  exclu: { fill: '#ffffff', stroke: '#858a8d', dashed: true },
};
const STATE_TEXT: Record<NodeState, string> = {
  mesure: 'mesuré', agrege: 'agrégé', difference: 'par différence', inconnu: 'non instrumenté', reserve: 'réserve / sans conso.', exclu: 'hors périmètre',
};

export function toDrawio(plan: Plan, layout: Layout): string {
  const cells: string[] = ['<mxCell id="0"/>', '<mxCell id="1" parent="0"/>'];
  const nid = (id: string) => `n-${id}`;

  layout.columns.forEach((c, i) => {
    cells.push(`<mxCell id="col-${i}" value="${esc(c.label.toUpperCase())}" style="text;html=1;align=left;verticalAlign=middle;fontStyle=1;fontSize=11;fontColor=#55595c;" vertex="1" parent="1"><mxGeometry x="${c.x}" y="20" width="${c.w}" height="24" as="geometry"/></mxCell>`);
  });

  for (const p of layout.nodes) {
    const f = FILL[p.state];
    const rated = p.node.rated ? ` · ${p.node.rated.toLocaleString('fr-FR')} ${plan.ratedUnit}` : '';
    const value = `<b>${esc(p.node.label)}</b><br/><font style="font-size:10px">${esc(KIND_LABEL[p.node.kind])}${esc(rated)} — ${STATE_TEXT[p.state]}${p.node.flag !== 'actif' ? ` (${esc(FLAG_LABEL[p.node.flag])})` : ''}</font>`;
    cells.push(`<mxCell id="${nid(p.node.id)}" value="${esc(value)}" style="rounded=1;whiteSpace=wrap;html=1;fillColor=${f.fill};strokeColor=${f.stroke};strokeWidth=1.5;${f.dashed ? 'dashed=1;' : ''}align=left;spacingLeft=8;fontSize=12;fontColor=#16181a;" vertex="1" parent="1"><mxGeometry x="${Math.round(p.x)}" y="${Math.round(p.y)}" width="${CARD_W}" height="${CARD_H}" as="geometry"/></mxCell>`);
  }

  layout.links.forEach((l, i) => {
    const pts = l.points;
    const inner = pts.slice(1, -1).map(([x, y]) => `<mxPoint x="${Math.round(x)}" y="${Math.round(y)}"/>`).join('');
    const src = l.from ? ` source="${nid(l.from)}"` : '';
    const style = `edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;endArrow=none;strokeWidth=1.5;strokeColor=${l.secondary ? '#b45309' : '#16181a'};${l.secondary ? 'dashed=1;dashPattern=8 6;' : ''}`;
    if (l.from === null) {
      cells.push(`<mxCell id="lk-${i}" style="${style}" edge="1" parent="1" target="${nid(l.to)}"><mxGeometry relative="1" as="geometry"><mxPoint x="${Math.round(pts[0][0])}" y="${Math.round(pts[0][1])}" as="sourcePoint"/></mxGeometry></mxCell>`);
    } else {
      cells.push(`<mxCell id="lk-${i}"${src} target="${nid(l.to)}" style="${style}" edge="1" parent="1"><mxGeometry relative="1" as="geometry"><Array as="points">${inner}</Array></mxGeometry></mxCell>`);
    }
    for (const pm of l.meters) {
      const planned = pm.meter.status === 'a-installer';
      const comm = pm.meter.status === 'existant-communicant';
      const style = `ellipse;whiteSpace=wrap;html=1;aspect=fixed;fontSize=10;fontStyle=1;strokeWidth=1.5;strokeColor=${planned ? '#b45309' : '#0f6b5c'};fillColor=${comm ? '#0f6b5c' : '#ffffff'};fontColor=${comm ? '#ffffff' : '#0f6b5c'};${planned ? 'dashed=1;' : ''}`;
      const tip = `${pm.meter.id} — ${STATUS_LABEL[pm.meter.status]}${pm.meter.comm ? ` — ${pm.meter.comm}` : ''}`;
      cells.push(`<mxCell id="mt-${esc(pm.meter.id)}" value="${planned ? '+' : 'M'}" tooltip="${esc(tip)}" style="${style}" vertex="1" parent="1"><mxGeometry x="${Math.round(pm.x - 11)}" y="${Math.round(pm.y - 11)}" width="22" height="22" as="geometry"/></mxCell>`);
      cells.push(`<mxCell id="mtl-${esc(pm.meter.id)}" value="${esc(pm.meter.id)}" style="text;html=1;align=center;verticalAlign=top;fontSize=9;fontColor=#55595c;" vertex="1" parent="1"><mxGeometry x="${Math.round(pm.x - 40)}" y="${Math.round(pm.y + 12)}" width="80" height="14" as="geometry"/></mxCell>`);
    }
  });

  const title = `${plan.name}${plan.site ? ` — ${plan.site}` : ''} (${layout.scenario === 'cible' ? 'scénario cible' : 'état actuel'})`;
  cells.push(`<mxCell id="title" value="${esc(title)}" style="text;html=1;align=left;verticalAlign=middle;fontStyle=1;fontSize=16;" vertex="1" parent="1"><mxGeometry x="20" y="${Math.round(layout.height + 10)}" width="700" height="28" as="geometry"/></mxCell>`);

  return `<?xml version="1.0" encoding="UTF-8"?>\n<mxfile host="app.diagrams.net"><diagram name="${esc(plan.name)}" id="plan-${esc(plan.id)}"><mxGraphModel grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="${Math.round(layout.width + 80)}" pageHeight="${Math.round(layout.height + 80)}" math="0" shadow="0"><root>${cells.join('')}</root></mxGraphModel></diagram></mxfile>\n`;
}
