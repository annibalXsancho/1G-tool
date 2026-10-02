'use client';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { byId } from '@/engines/registry';
import { CATEGORIES } from '@/core/categories';
import { isVisible, parseInputs, type Raw } from '@/core/form';
import { rawToSearch, searchToRaw } from '@/core/url-state';
import { fmtNum } from '@/core/fmt';
import { DIMENSIONS, fromSI } from '@/core/units';
import type { AnyCalculator, FieldError, ResultOk } from '@/core/types';
import { describeInputs } from '@/lib/describe';
import { recordHistory, useFavorites } from '@/lib/storage';
import FieldRenderer from './FieldRenderer';
import ResultPanel, { CalcError, InputErrors, WarningList } from './ResultPanel';
import FormulaBlock from './FormulaBlock';
import PrintSheet from './PrintSheet';
import { IconLink, IconPrint, IconStar } from './icons';

type Outcome =
  | { kind: 'input-errors'; errors: FieldError[] }
  | { kind: 'calc-error'; errors: FieldError[] }
  | { kind: 'ok'; result: ResultOk<unknown> };

function evaluate(calc: AnyCalculator, raw: Raw): Outcome {
  const parsed = parseInputs(calc.inputs, raw);
  if (!parsed.ok) return { kind: 'input-errors', errors: parsed.errors };
  try {
    const r = calc.compute(parsed.input);
    return r.ok ? { kind: 'ok', result: r } : { kind: 'calc-error', errors: r.errors };
  } catch (e) {
    return { kind: 'calc-error', errors: [{ message: `Erreur inattendue du moteur : ${e instanceof Error ? e.message : String(e)}` }] };
  }
}

function Inner({ calc }: { calc: AnyCalculator }) {
  const sp = useSearchParams();
  const [raw, setRaw] = useState<Raw>(() => searchToRaw(calc.inputs, new URLSearchParams(sp.toString())));
  const [favs, toggleFav] = useFavorites();
  const [copied, setCopied] = useState(false);
  const [date, setDate] = useState('');
  const sid = useRef(`${Date.now()}`);
  const touched = useRef(false);

  useEffect(() => setDate(new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })), []);

  const outcome = useMemo(() => evaluate(calc, raw), [calc, raw]);
  const search = rawToSearch(calc.inputs, raw);

  // État dans l'URL (remplacement, sans empiler l'historique du navigateur).
  useEffect(() => {
    const url = `${window.location.pathname}${search ? `?${search}` : ''}`;
    window.history.replaceState(window.history.state, '', url);
  }, [search]);

  // Historique récent : après saisie utilisateur seulement, avec un léger délai.
  useEffect(() => {
    if (!touched.current || outcome.kind !== 'ok') return;
    const q = outcome.result.main[0];
    const t = setTimeout(() => {
      const u = q.unit ?? DIMENSIONS[q.dimension].display;
      recordHistory({ sid: sid.current, id: calc.id, title: calc.title, search, ts: Date.now(), summary: `${fmtNum(fromSI(q.value, q.dimension, u))} ${u}` });
    }, 1200);
    return () => clearTimeout(t);
  }, [outcome, search, calc]);

  const errByKey = useMemo(() => {
    const m: Record<string, string> = {};
    if (outcome.kind === 'input-errors') for (const e of outcome.errors) if (e.key && !m[e.key]) m[e.key] = e.message;
    return m;
  }, [outcome]);

  const lines = useMemo(() => describeInputs(calc.inputs, raw), [calc, raw]);
  const cat = CATEGORIES.find((c) => c.id === calc.category);
  const fav = favs.includes(calc.id);
  const result = outcome.kind === 'ok' ? outcome.result : null;

  return (
    <>
      <div className="screen-only">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <Link href={`/outils/${calc.category}/`} className="eyebrow hover:text-ink">{cat?.label}</Link>
            <h1 className="text-[22px] font-semibold leading-tight tracking-tight sm:text-[26px]">{calc.title}</h1>
            <p className="mt-0.5 max-w-prose text-[13px] text-ink-2">{calc.summary}</p>
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn" aria-pressed={fav} onClick={() => toggleFav(calc.id)} title="Favori"><IconStar filled={fav} /> Favori</button>
            <button
              type="button" className="btn"
              onClick={() => navigator.clipboard?.writeText(window.location.href).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })}
            ><IconLink /> {copied ? 'Lien copié' : 'Copier le lien'}</button>
            <button type="button" className="btn" onClick={() => window.print()}><IconPrint /> Note A4</button>
          </div>
        </div>

        <div className="grid items-start border bg-surface lg:grid-cols-[minmax(320px,400px)_1fr]">
          <section aria-label="Saisie" className="space-y-4 border-b p-4 lg:border-b-0 lg:border-r">
            <h2 className="eyebrow">Saisie</h2>
            {calc.inputs.filter((f) => isVisible(f, raw)).map((f) => (
              <FieldRenderer key={f.key} field={f} raw={raw} error={errByKey[f.key]} onChange={(r) => { touched.current = true; setRaw(r); }} />
            ))}
          </section>
          <section aria-label="Résultat" className="min-w-0 p-4">
            <h2 className="eyebrow mb-3">Résultat</h2>
            {outcome.kind === 'input-errors' && <InputErrors errors={outcome.errors} />}
            {outcome.kind === 'calc-error' && <CalcError errors={outcome.errors} />}
            {outcome.kind === 'ok' && <ResultPanel result={outcome.result} />}
          </section>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {result && (
            <section className="border bg-surface p-4 lg:col-span-2">
              <h2 className="eyebrow mb-2">Formules et application numérique</h2>
              <div className="grid gap-x-8 md:grid-cols-2">
                {result.formulas.map((f, i) => (
                  <div key={i} className="border-t py-2">
                    <p className="text-[12px] text-ink-3">{f.label}</p>
                    <FormulaBlock latex={f.symbolic} />
                    <FormulaBlock latex={f.substituted} />
                  </div>
                ))}
              </div>
            </section>
          )}
          <section className="border bg-surface p-4">
            <h2 className="eyebrow mb-2">Hypothèses</h2>
            <ul className="list-disc space-y-1 pl-4 text-[13px] text-ink-2">{calc.assumptions.map((a, i) => <li key={i}>{a}</li>)}</ul>
          </section>
          <section className="border bg-surface p-4">
            <h2 className="eyebrow mb-2">Domaine de validité</h2>
            <ul className="list-disc space-y-1 pl-4 text-[13px] text-ink-2">{calc.validity.map((a, i) => <li key={i}>{a}</li>)}</ul>
            <h2 className="eyebrow mb-2 mt-4">Références</h2>
            <ul className="space-y-1 text-[13px] text-ink-2">
              {calc.references.map((r, i) => (
                <li key={i}>{r.source}{r.section ? <span className="text-ink-3"> · {r.section}</span> : null}{r.note ? <span className="text-warn"> · {r.note}</span> : null}</li>
              ))}
            </ul>
          </section>
        </div>
        <p className="mt-4 text-[12px] text-ink-3">Aide au dimensionnement : le résultat relève de la responsabilité de l’ingénieur.</p>
      </div>
      <PrintSheet calc={calc} lines={lines} result={result} date={date} />
    </>
  );
}

export default function CalculatorView({ id }: { id: string }) {
  const calc = byId(id);
  if (!calc) return <p>Outil introuvable.</p>;
  return (
    <Suspense fallback={<div className="h-64 animate-pulse bg-sunken" aria-busy="true" />}>
      <Inner calc={calc} />
    </Suspense>
  );
}
