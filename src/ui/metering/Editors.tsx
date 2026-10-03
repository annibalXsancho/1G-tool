'use client';
// Tableaux d'édition d'un plan de comptage : informations (cartouche), postes et compteurs.
import { useEffect, useState } from 'react';
import { parseNumber } from '@/core/form';
import { addMeter, addNode, descendantsOf, removeMeter, removeNode, updateMeter, updateNode, updatePlan } from '@/metering/edit';
import {
  COMM_SUGGESTIONS, DEVICE_SUGGESTIONS, FLAG_LABEL, KIND_LABEL, KIND_ORDER, STATUS_LABEL,
  type MeterStatus, type NodeFlag, type NodeKind, type Plan, type Project,
} from '@/metering/model';
import { IconClose } from '../icons';

export type EditProject = (fn: (p: Project) => Project, groupKey?: string) => void;

const cell = 'h-9 w-full border border-rule bg-bg px-2 text-[13px] focus:border-accent focus:outline-none';

function TextInput({ value, onCommit, label, placeholder, list, className = '' }: { value: string; onCommit: (s: string) => void; label: string; placeholder?: string; list?: string; className?: string }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => { if (draft.trim() !== value) onCommit(draft.trim()); };
  return <input aria-label={label} list={list} placeholder={placeholder} className={`${cell} ${className}`} value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()} />;
}

function NumInput({ value, onCommit, label }: { value: number | undefined; onCommit: (v: number | undefined) => void; label: string }) {
  const txt = value === undefined ? '' : String(value).replace('.', ',');
  const [draft, setDraft] = useState(txt);
  const [focus, setFocus] = useState(false);
  useEffect(() => { if (!focus) setDraft(txt); }, [txt, focus]);
  const bad = draft.trim() !== '' && !(Number.isFinite(parseNumber(draft)) && parseNumber(draft) >= 0);
  return (
    <input aria-label={label} inputMode="decimal" autoComplete="off" placeholder="—" className={`${cell} num text-right ${bad ? '!border-err' : ''}`} value={draft}
      onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
      onChange={(e) => {
        setDraft(e.target.value);
        if (e.target.value.trim() === '') onCommit(undefined);
        else { const v = parseNumber(e.target.value); if (Number.isFinite(v) && v >= 0) onCommit(v); }
      }} />
  );
}

export function PlanInfoForm({ plan, edit }: { plan: Plan; edit: EditProject }) {
  const f = (k: 'name' | 'site' | 'carrier' | 'ratedUnit' | 'version' | 'author', label: string, hint?: string) => (
    <label className="block text-[12px] text-ink-2">{label}
      <TextInput className="mt-0.5" label={label} value={plan[k] ?? ''} placeholder={hint} onCommit={(s) => edit((p) => updatePlan(p, plan.id, { [k]: s || (k === 'name' ? plan.name : undefined) } as Partial<Plan>))} />
    </label>
  );
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {f('name', 'Nom du plan')}{f('site', 'Site')}{f('carrier', 'Énergie', 'Électricité, Gaz naturel, Vapeur…')}
      {f('ratedUnit', 'Unité de capacité', 'kVA, kW, m³/h…')}{f('version', 'Version', 'V1')}{f('author', 'Auteur')}
    </div>
  );
}

export function NodesTable({ plan, edit, selected, onSelect }: { plan: Plan; edit: EditProject; selected?: string; onSelect: (id: string) => void }) {
  const [label, setLabel] = useState('');
  const [kind, setKind] = useState<NodeKind>('usage');
  const [parent, setParent] = useState('');
  const opts = plan.nodes.map((n) => <option key={n.id} value={n.id}>{n.label}</option>);
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1080px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-rule-strong text-left text-ink-2">
              {['Identifiant', 'Libellé', 'Type', 'Poste amont', 'Secours', `Capacité (${plan.ratedUnit})`, 'MWh/an', 'Zone', 'Statut', ''].map((h, i) => <th key={i} className={`py-1.5 pr-1 font-medium ${i === 5 || i === 6 ? 'text-right' : ''}`}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {plan.nodes.map((n) => {
              const blocked = descendantsOf(plan, n.id);
              return (
                <tr key={n.id} className={`border-t ${selected === n.id ? 'bg-accent-soft' : ''}`} onFocus={() => onSelect(n.id)}>
                  <td className="num w-32 py-1 pr-1 text-[12px] text-ink-2">{n.id}</td>
                  <td className="min-w-52 py-1 pr-1"><TextInput label={`Libellé de ${n.id}`} value={n.label} onCommit={(s) => s && edit((p) => updateNode(p, plan.id, n.id, { label: s }))} /></td>
                  <td className="w-40 py-1 pr-1">
                    <select aria-label={`Type de ${n.label}`} className={cell} value={n.kind} onChange={(e) => edit((p) => updateNode(p, plan.id, n.id, { kind: e.target.value as NodeKind }))}>
                      {KIND_ORDER.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                    </select>
                  </td>
                  <td className="w-44 py-1 pr-1">
                    <select aria-label={`Poste amont de ${n.label}`} className={cell} value={n.parent ?? ''} onChange={(e) => edit((p) => updateNode(p, plan.id, n.id, { parent: e.target.value || undefined }))}>
                      <option value="">— (aucun)</option>
                      {plan.nodes.filter((x) => !blocked.has(x.id)).map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                    </select>
                  </td>
                  <td className="w-40 py-1 pr-1">
                    <select aria-label={`Secours de ${n.label}`} className={cell} value={n.backup ?? ''} onChange={(e) => edit((p) => updateNode(p, plan.id, n.id, { backup: e.target.value || undefined }))}>
                      <option value="">—</option>
                      {plan.nodes.filter((x) => x.id !== n.id).map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                    </select>
                  </td>
                  <td className="w-24 py-1 pr-1"><NumInput label={`Capacité de ${n.label}`} value={n.rated} onCommit={(v) => edit((p) => updateNode(p, plan.id, n.id, { rated: v }), `n-${n.id}-rated`)} /></td>
                  <td className="w-24 py-1 pr-1"><NumInput label={`Consommation annuelle de ${n.label} en MWh`} value={n.annualMWh} onCommit={(v) => edit((p) => updateNode(p, plan.id, n.id, { annualMWh: v }), `n-${n.id}-annual`)} /></td>
                  <td className="w-32 py-1 pr-1"><TextInput label={`Zone de ${n.label}`} value={n.zone ?? ''} placeholder="—" onCommit={(s) => edit((p) => updateNode(p, plan.id, n.id, { zone: s || undefined }))} /></td>
                  <td className="w-44 py-1 pr-1">
                    <select aria-label={`Statut de ${n.label}`} className={cell} value={n.flag} onChange={(e) => edit((p) => updateNode(p, plan.id, n.id, { flag: e.target.value as NodeFlag }))}>
                      {(Object.keys(FLAG_LABEL) as NodeFlag[]).map((f) => <option key={f} value={f}>{FLAG_LABEL[f]}</option>)}
                    </select>
                  </td>
                  <td className="w-10 py-1">
                    <button type="button" className="btn !min-h-9 !px-2" aria-label={`Supprimer ${n.label}`}
                      onClick={() => { const k = plan.meters.filter((m) => m.node === n.id).length; if (confirm(`Supprimer « ${n.label} »${k ? ` et ses ${k} compteur(s)` : ''} ? Ses départs seront rattachés au poste amont.`)) edit((p) => removeNode(p, plan.id, n.id)); }}><IconClose /></button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <form className="mt-2 flex flex-wrap items-center gap-2" onSubmit={(e) => {
        e.preventDefault();
        if (!label.trim()) return;
        edit((p) => addNode(p, plan.id, label.trim(), kind, parent || undefined).project);
        setLabel('');
      }}>
        <input aria-label="Libellé du nouveau poste" placeholder="Nouveau poste…" className={`${cell} !w-64`} value={label} onChange={(e) => setLabel(e.target.value)} />
        <select aria-label="Type du nouveau poste" className={`${cell} !w-44`} value={kind} onChange={(e) => setKind(e.target.value as NodeKind)}>{KIND_ORDER.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</select>
        <select aria-label="Poste amont du nouveau poste" className={`${cell} !w-52`} value={parent} onChange={(e) => setParent(e.target.value)}><option value="">Poste amont : aucun</option>{opts}</select>
        <button type="submit" className="btn" disabled={!label.trim()}>+ Ajouter le poste</button>
      </form>
    </div>
  );
}

export function MetersTable({ plan, edit, selected, onSelect }: { plan: Plan; edit: EditProject; selected?: string; onSelect: (id: string) => void }) {
  return (
    <div>
      <datalist id="comm-list">{COMM_SUGGESTIONS.map((c) => <option key={c} value={c} />)}</datalist>
      <datalist id="device-list">{DEVICE_SUGGESTIONS.map((c) => <option key={c} value={c} />)}</datalist>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1180px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-rule-strong text-left text-ink-2">
              {['Repère', 'Poste mesuré', 'Statut', 'Appareil', 'Grandeurs', 'Communication', 'Adresse', 'TC', 'Classe', 'Localisation', ''].map((h, i) => <th key={i} className="py-1.5 pr-1 font-medium">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {plan.meters.map((m) => {
              const g = (k: 'device' | 'quantity' | 'comm' | 'address' | 'ct' | 'accuracy' | 'location', label: string, list?: string) => (
                <TextInput label={`${label} de ${m.id}`} list={list} placeholder="—" value={m[k] ?? ''} onCommit={(s) => edit((p) => updateMeter(p, plan.id, m.id, { [k]: s || undefined }))} />
              );
              return (
                <tr key={m.id} className={`border-t ${selected === m.id ? 'bg-accent-soft' : ''}`} onFocus={() => onSelect(m.id)}>
                  <td className="num w-36 py-1 pr-1 text-[12px]">{m.id}</td>
                  <td className="w-44 py-1 pr-1">
                    <select aria-label={`Poste mesuré par ${m.id}`} className={cell} value={m.node} onChange={(e) => edit((p) => updateMeter(p, plan.id, m.id, { node: e.target.value }))}>
                      {!plan.nodes.some((n) => n.id === m.node) && <option value={m.node}>{m.node} (inconnu)</option>}
                      {plan.nodes.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
                    </select>
                  </td>
                  <td className="w-48 py-1 pr-1">
                    <select aria-label={`Statut de ${m.id}`} className={cell} value={m.status} onChange={(e) => edit((p) => updateMeter(p, plan.id, m.id, { status: e.target.value as MeterStatus }))}>
                      {(Object.keys(STATUS_LABEL) as MeterStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                    </select>
                  </td>
                  <td className="w-44 py-1 pr-1">{g('device', 'Appareil', 'device-list')}</td>
                  <td className="w-36 py-1 pr-1">{g('quantity', 'Grandeurs')}</td>
                  <td className="w-40 py-1 pr-1">{g('comm', 'Communication', 'comm-list')}</td>
                  <td className="w-20 py-1 pr-1">{g('address', 'Adresse')}</td>
                  <td className="w-24 py-1 pr-1">{g('ct', 'TC')}</td>
                  <td className="w-20 py-1 pr-1">{g('accuracy', 'Classe')}</td>
                  <td className="min-w-40 py-1 pr-1">{g('location', 'Localisation')}</td>
                  <td className="w-10 py-1"><button type="button" className="btn !min-h-9 !px-2" aria-label={`Supprimer ${m.id}`} onClick={() => edit((p) => removeMeter(p, plan.id, m.id))}><IconClose /></button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select aria-label="Poste du nouveau compteur" id="new-meter-node" className={`${cell} !w-56`} defaultValue="">
          <option value="" disabled>Poste à instrumenter…</option>
          {plan.nodes.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
        </select>
        <button type="button" className="btn" onClick={() => {
          const el = document.getElementById('new-meter-node') as HTMLSelectElement | null;
          if (el?.value) edit((p) => addMeter(p, plan.id, el.value, 'a-installer').project);
        }}>+ Ajouter un compteur à installer</button>
      </div>
    </div>
  );
}
