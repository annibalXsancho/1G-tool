'use client';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { fmtNum } from '@/core/fmt';
import { fromSI } from '@/core/units';
import { analyse, type Issue, type SiteAnalysis } from '@/site/analyse';
import { modelToSheets, parseWorkbook, type Sheet } from '@/site/excel';
import { EXEMPLE_SITE } from '@/site/exemple';
import { KIND_LABEL, STATUS_LABEL, type SiteModel } from '@/site/model';
import { fileSafe } from '@/lib/download';
import { useSiteModel } from '@/lib/site-store';
import { IconAlert, IconInfo, IconWarn } from '../icons';
import PlotlyChart, { exportChart } from '../charts/PlotlyChart';
import { carrierColors } from './carriers';
import { buildPurchaseBars, buildSankey, buildUsageBars, type SankeyOptions } from './charts';

type Tab = 'sankey' | 'bilan' | 'donnees';
const MWh = (j: number) => fmtNum(fromSI(j, 'energy', 'MWh'), 4);
const MWhCell = (j: number) => Number(fromSI(j, 'energy', 'MWh').toPrecision(10));

async function writeSheets(sheets: Sheet[], filename: string) {
  const { default: writeExcelFile } = await import('write-excel-file/browser');
  await writeExcelFile(sheets.map((s) => ({ sheet: s.sheet, data: s.data.map((r) => r.map((c) => (c === undefined ? null : c))) }))).toFile(filename);
}

function bilanSheets(model: SiteModel, a: SiteAnalysis): Sheet[] {
  const label = (id: string) => model.nodes.find((n) => n.id === id)?.label ?? 'Pertes de transformation';
  return [
    {
      sheet: 'Bilan par poste',
      data: [
        ['Poste', 'Type', 'Zone', 'Entrées (MWh/an)', 'Sorties (MWh/an)', 'Pertes (MWh/an)', 'Rendement apparent'],
        ...a.balances.map((b) => [b.node.label, KIND_LABEL[b.node.kind], b.node.zone ?? null, MWhCell(b.in), MWhCell(b.out), MWhCell(b.losses), b.efficiency === null ? null : Number(b.efficiency.toFixed(4))]),
      ],
    },
    {
      sheet: 'Flux (avec pertes)',
      data: [
        ['De', 'Vers', 'Énergie', 'Quantité (MWh/an)', 'Statut', 'Compteur', 'Commentaire'],
        ...a.links.map((l) => [label(l.from), label(l.to), l.carrier, MWhCell(l.value), STATUS_LABEL[l.status], l.meter ?? null, l.comment ?? null]),
      ],
    },
    {
      sheet: 'Synthèse',
      data: [
        ['Indicateur', 'Valeur (MWh/an)'],
        ['Énergie achetée', MWhCell(a.totals.purchased)],
        ['Usages finaux', MWhCell(a.totals.final)],
        ['Pertes de transformation', MWhCell(a.totals.losses)],
        ...a.totals.byCarrier.map((c) => [`Achat — ${c.carrier}`, MWhCell(c.value)]),
        ['Flux mesurés', MWhCell(a.totals.byStatus.mesure)],
        ['Flux estimés', MWhCell(a.totals.byStatus.estime)],
        ['Flux calculés', MWhCell(a.totals.byStatus.calcule)],
      ],
    },
  ];
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-surface p-3">
      <div className="text-[12px] text-ink-2">{label}</div>
      <div className="num text-[22px] font-medium leading-tight">{value}</div>
      {sub && <div className="text-[12px] text-ink-3">{sub}</div>}
    </div>
  );
}

function Issues({ issues }: { issues: Issue[] }) {
  if (issues.length === 0) return <p className="text-[13px] text-ink-2">Aucune anomalie détectée.</p>;
  const order = { erreur: 0, avertissement: 1, info: 2 };
  return (
    <ul className="space-y-1.5">
      {[...issues].sort((a, b) => order[a.level] - order[b.level]).map((i, k) => (
        <li key={k} className={`flex gap-2 text-[13px] ${i.level === 'erreur' ? 'border-l-4 border-err bg-err-soft p-2' : i.level === 'avertissement' ? 'border-l-4 border-warn bg-warn-soft p-2' : 'p-1 text-ink-2'}`}>
          <span className={`mt-0.5 ${i.level === 'erreur' ? 'text-err' : i.level === 'avertissement' ? 'text-warn' : 'text-ink-3'}`}>
            {i.level === 'erreur' ? <IconAlert /> : i.level === 'avertissement' ? <IconWarn /> : <IconInfo />}
          </span>
          <span>{i.sheet ? <span className="text-ink-2">{i.sheet}{i.row ? `, ligne ${i.row}` : ''} : </span> : null}{i.message}</span>
        </li>
      ))}
    </ul>
  );
}

function Table({ head, rows, numeric = [] }: { head: string[]; rows: ReactNode[][]; numeric?: number[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-rule-strong">
            {head.map((h, j) => <th key={j} className={`whitespace-nowrap py-1.5 pr-3 font-medium text-ink-2 ${numeric.includes(j) ? 'text-right' : 'text-left'}`}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t">
              {r.map((c, j) => <td key={j} className={`py-1.5 pr-3 align-top ${numeric.includes(j) ? 'num text-right' : ''}`}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const StatusChip = ({ s }: { s: keyof typeof STATUS_LABEL }) => (
  <span className={`inline-block border px-1.5 text-[11px] ${s === 'mesure' ? 'border-accent text-accent' : 'border-rule-strong text-ink-2'}`}>{STATUS_LABEL[s]}</span>
);

export default function SitePage() {
  const [model, setModel, ready] = useSiteModel();
  const [importIssues, setImportIssues] = useState<Issue[]>([]);
  const [tab, setTab] = useState<Tab>('sankey');
  const [opts, setOpts] = useState<SankeyOptions>({ unit: 'MWh', showLosses: true });
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const analysis = useMemo(() => (model ? analyse(model) : null), [model]);
  const sankey = useMemo(() => (model && analysis ? buildSankey(model, analysis, opts) : null), [model, analysis, opts]);
  const usageBars = useMemo(() => (model && analysis ? buildUsageBars(model, analysis) : null), [model, analysis]);
  const purchaseBars = useMemo(() => (analysis ? buildPurchaseBars(analysis) : null), [analysis]);
  const sankeyHeight = model ? Math.max(460, model.nodes.length * 44 + 120) : 460;
  const base = fileSafe(model?.name || 'site');

  async function onFile(file: File) {
    setBusy(true);
    try {
      const { default: readExcelFile } = await import('read-excel-file/browser');
      const sheets = (await readExcelFile(file)) as Sheet[];
      const { model: m, issues } = parseWorkbook(sheets);
      if (!m.name) m.name = file.name.replace(/\.xlsx$/i, '');
      setImportIssues(issues);
      if (m.flows.length > 0) setModel(m);
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
      <button type="button" className="btn !border-accent !bg-accent !text-accent-ink" onClick={() => fileRef.current?.click()} disabled={busy}>{busy ? 'Lecture…' : 'Importer un fichier Excel'}</button>
      <button type="button" className="btn" onClick={() => writeSheets(modelToSheets(EXEMPLE_SITE), 'gabarit-modele-site.xlsx')}>Télécharger le gabarit Excel</button>
      {model && <button type="button" className="btn" onClick={() => writeSheets(modelToSheets(model), `modele-${base}.xlsx`)}>Exporter le modèle (Excel)</button>}
      <button type="button" className="btn" onClick={() => { setModel(structuredClone(EXEMPLE_SITE)); setImportIssues([]); }}>Charger l’exemple</button>
      {model && <button type="button" className="btn" onClick={() => { if (confirm('Effacer le modèle de site enregistré dans ce navigateur ?')) { setModel(null); setImportIssues([]); } }}>Vider</button>}
    </div>
  );

  if (!ready) return <div className="h-64 animate-pulse bg-sunken" aria-busy="true" />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Site & livrables</p>
          <h1 className="text-[22px] font-semibold leading-tight tracking-tight sm:text-[26px]">{model?.name || 'Modèle énergétique du site'}{model?.year ? <span className="text-ink-3"> · {model.year}</span> : null}</h1>
          <p className="mt-0.5 max-w-prose text-[13px] text-ink-2">Postes (sources, transformations, usages) et flux annuels d’énergie, importés depuis Excel. Sert de base au diagramme de Sankey, aux bilans et bientôt au plan de comptage.</p>
        </div>
      </div>
      {toolbar}
      {importIssues.length > 0 && (
        <section className="border bg-surface p-4">
          <h2 className="eyebrow mb-2">Compte rendu d’import</h2>
          <Issues issues={importIssues} />
        </section>
      )}

      {!model || !analysis ? (
        <section className="grid gap-4 border bg-surface p-4 md:grid-cols-2">
          <div className="space-y-2 text-[13px] text-ink-2">
            <h2 className="text-[15px] font-semibold text-ink">Préparer le fichier Excel</h2>
            <p>Une feuille <strong className="text-ink">Flux</strong> suffit, avec une ligne par flux annuel : <em>De</em>, <em>Vers</em>, <em>Énergie</em>, <em>Quantité</em> (MWh/an par défaut), et si possible <em>Statut</em> (mesuré, estimé, calculé) et <em>Compteur</em>.</p>
            <p>Feuilles facultatives : <strong className="text-ink">Postes</strong> (identifiant, libellé, type source / transformation / usage, zone) et <strong className="text-ink">Site</strong> (nom, année). Sans feuille Postes, le type est déduit : un poste qui ne fait qu’émettre est une source, un poste qui ne fait que recevoir est un usage.</p>
            <p>Le plus simple : télécharger le gabarit (prérempli avec un site exemple) et y coller vos données.</p>
          </div>
          <div className="border-l-4 border-accent bg-accent-soft p-3 text-[13px]">
            <p className="font-medium">Exemple de feuille Flux</p>
            <Table head={['De', 'Vers', 'Énergie', 'Quantité (MWh/an)', 'Statut']} numeric={[3]} rows={[
              ['Gaz naturel', 'Chaufferie vapeur', 'Gaz naturel', '18 000', 'mesuré'],
              ['Chaufferie vapeur', 'Atelier A', 'Vapeur', '8 500', 'estimé'],
              ['Électricité réseau', 'Atelier A', 'Électricité', '2 400', 'mesuré'],
            ]} />
          </div>
        </section>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-px border bg-rule lg:grid-cols-4">
            <Kpi label="Énergie achetée" value={`${MWh(analysis.totals.purchased)} MWh`} sub={analysis.totals.byCarrier.map((c) => `${c.carrier} ${fmtNum((c.value / (analysis.totals.purchased || 1)) * 100, 2)} %`).join(' · ')} />
            <Kpi label="Usages finaux" value={`${MWh(analysis.totals.final)} MWh`} />
            <Kpi label="Pertes de transformation" value={`${MWh(analysis.totals.losses)} MWh`} sub={`${fmtNum((analysis.totals.losses / (analysis.totals.purchased || 1)) * 100, 3)} % des achats`} />
            <Kpi label="Part des flux mesurés" value={`${fmtNum((analysis.totals.byStatus.mesure / ((analysis.totals.byStatus.mesure + analysis.totals.byStatus.estime + analysis.totals.byStatus.calcule) || 1)) * 100, 3)} %`} sub="en énergie, tous flux confondus" />
          </div>

          <div role="tablist" className="flex gap-px border-b border-rule-strong">
            {([['sankey', 'Diagramme de Sankey'], ['bilan', 'Bilan par poste'], ['donnees', `Données & contrôles${analysis.issues.some((i) => i.level !== 'info') ? ` (${analysis.issues.filter((i) => i.level !== 'info').length})` : ''}`]] as [Tab, string][]).map(([t, l]) => (
              <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
                className={`-mb-px min-h-11 border-b-2 px-3 text-[13px] ${tab === t ? 'border-accent font-medium text-ink' : 'border-transparent text-ink-2 hover:text-ink'}`}>{l}</button>
            ))}
          </div>

          {tab === 'sankey' && (
            <section className="border bg-surface p-4">
              <div className="mb-3 flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-[13px]">Unité
                  <select className="unit-select !min-h-9" value={opts.unit} onChange={(e) => setOpts({ ...opts, unit: e.target.value as SankeyOptions['unit'] })}>
                    {['MWh', 'GWh', 'tep'].map((u) => <option key={u}>{u}</option>)}
                  </select>
                </label>
                <label className="flex items-center gap-2 text-[13px]">
                  <input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" checked={opts.showLosses} onChange={(e) => setOpts({ ...opts, showLosses: e.target.checked })} />
                  Afficher les pertes de transformation
                </label>
                <div className="ml-auto flex gap-2">
                  <button type="button" className="btn" onClick={() => sankey && exportChart(sankey, 'png', `sankey-${base}`, { width: 1400, height: sankeyHeight + 80 })}>Exporter PNG</button>
                  <button type="button" className="btn" onClick={() => sankey && exportChart(sankey, 'svg', `sankey-${base}`, { width: 1400, height: sankeyHeight + 80 })}>Exporter SVG</button>
                </div>
              </div>
              {analysis.hasCycle
                ? <p className="p-4 text-[13px] text-err">Diagramme impossible : le modèle contient une boucle (voir Données & contrôles).</p>
                : sankey && <PlotlyChart build={sankey} height={sankeyHeight} label={`Diagramme de Sankey des flux énergétiques de ${model.name}`} />}
              <p className="mt-2 text-[12px] text-ink-3">
                Épaisseur des bandes proportionnelle à l’énergie annuelle ; couleur = vecteur énergétique. Les pertes de transformation sont calculées (entrées − sorties de chaque transformation). Survolez une bande pour le détail ; les postes peuvent être déplacés à la souris (verticalement) pour démêler le diagramme. Les exports sont en thème clair, pour les rapports.
              </p>
            </section>
          )}

          {tab === 'bilan' && (
            <section className="space-y-3 border bg-surface p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="eyebrow">Bilan par poste (MWh/an)</h2>
                <button type="button" className="btn" onClick={() => writeSheets(bilanSheets(model, analysis), `bilan-${base}.xlsx`)}>Exporter le bilan (Excel)</button>
              </div>
              <Table
                head={['Poste', 'Type', 'Zone', 'Entrées', 'Sorties', 'Pertes', 'Rendement']}
                numeric={[3, 4, 5, 6]}
                rows={analysis.balances.map((b) => [
                  b.node.label, KIND_LABEL[b.node.kind], b.node.zone ?? '',
                  b.in ? MWh(b.in) : '', b.out ? MWh(b.out) : '', b.losses ? MWh(b.losses) : '',
                  b.efficiency === null ? '' : `${fmtNum(b.efficiency * 100, 3)} %`,
                ])}
              />
              <div className="grid gap-4 border-t pt-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                {usageBars && <PlotlyChart build={usageBars} height={Math.max(320, analysis.balances.filter((b) => b.node.kind === 'usage').length * 34 + 100)} label="Consommation finale par usage" exportName={`usages-${base}`} />}
                {purchaseBars && <PlotlyChart build={purchaseBars} height={320} label="Énergie achetée par vecteur" exportName={`achats-${base}`} />}
              </div>
              <p className="text-[12px] text-ink-3">Rendement apparent = sorties / entrées des transformations, tel que déduit des flux saisis. Un rendement anormal signale souvent un flux manquant ou mal attribué.</p>
            </section>
          )}

          {tab === 'donnees' && (
            <div className="space-y-4">
              <section className="border bg-surface p-4">
                <h2 className="eyebrow mb-2">Contrôles de cohérence</h2>
                <Issues issues={analysis.issues} />
              </section>
              <section className="border bg-surface p-4">
                <h2 className="eyebrow mb-2">Flux ({model.flows.length})</h2>
                <FlowTable model={model} />
              </section>
              <section className="border bg-surface p-4">
                <h2 className="eyebrow mb-2">Postes ({model.nodes.length})</h2>
                <Table head={['Identifiant', 'Libellé', 'Type', 'Zone']} rows={model.nodes.map((n) => [<span key="i" className="num">{n.id}</span>, n.label, KIND_LABEL[n.kind], n.zone ?? ''])} />
              </section>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function FlowTable({ model }: { model: SiteModel }) {
  const colors = carrierColors([...new Set(model.flows.map((f) => f.carrier))]);
  const label = (id: string) => model.nodes.find((n) => n.id === id)?.label ?? id;
  return (
    <Table
      head={['De', 'Vers', 'Énergie', 'MWh/an', 'Statut', 'Compteur', 'Commentaire']}
      numeric={[3]}
      rows={model.flows.map((f) => [
        label(f.from), label(f.to),
        <span key="c" className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-[2px]" style={{ background: `var(${colors.get(f.carrier)})` }} />{f.carrier}</span>,
        MWh(f.value), <StatusChip key="s" s={f.status} />, f.meter ?? '', f.comment ?? '',
      ])}
    />
  );
}
