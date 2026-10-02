import { fmtNum } from '@/core/fmt';
import { DIMENSIONS, fromSI } from '@/core/units';
import type { AnyCalculator, Quantity, ResultOk } from '@/core/types';
import type { InputLine } from '@/lib/describe';
import FormulaBlock from './FormulaBlock';

const qty = (q: Quantity) => {
  const u = q.unit ?? DIMENSIONS[q.dimension].display;
  return `${fmtNum(fromSI(q.value, q.dimension, u), 5)} ${u}`;
};

/** Note de calcul A4 : masquée à l'écran, seule visible à l'impression (voir globals.css). */
export default function PrintSheet({ calc, lines, result, date }: { calc: AnyCalculator; lines: InputLine[]; result: ResultOk<unknown> | null; date: string }) {
  const h2 = 'mt-5 mb-1 border-b border-black pb-0.5 text-[11pt] font-semibold uppercase tracking-wide';
  return (
    <article className="print-only text-[10pt] leading-snug" style={{ color: '#000', background: '#fff' }}>
      <header className="border-b-2 border-black pb-2">
        <p className="text-[9pt] uppercase tracking-widest">Note de calcul · {calc.category}</p>
        <h1 className="text-[18pt] font-semibold">{calc.title}</h1>
        <p className="text-[9pt]">Établie le {date}</p>
      </header>

      <h2 className={h2}>Paramètres saisis</h2>
      <table className="w-full border-collapse">
        <tbody>
          {lines.map((l, i) => (
            <tr key={i} className="border-b border-neutral-400 align-top">
              <th className="w-1/2 py-0.5 text-left font-normal">{l.label}</th>
              <td className="py-0.5">
                {l.table ? (
                  <table className="w-full border-collapse text-[9pt]">
                    <thead><tr>{l.table.head.map((h, j) => <th key={j} className="border-b border-black text-left font-medium">{h}</th>)}</tr></thead>
                    <tbody>{l.table.body.map((r, j) => <tr key={j}>{r.map((c, k) => <td key={k}>{c}</td>)}</tr>)}</tbody>
                  </table>
                ) : l.value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {result ? (
        <>
          <h2 className={h2}>Formules et application numérique</h2>
          {result.formulas.map((f, i) => (
            <div key={i} className="break-inside-avoid">
              <p className="mt-1 text-[9pt] italic">{f.label}</p>
              <FormulaBlock latex={f.symbolic} />
              <FormulaBlock latex={f.substituted} />
            </div>
          ))}
          <h2 className={h2}>Résultat</h2>
          {result.main.map((q) => <p key={q.key} className="text-[14pt] font-semibold">{q.label} : {qty(q)}</p>)}
          <h2 className={h2}>Grandeurs intermédiaires</h2>
          <table className="w-full border-collapse">
            <tbody>{result.intermediates.map((q) => <tr key={q.key} className="border-b border-neutral-400"><th className="py-0.5 text-left font-normal">{q.label}</th><td className="py-0.5 text-right">{qty(q)}</td></tr>)}</tbody>
          </table>
          {result.warnings.length > 0 && (
            <>
              <h2 className={h2}>Avertissements</h2>
              <ul className="list-disc pl-5">{result.warnings.map((w, i) => <li key={i}>{w.level === 'validity' ? '[Hors domaine de validité] ' : ''}{w.message}</li>)}</ul>
            </>
          )}
        </>
      ) : <p className="mt-4 font-semibold">Saisie incomplète ou invalide : pas de résultat.</p>}

      <h2 className={h2}>Hypothèses</h2>
      <ul className="list-disc pl-5">{calc.assumptions.map((a, i) => <li key={i}>{a}</li>)}</ul>
      <h2 className={h2}>Domaine de validité</h2>
      <ul className="list-disc pl-5">{calc.validity.map((a, i) => <li key={i}>{a}</li>)}</ul>
      <h2 className={h2}>Références</h2>
      <ul className="list-disc pl-5">{calc.references.map((r, i) => <li key={i}>{r.source}{r.section ? `, ${r.section}` : ''}{r.note ? ` (${r.note})` : ''}</li>)}</ul>

      <p className="mt-6 border border-black p-2 text-[9pt]">
        Ce résultat est une aide au dimensionnement. Il relève de la responsabilité de l’ingénieur qui l’utilise, qui doit en vérifier les hypothèses et le domaine de validité.
      </p>
    </article>
  );
}
