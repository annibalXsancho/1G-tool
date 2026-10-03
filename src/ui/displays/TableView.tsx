'use client';
import { useMemo, useState } from 'react';
import { fmtNum } from '@/core/fmt';
import { DIMENSIONS, fromSI } from '@/core/units';
import type { Display, TableDisplay } from '@/core/types';
import PlotlyChart, { type BuildChart } from '../charts/PlotlyChart';

type Col = TableDisplay['columns'][number];
const unitOf = (c: Col) => (c.dimension ? c.unit ?? DIMENSIONS[c.dimension].display : c.unit);
const val = (c: Col, v: number | string) => (typeof v === 'number' && c.dimension ? fromSI(v, c.dimension, unitOf(c)!) : v);

/** Tableau de sensibilité, avec une vue graphique : colonne 1 en abscisse, une colonne au choix en ordonnée (un seul axe). */
export default function TableView({ display }: { display: Display }) {
  const d = display as TableDisplay;
  const [view, setView] = useState<'table' | 'chart'>('table');
  const numericY = d.columns.map((c, j) => ({ c, j })).filter(({ c, j }) => j > 0 && d.rows.every((r) => typeof r[j] === 'number') && !!c);
  const canChart = typeof d.rows[0]?.[0] === 'number' && numericY.length > 0;
  const [yCol, setYCol] = useState<number>(numericY.some(({ j }) => j === d.chartColumn) ? d.chartColumn! : numericY[numericY.length - 1]?.j ?? 1);
  const y = d.columns[yCol];

  const build = useMemo<BuildChart>(() => (t) => {
    const x0 = d.columns[0];
    const xs = d.rows.map((r) => val(x0, r[0]) as number);
    const ys = d.rows.map((r) => val(y, r[yCol]) as number);
    const hl = d.highlight;
    return {
      data: [
        {
          type: 'scatter', mode: 'lines+markers', x: xs, y: ys, name: y.label,
          line: { color: t.accent, width: 2 }, marker: { size: 8, color: t.accent },
          hovertemplate: `${x0.label} : %{x} ${unitOf(x0) ?? ''}<br>${y.label} : %{y} ${unitOf(y) ?? ''}<extra></extra>`,
        },
        ...(hl !== undefined && hl >= 0 ? [{
          type: 'scatter' as const, mode: 'markers' as const, x: [xs[hl]], y: [ys[hl]], name: 'Saisie actuelle',
          marker: { size: 13, color: t.accent, line: { color: t.surface, width: 2 } },
          hovertemplate: `Saisie actuelle<br>%{y} ${unitOf(y) ?? ''}<extra></extra>`,
        }] : []),
      ],
      layout: {
        showlegend: false,
        xaxis: { title: { text: `${x0.label}${unitOf(x0) ? ` (${unitOf(x0)})` : ''}` } },
        yaxis: { title: { text: `${y.label}${unitOf(y) ? ` (${unitOf(y)})` : ''}` }, rangemode: 'tozero' },
        margin: { l: 64, r: 16, t: 16, b: 52 },
      },
    };
  }, [d, y, yCol]);

  return (
    <section>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h3 className="eyebrow">{d.title}</h3>
        {canChart && (
          <div className="flex items-center gap-2">
            {view === 'chart' && numericY.length > 1 && (
              <select className="unit-select !min-h-8 !text-[12px]" value={yCol} onChange={(e) => setYCol(Number(e.target.value))} aria-label="Grandeur tracée">
                {numericY.map(({ c, j }) => <option key={j} value={j}>{c.label}</option>)}
              </select>
            )}
            <div role="radiogroup" aria-label="Affichage" className="flex overflow-hidden rounded-[3px] border border-rule-strong text-[12px]">
              {(['table', 'chart'] as const).map((v) => (
                <button key={v} type="button" role="radio" aria-checked={view === v} onClick={() => setView(v)}
                  className={`min-h-8 px-2.5 ${view === v ? 'bg-accent text-accent-ink' : 'bg-bg text-ink-2 hover:text-ink'}`}>
                  {v === 'table' ? 'Tableau' : 'Graphique'}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      {view === 'chart' && canChart ? (
        <PlotlyChart build={build} height={300} label={`${d.title} : ${y.label} en fonction de ${d.columns[0].label}`} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-rule-strong">
                {d.columns.map((c, j) => (
                  <th key={j} className={`py-1 pr-3 font-medium text-ink-2 ${j === 0 ? 'text-left' : 'text-right'}`}>
                    {c.label}{unitOf(c) ? <span className="num ml-1 text-[11px] font-normal text-ink-3">{unitOf(c)}</span> : null}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {d.rows.map((r, i) => (
                <tr key={i} className={`border-t ${i === d.highlight ? 'bg-accent-soft font-medium' : ''}`}>
                  {r.map((v, j) => {
                    const c = d.columns[j];
                    const x = c ? val(c, v) : v;
                    return <td key={j} className={`num py-1 pr-3 ${j === 0 ? 'text-left' : 'text-right'}`}>{typeof x === 'number' ? fmtNum(x) : x}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {d.note && <p className="mt-1 text-[12px] text-ink-3">{d.note}</p>}
    </section>
  );
}
