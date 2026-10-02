// Description lisible des entrées saisies (note de calcul).
import { getRows, isVisible, rowUnits, unitKey, type Raw } from '@/core/form';
import type { InputField } from '@/core/types';

export type InputLine = { label: string; value: string; table?: { head: string[]; body: string[][] } };

export function describeInputs(fields: InputField[], raw: Raw): InputLine[] {
  const out: InputLine[] = [];
  for (const f of fields) {
    if (!isVisible(f, raw)) continue;
    if (f.type === 'number') out.push({ label: f.label, value: `${raw[f.key]} ${raw[unitKey(f.key)] ?? ''}`.trim() });
    else if (f.type === 'choice') out.push({ label: f.label, value: f.options.find((o) => o.value === raw[f.key])?.label ?? raw[f.key] });
    else {
      const units = rowUnits(f, raw);
      out.push({
        label: f.label,
        value: '',
        table: {
          head: f.columns.map((c, j) => (units[j] ? `${c.label} (${units[j]})` : c.label)),
          body: getRows(f, raw).map((cells) => cells.map((v, j) => {
            const c = f.columns[j];
            return c.type === 'choice' ? c.options.find((o) => o.value === v)?.label ?? v : v;
          })),
        },
      });
    }
  }
  return out;
}
