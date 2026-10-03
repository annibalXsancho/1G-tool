'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { electrique } from '@/data';
import { fmtNum } from '@/core/fmt';
import { calculate, flatten, DEFAULT_CALC, type Issue } from '@/unifilaire/calc';
import { drawInstallation } from '@/unifilaire/draw';
import { addElement, addInstallation, autoSizeBreakers, descendantsOf, removeElement, removeInstallation, updateBreaker, updateCable, updateElement, updateInstallation, updateMeterRef } from '@/unifilaire/edit';
import { parseUnifilaires, unifilairesToSheets } from '@/unifilaire/excel';
import { EXEMPLE_UNIFILAIRE } from '@/unifilaire/exemple';
import { BREAKER_LABEL, KIND_LABEL, KIND_ORDER, canHaveChildren, type BreakerType, type Installation, type Kind, type Material, type UElement } from '@/unifilaire/model';
import { STATUS_LABEL, type MeterStatus } from '@/metering/model';
import { fileSafe } from '@/lib/download';
import { exportPngElement, exportSvgElement } from '@/lib/svg-export';
import { useUnifilaires } from '@/lib/unifilaire-store';
import { readSheets, writeSheets } from '@/lib/xlsx';
import { IconAlert, IconInfo, IconWarn } from '../icons';
import { NumField, SelectField, TextField } from '../fields';
import DrawingSvg from './DrawingSvg';

const f = (v: number, d = 3) => (Number.isFinite(v) ? fmtNum(v, d) : '∞');
const BREAKER_OPTS: { value: BreakerType | 'aucune'; label: string }[] = [{ value: 'aucune', label: 'Aucune' }, ...(Object.keys(BREAKER_LABEL) as BreakerType[]).map((k) => ({ value: k, label: BREAKER_LABEL[k] }))];

function IssueList({ issues, onSelect }: { issues: Issue[]; onSelect: (id: string) => void }) {
  if (issues.length === 0) return <p className="text-[13px] text-ink-2">Aucune anomalie détectée.</p>;
  const order = { erreur: 0, avertissement: 1, info: 2 };
  return (
    <ul className="space-y-1.5">
      {[...issues].sort((a, b) => order[a.level] - order[b.level]).map((i, k) => (
        <li key={k} className={`flex gap-2 text-[13px] ${i.level === 'erreur' ? 'border-l-4 border-err bg-err-soft p-2' : i.level === 'avertissement' ? 'border-l-4 border-warn bg-warn-soft p-2' : 'p-1 text-ink-2'}`}>
          <span className={`mt-0.5 ${i.level === 'erreur' ? 'text-err' : i.level === 'avertissement' ? 'text-warn' : 'text-ink-3'}`}>{i.level === 'erreur' ? <IconAlert /> : i.level === 'avertissement' ? <IconWarn /> : <IconInfo />}</span>
          <span className="flex-1">{i.message}</span>
          {i.element && <button type="button" className="shrink-0 text-[12px] text-accent underline-offset-2 hover:underline" onClick={() => onSelect(i.element!)}>Voir</button>}
        </li>
      ))}
    </ul>
  );
}

function Section({ n, title, children, right }: { n: number; title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="border bg-surface">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2">
        <h2 className="flex items-baseline gap-2"><span className="num text-[13px] font-semibold text-accent">{n}</span><span className="eyebrow">{title}</span></h2>
        {right}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

export default function UnifilairePage() {
  const { project, ready, replace, edit, undo, canUndo } = useUnifilaires();
  const [instId, setInstId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [showValues, setShowValues] = useState(true);
  const [zoom, setZoom] = useState<'fit' | number>('fit');
  const [duLimit, setDuLimit] = useState(DEFAULT_CALC.duLimit);
  const [importIssues, setImportIssues] = useState<Issue[]>([]);
  const [busy, setBusy] = useState(false);
  const [date, setDate] = useState('');
  const [boxW, setBoxW] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const sheetRef = useRef<SVGSVGElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const detailRef = useRef<HTMLDivElement>(null);

  useEffect(() => setDate(new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })), []);

  const inst: Installation | null = project ? project.installations.find((i) => i.id === instId) ?? project.installations[0] ?? null : null;
  const opts = useMemo(() => ({ duLimit }), [duLimit]);
  const calc = useMemo(() => (inst ? calculate(inst, opts) : null), [inst, opts]);
  const drawing = useMemo(() => (inst && calc ? drawInstallation(inst, { calc, calcOptions: opts, showValues }) : null), [inst, calc, opts, showValues]);
  const rows = useMemo(() => (calc ? flatten(calc) : []), [calc]);

  const hasBox = !!drawing;
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBoxW(el.clientWidth));
    ro.observe(el);
    setBoxW(el.clientWidth);
    return () => ro.disconnect();
  }, [hasBox]);

  const select = (id: string) => { setSelected(id); setTimeout(() => detailRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 50); };
  const base = fileSafe(inst?.name ?? 'unifilaire');

  async function onFile(file: File) {
    setBusy(true);
    try {
      const { project: p, issues } = parseUnifilaires(await readSheets(file));
      if (!p.name) p.name = file.name.replace(/\.xlsx$/i, '');
      setImportIssues(issues);
      if (p.installations.length > 0) { replace(p); setInstId(p.installations[0].id); setSelected(null); }
    } catch (e) {
      setImportIssues([{ level: 'erreur', message: `Lecture du fichier impossible : ${e instanceof Error ? e.message : String(e)}. Format attendu : .xlsx.` }]);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  const toolbar = (
    <div className="flex flex-wrap gap-2">
      <input ref={fileRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
      <button type="button" className="btn !border-accent !bg-accent !text-accent-ink" disabled={busy} onClick={() => fileRef.current?.click()}>{busy ? 'Lecture…' : 'Importer un fichier Excel'}</button>
      <button type="button" className="btn" onClick={() => writeSheets(unifilairesToSheets(EXEMPLE_UNIFILAIRE), 'gabarit-unifilaire.xlsx')}>Télécharger le gabarit Excel</button>
      {project && <button type="button" className="btn" onClick={() => writeSheets(unifilairesToSheets(project), `unifilaires-${fileSafe(project.name || 'projet')}.xlsx`)}>Exporter le projet (Excel)</button>}
      <button type="button" className="btn" onClick={() => { replace(structuredClone(EXEMPLE_UNIFILAIRE)); setInstId(EXEMPLE_UNIFILAIRE.installations[0].id); setSelected(null); setImportIssues([]); }}>Charger l’exemple</button>
      {project && <button type="button" className="btn" disabled={!canUndo} onClick={undo} title="Annuler la dernière modification">↶ Annuler</button>}
      {project && <button type="button" className="btn" onClick={() => { if (confirm('Effacer le projet enregistré dans ce navigateur ?')) { replace(null); setInstId(null); setSelected(null); } }}>Vider</button>}
    </div>
  );

  if (!ready) return <div className="h-64 animate-pulse bg-sunken" aria-busy="true" />;

  const errs = calc ? calc.issues.filter((i) => i.level === 'erreur').length : 0;
  const warns = calc ? calc.issues.filter((i) => i.level === 'avertissement').length : 0;
  const sel = inst && selected ? inst.elements.find((e) => e.id === selected) : undefined;
  const scale = zoom === 'fit' && drawing ? Math.min(1.2, Math.max(0.3, (boxW - 26) / drawing.width)) : typeof zoom === 'number' ? zoom : 1;

  return (
    <>
      <div className="screen-only space-y-4">
        <div>
          <p className="eyebrow">Électricité · livrables</p>
          <h1 className="text-[22px] font-semibold leading-tight tracking-tight sm:text-[26px]">Générateur de schémas unifilaires{project?.name ? <span className="text-ink-3"> · {project.name}</span> : null}</h1>
          <p className="mt-0.5 max-w-prose text-[13px] text-ink-2">Décrivez l’installation (réseau, transformateurs, tableaux, départs) : le schéma se dessine automatiquement, avec courants d’emploi, courants de court-circuit, chutes de tension et vérifications des protections.</p>
        </div>
        {toolbar}
        {importIssues.length > 0 && <section className="border bg-surface p-4"><h2 className="eyebrow mb-2">Compte rendu d’import</h2><IssueList issues={importIssues} onSelect={select} /></section>}

        {!project || !inst || !calc || !drawing ? (
          <section className="grid gap-4 border bg-surface p-4 md:grid-cols-2">
            <div className="space-y-2 text-[13px] text-ink-2">
              <h2 className="text-[15px] font-semibold text-ink">Démarrer</h2>
              <p>Cliquez sur <strong className="text-ink">Charger l’exemple</strong> pour voir un poste HTA/BT complet (réseau, transformateur, TGBT, départs moteurs et charges, compensation, groupe électrogène, compteurs), puis modifiez-le.</p>
              <p>Ou importez un fichier Excel : une ligne par élément avec son <em>Parent</em>, ses caractéristiques, sa protection, son câble et son compteur. Le gabarit téléchargeable en donne le format.</p>
            </div>
            <div className="border-l-4 border-accent bg-accent-soft p-3 text-[13px]">
              <p className="mb-1 font-medium">Ce que l’outil calcule et vérifie</p>
              <ul className="list-disc space-y-1 pl-4 text-ink-2">
                <li>courants d’emploi par départ, tableau et transformateur (avec simultanéité et compensation) ;</li>
                <li><strong className="text-ink">Icc triphasé maximal</strong> à chaque tableau (méthode des impédances) ;</li>
                <li>calibre ≥ courant d’emploi, <strong className="text-ink">pouvoir de coupure</strong> ≥ Icc, charge des transformateurs et des barres ;</li>
                <li>chute de tension cumulée ;</li>
                <li>dessin SVG, PNG et feuille A4 paysage avec légende et cartouche.</li>
              </ul>
            </div>
          </section>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Installations">
              {project.installations.map((i) => (
                <button key={i.id} type="button" role="tab" aria-selected={i.id === inst.id} onClick={() => { setInstId(i.id); setSelected(null); }}
                  className={`min-h-9 border px-3 text-[13px] ${i.id === inst.id ? 'border-accent bg-accent-soft font-medium' : 'border-rule-strong bg-bg text-ink-2 hover:text-ink'}`}>{i.name}</button>
              ))}
              <button type="button" className="btn !min-h-9" onClick={() => { const name = prompt('Nom de la nouvelle installation ?', 'Nouvelle installation'); if (name?.trim()) { const r = addInstallation(project, name.trim()); edit(() => r.project); setInstId(r.id); } }}>+ Installation</button>
              {project.installations.length > 1 && <button type="button" className="btn !min-h-9" onClick={() => { if (confirm(`Supprimer « ${inst.name} » ?`)) { edit((p) => removeInstallation(p, inst.id)); setInstId(null); } }}>Supprimer</button>}
            </div>

            <Section n={1} title="Installation">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <TextField label="Nom du schéma" value={inst.name} onCommit={(s) => s && edit((p) => updateInstallation(p, inst.id, { name: s }))} />
                <TextField label="Site" value={inst.site} onCommit={(s) => edit((p) => updateInstallation(p, inst.id, { site: s }))} />
                <TextField label="Version" value={inst.version ?? ''} placeholder="V1" onCommit={(s) => edit((p) => updateInstallation(p, inst.id, { version: s || undefined }))} />
                <TextField label="Auteur" value={inst.author ?? ''} onCommit={(s) => edit((p) => updateInstallation(p, inst.id, { author: s || undefined }))} />
                <NumField label="Chute de tension admise" unit="%" value={duLimit} min={0.1} max={20} onCommit={(v) => v && setDuLimit(v)} hint="Réglage de contrôle, à adapter au référentiel du projet." />
              </div>
            </Section>

            <Section n={2} title="Éléments de l’installation" right={
              <button type="button" className="btn !min-h-8" onClick={() => edit((p) => autoSizeBreakers(p, inst.id, electrique.series.calibres_A))} title="Remplace chaque calibre par le calibre usuel immédiatement supérieur au courant d'emploi">Dimensionner les calibres</button>
            }>
              <div className="grid items-start gap-4 lg:grid-cols-[minmax(280px,1fr)_minmax(0,1.5fr)]">
                <div>
                  <ul className="max-h-[520px] overflow-auto border">
                    {rows.map(({ el, depth }) => {
                      const n = calc.nodes.get(el.id)!;
                      const bad = calc.issues.some((i) => i.element === el.id && i.level === 'erreur');
                      const warn = calc.issues.some((i) => i.element === el.id && i.level === 'avertissement');
                      return (
                        <li key={el.id}>
                          <button type="button" onClick={() => setSelected(el.id)} style={{ paddingLeft: 8 + depth * 14 }}
                            className={`flex w-full items-baseline gap-2 border-t py-1.5 pr-2 text-left text-[13px] first:border-t-0 ${selected === el.id ? 'bg-accent-soft' : 'hover:bg-sunken'}`}>
                            <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${bad ? 'bg-err' : warn ? 'bg-warn' : 'bg-accent'}`} title={bad ? 'Erreur' : warn ? 'Avertissement' : 'Conforme'} />
                            <span className="min-w-0 flex-1 truncate font-medium">{el.label}</span>
                            <span className="shrink-0 text-[11px] text-ink-3">{KIND_LABEL[el.kind].split(' ')[0]}</span>
                            <span className="num shrink-0 text-[12px] text-ink-2">{n.ib > 0 ? `${f(n.ib)} A` : ''}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {KIND_ORDER.filter((k) => k !== 'reseau' || inst.elements.length === 0 || !inst.elements.some((e) => e.kind === 'reseau')).map((k) => (
                      <button key={k} type="button" className="btn !min-h-8 !px-2 !text-[12px]" title={sel && canHaveChildren(sel.kind) ? `Ajouter sous « ${sel.label} »` : 'Ajouter à la racine ou sous le premier tableau'}
                        onClick={() => {
                          const parentEl = sel && canHaveChildren(sel.kind) ? sel : k === 'reseau' ? undefined : inst.elements.find((e) => e.kind === 'tableau') ?? inst.elements[0];
                          const r = addElement(project, inst.id, k, parentEl?.id);
                          edit(() => r.project);
                          setSelected(r.id);
                        }}>+ {KIND_LABEL[k].split(' ')[0].replace('Batterie', 'Condensateurs')}</button>
                    ))}
                  </div>
                  <p className="mt-1 text-[11px] text-ink-3">Le nouvel élément est ajouté sous l’élément sélectionné (tableau, transformateur ou réseau).</p>
                </div>

                <div ref={detailRef}>
                  {sel ? <ElementForm inst={inst} el={sel} calc={calc} edit={edit} onDelete={() => { if (confirm(`Supprimer « ${sel.label} » et tout ce qu’il alimente ?`)) { edit((p) => removeElement(p, inst.id, sel.id)); setSelected(null); } }} />
                    : <p className="border p-4 text-[13px] text-ink-3">Sélectionnez un élément dans la liste ou cliquez dessus sur le schéma pour modifier ses caractéristiques, sa protection, son câble et son compteur.</p>}
                </div>
              </div>
            </Section>

            <Section n={3} title="Schéma unifilaire" right={
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" checked={showValues} onChange={(e) => setShowValues(e.target.checked)} />Valeurs calculées</label>
                <div className="flex items-center gap-1" role="group" aria-label="Zoom">
                  <button type="button" className="btn !min-h-8 !px-2.5" aria-label="Réduire" onClick={() => setZoom(Math.max(0.3, scale - 0.15))}>−</button>
                  <button type="button" className="btn !min-h-8 !px-2.5" aria-pressed={zoom === 'fit'} onClick={() => setZoom('fit')}>Ajuster</button>
                  <button type="button" className="btn !min-h-8 !px-2.5" aria-label="Agrandir" onClick={() => setZoom(Math.min(2, scale + 0.15))}>+</button>
                </div>
                <button type="button" className="btn !min-h-8" onClick={() => sheetRef.current && exportPngElement(sheetRef.current, `unifilaire-${base}.png`)}>PNG</button>
                <button type="button" className="btn !min-h-8" onClick={() => sheetRef.current && exportSvgElement(sheetRef.current, `unifilaire-${base}.svg`)}>SVG</button>
                <button type="button" className="btn !min-h-8" onClick={() => window.print()} title="A4 paysage avec cartouche : choisir « Enregistrer au format PDF »">Imprimer / PDF</button>
              </div>
            }>
              <div ref={boxRef} className="overflow-auto border bg-bg p-3" style={{ maxHeight: '78vh' }}>
                <DrawingSvg inst={inst} drawing={drawing} variant="screen" scale={scale} selected={selected} onSelect={select} />
              </div>
              <p className="mt-2 text-[12px] text-ink-3">Cliquez sur un élément pour le modifier. Rouge : calibre ou pouvoir de coupure insuffisant. Les exports incluent légende et cartouche, en thème clair.</p>
            </Section>

            <Section n={4} title="Vérifications et calculs" right={<span className="text-[13px] text-ink-2">{errs} erreur(s) · {warns} avertissement(s)</span>}>
              <IssueList issues={calc.issues} onSelect={select} />
              <details className="mt-4">
                <summary className="cursor-pointer text-[13px] font-medium">Tableau des grandeurs calculées</summary>
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full min-w-[760px] border-collapse text-[13px]">
                    <thead><tr className="border-b border-rule-strong text-left text-ink-2">{['Élément', 'U (V)', 'P (kW)', 'Q (kvar)', 'S (kVA)', 'IB (A)', 'Charge', 'Icc (kA)', 'ΔU cumulée'].map((h, i) => <th key={h} className={`py-1.5 pr-3 font-medium ${i ? 'text-right' : ''}`}>{h}</th>)}</tr></thead>
                    <tbody>
                      {rows.map(({ el, depth }) => {
                        const n = calc.nodes.get(el.id)!;
                        return (
                          <tr key={el.id} className="border-t">
                            <td className="py-1.5 pr-3" style={{ paddingLeft: depth * 12 }}>{el.label}</td>
                            <td className="num py-1.5 pr-3 text-right">{f(n.u)}</td>
                            <td className="num py-1.5 pr-3 text-right">{n.p ? f(n.p) : ''}</td>
                            <td className="num py-1.5 pr-3 text-right">{n.q ? f(n.q) : ''}</td>
                            <td className="num py-1.5 pr-3 text-right">{n.s ? f(n.s) : ''}</td>
                            <td className="num py-1.5 pr-3 text-right">{n.ib ? f(n.ib) : ''}</td>
                            <td className="num py-1.5 pr-3 text-right">{n.loading !== undefined ? `${f(n.loading * 100, 3)} %` : ''}</td>
                            <td className="num py-1.5 pr-3 text-right">{Number.isFinite(n.icc) ? f(n.icc) : '∞'}</td>
                            <td className="num py-1.5 pr-3 text-right">{n.du ? `${f(n.du, 3)} %` : ''}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </details>
              <div className="mt-4 grid gap-4 border-t pt-4 text-[12px] text-ink-2 md:grid-cols-2">
                <div>
                  <h3 className="eyebrow mb-1">Hypothèses</h3>
                  <ul className="list-disc space-y-0.5 pl-4">
                    <li>Réseau triphasé équilibré ; régime permanent.</li>
                    <li>Icc triphasé maximal par la méthode des impédances : réseau amont réduit à sa puissance de court-circuit (R/X = {electrique.rapportRsurX_source}), facteur de tension c = {electrique.facteurTension_c}, résistivité à 20 °C, réactance linéique {electrique.reactanceLineique_mOhm_par_m} mΩ/m.</li>
                    <li>Contribution des moteurs et des groupes au court-circuit ignorée ; pertes à vide des transformateurs ignorées.</li>
                    <li>Courants d’emploi par agrégation des puissances active et réactive, avec le coefficient de simultanéité de chaque tableau.</li>
                    <li>Chute de tension : câbles (résistivité en service) et transformateurs (approximation par ukk).</li>
                  </ul>
                </div>
                <div>
                  <h3 className="eyebrow mb-1">Limites</h3>
                  <ul className="list-disc space-y-0.5 pl-4">
                    <li>Aide au dessin et au pré-dimensionnement : ne remplace ni une étude de sélectivité et de filiation, ni le choix des courants admissibles des câbles, ni un calcul d’Icc minimal.</li>
                    <li>Les coefficients tabulés (résistivités, réactance, facteur c) sont dans <code>src/data/electrique.json</code> et signalés « à vérifier » ; ils sont modifiables.</li>
                    <li>Symboles simplifiés d’esprit CEI 60617 : conformité à valider avant diffusion.</li>
                  </ul>
                </div>
              </div>
            </Section>
          </>
        )}
      </div>

      {inst && drawing && (
        <div className="print-only print-plan">
          <DrawingSvg ref={sheetRef} inst={inst} drawing={drawing} variant="sheet" info={{ projectName: project?.name ?? '', date, summary: `Icc et IB calculés — ${errs} erreur(s), ${warns} avertissement(s)` }} />
        </div>
      )}
    </>
  );
}

function ElementForm({ inst, el, calc, edit, onDelete }: { inst: Installation; el: UElement; calc: ReturnType<typeof calculate>; edit: (fn: (p: import('@/unifilaire/model').UProject) => import('@/unifilaire/model').UProject, key?: string) => void; onDelete: () => void }) {
  const n = calc.nodes.get(el.id)!;
  const up = (patch: Partial<UElement>, key?: string) => edit((p) => updateElement(p, inst.id, el.id, patch), key ? `${el.id}-${key}` : undefined);
  const blocked = descendantsOf(inst, el.id);
  const parents = inst.elements.filter((e) => canHaveChildren(e.kind) && !blocked.has(e.id));
  const b = el.breaker;
  const c = el.cable;
  const m = el.meter;
  const k = el.kind;
  return (
    <div className="space-y-4 border p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[15px] font-semibold">{el.label}</h3>
        <button type="button" className="btn !min-h-8 !text-err" onClick={onDelete}>Supprimer</button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label="Libellé" value={el.label} onCommit={(s) => s && up({ label: s })} />
        <SelectField label="Type" value={k} options={KIND_ORDER.map((x) => ({ value: x, label: KIND_LABEL[x] }))} onChange={(v) => up({ kind: v })} />
        <SelectField label="Alimenté par" value={el.parent ?? ''} options={[{ value: '', label: '— (tête de schéma)' }, ...parents.map((p) => ({ value: p.id, label: p.label }))]} onChange={(v) => up({ parent: v || undefined })} />
        <div className="text-[12px] text-ink-3"><span className="eyebrow block">Identifiant</span><span className="num text-[13px] text-ink">{el.id}</span></div>
      </div>

      <div>
        <h4 className="eyebrow mb-1.5">Caractéristiques</h4>
        <div className="grid gap-3 sm:grid-cols-3">
          {k === 'reseau' && <><NumField label="Tension composée" unit="V" value={el.voltage} min={50} onCommit={(v) => up({ voltage: v }, 'u')} /><NumField label="Puissance de court-circuit" unit="MVA" value={el.scc} onCommit={(v) => up({ scc: v }, 'scc')} hint="Vide = source infinie (Icc majorés)." /></>}
          {k === 'transformateur' && <>
            <NumField label="Puissance assignée" unit="kVA" list="tr-list" value={el.s} onCommit={(v) => up({ s: v }, 's')} />
            <NumField label="Tension secondaire à vide" unit="V" value={el.u2} min={50} onCommit={(v) => up({ u2: v }, 'u2')} />
            <NumField label="Tension de court-circuit ukk" unit="%" value={el.ukk} max={30} onCommit={(v) => up({ ukk: v }, 'ukk')} />
            <NumField label="Pertes en charge Pk" unit="kW" value={el.pk} onCommit={(v) => up({ pk: v }, 'pk')} hint="Facultatif (plaque signalétique)." />
            <TextField label="Couplage" value={el.coupling ?? ''} placeholder="Dyn11" onCommit={(s) => up({ coupling: s || undefined })} />
          </>}
          {k === 'tableau' && <><NumField label="Courant assigné des barres" unit="A" list="cal-list" value={el.inBar} onCommit={(v) => up({ inBar: v }, 'inbar')} /><NumField label="Coefficient de simultanéité" value={el.ks} min={0.05} max={1} onCommit={(v) => up({ ks: v }, 'ks')} hint="1 = tous les départs en même temps." /></>}
          {k === 'moteur' && <><NumField label="Puissance mécanique" unit="kW" value={el.p} onCommit={(v) => up({ p: v }, 'p')} /><NumField label="cos φ" value={el.cosphi} min={0.1} max={1} onCommit={(v) => up({ cosphi: v }, 'cos')} /><NumField label="Rendement" value={el.eta} min={0.1} max={1} onCommit={(v) => up({ eta: v }, 'eta')} /></>}
          {k === 'charge' && <><NumField label="Puissance absorbée" unit="kW" value={el.p} onCommit={(v) => up({ p: v }, 'p')} /><NumField label="cos φ" value={el.cosphi} min={0.1} max={1} onCommit={(v) => up({ cosphi: v }, 'cos')} /></>}
          {k === 'condensateurs' && <NumField label="Puissance réactive" unit="kvar" value={el.q} onCommit={(v) => up({ q: v }, 'q')} />}
          {k === 'groupe' && <NumField label="Puissance" unit="kVA" value={el.s} onCommit={(v) => up({ s: v }, 's')} />}
        </div>
      </div>

      {el.parent && (
        <>
          <div>
            <h4 className="eyebrow mb-1.5">Protection (liaison amont)</h4>
            <div className="grid gap-3 sm:grid-cols-4">
              <SelectField label="Appareil" value={b?.type ?? 'aucune'} options={BREAKER_OPTS} onChange={(v) => edit((p) => updateBreaker(p, inst.id, el.id, v === 'aucune' ? undefined : { ...(b ?? {}), type: v }))} />
              {b && <>
                <NumField label="Calibre In" unit="A" list="cal-list" value={b.in} onCommit={(v) => edit((p) => updateBreaker(p, inst.id, el.id, { ...b, in: v }), `${el.id}-in`)} hint={n.ib > 0 ? `IB = ${f(n.ib)} A` : undefined} />
                <NumField label="Pouvoir de coupure Icu" unit="kA" list="icu-list" value={b.icu} onCommit={(v) => edit((p) => updateBreaker(p, inst.id, el.id, { ...b, icu: v }), `${el.id}-icu`)} hint={n.iccUp !== undefined && Number.isFinite(n.iccUp) ? `Icc amont = ${f(n.iccUp)} kA` : undefined} />
                <TextField label="Courbe" value={b.curve ?? ''} placeholder="C, D, gG…" onCommit={(s) => edit((p) => updateBreaker(p, inst.id, el.id, { ...b, curve: s || undefined }))} />
              </>}
            </div>
          </div>
          <div>
            <h4 className="eyebrow mb-1.5">Câble (liaison amont)</h4>
            <div className="grid gap-3 sm:grid-cols-4">
              <SelectField label="Matériau" value={c?.material ?? 'cuivre'} options={[{ value: 'cuivre', label: 'Cuivre' }, { value: 'aluminium', label: 'Aluminium' }]} onChange={(v: Material) => edit((p) => updateCable(p, inst.id, el.id, { ...(c ?? { material: v }), material: v }))} />
              <NumField label="Section" unit="mm²" list="sec-list" value={c?.section} onCommit={(v) => edit((p) => updateCable(p, inst.id, el.id, { ...(c ?? { material: 'cuivre' }), section: v }), `${el.id}-sec`)} />
              <NumField label="Longueur" unit="m" value={c?.length} onCommit={(v) => edit((p) => updateCable(p, inst.id, el.id, { ...(c ?? { material: 'cuivre' }), length: v }), `${el.id}-len`)} hint={n.duLink > 0.005 ? `ΔU liaison = ${f(n.duLink, 2)} %` : undefined} />
              <NumField label="Câbles en parallèle" value={c?.parallel} min={1} max={12} placeholder="1" onCommit={(v) => edit((p) => updateCable(p, inst.id, el.id, { ...(c ?? { material: 'cuivre' }), parallel: v }))} />
            </div>
          </div>
        </>
      )}

      <div>
        <h4 className="eyebrow mb-1.5">Compteur d’énergie</h4>
        <div className="grid gap-3 sm:grid-cols-3">
          <TextField label="Repère" value={m?.id ?? ''} placeholder="CE-…" hint="Vide = pas de compteur." onCommit={(s) => edit((p) => updateMeterRef(p, inst.id, el.id, s ? { id: s, status: m?.status ?? 'existant-communicant', ct: m?.ct } : undefined))} />
          {m && <>
            <SelectField label="Statut" value={m.status} options={(Object.keys(STATUS_LABEL) as MeterStatus[]).map((s) => ({ value: s, label: STATUS_LABEL[s] }))} onChange={(v) => edit((p) => updateMeterRef(p, inst.id, el.id, { ...m, status: v }))} />
            <TextField label="Rapport de TC" value={m.ct ?? ''} placeholder="400/5" onCommit={(s) => edit((p) => updateMeterRef(p, inst.id, el.id, { ...m, ct: s || undefined }))} />
          </>}
        </div>
      </div>

      <TextField label="Commentaire" value={el.comment ?? ''} onCommit={(s) => up({ comment: s || undefined })} />

      <datalist id="cal-list">{electrique.series.calibres_A.map((x) => <option key={x} value={x} />)}</datalist>
      <datalist id="sec-list">{electrique.series.sections_mm2.map((x) => <option key={x} value={x} />)}</datalist>
      <datalist id="icu-list">{electrique.series.pouvoirsCoupure_kA.map((x) => <option key={x} value={x} />)}</datalist>
      <datalist id="tr-list">{electrique.series.transformateurs_kVA.map((x) => <option key={x} value={x} />)}</datalist>
    </div>
  );
}
