'use client';
import { useState } from 'react';
import { fmtNum } from '@/core/fmt';
import { DIMENSIONS, fromSI, unitsOf } from '@/core/units';
import type { FieldError, Quantity, ResultOk, Warning } from '@/core/types';
import { IconAlert, IconInfo, IconWarn } from './icons';
import { displays } from './displays';

function useUnitChoice() {
  const [m, setM] = useState<Record<string, string>>({});
  const unitOf = (q: Quantity) => m[q.key] ?? q.unit ?? DIMENSIONS[q.dimension].display;
  return { unitOf, set: (key: string, u: string) => setM((c) => ({ ...c, [key]: u })) };
}

function UnitSelect({ q, unit, onPick }: { q: Quantity; unit: string; onPick: (u: string) => void }) {
  const units = unitsOf(q.dimension);
  if (units.length <= 1) return <span className="num text-ink-2">{unit}</span>;
  return (
    <select className="num cursor-pointer border-0 bg-transparent py-0 pr-1 text-ink-2 hover:text-ink" value={unit} onChange={(e) => onPick(e.target.value)} aria-label={`Unité de ${q.label}`}>
      {units.map((u) => <option key={u}>{u}</option>)}
    </select>
  );
}

export function WarningList({ warnings }: { warnings: Warning[] }) {
  if (warnings.length === 0) return null;
  const sorted = [...warnings].sort((a, b) => (a.level === b.level ? 0 : a.level === 'validity' ? -1 : 1));
  return (
    <ul className="space-y-2">
      {sorted.map((w, i) =>
        w.level === 'validity' ? (
          <li key={i} className="flex gap-2 border-l-4 border-warn bg-warn-soft p-3 text-[13px]" role="alert">
            <span className="mt-0.5 text-warn"><IconWarn /></span>
            <span><strong className="block text-[11px] font-semibold uppercase tracking-wider text-warn">Hors domaine de validité</strong>{w.message}</span>
          </li>
        ) : (
          <li key={i} className="flex gap-2 p-1 text-[13px] text-ink-2">
            <span className="mt-0.5 text-ink-3"><IconInfo /></span><span>{w.message}</span>
          </li>
        ),
      )}
    </ul>
  );
}

export function InputErrors({ errors }: { errors: FieldError[] }) {
  return (
    <div className="border-l-4 border-err bg-err-soft p-4 text-[13px]" role="alert">
      <strong className="mb-1 flex items-center gap-2 text-err"><IconAlert /> Saisie à corriger</strong>
      <ul className="list-disc pl-5 text-ink">{errors.map((e, i) => <li key={i}>{e.message}</li>)}</ul>
    </div>
  );
}

export function CalcError({ errors }: { errors: FieldError[] }) {
  return (
    <div className="border-l-4 border-err bg-err-soft p-4 text-[13px]" role="alert">
      <strong className="mb-1 flex items-center gap-2 text-err"><IconAlert /> Calcul impossible</strong>
      <ul className="list-disc pl-5 text-ink">{errors.map((e, i) => <li key={i}>{e.message}</li>)}</ul>
    </div>
  );
}

export default function ResultPanel({ result }: { result: ResultOk<unknown> }) {
  const { unitOf, set } = useUnitChoice();
  const Custom = result.display ? displays[result.display.type] : undefined;
  return (
    <div className="space-y-4" aria-live="polite">
      <WarningList warnings={result.warnings} />
      {result.main.length > 0 && (() => {
        const [first, ...rest] = result.main;
        const u = unitOf(first);
        return (
          <div className="border-y-2 border-accent py-3">
            <div className="eyebrow !text-accent">{first.label}</div>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-3">
              <span className="num text-[44px] font-medium leading-none tracking-tight sm:text-[56px]" data-testid={`main-${first.key}`}>{fmtNum(fromSI(first.value, first.dimension, u))}</span>
              <span className="text-[20px]"><UnitSelect q={first} unit={u} onPick={(x) => set(first.key, x)} /></span>
            </div>
            {rest.length > 0 && (
              <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t pt-2 sm:grid-cols-3">
                {rest.map((q) => {
                  const uq = unitOf(q);
                  return (
                    <div key={q.key}>
                      <div className="text-[12px] text-ink-2">{q.label}</div>
                      <div className="flex items-baseline gap-1.5">
                        <span className="num text-[22px] font-medium leading-tight" data-testid={`main-${q.key}`}>{fmtNum(fromSI(q.value, q.dimension, uq))}</span>
                        <span className="text-[13px]"><UnitSelect q={q} unit={uq} onPick={(x) => set(q.key, x)} /></span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}
      {result.conclusion && <p className="border-l-4 border-accent bg-accent-soft px-3 py-2 text-[13px]">{result.conclusion}</p>}
      {result.intermediates.length > 0 && (
        <section>
          <h3 className="eyebrow mb-1">Grandeurs intermédiaires</h3>
          <table className="w-full border-collapse text-[13px]">
            <tbody>
              {result.intermediates.map((q) => {
                const u = unitOf(q);
                return (
                  <tr key={q.key} className="border-t">
                    <th scope="row" className="py-1.5 pr-3 text-left font-normal text-ink-2">{q.label}</th>
                    <td className="num py-1.5 text-right">{fmtNum(fromSI(q.value, q.dimension, u))}</td>
                    <td className="py-1.5 pl-2 text-left text-[12px]"><UnitSelect q={q} unit={u} onPick={(x) => set(q.key, x)} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
      {Custom && result.display && <Custom display={result.display} />}
    </div>
  );
}
