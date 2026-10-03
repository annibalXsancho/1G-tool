'use client';
// Briques d'interface partagées par les pages à sections (monitoring) : section numérotée, tuile d'indicateur, liste de contrôles.
import type { ReactNode } from 'react';
import { IconAlert, IconInfo, IconWarn } from './icons';

export function Section({ n, title, children, right }: { n?: number; title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="border bg-surface">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2">
        <h2 className="flex items-baseline gap-2">{n !== undefined && <span className="num text-[13px] font-semibold text-accent">{n}</span>}<span className="eyebrow">{title}</span></h2>
        {right}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Stat({ label, value, unit, hint, strong, tone }: { label: string; value: string; unit?: string; hint?: ReactNode; strong?: boolean; tone?: 'good' | 'bad' }) {
  return (
    <div className={`border bg-bg p-3 ${strong ? 'border-accent' : ''}`}>
      <p className="eyebrow">{label}</p>
      <p className="num mt-0.5 text-[22px] font-semibold leading-tight">{value}{unit ? <span className="ml-1 text-[13px] font-normal text-ink-3">{unit}</span> : null}</p>
      {hint && <p className={`mt-0.5 text-[12px] ${tone === 'good' ? 'text-accent' : tone === 'bad' ? 'text-err' : 'text-ink-2'}`}>{hint}</p>}
    </div>
  );
}

export type Item = { id: string; label?: string; level: 'ok' | 'warn' | 'ko' | 'info'; detail: string };
export function CheckList({ items }: { items: Item[] }) {
  const order = { ko: 0, warn: 1, info: 2, ok: 3 };
  return (
    <ul className="space-y-1.5">
      {[...items].sort((a, b) => order[a.level] - order[b.level]).map((c) => (
        <li key={c.id} className={`flex gap-2 p-2 text-[13px] ${c.level === 'ko' ? 'border-l-4 border-err bg-err-soft' : c.level === 'warn' ? 'border-l-4 border-warn bg-warn-soft' : c.level === 'ok' ? 'border-l-4 border-accent bg-accent-soft' : 'border-l-4 border-rule-strong'}`}>
          <span className={`mt-0.5 shrink-0 ${c.level === 'ko' ? 'text-err' : c.level === 'warn' ? 'text-warn' : c.level === 'ok' ? 'text-accent' : 'text-ink-3'}`}>
            {c.level === 'ko' ? <IconAlert /> : c.level === 'warn' ? <IconWarn /> : c.level === 'info' ? <IconInfo /> : <span className="inline-block w-4 text-center font-bold">✓</span>}
          </span>
          <span>{c.label && <span className="font-medium">{c.label}</span>}<span className={c.label ? 'block text-ink-2' : ''}>{c.detail}</span></span>
        </li>
      ))}
    </ul>
  );
}

export function Tabs<T extends string>({ value, onChange, tabs, label }: { value: T; onChange: (v: T) => void; tabs: { id: T; label: string }[]; label: string }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <button key={t.id} type="button" role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)}
          className={`min-h-9 border px-3 text-[13px] ${value === t.id ? 'border-accent bg-accent-soft font-medium' : 'border-rule-strong bg-bg text-ink-2 hover:text-ink'}`}>{t.label}</button>
      ))}
    </div>
  );
}
