'use client';
import Link from 'next/link';
import { byId } from '@/engines/registry';
import type { AnyCalculator, Formula, ResultOk } from '@/core/types';
import FormulaBlock from './FormulaBlock';

export function FormulaStep({ f, n }: { f: Formula; n: number }) {
  return (
    <li className="border-t py-3 first:border-t-0">
      <p className="mb-1 flex items-baseline gap-2 text-[13px] font-medium">
        <span className="num inline-flex h-5 min-w-5 items-center justify-center bg-ink px-1 text-[11px] text-bg">{n}</span>
        {f.label}
      </p>
      <div className="grid gap-x-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div>
          <p className="text-[11px] text-ink-3">Formule</p>
          <FormulaBlock latex={f.symbolic} />
        </div>
        <div>
          <p className="text-[11px] text-ink-3">Application numérique</p>
          <FormulaBlock latex={f.substituted} />
        </div>
      </div>
      {f.legend && f.legend.length > 0 && (
        <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[12px] text-ink-2 sm:grid-cols-[auto_1fr_auto_1fr]">
          {f.legend.map((l, i) => (
            <div key={i} className="contents">
              <dt className="text-ink"><FormulaBlock latex={l.symbol} display={false} /></dt>
              <dd>{l.meaning}{l.unit ? <span className="num text-ink-3"> [{l.unit}]</span> : null}</dd>
            </div>
          ))}
        </dl>
      )}
      {f.note && <p className="mt-1 text-[12px] italic text-ink-2">{f.note}</p>}
    </li>
  );
}

export default function Justification({ calc, result }: { calc: AnyCalculator; result: ResultOk<unknown> | null }) {
  const related = (calc.related ?? []).map((id) => byId(id)).filter((c) => !!c);
  return (
    <div className="mt-4 space-y-4">
      <section className="border bg-surface">
        <header className="flex items-baseline gap-2 border-b px-4 py-2">
          <span className="num text-[13px] font-semibold text-accent">3</span>
          <h2 className="eyebrow">Justification · note de calcul</h2>
        </header>
        <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          {calc.method && calc.method.length > 0 && (
            <div className="border-b p-4 lg:border-b-0 lg:border-r">
              <h3 className="mb-2 text-[13px] font-semibold">Principe du calcul</h3>
              <div className="space-y-2 text-[13px] leading-relaxed text-ink-2">{calc.method.map((m, i) => <p key={i}>{m}</p>)}</div>
            </div>
          )}
          <div className={`p-4 ${calc.method?.length ? '' : 'lg:col-span-2'}`}>
            <h3 className="mb-1 text-[13px] font-semibold">Étapes du calcul</h3>
            {result ? (
              <>
                <ol>{result.formulas.map((f, i) => <FormulaStep key={i} f={f} n={i + 1} />)}</ol>
                {result.conclusion && <p className="mt-2 border-l-4 border-accent bg-accent-soft px-3 py-2 text-[13px] font-medium">{result.conclusion}</p>}
              </>
            ) : <p className="text-[13px] text-ink-3">Corrigez la saisie pour afficher le détail du calcul.</p>}
          </div>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="border bg-surface p-4">
          <h2 className="eyebrow mb-2">Hypothèses</h2>
          <ul className="list-disc space-y-1 pl-4 text-[13px] text-ink-2">{calc.assumptions.map((a, i) => <li key={i}>{a}</li>)}</ul>
        </section>
        <section className="border bg-surface p-4">
          <h2 className="eyebrow mb-2">Domaine de validité</h2>
          <ul className="list-disc space-y-1 pl-4 text-[13px] text-ink-2">{calc.validity.map((a, i) => <li key={i}>{a}</li>)}</ul>
          {calc.scope && (
            <>
              <h2 className="eyebrow mb-2 mt-4">Ce que ce calcul ne couvre pas</h2>
              <p className="text-[13px] text-ink-2">{calc.scope}</p>
            </>
          )}
          {related.length > 0 && (
            <ul className="mt-2 space-y-1 text-[13px]">
              {related.map((c) => <li key={c!.id}><Link className="text-accent underline-offset-2 hover:underline" href={`/outils/${c!.category}/${c!.id}/`}>→ {c!.title}</Link></li>)}
            </ul>
          )}
        </section>
        <section className="border bg-surface p-4">
          <h2 className="eyebrow mb-2">Références</h2>
          <ul className="space-y-2 text-[13px] text-ink-2">
            {calc.references.map((r, i) => (
              <li key={i}>{r.source}{r.section ? <span className="text-ink-3"> · {r.section}</span> : null}{r.note ? <span className="block text-warn">{r.note}</span> : null}</li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
