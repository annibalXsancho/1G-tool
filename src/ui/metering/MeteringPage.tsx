'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { fmtNum } from '@/core/fmt';
import type { Sheet } from '@/core/sheet';
import { buildTree, pathOf, planStats, recommend, type Issue } from '@/metering/analyse';
import { toDrawio } from '@/metering/drawio';
import { addMeter, addPlan, applyRecommendations, removeMeter, removePlan, updateMeter, updateNode } from '@/metering/edit';
import { parseProject, projectToSheets } from '@/metering/excel';
import { EXEMPLE_PROJET } from '@/metering/exemple';
import { layoutPlan } from '@/metering/layout';
import { FLAG_LABEL, KIND_LABEL, STATUS_LABEL, type MeterStatus, type NodeFlag, type Plan, type Scenario } from '@/metering/model';
import { downloadBlob, fileSafe } from '@/lib/download';
import { useProject } from '@/lib/plan-store';
import { exportPngElement, exportSvgElement } from '@/lib/svg-export';
import { readSheets, writeSheets } from '@/lib/xlsx';
import { IconAlert, IconInfo, IconWarn } from '../icons';
import PlotlyChart from '../charts/PlotlyChart';
import PlanSvg, { LIGHT_COLORS, SCREEN_COLORS, STATE_TEXT, type Selection } from './PlanSvg';
import { buildCoverageBars, buildTreemap } from './charts';
import { MetersTable, NodesTable, PlanInfoForm } from './Editors';

type Tab = 'plan' | 'couverture' | 'compteurs' | 'donnees';
const pct = (v: number) => `${fmtNum(v * 100, 3)} %`;

function Issues({ issues, onSelect }: { issues: Issue[]; onSelect?: (s: Selection) => void }) {
  if (issues.length === 0) return <p className="text-[13px] text-ink-2">Aucune anomalie détectée.</p>;
  const order = { erreur: 0, avertissement: 1, info: 2 };
  return (
    <ul className="space-y-1.5">
      {[...issues].sort((a, b) => order[a.level] - order[b.level]).map((i, k) => (
        <li key={k} className={`flex gap-2 text-[13px] ${i.level === 'erreur' ? 'border-l-4 border-err bg-err-soft p-2' : i.level === 'avertissement' ? 'border-l-4 border-warn bg-warn-soft p-2' : 'p-1 text-ink-2'}`}>
          <span className={`mt-0.5 ${i.level === 'erreur' ? 'text-err' : i.level === 'avertissement' ? 'text-warn' : 'text-ink-3'}`}>{i.level === 'erreur' ? <IconAlert /> : i.level === 'avertissement' ? <IconWarn /> : <IconInfo />}</span>
          <span className="flex-1">{i.message}</span>
          {onSelect && (i.node || i.meter) && <button type="button" className="shrink-0 text-[12px] text-accent underline-offset-2 hover:underline" onClick={() => onSelect({ node: i.node, meter: i.meter })}>Voir</button>}
        </li>
      ))}
    </ul>
  );
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'warn' }) {
  return (
    <div className="bg-surface p-3">
      <div className="text-[12px] text-ink-2">{label}</div>
      <div className={`num text-[22px] font-medium leading-tight ${tone === 'warn' ? 'text-warn' : ''}`}>{value}</div>
      {sub && <div className="text-[12px] text-ink-3">{sub}</div>}
    </div>
  );
}

export default function MeteringPage() {
  const { project, ready, replace, edit, undo, canUndo } = useProject();
  const [planId, setPlanId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('plan');
  const [scenario, setScenario] = useState<Scenario>('actuel');
  const [showIds, setShowIds] = useState(true);
  const [selection, setSelection] = useState<Selection>(null);
  const [target, setTarget] = useState(95);
  const [importIssues, setImportIssues] = useState<Issue[]>([]);
  const [busy, setBusy] = useState(false);
  const [date, setDate] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const sheetRef = useRef<SVGSVGElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [boxW, setBoxW] = useState(0);
  const [zoom, setZoom] = useState<'fit' | number>('fit');

  const hasBox = !!project;
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBoxW(el.clientWidth));
    ro.observe(el);
    setBoxW(el.clientWidth);
    return () => ro.disconnect();
  }, [hasBox, tab]);

  useEffect(() => setDate(new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })), []);

  const plan: Plan | null = project ? project.plans.find((p) => p.id === planId) ?? project.plans[0] ?? null : null;
  const stats = useMemo(() => (plan ? planStats(plan) : null), [plan]);
  const layout = useMemo(() => (plan ? layoutPlan(plan, scenario) : null), [plan, scenario]);
  const recs = useMemo(() => (plan ? recommend(plan, { target: target / 100 }) : []), [plan, target]);
  const tree = useMemo(() => (plan ? buildTree(plan) : null), [plan]);
  const bars = useMemo(() => (stats ? buildCoverageBars(stats.actual, stats.target) : null), [stats]);
  const treemap = useMemo(() => (plan ? buildTreemap(plan, scenario) : null), [plan, scenario]);

  async function onFile(file: File) {
    setBusy(true);
    try {
      const { project: p, issues } = parseProject(await readSheets(file));
      if (!p.name) p.name = file.name.replace(/\.xlsx$/i, '');
      setImportIssues(issues);
      if (p.plans.length > 0) { replace(p); setPlanId(p.plans[0].id); setSelection(null); }
    } catch (e) {
      setImportIssues([{ level: 'erreur', message: `Lecture du fichier impossible : ${e instanceof Error ? e.message : String(e)}. Format attendu : .xlsx.` }]);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  const base = fileSafe(plan?.name ?? 'plan');
  const info = { projectName: project?.name ?? '', date, coveragePct: stats ? pct(stats.actual.coverage) : '—', targetPct: stats ? pct(stats.target.coverage) : '—' };

  function deliverableSheets(): Sheet[] {
    if (!plan || !stats || !tree) return [];
    const cap = (id: string) => plan.nodes.find((n) => n.id === id)?.rated ?? null;
    return [
      {
        sheet: 'Fiches compteurs',
        data: [
          ['Repère', 'Poste mesuré', 'Chemin', 'Statut', 'Appareil', 'Grandeurs', 'Communication', 'Adresse', 'TC', 'Classe', 'Localisation', `Capacité du poste (${plan.ratedUnit})`, 'Commentaire'],
          ...plan.meters.map((m) => [m.id, plan.nodes.find((n) => n.id === m.node)?.label ?? m.node, pathOf(tree, m.node), STATUS_LABEL[m.status], m.device ?? null, m.quantity ?? null, m.comm ?? null, m.address ?? null, m.ct ?? null, m.accuracy ?? null, m.location ?? null, cap(m.node), m.comment ?? null]),
        ],
      },
      {
        sheet: 'Couverture',
        data: [
          ['Indicateur', 'État actuel', 'Scénario cible'],
          ['Taux de couverture', Number(stats.actual.coverage.toFixed(4)), Number(stats.target.coverage.toFixed(4))],
          ['Base de pondération', stats.actual.basis, stats.target.basis],
          ['Part mesurée directement', Number((stats.actual.byState.mesure / (stats.actual.total || 1)).toFixed(4)), Number((stats.target.byState.mesure / (stats.target.total || 1)).toFixed(4))],
          ['Part déduite par différence', Number((stats.actual.byState.difference / (stats.actual.total || 1)).toFixed(4)), Number((stats.target.byState.difference / (stats.target.total || 1)).toFixed(4))],
          ['Part non instrumentée', Number((stats.actual.byState.inconnu / (stats.actual.total || 1)).toFixed(4)), Number((stats.target.byState.inconnu / (stats.target.total || 1)).toFixed(4))],
          ['Compteurs existants communicants', stats.meters['existant-communicant'], null],
          ['Compteurs existants à relevé manuel', stats.meters['existant-manuel'], null],
          ['Compteurs à installer', stats.meters['a-installer'], null],
        ],
      },
      {
        sheet: 'Postes par état',
        data: [
          ['Poste', 'Type', 'Chemin', 'État actuel', 'État cible', 'Part du total'],
          ...plan.nodes.map((n) => [n.label, KIND_LABEL[n.kind], pathOf(tree, n.id), STATE_TEXT[stats.actual.state.get(n.id) ?? 'inconnu'].toLowerCase(), STATE_TEXT[stats.target.state.get(n.id) ?? 'inconnu'].toLowerCase(), stats.actual.weight.has(n.id) ? Number(((stats.actual.weight.get(n.id) ?? 0) / (stats.actual.total || 1)).toFixed(4)) : null]),
        ],
      },
      { sheet: 'Contrôles', data: [['Niveau', 'Message'], ...stats.issues.map((i) => [i.level, i.message])] },
      { sheet: 'Recommandations', data: [['Étape', 'Poste à instrumenter', 'Gain de couverture', 'Couverture cumulée'], ...recs.map((r, i) => [i + 1, plan.nodes.find((n) => n.id === r.node)?.label ?? r.node, Number(r.gain.toFixed(4)), Number(r.coverageAfter.toFixed(4))])] },
    ];
  }

  const toolbar = (
    <div className="flex flex-wrap gap-2">
      <input ref={fileRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
      <button type="button" className="btn !border-accent !bg-accent !text-accent-ink" disabled={busy} onClick={() => fileRef.current?.click()}>{busy ? 'Lecture…' : 'Importer un fichier Excel'}</button>
      <button type="button" className="btn" onClick={() => writeSheets(projectToSheets(EXEMPLE_PROJET), 'gabarit-plans-de-comptage.xlsx')}>Télécharger le gabarit Excel</button>
      {project && <button type="button" className="btn" onClick={() => writeSheets(projectToSheets(project), `plans-de-comptage-${fileSafe(project.name || 'projet')}.xlsx`)}>Exporter le projet (Excel)</button>}
      <button type="button" className="btn" onClick={() => { replace(structuredClone(EXEMPLE_PROJET)); setPlanId(EXEMPLE_PROJET.plans[0].id); setImportIssues([]); setSelection(null); }}>Charger l’exemple</button>
      {project && <button type="button" className="btn" disabled={!canUndo} onClick={undo} title="Annuler la dernière modification">↶ Annuler</button>}
      {project && <button type="button" className="btn" onClick={() => { if (confirm('Effacer le projet enregistré dans ce navigateur ?')) { replace(null); setPlanId(null); setImportIssues([]); } }}>Vider</button>}
    </div>
  );

  if (!ready) return <div className="h-64 animate-pulse bg-sunken" aria-busy="true" />;

  const nodeMeters = selection?.node && plan ? plan.meters.filter((m) => m.node === selection.node) : [];
  const selNode = selection?.node && plan ? plan.nodes.find((n) => n.id === selection.node) : undefined;
  const nIssues = stats ? stats.issues.filter((i) => i.level !== 'info').length : 0;

  return (
    <>
      <div className="screen-only space-y-4">
        <div>
          <p className="eyebrow">Site & livrables</p>
          <h1 className="text-[22px] font-semibold leading-tight tracking-tight sm:text-[26px]">Plans de comptage{project?.name ? <span className="text-ink-3"> · {project.name}</span> : null}</h1>
          <p className="mt-0.5 max-w-prose text-[13px] text-ink-2">Schéma de distribution (électricité, gaz, vapeur…) généré automatiquement, avec l’état des compteurs, le taux de couverture, les angles morts et un plan d’instrumentation recommandé.</p>
        </div>
        {toolbar}
        {importIssues.length > 0 && <section className="border bg-surface p-4"><h2 className="eyebrow mb-2">Compte rendu d’import</h2><Issues issues={importIssues} /></section>}

        {!project || !plan || !stats || !layout || !tree ? (
          <section className="grid gap-4 border bg-surface p-4 md:grid-cols-2">
            <div className="space-y-2 text-[13px] text-ink-2">
              <h2 className="text-[15px] font-semibold text-ink">Préparer le fichier Excel</h2>
              <p>Une feuille <strong className="text-ink">Postes</strong> : une ligne par poste (arrivée, transformateur, tableau, départ, groupe électrogène…) avec son <em>Parent</em> (le poste qui l’alimente), sa capacité nominale et, si possible, sa consommation annuelle estimée.</p>
              <p>Une feuille <strong className="text-ink">Compteurs</strong> : une ligne par compteur existant ou prévu, avec le poste qu’il mesure, son statut, sa communication et son rapport de TC.</p>
              <p>Facultatif : une feuille <strong className="text-ink">Plans</strong> (site, énergie, version, auteur) et une colonne <em>Plan</em> pour mettre plusieurs sites ou réseaux dans le même classeur.</p>
              <p>Le plus simple : télécharger le gabarit, prérempli avec un exemple fictif.</p>
            </div>
            <div className="border-l-4 border-accent bg-accent-soft p-3 text-[13px]">
              <p className="mb-1 font-medium">Ce que l’outil produit</p>
              <ul className="list-disc space-y-1 pl-4 text-ink-2">
                <li>le <strong className="text-ink">plan</strong> auto-disposé, exportable en PNG, SVG, draw.io et A4 paysage avec cartouche ;</li>
                <li>le <strong className="text-ink">taux de couverture</strong> actuel et cible, pondéré par la consommation ou la puissance ;</li>
                <li>les <strong className="text-ink">angles morts</strong> et les postes déductibles par différence ;</li>
                <li>un <strong className="text-ink">plan d’instrumentation minimal</strong> pour atteindre l’objectif ;</li>
                <li>les <strong className="text-ink">fiches compteurs</strong> en Excel.</li>
              </ul>
            </div>
          </section>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Plans">
              {project.plans.map((p) => (
                <button key={p.id} type="button" role="tab" aria-selected={p.id === plan.id} onClick={() => { setPlanId(p.id); setSelection(null); }}
                  className={`min-h-9 border px-3 text-[13px] ${p.id === plan.id ? 'border-accent bg-accent-soft font-medium' : 'border-rule-strong bg-bg text-ink-2 hover:text-ink'}`}>{p.name}</button>
              ))}
              <button type="button" className="btn !min-h-9" onClick={() => { const name = prompt('Nom du nouveau plan ?', 'Nouveau plan'); if (name?.trim()) { const r = addPlan(project, name.trim()); edit(() => r.project); setPlanId(r.id); } }}>+ Plan</button>
              {project.plans.length > 1 && <button type="button" className="btn !min-h-9" onClick={() => { if (confirm(`Supprimer le plan « ${plan.name} » ?`)) { edit((p) => removePlan(p, plan.id)); setPlanId(null); } }}>Supprimer ce plan</button>}
            </div>

            <div className="grid grid-cols-2 gap-px border bg-rule lg:grid-cols-4">
              <Kpi label="Couverture actuelle" value={pct(stats.actual.coverage)} sub={`base : ${stats.actual.basis}`} tone={stats.actual.coverage < 0.8 ? 'warn' : undefined} />
              <Kpi label="Couverture cible" value={pct(stats.target.coverage)} sub={`${stats.target.coverage - stats.actual.coverage >= 0 ? '+' : ''}${fmtNum((stats.target.coverage - stats.actual.coverage) * 100, 3)} pts avec les compteurs prévus`} />
              <Kpi label="Compteurs" value={String(plan.meters.length)} sub={`${stats.meters['existant-communicant']} communicants · ${stats.meters['existant-manuel']} manuels · ${stats.meters['a-installer']} à installer`} />
              <Kpi label="Points d’attention" value={String(nIssues)} sub={`sur ${stats.issues.length} contrôles`} tone={nIssues > 0 ? 'warn' : undefined} />
            </div>

            <div role="tablist" className="flex gap-px overflow-x-auto border-b border-rule-strong">
              {([['plan', 'Plan'], ['couverture', 'Couverture & recommandations'], ['compteurs', 'Fiches compteurs'], ['donnees', `Données & contrôles${nIssues ? ` (${nIssues})` : ''}`]] as [Tab, string][]).map(([t, l]) => (
                <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`-mb-px min-h-11 shrink-0 border-b-2 px-3 text-[13px] ${tab === t ? 'border-accent font-medium text-ink' : 'border-transparent text-ink-2 hover:text-ink'}`}>{l}</button>
              ))}
            </div>

            {(tab === 'plan' || tab === 'couverture') && (
              <div className="flex flex-wrap items-center gap-3">
                <div role="radiogroup" aria-label="Scénario" className="flex overflow-hidden rounded-[3px] border border-rule-strong text-[13px]">
                  {(['actuel', 'cible'] as Scenario[]).map((s) => (
                    <button key={s} type="button" role="radio" aria-checked={scenario === s} onClick={() => setScenario(s)} className={`min-h-9 px-3 ${scenario === s ? 'bg-accent font-medium text-accent-ink' : 'bg-bg text-ink-2 hover:text-ink'}`}>{s === 'actuel' ? 'État actuel' : 'Scénario cible'}</button>
                  ))}
                </div>
                <span className="text-[12px] text-ink-3">{scenario === 'actuel' ? 'Seuls les compteurs existants comptent.' : 'Les compteurs à installer comptent aussi.'}</span>
              </div>
            )}

            {tab === 'plan' && (
              <section className="border bg-surface p-4">
                <div className="mb-3 flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" checked={showIds} onChange={(e) => setShowIds(e.target.checked)} />Repères des compteurs</label>
                  <div className="flex items-center gap-1" role="group" aria-label="Zoom">
                    <button type="button" className="btn !min-h-9 !px-2.5" aria-label="Réduire" onClick={() => setZoom((z) => Math.max(0.35, (z === 'fit' ? Math.min(1.25, Math.max(0.35, (boxW - 26) / layout.width)) : z) - 0.15))}>−</button>
                    <button type="button" className="btn !min-h-9 !px-2.5" aria-pressed={zoom === 'fit'} onClick={() => setZoom('fit')}>Ajuster</button>
                    <button type="button" className="btn !min-h-9 !px-2.5" aria-label="Agrandir" onClick={() => setZoom((z) => Math.min(2, (z === 'fit' ? Math.min(1.25, Math.max(0.35, (boxW - 26) / layout.width)) : z) + 0.15))}>+</button>
                  </div>
                  <div className="ml-auto flex flex-wrap gap-2">
                    <button type="button" className="btn" onClick={() => sheetRef.current && exportPngElement(sheetRef.current, `plan-comptage-${base}.png`)}>PNG</button>
                    <button type="button" className="btn" onClick={() => sheetRef.current && exportSvgElement(sheetRef.current, `plan-comptage-${base}.svg`)}>SVG</button>
                    <button type="button" className="btn" onClick={() => downloadBlob(new Blob([toDrawio(plan, layout)], { type: 'application/vnd.jgraph.mxfile' }), `plan-comptage-${base}.drawio`)} title="Fichier modifiable dans diagrams.net">draw.io</button>
                    <button type="button" className="btn" onClick={() => window.print()} title="A4 paysage avec cartouche : choisir « Enregistrer au format PDF »">Imprimer / PDF</button>
                  </div>
                </div>
                <div ref={boxRef} className="overflow-auto border bg-bg p-3" style={{ maxHeight: '72vh' }}>
                  <PlanSvg plan={plan} layout={layout} colors={SCREEN_COLORS} variant="screen" selection={selection} onSelect={setSelection} showMeterIds={showIds}
                    scale={zoom === 'fit' ? Math.min(1.25, Math.max(0.35, (boxW - 26) / layout.width)) : zoom} />
                </div>
                <p className="mt-2 text-[12px] text-ink-3">Cliquez sur un poste ou un compteur pour le détailler et le modifier. Les exports (PNG, SVG, A4) incluent la légende et le cartouche, en thème clair.</p>

                <div className="mt-3 border-t pt-3">
                  {selNode ? (
                    <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
                      <div className="space-y-1 text-[13px]">
                        <h3 className="text-[15px] font-semibold">{selNode.label}</h3>
                        <p className="text-ink-2">{pathOf(tree, selNode.id)}</p>
                        <p>{KIND_LABEL[selNode.kind]}{selNode.rated ? ` · ${fmtNum(selNode.rated, 4)} ${plan.ratedUnit}` : ''}{selNode.annualMWh ? ` · ${fmtNum(selNode.annualMWh, 4)} MWh/an` : ''}</p>
                        <p><span className="text-ink-3">État ({scenario}) :</span> <strong>{STATE_TEXT[(scenario === 'actuel' ? stats.actual : stats.target).state.get(selNode.id) ?? 'inconnu'].toLowerCase()}</strong></p>
                        {selNode.comment && <p className="text-ink-2">{selNode.comment}</p>}
                        <label className="mt-2 block text-[12px] text-ink-2">Statut du poste
                          <select className="mt-0.5 h-9 w-full border border-rule bg-bg px-2 text-[13px]" value={selNode.flag} onChange={(e) => edit((p) => updateNode(p, plan.id, selNode.id, { flag: e.target.value as NodeFlag }))}>
                            {(Object.keys(FLAG_LABEL) as NodeFlag[]).map((f) => <option key={f} value={f}>{FLAG_LABEL[f]}</option>)}
                          </select>
                        </label>
                      </div>
                      <div>
                        <h3 className="mb-1 text-[13px] font-semibold">Compteurs sur ce poste ({nodeMeters.length})</h3>
                        {nodeMeters.length === 0 && <p className="text-[13px] text-ink-3">Aucun compteur : ce poste est {STATE_TEXT[stats.actual.state.get(selNode.id) ?? 'inconnu'].toLowerCase()}.</p>}
                        <ul className="space-y-1.5">
                          {nodeMeters.map((m) => (
                            <li key={m.id} className={`flex flex-wrap items-center gap-2 border p-2 text-[13px] ${selection?.meter === m.id ? 'border-ink' : ''}`}>
                              <span className="num font-medium">{m.id}</span>
                              <select aria-label={`Statut de ${m.id}`} className="h-8 border border-rule bg-bg px-1 text-[12px]" value={m.status} onChange={(e) => edit((p) => updateMeter(p, plan.id, m.id, { status: e.target.value as MeterStatus }))}>
                                {(Object.keys(STATUS_LABEL) as MeterStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                              </select>
                              <span className="text-ink-2">{[m.device, m.comm, m.ct && `TC ${m.ct}`].filter(Boolean).join(' · ')}</span>
                              <button type="button" className="btn !min-h-8 !px-2 ml-auto" aria-label={`Supprimer ${m.id}`} onClick={() => edit((p) => removeMeter(p, plan.id, m.id))}>Supprimer</button>
                            </li>
                          ))}
                        </ul>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <button type="button" className="btn" onClick={() => { const r = addMeter(project, plan.id, selNode.id, 'a-installer'); edit(() => r.project); setSelection({ node: selNode.id, meter: r.id }); }}>+ Compteur à installer</button>
                          <button type="button" className="btn" onClick={() => { const r = addMeter(project, plan.id, selNode.id, 'existant-manuel'); edit(() => r.project); setSelection({ node: selNode.id, meter: r.id }); }}>+ Compteur existant</button>
                        </div>
                      </div>
                    </div>
                  ) : <p className="text-[13px] text-ink-3">Aucune sélection.</p>}
                </div>
              </section>
            )}

            {tab === 'couverture' && bars && treemap && (
              <div className="space-y-4">
                <section className="border bg-surface p-4">
                  <h2 className="eyebrow mb-1">Taux de couverture</h2>
                  <p className="mb-2 text-[12px] text-ink-3">Part du total dont la consommation est connue : mesurée directement ou déduite par différence (un seul départ non compté sous un compteur amont). Pondération : {stats.actual.basis === 'annuel' ? 'consommation annuelle estimée' : stats.actual.basis === 'puissance' ? 'puissance installée' : 'nombre de postes (renseigner puissance ou consommation pour pondérer)'}.</p>
                  <PlotlyChart build={bars} height={230} label="Part du total mesurée, déduite ou non instrumentée, état actuel et scénario cible" exportName={`couverture-${base}`} />
                </section>
                <section className="border bg-surface p-4">
                  <h2 className="eyebrow mb-1">Carte de l’installation ({scenario === 'actuel' ? 'état actuel' : 'scénario cible'})</h2>
                  <p className="mb-2 text-[12px] text-ink-3">Surface = poids du poste. Teal : connu ; jaune : angle mort. Cliquer sur un bloc pour zoomer dans la hiérarchie.</p>
                  <PlotlyChart build={treemap} height={420} label="Carte de l’installation par état de mesure" exportName={`carte-${base}`} />
                </section>
                <section className="border bg-surface p-4">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
                    <h2 className="eyebrow">Plan d’instrumentation recommandé</h2>
                    <label className="flex items-center gap-2 text-[13px]">Couverture visée
                      <input type="number" min={50} max={100} step={1} value={target} onChange={(e) => setTarget(Math.min(100, Math.max(50, Number(e.target.value) || 95)))} className="num h-9 w-20 border border-rule bg-bg px-2 text-right" /> %
                    </label>
                  </div>
                  {recs.length === 0 ? (
                    <p className="text-[13px] text-ink-2">{stats.target.coverage >= target / 100 - 1e-9 ? `Objectif atteint avec les compteurs déjà prévus (${pct(stats.target.coverage)}).` : 'Aucun compteur supplémentaire ne permet d’améliorer la couverture : compléter les capacités ou consommations des postes.'}</p>
                  ) : (
                    <>
                      <p className="mb-2 text-[13px] text-ink-2">En plus des compteurs déjà prévus, <strong className="text-ink">{recs.length} compteur{recs.length > 1 ? 's' : ''}</strong> permet{recs.length > 1 ? 'tent' : ''} d’atteindre {pct(recs.at(-1)!.coverageAfter)}. Un poste non compté déductible par différence ne nécessite pas de compteur.</p>
                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse text-[13px]">
                          <thead><tr className="border-b border-rule-strong text-left text-ink-2"><th className="py-1.5 pr-2 font-medium">#</th><th className="py-1.5 pr-2 font-medium">Poste à instrumenter</th><th className="py-1.5 pr-2 font-medium">Chemin</th><th className="py-1.5 pr-2 text-right font-medium">Gain</th><th className="py-1.5 pr-2 text-right font-medium">Couverture</th><th /></tr></thead>
                          <tbody>
                            {recs.map((r, i) => (
                              <tr key={r.node} className="border-t">
                                <td className="num py-1.5 pr-2">{i + 1}</td>
                                <td className="py-1.5 pr-2 font-medium">{plan.nodes.find((n) => n.id === r.node)?.label}</td>
                                <td className="py-1.5 pr-2 text-ink-2">{pathOf(tree, r.node)}</td>
                                <td className="num py-1.5 pr-2 text-right">+{fmtNum(r.gain * 100, 3)} pts</td>
                                <td className="num py-1.5 pr-2 text-right">{pct(r.coverageAfter)}</td>
                                <td className="py-1.5 text-right"><button type="button" className="btn !min-h-8" onClick={() => edit((p) => addMeter(p, plan.id, r.node, 'a-installer', { comment: 'Recommandé par l’analyse de couverture.' }).project)}>Ajouter</button></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <button type="button" className="btn mt-2" onClick={() => edit((p) => applyRecommendations(p, plan.id, recs))}>Ajouter les {recs.length} compteurs recommandés au plan</button>
                    </>
                  )}
                </section>
              </div>
            )}

            {tab === 'compteurs' && (
              <section className="space-y-3 border bg-surface p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="eyebrow">Fiches compteurs ({plan.meters.length})</h2>
                  <button type="button" className="btn" onClick={() => writeSheets(deliverableSheets(), `livrable-comptage-${base}.xlsx`)}>Exporter fiches, couverture et recommandations (Excel)</button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] border-collapse text-[13px]">
                    <thead><tr className="border-b border-rule-strong text-left text-ink-2">{['Repère', 'Poste mesuré', 'Statut', 'Appareil', 'Communication', 'TC', 'Classe', 'Localisation'].map((h) => <th key={h} className="py-1.5 pr-3 font-medium">{h}</th>)}</tr></thead>
                    <tbody>
                      {plan.meters.map((m) => (
                        <tr key={m.id} className="border-t align-top">
                          <td className="num py-1.5 pr-3 font-medium">{m.id}</td>
                          <td className="py-1.5 pr-3"><span className="block">{plan.nodes.find((n) => n.id === m.node)?.label ?? m.node}</span><span className="block text-[12px] text-ink-3">{pathOf(tree, m.node)}</span></td>
                          <td className="py-1.5 pr-3"><span className={`inline-block border px-1.5 text-[11px] ${m.status === 'a-installer' ? 'border-warn text-warn' : m.status === 'existant-communicant' ? 'border-accent text-accent' : 'border-rule-strong text-ink-2'}`}>{STATUS_LABEL[m.status]}</span></td>
                          <td className="py-1.5 pr-3">{m.device ?? ''}</td><td className="py-1.5 pr-3">{[m.comm, m.address && `adr. ${m.address}`].filter(Boolean).join(' · ')}</td>
                          <td className="num py-1.5 pr-3">{m.ct ?? ''}</td><td className="py-1.5 pr-3">{m.accuracy ?? ''}</td><td className="py-1.5 pr-3">{m.location ?? ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {plan.meters.length === 0 && <p className="text-[13px] text-ink-3">Aucun compteur dans ce plan.</p>}
              </section>
            )}

            {tab === 'donnees' && (
              <div className="space-y-4">
                <section className="border bg-surface p-4"><h2 className="eyebrow mb-2">Cartouche du plan</h2><PlanInfoForm plan={plan} edit={edit} /></section>
                <section className="border bg-surface p-4"><h2 className="eyebrow mb-2">Contrôles de cohérence</h2><Issues issues={stats.issues} onSelect={(s) => { setSelection(s); setTab('plan'); }} /></section>
                <section className="border bg-surface p-4"><h2 className="eyebrow mb-2">Postes ({plan.nodes.length}) — modifiables</h2><NodesTable plan={plan} edit={edit} selected={selection?.node} onSelect={(id) => setSelection({ node: id })} /></section>
                <section className="border bg-surface p-4"><h2 className="eyebrow mb-2">Compteurs ({plan.meters.length}) — modifiables</h2><MetersTable plan={plan} edit={edit} selected={selection?.meter} onSelect={(id) => setSelection({ node: plan.meters.find((m) => m.id === id)?.node, meter: id })} /></section>
              </div>
            )}
          </>
        )}
      </div>

      {/* Feuille A4 paysage : masquée à l'écran, source des exports PNG/SVG et de l'impression. */}
      {plan && layout && (
        <div className="print-only print-plan">
          <PlanSvg ref={sheetRef} plan={plan} layout={layout} colors={LIGHT_COLORS} variant="sheet" showMeterIds={showIds} info={info} />
        </div>
      )}
    </>
  );
}
