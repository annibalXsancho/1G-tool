'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { hydraulique } from '@/data';
import { fmtNum } from '@/core/fmt';
import { custom, water, type Fluid } from '@/hydraulique/fluid';
import type { Method } from '@/hydraulique/friction';
import { compute, isOk, type Net, type Section } from '@/hydraulique/network';
import { PRESETS } from '@/hydraulique/presets';
import { CATALOG, CATEGORIES, defOf, singularityK, type SingInput } from '@/hydraulique/singularities';
import { exportPngElement, exportSvgElement } from '@/lib/svg-export';
import { writeSheets } from '@/lib/xlsx';
import { NumField, SelectField, TextField } from '../fields';
import { CheckList, Section as Block, Stat, type Item } from '../common';
import { FormulaStep } from '../Justification';
import PlotlyChart from '../charts/PlotlyChart';
import BendWidget from './BendWidget';
import PipeSvg, { type Sel } from './PipeSvg';
import { buildItems, buildProfile, buildSplit } from './charts';

const STORE = 'ee:hydraulique:v1';
const f = (v: number, s = 4) => (Number.isFinite(v) ? fmtNum(v, s) : '—');

type FluidSpec = { kind: 'eau'; T: number } | { kind: 'libre'; rho: number; nu: number };
type Unit = 'Pa' | 'mbar' | 'mCE';
type State = { fluid: FluidSpec; Q_m3h: number; method: Method; kMode: Net['kMode']; aspiration: boolean; sections: Section[]; unit: Unit };

function fromPreset(id: string): State {
  const p = PRESETS.find((x) => x.id === id)!;
  const n = p.net;
  return { fluid: n.fluid.T !== undefined ? { kind: 'eau', T: n.fluid.T } : { kind: 'libre', rho: n.fluid.rho, nu: n.fluid.nu * 1e6 }, Q_m3h: n.Q_m3h, method: n.method, kMode: n.kMode, aspiration: !!n.aspiration, sections: structuredClone(n.sections), unit: 'mbar' };
}
function load(): State {
  try { const raw = JSON.parse(localStorage.getItem(STORE) ?? 'null'); if (raw && Array.isArray(raw.sections) && raw.fluid) return { ...fromPreset('chaudiere'), ...raw }; } catch { /* valeurs par défaut */ }
  return fromPreset('chaudiere');
}
function toNet(s: State): { net: Net | null; error?: string } {
  let fluid: Fluid;
  try { fluid = s.fluid.kind === 'eau' ? water(s.fluid.T) : custom(s.fluid.rho, s.fluid.nu); } catch (e) { return { net: null, error: e instanceof Error ? e.message : String(e) }; }
  return { net: { fluid, Q_m3h: s.Q_m3h, method: s.method, kMode: s.kMode, aspiration: s.aspiration, sections: s.sections } };
}
let uid = 100;
const newId = () => `n${uid++}`;

export default function HydrauliquePage() {
  const [st, setSt] = useState<State>(() => fromPreset('chaudiere'));
  const [ready, setReady] = useState(false);
  const [sel, setSel] = useState<Sel>(null);
  const [flows, setFlows] = useState(true);
  const [adding, setAdding] = useState('coude-rayon');
  const sheetRef = useRef<SVGSVGElement>(null);

  useEffect(() => { setSt(load()); setFlows(!matchMedia('(prefers-reduced-motion: reduce)').matches); setReady(true); }, []);
  useEffect(() => { if (ready) try { localStorage.setItem(STORE, JSON.stringify(st)); } catch { /* stockage indisponible */ } }, [st, ready]);

  const { net, error } = useMemo(() => toNet(st), [st]);
  const res = useMemo(() => (net ? compute(net) : null), [net]);
  const r = res && isOk(res) ? res : null;
  const rho = net?.fluid.rho ?? 1000;

  const patch = (p: Partial<State>) => setSt((s) => ({ ...s, ...p }));
  const upSec = (id: string, p: Partial<Section>) => setSt((s) => ({ ...s, sections: s.sections.map((x) => (x.id === id ? { ...x, ...p } : x)) }));
  const upSing = (secId: string, j: number, p: Partial<SingInput>) => setSt((s) => ({ ...s, sections: s.sections.map((x) => (x.id === secId ? { ...x, sings: x.sings.map((q, k) => (k === j ? { ...q, ...p } : q)) } : x)) }));
  const addSing = (secId: string, def: string) => {
    const d = defOf(def); if (!d) return;
    const init: Partial<SingInput> = d.kind === 'coude-arrondi' ? { angle: 90, rD: 1.5 } : d.kind === 'coude-vif' ? { angle: 90 } : d.kind === 'libre' ? { K: 1 } : d.kind === 'elargissement' || d.kind === 'retrecissement' ? { cone: 180 } : {};
    setSt((s) => ({ ...s, sections: s.sections.map((x) => (x.id === secId ? { ...x, sings: [...x.sings, { id: newId(), def, qty: 1, ...init }] } : x)) }));
    setSel({ sec: secId, sing: (st.sections.find((x) => x.id === secId)?.sings.length ?? 0) });
  };
  const delSing = (secId: string, j: number) => { setSt((s) => ({ ...s, sections: s.sections.map((x) => (x.id === secId ? { ...x, sings: x.sings.filter((_, k) => k !== j) } : x)) })); setSel({ sec: secId }); };
  const addSection = () => { const id = newId(); setSt((s) => ({ ...s, sections: [...s.sections, { id, nom: `Tronçon ${s.sections.length + 1}`, D_mm: 50, L_m: 10, materiau: 'acier', dz_m: 0, sings: [] }] })); setSel({ sec: id }); };
  const delSection = (id: string) => { setSt((s) => ({ ...s, sections: s.sections.filter((x) => x.id !== id) })); setSel(null); };
  const dupSection = (id: string) => { const nid = newId(); setSt((s) => { const x = s.sections.find((q) => q.id === id)!; const i = s.sections.indexOf(x); const copy = { ...structuredClone(x), id: nid, nom: `${x.nom} (copie)`, sings: x.sings.map((q) => ({ ...q, id: newId() })) }; return { ...s, sections: [...s.sections.slice(0, i + 1), copy, ...s.sections.slice(i + 1)] }; }); setSel({ sec: nid }); };

  const secSel = sel ? st.sections.find((x) => x.id === sel.sec) : undefined;
  const singSel = secSel && sel?.sing !== undefined ? secSel.sings[sel.sing] : undefined;
  const singDef = singSel ? defOf(singSel.def) : undefined;
  const unitK = st.unit === 'Pa' ? 1 : st.unit === 'mbar' ? 0.01 : 1 / (rho * 9.81);
  const fmtP = (pa: number) => `${f(pa * unitK, 4)} ${st.unit}`;
  const profile = useMemo(() => (r ? buildProfile(r, st.unit, rho) : null), [r, st.unit, rho]);
  const split = useMemo(() => (r ? buildSplit(r) : null), [r]);
  const items = useMemo(() => (r ? buildItems(r) : null), [r]);

  const exportExcel = () => {
    if (!r) return;
    writeSheets([
      { sheet: 'Tronçons', data: [['Tronçon', 'Ø (mm)', 'L (m)', 'Débit (m³/h)', 'Vitesse (m/s)', 'Re', 'f', 'ΔP linéique (Pa)', 'ΣK', 'ΔP singulière (Pa)', 'ΔP frottement (Pa)', 'Hauteur statique (Pa)'], ...r.sections.map((s) => [s.section.nom, s.section.D_mm, s.section.L_m, s.Q * 3600, s.v, s.Re, s.f, s.dpLin, s.Ktot, s.dpSing, s.dpFrict, s.dpStatic])] },
      { sheet: 'Singularités', data: [['Tronçon', 'Organe', 'Quantité', 'K', 'K min', 'K max', 'ΔP (Pa)'], ...r.sections.flatMap((s) => s.items.map((i) => [s.section.nom, i.name, i.qty, i.K, i.Kmin, i.Kmax, i.dp]))] },
      { sheet: 'Total', data: [['Pertes de frottement (Pa)', r.dpFrict], ['Hauteur statique (Pa)', r.dpStatic], ['Total à fournir (Pa)', r.dpTotal], ['Hauteur manométrique (m)', r.hTotal], ['Part des singularités (%)', r.shareSing * 100]] },
    ], 'pertes-de-charge.xlsx');
  };

  if (!ready) return <div className="h-64 animate-pulse bg-sunken" aria-busy="true" />;

  return (
    <div className="space-y-4">
      <div>
        <p className="eyebrow">Fluides · hydraulique</p>
        <h1 className="text-[22px] font-semibold leading-tight tracking-tight sm:text-[26px]">Pertes de charge : linéiques et singulières</h1>
        <p className="mt-0.5 max-w-prose text-[13px] text-ink-2">Construisez un réseau en série (tronçons, coudes, vannes, tés, raccords de section) : vitesse, Reynolds, frottement de Colebrook-White, pertes de chaque organe, cumul le long du réseau et pression à fournir à la pompe.</p>
      </div>

      <Block n={1} title="Fluide, débit et préréglages">
        <div className="mb-4 flex flex-wrap gap-2">
          {PRESETS.map((p) => <button key={p.id} type="button" className="btn !min-h-8 !text-[12px]" title={p.description} onClick={() => { setSt(fromPreset(p.id)); setSel(null); }}>{p.label}</button>)}
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SelectField label="Fluide" value={st.fluid.kind} options={[{ value: 'eau', label: 'Eau liquide (0 à 100 °C)' }, { value: 'libre', label: 'Fluide saisi (ρ, ν)' }]} onChange={(k) => patch({ fluid: k === 'eau' ? { kind: 'eau', T: 20 } : { kind: 'libre', rho: net?.fluid.rho ?? 1000, nu: (net?.fluid.nu ?? 1e-6) * 1e6 } })} />
          {st.fluid.kind === 'eau'
            ? <NumField label="Température de l’eau" unit="°C" value={st.fluid.T} min={0} max={100} hint={net ? `ρ = ${f(net.fluid.rho, 4)} kg/m³ · ν = ${f(net.fluid.nu * 1e6, 3)} mm²/s` : undefined} onCommit={(v) => v !== undefined && patch({ fluid: { kind: 'eau', T: v } })} />
            : <>
              <NumField label="Masse volumique" unit="kg/m³" value={st.fluid.rho} min={1} onCommit={(v) => v !== undefined && st.fluid.kind === 'libre' && patch({ fluid: { ...st.fluid, rho: v } })} />
              <NumField label="Viscosité cinématique" unit="mm²/s" value={st.fluid.nu} min={0.001} hint="1 mm²/s ≈ eau à 20 °C" onCommit={(v) => v !== undefined && st.fluid.kind === 'libre' && patch({ fluid: { ...st.fluid, nu: v } })} />
            </>}
          <NumField label="Débit du réseau" unit="m³/h" value={Math.round(st.Q_m3h * 1000) / 1000} min={0} hint="Chaque tronçon peut avoir son propre débit (dérivation)." onCommit={(v) => v !== undefined && patch({ Q_m3h: v })} />
          <SelectField label="Coefficient de frottement" value={st.method} options={[{ value: 'colebrook', label: 'Colebrook-White (itératif)' }, { value: 'swamee-jain', label: 'Swamee-Jain (explicite)' }]} onChange={(m) => patch({ method: m })} />
          <SelectField label="Coefficients K des organes" value={st.kMode} options={[{ value: 'defaut', label: 'Valeur par défaut' }, { value: 'min', label: 'Bas de la plage' }, { value: 'max', label: 'Haut de la plage' }]} onChange={(m) => patch({ kMode: m })} />
          <label className="flex items-start gap-2 pt-5 text-[13px]"><input type="checkbox" className="mt-1 h-4 w-4 accent-[var(--accent)]" checked={st.aspiration} onChange={(e) => patch({ aspiration: e.target.checked })} /><span>Conduite d’aspiration de pompe<span className="block text-[11px] text-ink-3">Vitesse limitée à {hydraulique.criteres.vitesseMaxAspiration_m_s} m/s (cavitation).</span></span></label>
        </div>
        {error && <p className="mt-3 border-l-4 border-err bg-err-soft px-3 py-2 text-[13px] text-err" role="alert">{error}</p>}
      </Block>

      <Block n={2} title="Réseau" right={r && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn !min-h-8 !text-[12px]" onClick={() => sheetRef.current && exportPngElement(sheetRef.current, 'reseau-hydraulique.png')}>PNG</button>
          <button type="button" className="btn !min-h-8 !text-[12px]" onClick={() => sheetRef.current && exportSvgElement(sheetRef.current, 'reseau-hydraulique.svg')}>SVG</button>
          <button type="button" className="btn !min-h-8 !text-[12px]" onClick={exportExcel}>Excel</button>
        </div>)}>
        {res && !r ? (
          <section className="border border-err bg-err-soft p-4 text-[13px]" role="alert"><p className="mb-1 font-medium text-err">Calcul impossible</p><ul className="list-disc pl-4">{(res as { errors: string[] }).errors.map((e, i) => <li key={i}>{e}</li>)}</ul></section>
        ) : null}
        {r && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3 border bg-bg p-2 text-[13px]">
              <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" checked={flows} onChange={(e) => setFlows(e.target.checked)} />Écoulement animé (la vitesse du défilement suit la vitesse du fluide)</label>
              <button type="button" className="btn !min-h-8 !text-[12px]" onClick={addSection}>+ Tronçon</button>
              <span className="text-[12px] text-ink-3">Cliquez un tube ou un pictogramme pour le modifier.</span>
            </div>
            <div className="overflow-x-auto border bg-bg p-2"><PipeSvg result={r} selected={sel} onSelect={setSel} animate={flows} paused={!flows} variant="screen" /></div>
            <div className="hidden"><PipeSvg ref={sheetRef} result={r} selected={null} variant="sheet" title="Réseau hydraulique en série" /></div>
          </div>
        )}
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {secSel ? (
            <section className="space-y-3 border bg-bg p-3" aria-label="Tronçon sélectionné">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-[14px] font-semibold">Tronçon : {secSel.nom || 'sans nom'}</h3>
                <div className="flex gap-2 text-[12px]"><button type="button" className="text-accent hover:underline" onClick={() => dupSection(secSel.id)}>Dupliquer</button><button type="button" className="text-err hover:underline disabled:opacity-40" disabled={st.sections.length < 2} onClick={() => delSection(secSel.id)}>Supprimer</button></div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <TextField label="Nom" value={secSel.nom} onCommit={(v) => upSec(secSel.id, { nom: v })} />
                <NumField label="Diamètre intérieur" unit="mm" value={secSel.D_mm} min={1} onCommit={(v) => v !== undefined && upSec(secSel.id, { D_mm: v })} />
                <NumField label="Longueur droite" unit="m" value={secSel.L_m} min={0} onCommit={(v) => v !== undefined && upSec(secSel.id, { L_m: v })} />
                <NumField label="Dénivelé (fin − début)" unit="m" value={secSel.dz_m} min={-1000} hint="Positif en montée." onCommit={(v) => v !== undefined && upSec(secSel.id, { dz_m: v })} />
                <SelectField label="Matériau (rugosité)" value={secSel.materiau} options={[...Object.entries(hydraulique.rugosites).map(([k, x]) => ({ value: k, label: `${x.label} · ${x.eps_mm} mm` })), { value: 'libre', label: 'Rugosité saisie' }]} onChange={(m) => upSec(secSel.id, { materiau: m, eps_mm: m === 'libre' ? secSel.eps_mm ?? 0.1 : undefined })} />
                {secSel.materiau === 'libre' && <NumField label="Rugosité absolue" unit="mm" value={secSel.eps_mm} min={0} onCommit={(v) => upSec(secSel.id, { eps_mm: v ?? 0 })} />}
                <NumField label="Débit propre au tronçon" unit="m³/h" value={secSel.Q_m3h} min={0} hint="Vide = débit du réseau." onCommit={(v) => upSec(secSel.id, { Q_m3h: v })} />
              </div>
              <div>
                <h4 className="mb-1 text-[12px] font-semibold text-ink-2">Singularités du tronçon</h4>
                {secSel.sings.length === 0 && <p className="text-[12px] text-ink-3">Aucune.</p>}
                <ul className="space-y-1">
                  {secSel.sings.map((q, j) => {
                    const it = r?.sections.find((x) => x.section.id === secSel.id)?.items[j];
                    return (
                      <li key={q.id} className={`flex items-center justify-between gap-2 border px-2 py-1 text-[12px] ${sel?.sing === j ? 'border-accent bg-accent-soft' : 'border-rule'}`}>
                        <button type="button" className="min-w-0 flex-1 truncate text-left" onClick={() => setSel({ sec: secSel.id, sing: j })}>{q.qty} × {it?.name ?? defOf(q.def)?.label}</button>
                        <span className="num shrink-0 text-ink-3">{it ? `${f(it.dp)} Pa` : ''}</span>
                        <button type="button" className="shrink-0 text-err hover:underline" onClick={() => delSing(secSel.id, j)} aria-label="Supprimer la singularité">✕</button>
                      </li>
                    );
                  })}
                </ul>
                <div className="mt-2 flex flex-wrap items-end gap-2">
                  <label className="block text-[12px] text-ink-2">Ajouter un organe
                    <select className="mt-0.5 block h-9 w-72 max-w-full border border-rule bg-bg px-2 text-[13px]" value={adding} onChange={(e) => setAdding(e.target.value)}>
                      {CATEGORIES.map((c) => <optgroup key={c} label={c}>{CATALOG.filter((d) => d.categorie === c).map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}</optgroup>)}
                    </select>
                  </label>
                  <button type="button" className="btn !min-h-9" onClick={() => addSing(secSel.id, adding)}>Ajouter</button>
                </div>
              </div>
            </section>
          ) : (
            <p className="border bg-bg p-3 text-[13px] text-ink-2">Sélectionnez un tronçon ou un organe sur le schéma pour régler ses paramètres : diamètre, longueur, matériau, dénivelé, quantité et caractéristiques de chaque singularité.</p>
          )}
          {secSel && singSel && singDef && (
            <section className="space-y-3 border bg-bg p-3" aria-label="Singularité sélectionnée">
              <h3 className="text-[14px] font-semibold">{singDef.label}</h3>
              <NumField label="Quantité" value={singSel.qty} min={0} onCommit={(v) => v !== undefined && upSing(secSel.id, sel!.sing!, { qty: Math.round(v) })} />
              {(singDef.kind === 'coude-arrondi' || singDef.kind === 'coude-vif') && (
                <BendWidget angle={singSel.angle ?? 90} rD={singSel.rD ?? 1.5} sharp={singDef.kind === 'coude-vif'} onChange={(a) => upSing(secSel.id, sel!.sing!, a)} />
              )}
              {(singDef.kind === 'elargissement' || singDef.kind === 'retrecissement') && (
                <>
                  <NumField label="Angle total du cône" unit="°" value={singSel.cone ?? 180} min={1} max={180} hint="180° = raccord brusque. Le diamètre aval est celui du tronçon suivant." onCommit={(v) => v !== undefined && upSing(secSel.id, sel!.sing!, { cone: v })} />
                  {(() => { const i = st.sections.findIndex((x) => x.id === secSel.id); const nx = st.sections[i + 1]; const k = nx ? singularityK(singSel, secSel.D_mm / 1000, nx.D_mm / 1000) : null; return <p className="text-[12px] text-ink-2">{k ? <>K rapporté à la vitesse du tronçon : <span className="num text-ink">{f(k.K, 3)}</span>{k.warning ? ` · ${k.warning}` : ''}</> : 'Ajoutez un tronçon après celui-ci : il fixe le diamètre de sortie.'}</p>; })()}
                </>
              )}
              {singDef.kind === 'libre' && <NumField label="Coefficient K" value={singSel.K} min={0} onCommit={(v) => v !== undefined && upSing(secSel.id, sel!.sing!, { K: v })} />}
              {singDef.kind === 'fixe' && <p className="text-[12px] text-ink-2">K = <span className="num text-ink">{f(singDef.K!, 3)}</span> par pièce (plage {f(singDef.Kmin ?? singDef.K!, 3)} à {f(singDef.Kmax ?? singDef.K!, 3)}). Le mode « bas » ou « haut de la plage » se règle plus haut.</p>}
            </section>
          )}
        </div>
      </Block>

      {r && (
        <>
          <Block n={3} title="Résultats" right={
            <div className="flex gap-1" role="radiogroup" aria-label="Unité de pression">{(['Pa', 'mbar', 'mCE'] as Unit[]).map((u) => <button key={u} type="button" role="radio" aria-checked={st.unit === u} onClick={() => patch({ unit: u })} className={`min-h-8 border px-2.5 text-[12px] ${st.unit === u ? 'border-accent bg-accent-soft font-medium' : 'border-rule-strong bg-bg text-ink-2'}`}>{u}</button>)}</div>}>
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              <Stat strong label="Pertes de frottement" value={f(r.dpFrict * unitK)} unit={st.unit} hint={`${f(r.hFrict, 4)} m de fluide`} />
              <Stat strong label="Pression à fournir" value={f(r.dpTotal * unitK)} unit={st.unit} hint={r.dpStatic !== 0 ? `dont hauteur statique ${fmtP(r.dpStatic)}` : 'sans dénivelé'} />
              <Stat label="Linéiques" value={f(r.dpLin * unitK)} unit={st.unit} hint={`${f((1 - r.shareSing) * 100, 3)} % du frottement`} />
              <Stat label="Singulières" value={f(r.dpSing * unitK)} unit={st.unit} hint={`${f(r.shareSing * 100, 3)} % · ΣK = ${f(r.Ktot, 3)}`} />
              <Stat label="Vitesse (1er tronçon)" value={f(r.sections[0].v, 3)} unit="m/s" hint={`${r.sections[0].regime} · Re ${f(r.sections[0].Re, 3)}`} />
              <Stat label="Coefficient f" value={f(r.sections[0].f, 3)} hint={`rugosité relative ${f(r.sections[0].eps / (r.sections[0].section.D_mm / 1000), 3)}`} />
              <Stat label="Perte linéique" value={f(r.sections[0].R * unitK)} unit={`${st.unit}/m`} hint={`${f(r.sections[0].R / 9.80665, 3)} mmCE/m`} />
              <Stat label="Plage des K" value={`${f(r.dpFrictMin * unitK, 3)} – ${f(r.dpFrictMax * unitK, 3)}`} unit={st.unit} hint="selon l’incertitude des coefficients" />
            </div>
            <p className="mt-3 border-l-4 border-accent bg-accent-soft px-3 py-2 text-[13px] font-medium">{r.conclusion}</p>
          </Block>
          <div className="grid gap-4 lg:grid-cols-2">
            <Block title="Pression le long du réseau"><p className="mb-2 text-[12px] text-ink-2">Pente dans les tubes, marche à la fin de chaque tronçon pour ses singularités (position réelle dans le tronçon non modélisée).</p>{profile && <PlotlyChart build={profile} height={320} label="Pression cumulée le long du réseau" exportName="pertes-profil-pression" />}</Block>
            <Block title="Linéiques et singulières par tronçon">{split && <PlotlyChart build={split} height={320} label="Pertes linéiques et singulières par tronçon" exportName="pertes-par-troncon" />}</Block>
          </div>
          <Block title="Organes les plus pénalisants">{items && r.sections.some((s) => s.items.length) ? <PlotlyChart build={items} height={Math.max(220, 40 * new Set(r.sections.flatMap((s) => s.items.map((i) => i.name))).size + 90)} label="Pertes par type d’organe" exportName="pertes-par-organe" /> : <p className="text-[13px] text-ink-2">Aucune singularité.</p>}</Block>
          <Block title="Détail par tronçon">
            <div className="overflow-x-auto"><table className="w-full min-w-[46rem] border-collapse text-[13px]">
              <thead><tr className="border-b text-left">{['Tronçon', 'Ø (mm)', 'v (m/s)', 'Re', 'f', `ΔP lin. (${st.unit})`, 'ΣK', 'L équiv. (m)', `ΔP sing. (${st.unit})`, `Total (${st.unit})`].map((h, i) => <th key={h} className={`py-1 pr-3 eyebrow ${i > 0 ? 'text-right' : ''}`}>{h}</th>)}</tr></thead>
              <tbody>{r.sections.map((s) => <tr key={s.section.id} className="border-b"><td className="py-1 pr-3">{s.section.nom}</td><td className="num py-1 pr-3 text-right">{f(s.section.D_mm)}</td><td className="num py-1 pr-3 text-right">{f(s.v, 3)}</td><td className="num py-1 pr-3 text-right">{f(s.Re, 3)}</td><td className="num py-1 pr-3 text-right">{f(s.f, 3)}</td><td className="num py-1 pr-3 text-right">{f(s.dpLin * unitK)}</td><td className="num py-1 pr-3 text-right">{f(s.Ktot, 3)}</td><td className="num py-1 pr-3 text-right">{f(s.Leq)}</td><td className="num py-1 pr-3 text-right">{f(s.dpSing * unitK)}</td><td className="num py-1 pr-3 text-right font-medium">{f(s.dpFrict * unitK)}</td></tr>)}</tbody>
            </table></div>
            <h3 className="mb-1 mt-4 text-[13px] font-semibold">Contribution de chaque organe</h3>
            <div className="overflow-x-auto"><table className="w-full min-w-[40rem] border-collapse text-[13px]">
              <thead><tr className="border-b text-left"><th className="py-1 pr-3 eyebrow">Tronçon</th><th className="py-1 pr-3 eyebrow">Organe</th><th className="py-1 pr-3 text-right eyebrow">Qté</th><th className="py-1 pr-3 text-right eyebrow">K</th><th className="py-1 pr-3 text-right eyebrow">Plage K</th><th className="py-1 text-right eyebrow">ΔP ({st.unit})</th></tr></thead>
              <tbody>{r.sections.flatMap((s) => s.items.map((i, k) => <tr key={`${s.section.id}-${k}`} className="border-b"><td className="py-1 pr-3">{s.section.nom}</td><td className="py-1 pr-3">{i.name}</td><td className="num py-1 pr-3 text-right">{i.qty}</td><td className="num py-1 pr-3 text-right">{f(i.K, 3)}</td><td className="num py-1 pr-3 text-right text-ink-3">{i.Kmin === i.Kmax ? '—' : `${f(i.Kmin, 3)} à ${f(i.Kmax, 3)}`}</td><td className="num py-1 text-right">{f(i.dp * unitK)}</td></tr>))}</tbody>
            </table></div>
          </Block>
          <Block n={4} title="Vérifications"><CheckList items={r.checks.map<Item>((c) => ({ id: c.id, label: c.label, level: c.level, detail: c.detail }))} /></Block>
          <Block n={5} title="Note de calcul">
            <div className="mb-3 grid gap-x-6 gap-y-2 text-[13px] leading-relaxed text-ink-2 md:grid-cols-3">
              <p>Un fluide qui s’écoule perd de la pression de deux façons : par frottement sur la paroi du tube (pertes <em>linéiques</em>, proportionnelles à la longueur) et en traversant un organe qui perturbe l’écoulement (pertes <em>singulières</em>, proportionnelles à l’énergie cinétique).</p>
              <p>Le frottement dépend du régime (nombre de Reynolds) et de la rugosité relative. Les coefficients des organes viennent de catalogues : leur précision est de l’ordre de ±20 à 30 %, d’où la plage proposée.</p>
              <p>La pression totale à fournir ajoute la hauteur statique ρ g Δz. C’est la donnée d’entrée du choix d’une pompe.</p>
            </div>
            <ol>{r.formulas.map((fm, i) => <FormulaStep key={i} f={fm} n={i + 1} />)}</ol>
          </Block>
        </>
      )}

      <Block title="Catalogue des coefficients de pertes singulières">
        <div className="overflow-x-auto"><table className="w-full min-w-[34rem] border-collapse text-[13px]">
          <thead><tr className="border-b text-left"><th className="py-1 pr-3 eyebrow">Catégorie</th><th className="py-1 pr-3 eyebrow">Organe</th><th className="py-1 pr-3 text-right eyebrow">K</th><th className="py-1 text-right eyebrow">Plage</th></tr></thead>
          <tbody>{CATALOG.map((d) => <tr key={d.id} className="border-b"><td className="py-1 pr-3 text-ink-2">{d.categorie}</td><td className="py-1 pr-3">{d.label}</td><td className="num py-1 pr-3 text-right">{d.K !== undefined ? f(d.K, 3) : d.kind === 'coude-arrondi' ? 'Weisbach' : d.kind === 'coude-vif' ? 'Weisbach' : d.kind === 'libre' ? 'saisi' : 'Borda / Crane'}</td><td className="num py-1 text-right text-ink-3">{d.Kmin !== undefined && d.Kmax !== undefined && d.Kmin !== d.Kmax ? `${f(d.Kmin, 3)} à ${f(d.Kmax, 3)}` : '—'}</td></tr>)}</tbody>
        </table></div>
        <p className="mt-2 text-[12px] text-ink-3">{hydraulique.meta.source.split('TODO')[0]}TODO: source à vérifier pour les vannes, clapets, tés et filtres.</p>
      </Block>
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="border bg-surface p-4"><h2 className="eyebrow mb-2">Hypothèses</h2><ul className="list-disc space-y-1 pl-4 text-[13px] text-ink-2"><li>Fluide incompressible, conduite pleine, régime établi.</li><li>Les pertes linéiques et singulières s’additionnent (pas d’interaction entre organes proches).</li><li>Singularités rapportées à la vitesse du tronçon ; leur position dans le tronçon n’est pas modélisée.</li><li>Raccords de section : le diamètre aval est celui du tronçon suivant.</li></ul></section>
        <section className="border bg-surface p-4"><h2 className="eyebrow mb-2">Domaine de validité</h2><ul className="list-disc space-y-1 pl-4 text-[13px] text-ink-2"><li>Colebrook et Swamee-Jain : Re &gt; 4 000, rugosité relative &lt; 5 %.</li><li>2 000 &lt; Re &lt; 4 000 : interpolation signalée, résultat incertain.</li><li>Eau de 0 à 100 °C ; autres fluides par saisie de ρ et ν.</li><li>Deux organes à moins de 10 diamètres l’un de l’autre s’influencent : la somme des K peut être sous-estimée.</li></ul><h2 className="eyebrow mb-2 mt-4">Ce que ce calcul ne couvre pas</h2><p className="text-[13px] text-ink-2">Réseaux maillés ou ramifiés avec répartition des débits, fluides non newtoniens, écoulement diphasique, coups de bélier, cavitation détaillée (NPSH).</p></section>
        <section className="border bg-surface p-4"><h2 className="eyebrow mb-2">Références</h2><ul className="list-disc space-y-1 pl-4 text-[13px] text-ink-2"><li>Darcy-Weisbach, Colebrook-White (1939), Swamee-Jain (1976).</li><li>Weisbach (coudes), Borda-Carnot (élargissement brusque), Crane TP-410 (raccords coniques, vannes), Idel’chik.</li><li>Cours HYDRAULIQUE : conduite forcée (cas de validation, feuille HYDRAULIQUE.xlsx).</li></ul><p className="mt-2 text-[12px] text-ink-3">Données : <code>src/data/hydraulique.json</code>. TODO: source à vérifier pour les valeurs d’organes.</p></section>
      </div>
    </div>
  );
}
