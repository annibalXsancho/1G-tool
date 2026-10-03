'use client';
import { fmtNum } from '@/core/fmt';
import { DIMENSIONS, fromSI } from '@/core/units';
import type { Display, TableDisplay } from '@/core/types';

export default function TableView({ display }: { display: Display }) {
  const d = display as TableDisplay;
  const unitOf = (c: TableDisplay['columns'][number]) => (c.dimension ? c.unit ?? DIMENSIONS[c.dimension].display : c.unit);
  return (
    <section>
      <h3 className="eyebrow mb-1">{d.title}</h3>
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
                  const txt = typeof v === 'number' ? fmtNum(c?.dimension ? fromSI(v, c.dimension, unitOf(c)!) : v) : v;
                  return <td key={j} className={`num py-1 pr-3 ${j === 0 ? 'text-left' : 'text-right'}`}>{txt}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {d.note && <p className="mt-1 text-[12px] text-ink-3">{d.note}</p>}
    </section>
  );
}
