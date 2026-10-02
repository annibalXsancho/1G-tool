'use client';
import { changeRowUnit, changeUnit, fieldUnits, defaultUnit, getRows, newRow, rowUnits, setRows, unitKey, type Raw } from '@/core/form';
import type { ChoiceField, InputField, NumberField, RowColumn, RowsField } from '@/core/types';
import { IconClose } from './icons';

type Props = { field: InputField; raw: Raw; error?: string; onChange: (raw: Raw) => void };

function UnitPicker({ units, value, onChange, label }: { units: string[]; value: string; onChange: (u: string) => void; label: string }) {
  if (units.length <= 1) return <span className="num flex min-h-11 min-w-14 items-center justify-center px-2 text-[13px] text-ink-2">{units[0]}</span>;
  return (
    <select className="unit-select" value={value} onChange={(e) => onChange(e.target.value)} aria-label={`Unité de ${label}`}>
      {units.map((u) => <option key={u} value={u}>{u}</option>)}
    </select>
  );
}

function Segmented({ f, value, onPick, id }: { f: Pick<ChoiceField, 'options' | 'label'>; value: string; onPick: (v: string) => void; id?: string }) {
  if (f.options.length > 4) {
    return (
      <select id={id} className="field-input" style={{ fontFamily: 'var(--font-sans)' }} value={value} onChange={(e) => onPick(e.target.value)}>
        {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    );
  }
  return (
    <div role="radiogroup" aria-label={f.label} className="flex flex-wrap gap-px overflow-hidden rounded-[3px] border border-rule-strong bg-rule-strong">
      {f.options.map((o) => (
        <button
          key={o.value} type="button" role="radio" aria-checked={o.value === value} onClick={() => onPick(o.value)}
          className={`min-h-11 flex-1 whitespace-nowrap px-3 text-[13px] transition-colors ${o.value === value ? 'bg-accent text-accent-ink font-medium' : 'bg-bg text-ink-2 hover:text-ink'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function NumberInput({ f, raw, error, onChange }: { f: NumberField; raw: Raw; error?: string; onChange: (r: Raw) => void }) {
  const units = fieldUnits(f);
  const unit = raw[unitKey(f.key)] && units.includes(raw[unitKey(f.key)]) ? raw[unitKey(f.key)] : defaultUnit(f);
  const id = `f-${f.key}`;
  return (
    <div className="flex gap-1">
      <input
        id={id} className="field-input" type="text" inputMode="decimal" autoComplete="off" spellCheck={false}
        value={raw[f.key] ?? ''} aria-invalid={!!error} aria-describedby={error ? `${id}-err` : undefined}
        onChange={(e) => onChange({ ...raw, [f.key]: e.target.value })}
      />
      <UnitPicker units={units} value={unit} label={f.label} onChange={(u) => onChange(changeUnit(f, raw, u))} />
    </div>
  );
}

function RowsInput({ f, raw, onChange }: { f: RowsField; raw: Raw; onChange: (r: Raw) => void }) {
  const rows = getRows(f, raw);
  const units = rowUnits(f, raw);
  const setCell = (i: number, j: number, v: string) => onChange(setRows(f, raw, rows.map((r, k) => (k === i ? r.map((c, l) => (l === j ? v : c)) : r))));
  const colUnit = (c: RowColumn, j: number) => (c.type === 'number' ? (units[j] && fieldUnits(c).includes(units[j]) ? units[j] : defaultUnit(c)) : '');
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[320px] border-collapse text-[13px]">
        <thead>
          <tr className="text-left">
            {f.columns.map((c, j) => (
              <th key={c.key} className="pb-1 pr-1 align-bottom font-medium text-ink-2">
                <span className="block text-[12px]">{c.label}</span>
                {c.type === 'number' && fieldUnits(c).length > 1 ? (
                  <select className="unit-select !min-h-7 !text-[12px]" value={colUnit(c, j)} aria-label={`Unité de ${c.label}`} onChange={(e) => onChange(changeRowUnit(f, raw, j, e.target.value))}>
                    {fieldUnits(c).map((u) => <option key={u}>{u}</option>)}
                  </select>
                ) : c.type === 'number' ? <span className="num text-[12px] text-ink-3">{colUnit(c, j)}</span> : null}
              </th>
            ))}
            <th className="w-10" />
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, i) => (
            <tr key={i}>
              {f.columns.map((c, j) => (
                <td key={c.key} className="pb-1 pr-1">
                  {c.type === 'number' ? (
                    <input className="field-input" inputMode="decimal" autoComplete="off" value={cells[j] ?? ''} aria-label={`${c.label}, ligne ${i + 1}`} onChange={(e) => setCell(i, j, e.target.value)} />
                  ) : (
                    <select className="field-input" style={{ fontFamily: 'var(--font-sans)' }} value={cells[j] ?? ''} aria-label={`${c.label}, ligne ${i + 1}`} onChange={(e) => setCell(i, j, e.target.value)}>
                      {c.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  )}
                </td>
              ))}
              <td className="pb-1">
                <button type="button" className="btn !min-h-11 !px-2" aria-label={`Supprimer la ligne ${i + 1}`} onClick={() => onChange(setRows(f, raw, rows.filter((_, k) => k !== i)))}><IconClose /></button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" className="btn mt-1" disabled={f.maxRows !== undefined && rows.length >= f.maxRows} onClick={() => onChange(setRows(f, raw, [...rows, newRow(f)]))}>
        + {f.rowLabel ?? 'Ajouter une ligne'}
      </button>
    </div>
  );
}

export default function FieldRenderer({ field, raw, error, onChange }: Props) {
  const id = `f-${field.key}`;
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-[13px] font-medium">{field.label}</label>
      {field.type === 'number' && <NumberInput f={field} raw={raw} error={error} onChange={onChange} />}
      {field.type === 'choice' && <Segmented id={id} f={field} value={raw[field.key] ?? field.default} onPick={(v) => onChange({ ...raw, [field.key]: v })} />}
      {field.type === 'rows' && <RowsInput f={field} raw={raw} onChange={onChange} />}
      {field.help && <p className="mt-1 text-[12px] text-ink-3">{field.help}</p>}
      {error && <p id={`${id}-err`} role="alert" className="mt-1 text-[12px] font-medium text-err">{error}</p>}
    </div>
  );
}
