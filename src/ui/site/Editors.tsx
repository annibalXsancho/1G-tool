'use client';
// Édition du modèle de site dans l'outil : tableau des flux et tableau des postes. Chaque modification passe par
// les fonctions pures de src/site/edit.ts et reste annulable.
import { useEffect, useRef, useState } from 'react';
import { parseNumber } from '@/core/form';
import { fromSI, toSI } from '@/core/units';
import { addFlow, addNode, flowsOfNode, removeFlow, removeNode, updateFlow, updateNode } from '@/site/edit';
import { KIND_LABEL, STATUS_LABEL, type FlowStatus, type NodeKind, type SiteModel } from '@/site/model';
import { IconClose } from '../icons';
import { carrierColors } from './carriers';

type Edit = (fn: (m: SiteModel) => SiteModel, groupKey?: string) => void;

const toMWh = (j: number) => String(Number(fromSI(j, 'energy', 'MWh').toPrecision(10))).replace('.', ',');
const cell = 'h-9 w-full border border-rule bg-bg px-2 text-[13px] focus:border-accent focus:outline-none';

/** Champ numérique en MWh : brouillon local pendant la saisie, appliqué dès qu'il est valide. */
function MWhInput({ value, onCommit, inputRef, label }: { value: number; onCommit: (j: number) => void; inputRef?: React.Ref<HTMLInputElement>; label: string }) {
  const [draft, setDraft] = useState(toMWh(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused) setDraft(toMWh(value)); }, [value, focused]);
  const v = parseNumber(draft);
  const invalid = !(Number.isFinite(v) && v >= 0);
  return (
    <input
      ref={inputRef} aria-label={label} inputMode="decimal" autoComplete="off"
      className={`${cell} num text-right ${invalid ? '!border-err' : ''}`}
      value={draft}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onChange={(e) => {
        setDraft(e.target.value);
        const x = parseNumber(e.target.value);
        if (Number.isFinite(x) && x >= 0) onCommit(toSI(x, 'energy', 'MWh'));
      }}
    />
  );
}

/** Champ texte appliqué à la sortie du champ ou sur Entrée (évite de créer une énergie à chaque frappe). */
function TextInput({ value, onCommit, label, list, placeholder }: { value: string; onCommit: (s: string) => void; label: string; list?: string; placeholder?: string }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => { if (draft.trim() !== value) onCommit(draft.trim()); };
  return (
    <input aria-label={label} list={list} placeholder={placeholder} className={cell} value={draft}
      onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()} />
  );
}

export function FlowEditor({ model, edit, selected, onSelect }: { model: SiteModel; edit: Edit; selected: number | null; onSelect: (i: number | null) => void }) {
  const carriers = [...new Set(model.flows.map((f) => f.carrier))];
  const colors = carrierColors(carriers);
  const selRef = useRef<HTMLInputElement>(null);
  const rowRef = useRef<HTMLTableRowElement>(null);

  useEffect(() => {
    if (selected === null) return;
    rowRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    selRef.current?.focus({ preventScroll: true });
    selRef.current?.select();
  }, [selected]);

  const nodeOptions = model.nodes.map((n) => <option key={n.id} value={n.id}>{n.label}</option>);

  return (
    <div>
      <datalist id="carriers-list">{carriers.map((c) => <option key={c} value={c} />)}</datalist>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-rule-strong text-left text-ink-2">
              <th className="py-1.5 pr-1 font-medium">De</th>
              <th className="py-1.5 pr-1 font-medium">Vers</th>
              <th className="py-1.5 pr-1 font-medium">Énergie</th>
              <th className="w-28 py-1.5 pr-1 text-right font-medium">MWh/an</th>
              <th className="w-28 py-1.5 pr-1 font-medium">Statut</th>
              <th className="w-28 py-1.5 pr-1 font-medium">Compteur</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {model.flows.map((f, i) => {
              const sel = i === selected;
              return (
                <tr key={i} ref={sel ? rowRef : undefined} className={`border-t ${sel ? 'bg-accent-soft' : ''}`} onFocus={() => onSelect(i)}>
                  <td className="py-1 pr-1">
                    <select aria-label={`Origine du flux ${i + 1}`} className={cell} value={f.from} onChange={(e) => edit((m) => updateFlow(m, i, { from: e.target.value }))}>{nodeOptions}</select>
                  </td>
                  <td className="py-1 pr-1">
                    <select aria-label={`Destination du flux ${i + 1}`} className={cell} value={f.to} onChange={(e) => edit((m) => updateFlow(m, i, { to: e.target.value }))}>{nodeOptions}</select>
                  </td>
                  <td className="py-1 pr-1">
                    <div className="flex items-center gap-1.5">
                      <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-[2px]" style={{ background: `var(${colors.get(f.carrier)})` }} />
                      <TextInput label={`Énergie du flux ${i + 1}`} list="carriers-list" value={f.carrier} onCommit={(s) => s && edit((m) => updateFlow(m, i, { carrier: s }))} />
                    </div>
                  </td>
                  <td className="py-1 pr-1">
                    <MWhInput label={`Quantité du flux ${i + 1} en MWh par an`} inputRef={sel ? selRef : undefined} value={f.value} onCommit={(j) => edit((m) => updateFlow(m, i, { value: j }), `flow-${i}-value`)} />
                  </td>
                  <td className="py-1 pr-1">
                    <select aria-label={`Statut du flux ${i + 1}`} className={cell} value={f.status} onChange={(e) => edit((m) => updateFlow(m, i, { status: e.target.value as FlowStatus }))}>
                      {(Object.keys(STATUS_LABEL) as FlowStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                    </select>
                  </td>
                  <td className="py-1 pr-1">
                    <TextInput label={`Compteur du flux ${i + 1}`} value={f.meter ?? ''} placeholder="—" onCommit={(s) => edit((m) => updateFlow(m, i, { meter: s || undefined }))} />
                  </td>
                  <td className="py-1">
                    <button type="button" className="btn !min-h-9 !px-2" aria-label={`Supprimer le flux ${i + 1}`} onClick={() => { onSelect(null); edit((m) => removeFlow(m, i)); }}><IconClose /></button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <button type="button" className="btn mt-2" disabled={model.nodes.length < 2} onClick={() => { edit((m) => addFlow(m)); onSelect(model.flows.length); }}>+ Ajouter un flux</button>
    </div>
  );
}

export function NodeEditor({ model, edit }: { model: SiteModel; edit: Edit }) {
  const [label, setLabel] = useState('');
  const [kind, setKind] = useState<NodeKind>('usage');
  const kinds = Object.keys(KIND_LABEL) as NodeKind[];
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-rule-strong text-left text-ink-2">
              <th className="w-32 py-1.5 pr-1 font-medium">Identifiant</th>
              <th className="py-1.5 pr-1 font-medium">Libellé</th>
              <th className="w-40 py-1.5 pr-1 font-medium">Type</th>
              <th className="w-40 py-1.5 pr-1 font-medium">Zone</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {model.nodes.map((n) => (
              <tr key={n.id} className="border-t">
                <td className="num py-1 pr-1 text-[12px] text-ink-2">{n.id}</td>
                <td className="py-1 pr-1"><TextInput label={`Libellé de ${n.id}`} value={n.label} onCommit={(s) => s && edit((m) => updateNode(m, n.id, { label: s }))} /></td>
                <td className="py-1 pr-1">
                  <select aria-label={`Type de ${n.label}`} className={cell} value={n.kind} onChange={(e) => edit((m) => updateNode(m, n.id, { kind: e.target.value as NodeKind }))}>
                    {kinds.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                  </select>
                </td>
                <td className="py-1 pr-1"><TextInput label={`Zone de ${n.label}`} value={n.zone ?? ''} placeholder="—" onCommit={(s) => edit((m) => updateNode(m, n.id, { zone: s || undefined }))} /></td>
                <td className="py-1">
                  <button type="button" className="btn !min-h-9 !px-2" aria-label={`Supprimer ${n.label}`}
                    onClick={() => {
                      const k = flowsOfNode(model, n.id);
                      if (k === 0 || confirm(`Supprimer « ${n.label} » et ses ${k} flux ?`)) edit((m) => removeNode(m, n.id));
                    }}><IconClose /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form className="mt-2 flex flex-wrap items-center gap-2" onSubmit={(e) => {
        e.preventDefault();
        if (!label.trim()) return;
        edit((m) => addNode(m, label.trim(), kind).model);
        setLabel('');
      }}>
        <input aria-label="Libellé du nouveau poste" placeholder="Nouveau poste…" className={`${cell} !w-64`} value={label} onChange={(e) => setLabel(e.target.value)} />
        <select aria-label="Type du nouveau poste" className={`${cell} !w-40`} value={kind} onChange={(e) => setKind(e.target.value as NodeKind)}>
          {kinds.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
        </select>
        <button type="submit" className="btn" disabled={!label.trim()}>+ Ajouter le poste</button>
      </form>
    </div>
  );
}
