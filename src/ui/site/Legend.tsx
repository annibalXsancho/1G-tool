'use client';
// Légende interactive du Sankey : un clic masque/affiche une énergie, un double-clic l'isole.
import { useRef } from 'react';
import { fmtNum } from '@/core/fmt';
import { fromSI } from '@/core/units';
import type { SiteAnalysis } from '@/site/analyse';
import { carrierColors } from './carriers';

export default function Legend({ analysis, hidden, onChange, unit }: { analysis: SiteAnalysis; hidden: string[]; onChange: (h: string[]) => void; unit: string }) {
  const carriers = [...new Set(analysis.links.map((l) => l.carrier))];
  const colors = carrierColors(carriers);
  const totals = new Map<string, number>();
  for (const l of analysis.links) totals.set(l.carrier, (totals.get(l.carrier) ?? 0) + l.value);
  // Un double-clic déclenche aussi deux clics : on retarde le clic simple pour les distinguer.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toggle = (c: string) => onChange(hidden.includes(c) ? hidden.filter((x) => x !== c) : [...hidden, c]);
  const isolate = (c: string) => {
    const others = carriers.filter((x) => x !== c);
    const alreadyIsolated = others.every((x) => hidden.includes(x)) && !hidden.includes(c);
    onChange(alreadyIsolated ? [] : others);
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filtrer par énergie">
      {carriers.map((c) => {
        const off = hidden.includes(c);
        return (
          <button
            key={c} type="button" aria-pressed={!off}
            title="Clic : masquer/afficher · double-clic : isoler"
            onClick={() => { if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => toggle(c), 220); }}
            onDoubleClick={() => { if (timer.current) clearTimeout(timer.current); isolate(c); }}
            className={`inline-flex min-h-9 select-none items-center gap-1.5 border px-2.5 text-[12px] transition-colors ${off ? 'border-rule text-ink-3 line-through' : 'border-rule-strong bg-bg text-ink hover:bg-sunken'}`}
          >
            <span className="inline-block h-3 w-3 rounded-[2px]" style={{ background: off ? 'transparent' : `var(${colors.get(c)})`, boxShadow: `inset 0 0 0 1.5px var(${colors.get(c)})` }} />
            {c}
            <span className="num text-ink-3 no-underline">{fmtNum(fromSI(totals.get(c) ?? 0, 'energy', unit), 3)}</span>
          </button>
        );
      })}
      {hidden.length > 0 && <button type="button" className="ml-1 text-[12px] text-accent underline-offset-2 hover:underline" onClick={() => onChange([])}>Tout afficher</button>}
    </div>
  );
}
