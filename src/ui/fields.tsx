'use client';
// Champs de formulaire à brouillon local : la valeur n'est appliquée que lorsqu'elle est valide.
import { useEffect, useState } from 'react';
import { parseNumber } from '@/core/form';

export const fieldCls = 'h-9 w-full border border-rule bg-bg px-2 text-[13px] focus:border-accent focus:outline-none';

export function TextField({ label, value, onCommit, placeholder, list, hint }: { label: string; value: string; onCommit: (s: string) => void; placeholder?: string; list?: string; hint?: string }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <label className="block text-[12px] text-ink-2">{label}
      <input className={`${fieldCls} mt-0.5`} list={list} placeholder={placeholder} value={draft} onChange={(e) => setDraft(e.target.value)}
        onBlur={() => draft.trim() !== value && onCommit(draft.trim())} onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()} />
      {hint && <span className="mt-0.5 block text-[11px] text-ink-3">{hint}</span>}
    </label>
  );
}

export function NumField({ label, value, onCommit, unit, list, min = 0, max, hint, placeholder = '—' }: {
  label: string; value: number | undefined; onCommit: (v: number | undefined) => void; unit?: string; list?: string; min?: number; max?: number; hint?: string; placeholder?: string;
}) {
  const txt = value === undefined ? '' : String(value).replace('.', ',');
  const [draft, setDraft] = useState(txt);
  const [focus, setFocus] = useState(false);
  useEffect(() => { if (!focus) setDraft(txt); }, [txt, focus]);
  const v = parseNumber(draft);
  const bad = draft.trim() !== '' && !(Number.isFinite(v) && v >= min && (max === undefined || v <= max));
  return (
    <label className="block text-[12px] text-ink-2">{label}{unit ? <span className="num text-ink-3"> ({unit})</span> : null}
      <input inputMode="decimal" autoComplete="off" list={list} placeholder={placeholder} aria-invalid={bad}
        className={`${fieldCls} num mt-0.5 text-right ${bad ? '!border-err' : ''}`} value={draft}
        onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
        onChange={(e) => {
          setDraft(e.target.value);
          if (e.target.value.trim() === '') onCommit(undefined);
          else { const x = parseNumber(e.target.value); if (Number.isFinite(x) && x >= min && (max === undefined || x <= max)) onCommit(x); }
        }} />
      {hint && <span className="mt-0.5 block text-[11px] text-ink-3">{hint}</span>}
    </label>
  );
}

export function SelectField<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <label className="block text-[12px] text-ink-2">{label}
      <select className={`${fieldCls} mt-0.5`} value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}
