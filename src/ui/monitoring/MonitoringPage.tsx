'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { fmtNum } from '@/core/fmt';
import { isAnalysis, type Analysis } from '@/suivi/analyse';
import { parseDay } from '@/suivi/aggregate';
import { REGRESSOR_LABEL, type Grain, type Regressor } from '@/suivi/model';
import { DEFAULT_OCCUPATION, delta, dayTypeEnergy, kpis, previousPeriod, topPeaks, type Occupation } from '@/monitoring/kpis';
import { exempleMonitoring, EXEMPLE_ACTION_DATE, EXEMPLE_SITES } from '@/monitoring/exemple';
import { ACTION_LABEL, controlChart, detectionPower, periodsNeeded, runMV, simulateMV, type Action, type MVSimulation, type Temps } from '@/monitoring/ipmvp';
import { checkQuality } from '@/monitoring/quality';
import { UNITS, ReadError, autoMap, readTable, readTemperatures, tableFromMatrix, toMeasures } from '@/monitoring/read';
import { aggregate, dayKey, dayStart, heatMatrix, loadDuration, medianStep, sitesOf, slice, totalCurve, typicalProfile } from '@/monitoring/series';
import { costs, DEFAULT_TARIFF, optimalPower, overruns, type Tariff } from '@/monitoring/tariff';
import { FREQ_LABEL, type Freq, type Issue, type Mapping, type Measure, type Table, type Unit } from '@/monitoring/types';
import { fileSafe } from '@/lib/download';
import { fetchTemperatures, searchPlace, type Place } from '@/lib/meteo';
import { readSheets, writeSheets } from '@/lib/xlsx';
import { NumField, SelectField, TextField, fieldCls } from '../fields';
import { IconAlert, IconInfo, IconWarn } from '../icons';
import { CheckList, Section, Stat, Tabs, type Item } from '../common';
import PlotlyChart from '../charts/PlotlyChart';
import { buildControl, buildCusumTab, buildDetection, buildEnergy, buildHeat, buildMonotone, buildOptions, buildPower, buildProfiles } from './charts';
import { buildCusum as buildCusumSuivi, buildSeries as buildSeriesSuivi, buildSignature } from '../suivi/charts';

const f = (v: number, s = 4) => (Number.isFinite(v) ? fmtNum(v, s) : '—');
const pct = (v: number) => (Number.isFinite(v) ? `${v > 0 ? '+' : ''}${fmtNum(v, 3)} %` : '—');
const iso = (ms: number) => dayKey(ms);
const STORE = 'ee:monitoring:v1';
/** Durée minimale d'un suivi (un cycle d'usage : 4 semaines au jour, 8 à la semaine, 3 mois). Ordre de grandeur, TODO: source à vérifier. */
const MIN_PERIODS: Record<Grain, number> = { brut: 3, jour: 28, semaine: 8, mois: 3 };

type Prefs = {
  tariff: Tariff; occ: Occupation; freq: Freq;
  mv: { grain: Grain; regressors: Regressor[]; base: number; confidence: 0.8 | 0.9 | 0.95; from: string };
  action: { kind: Action['kind']; value: number; from: string };
  stip: { hoursShare: number; uPowerPct: number; uHoursPct: number; spotDays: number };
};
const DEFAULT_PREFS: Prefs = {
  tariff: DEFAULT_TARIFF, occ: DEFAULT_OCCUPATION, freq: 'D',
  mv: { grain: 'jour', regressors: ['dju', 'djr', 'we'], base: 18, confidence: 0.9, from: '' },
  action: { kind: 'pct', value: 10, from: '' }, stip: { hoursShare: 100, uPowerPct: 2, uHoursPct: 10, spotDays: 7 },
};
function loadPrefs(): Prefs {
  try { const r = JSON.parse(localStorage.getItem(STORE) ?? 'null'); if (r && typeof r === 'object') return { ...DEFAULT_PREFS, ...r, tariff: { ...DEFAULT_PREFS.tariff, ...r.tariff }, occ: { ...DEFAULT_PREFS.occ, ...r.occ }, mv: { ...DEFAULT_PREFS.mv, ...r.mv }, action: { ...DEFAULT_PREFS.action, ...r.action }, stip: { ...DEFAULT_PREFS.stip, ...r.stip } }; } catch { /* valeurs par défaut */ }
  return DEFAULT_PREFS;
}

function DateField({ label, value, onChange, hint, min, max }: { label: string; value: string; onChange: (v: string) => void; hint?: string; min?: string; max?: string }) {
  return (
    <label className="block text-[12px] text-ink-2">{label}
      <input type="date" className={`${fieldCls} num mt-0.5`} value={value} min={min} max={max} onChange={(e) => onChange(e.target.value)} />
      {hint && <span className="mt-0.5 block text-[11px] text-ink-3">{hint}</span>}
    </label>
  );
}

function SiteChips({ sites, selected, onChange, all }: { sites: string[]; selected: string[]; onChange: (s: string[]) => void; all?: string }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Compteurs">
      {sites.map((s, i) => {
        const on = selected.includes(s);
        return (
          <button key={s} type="button" aria-pressed={on} onClick={() => onChange(on ? selected.filter((x) => x !== s) : [...selected, s])}
            className={`flex min-h-8 items-center gap-1.5 border px-2.5 text-[12px] ${on ? 'border-accent bg-accent-soft font-medium' : 'border-rule-strong bg-bg text-ink-3'}`}>
            <span className="inline-block h-2.5 w-2.5" style={{ background: `var(--series-${(i % 8) + 1})`, opacity: on ? 1 : 0.35 }} />{s}
          </button>
        );
      })}
      {all && <button type="button" className="text-[12px] text-accent underline-offset-2 hover:underline" onClick={() => onChange(selected.length === sites.length ? [] : sites)}>{selected.length === sites.length ? 'Tout décocher' : all}</button>}
    </div>
  );
}

type Tab = 'donnees' | 'kpis' | 'suivi' | 'simulation';

export default function MonitoringPage() {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<Tab>('donnees');
  const [rows, setRows] = useState<Measure[] | null>(null);
  const [name, setName] = useState('');
  const [temps, setTemps] = useState<Temps | undefined>(undefined);
  const [truth, setTruth] = useState<number | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [pending, setPending] = useState<{ table: Table; mapping: Mapping; source: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const [scope, setScope] = useState<string[]>([]);
  const [place, setPlace] = useState(''); const [places, setPlaces] = useState<Place[]>([]); const [meteoMsg, setMeteoMsg] = useState('');
  const [sim, setSim] = useState<{ result: MVSimulation; m: number } | null>(null);
  const [simBusy, setSimBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null); const tempRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setPrefs(loadPrefs()); setReady(true); }, []);
  useEffect(() => { if (ready) try { localStorage.setItem(STORE, JSON.stringify(prefs)); } catch { /* stockage indisponible */ } }, [prefs, ready]);
  const set = <K extends keyof Prefs>(k: K, v: Partial<Prefs[K]> | Prefs[K]) => setPrefs((p) => ({ ...p, [k]: typeof v === 'object' && !Array.isArray(v) ? { ...(p[k] as object), ...(v as object) } : v }) as Prefs);

  const sites = useMemo(() => (rows ? sitesOf(rows) : []), [rows]);
  const step = useMemo(() => (rows ? medianStep(rows) : 1), [rows]);
  const bounds = useMemo(() => (rows ? { a: iso(rows[0].t), b: iso(rows[rows.length - 1].t) } : null), [rows]);

  function adopt(r: Measure[], source: string, t?: Temps, tr?: number | null) {
    const s = sitesOf(r); const a = iso(r[0].t); const b = iso(r[r.length - 1].t);
    setRows(r); setName(source); setSelected(s); setScope(s); setFrom(a); setTo(b); setTemps(t); setTruth(tr ?? null); setSim(null);
    const cut = iso(new Date(dayStart(r[0].t) + Math.round((r[r.length - 1].t - r[0].t) / 86400000 * 0.7) * 86400000).getTime());
    set('mv', { from: prefs.mv.from && prefs.mv.from > a && prefs.mv.from < b ? prefs.mv.from : cut });
    set('action', { from: cut });
  }

  function loadExample() {
    const ex = exempleMonitoring();
    adopt(ex.rows, 'Exemple : site tertiaire-industriel (30 min, 20 mois)', ex.temps, ex.trueSavingKwh);
    setPrefs((p) => ({ ...p, mv: { ...p.mv, from: iso(EXEMPLE_ACTION_DATE) }, action: { ...p.action, from: iso(new Date(2026, 5, 1).getTime()) } }));
    setIssues([{ level: 'info', message: `Exemple chargé : ${ex.rows.length.toLocaleString('fr-FR')} mesures. Une action réelle (CVC −12 %) démarre le 01/03/2026 : l’onglet Suivi la retrouve, l’onglet Simulation la compare à une action simulée.` }]);
    setPending(null); setTab('kpis');
  }

  async function onFile(file: File) {
    setBusy(true);
    try {
      const table = /\.xlsx$/i.test(file.name) ? tableFromMatrix((await readSheets(file))[0]?.data ?? []) : readTable(await file.text());
      const m = autoMap(table); m.siteName = m.siteName || file.name.replace(/\.[a-z]+$/i, '');
      setPending({ table, mapping: m, source: file.name }); setIssues([]);
    } catch (e) { setIssues([{ level: 'erreur', message: `Lecture impossible : ${e instanceof Error ? e.message : String(e)}. Formats : .csv ou .xlsx.` }]); }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = ''; }
  }

  function applyMapping() {
    if (!pending) return;
    try { const r = toMeasures(pending.table, pending.mapping); adopt(r, pending.source, temps); setPending(null); setIssues([{ level: 'info', message: `${r.length.toLocaleString('fr-FR')} mesures lues.` }]); setTab('kpis'); }
    catch (e) { setIssues([{ level: 'erreur', message: e instanceof ReadError ? e.message : String(e) }]); }
  }

  async function onTempFile(file: File) {
    try {
      const table = /\.xlsx$/i.test(file.name) ? tableFromMatrix((await readSheets(file))[0]?.data ?? []) : readTable(await file.text());
      const { days, issues: iss } = readTemperatures(table);
      setTemps(days); setMeteoMsg(`${days.size} jour(s) de températures lus.${iss.length ? ' ' + iss.join(' ') : ''}`);
    } catch (e) { setMeteoMsg(`Lecture impossible : ${e instanceof Error ? e.message : String(e)}`); }
    finally { if (tempRef.current) tempRef.current.value = ''; }
  }

  async function doSearch() { setMeteoMsg('Recherche…'); try { const p = await searchPlace(place); setPlaces(p); setMeteoMsg(p.length ? '' : 'Aucune commune trouvée.'); } catch (e) { setMeteoMsg(e instanceof Error ? e.message : String(e)); } }
  async function doFetch(p: Place) {
    if (!bounds) return; setMeteoMsg('Téléchargement des températures…');
    try { const t = await fetchTemperatures(p, bounds.a, bounds.b); setTemps(t); setPlaces([]); setMeteoMsg(`${t.size} jour(s) de températures pour ${p.label}.`); } catch (e) { setMeteoMsg(e instanceof Error ? e.message : String(e)); }
  }

  // --------------------------------------------------------------- dérivés
  const fromMs = from ? parseDay(from).getTime() : null; const toMs = to ? parseDay(to).getTime() : null;
  const sel = useMemo(() => (rows ? slice(rows, fromMs === null ? null : dayStart(fromMs), toMs === null ? null : dayStart(toMs), selected) : []), [rows, fromMs, toMs, selected]);
  const k = useMemo(() => (sel.length ? kpis(sel, step, prefs.occ) : null), [sel, step, prefs.occ]);
  const prev = useMemo(() => (rows && fromMs !== null && toMs !== null ? previousPeriod(rows, dayStart(fromMs), dayStart(toMs), selected) : []), [rows, fromMs, toMs, selected]);
  const kPrev = useMemo(() => (prev.length ? kpis(prev, step, prefs.occ) : null), [prev, step, prefs.occ]);
  const spanDays = fromMs !== null && toMs !== null ? Math.max(1, Math.round((toMs - fromMs) / 86400000) + 1) : 1;
  const cost = useMemo(() => (sel.length ? costs(sel, step, prefs.tariff, spanDays) : null), [sel, step, prefs.tariff, spanDays]);
  const curve = useMemo(() => totalCurve(sel), [sel]);
  const ld = useMemo(() => loadDuration(sel), [sel]);
  const over = useMemo(() => overruns(curve, step, prefs.tariff), [curve, step, prefs.tariff]);
  const optimal = useMemo(() => optimalPower(ld, 1), [ld]);
  const quality = useMemo(() => (rows ? checkQuality(rows, step) : null), [rows, step]);
  const effFreq: Freq = prefs.freq === 'raw' && sel.length > 40000 ? 'h' : prefs.freq;
  const agg = useMemo(() => aggregate(sel, effFreq, step), [sel, effFreq, step]);
  const aggE = useMemo(() => aggregate(sel, prefs.freq === 'raw' || prefs.freq === 'h' ? 'D' : prefs.freq, step), [sel, prefs.freq, step]);
  const heat = useMemo(() => (sel.length ? heatMatrix(sel) : null), [sel]);
  const pOuvre = useMemo(() => typicalProfile(sel, 'ouvre'), [sel]);
  const pWe = useMemo(() => typicalProfile(sel, 'we'), [sel]);
  const dt = useMemo(() => (sel.length ? dayTypeEnergy(sel, step) : null), [sel, step]);
  const peaks = useMemo(() => topPeaks(sel, 8), [sel]);

  // Suivi M&V : compteurs du périmètre, relevé entier, référence avant la date de début du suivi.
  const mvRows = useMemo(() => (rows ? slice(rows, null, null, scope) : []), [rows, scope]);
  const mvCfg = useMemo(() => ({ from: prefs.mv.from ? parseDay(prefs.mv.from).getTime() : 0, grain: prefs.mv.grain, regressors: prefs.mv.regressors, base: prefs.mv.base, confidence: prefs.mv.confidence }), [prefs.mv]);
  const analysis = useMemo(() => (tab === 'suivi' && rows && prefs.mv.from ? runMV(mvRows, step, temps, mvCfg) : null), [tab, rows, mvRows, step, temps, mvCfg, prefs.mv.from]);
  const a: Analysis | null = analysis && isAnalysis(analysis) ? analysis : null;
  const cc = useMemo(() => (a ? controlChart(a) : null), [a]);

  function runSimulation() {
    if (!rows) return; setSimBusy(true);
    setTimeout(() => {
      const av = prefs.action; const fromA = parseDay(av.from || prefs.mv.from).getTime();
      const act: Action = av.kind === 'pct' ? { kind: 'pct', pct: av.value } : av.kind === 'kw' ? { kind: 'kw', kw: av.value } : av.kind === 'horsOccupation' ? { kind: 'horsOccupation', pct: av.value } : { kind: 'ecretage', capKw: av.value };
      const target = scope.length === sites.length ? null : scope;
      const result = simulateMV(rows, step, { mv: { ...mvCfg, from: fromA }, temps, occ: prefs.occ, action: { action: act, from: fromA, sites: target }, stipulation: { hoursShare: prefs.stip.hoursShare / 100, uPowerPct: prefs.stip.uPowerPct, uHoursPct: prefs.stip.uHoursPct, spotDays: prefs.stip.spotDays } });
      setSim({ result, m: result.analysisC?.suiviN ?? 12 }); setSimBusy(false);
    }, 30);
  }

  const detection = useMemo(() => (sim?.result.analysisC ? detectionPower(sim.result.analysisC, { m: sim.m, fractions: [0, 0.005, 0.01, 0.02, 0.03, 0.05, 0.075, 0.1, 0.15, 0.2], trials: 300, seed: 2026 }) : null), [sim]);

  const exportExcel = () => {
    if (!k || !cost) return;
    writeSheets([
      { sheet: 'KPIs', data: [['Indicateur', 'Valeur'], ['Énergie (kWh)', k.energy], ['Pointe (kW)', k.peak], ['Puissance moyenne (kW)', k.mean], ['Facteur de charge (%)', k.loadFactor], ['Talon P5 (kW)', k.baseLoad], ['Part hors occupation (%)', k.offShare], ['Heures d’utilisation (h)', k.utilisationHours], ['Coût énergie (€)', cost.energyCost]] },
      { sheet: 'Énergie par jour', data: [['Jour', 'Compteur', 'Énergie (kWh)', 'Puissance moyenne (kW)', 'Pointe (kW)'], ...aggregate(sel, 'D', step).map((r) => [iso(r.t), r.site, r.kwh, r.kw, r.peak])] },
      ...(a ? [{ sheet: 'Suivi', data: [['Début', 'Rôle', 'Mesuré (kWh)', 'Attendu (kWh)', 'Économie (kWh)', 'CUSUM (kWh)'], ...a.lines.map((l) => [l.period.start, l.role, l.period.kwh, l.expected, l.saving, l.cusum])] }] : []),
    ], `monitoring-${fileSafe(name || 'site')}.xlsx`);
  };

  if (!ready) return <div className="h-64 animate-pulse bg-sunken" aria-busy="true" />;

  const tile = (label: string, value: string, unit: string, cur: number, prv: number | undefined, better: 'lower' | 'higher' | 'none', hint?: string) => {
    const d = prv !== undefined && Number.isFinite(prv) ? delta(cur, prv) : null;
    const good = d && Number.isFinite(d.pct) ? (better === 'lower' ? d.abs < 0 : better === 'higher' ? d.abs > 0 : undefined) : undefined;
    return <Stat key={label} label={label} value={value} unit={unit} hint={d && Number.isFinite(d.pct) ? <>{pct(d.pct)} vs période précédente{hint ? ` · ${hint}` : ''}</> : hint} tone={good === undefined ? undefined : good ? 'good' : 'bad'} />;
  };

  const mapper = pending && (
    <Section title={`Désigner les colonnes · ${pending.source}`} right={<button type="button" className="btn !min-h-8 !text-[12px]" onClick={() => setPending(null)}>Annuler</button>}>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SelectField label="Colonne de date et heure" value={String(pending.mapping.timestamp)} options={pending.table.header.map((h, i) => ({ value: String(i), label: h || `Colonne ${i + 1}` }))} onChange={(v) => setPending({ ...pending, mapping: { ...pending.mapping, timestamp: Number(v) } })} />
        <SelectField label="Colonne de compteur (optionnel)" value={String(pending.mapping.site)} options={[{ value: '-1', label: 'Aucune' }, ...pending.table.header.map((h, i) => ({ value: String(i), label: h || `Colonne ${i + 1}` }))]} onChange={(v) => setPending({ ...pending, mapping: { ...pending.mapping, site: Number(v) } })} />
        <SelectField label="Unité de la puissance" value={pending.mapping.unit} options={(Object.keys(UNITS) as Unit[]).map((u) => ({ value: u, label: u }))} onChange={(v) => setPending({ ...pending, mapping: { ...pending.mapping, unit: v } })} />
        <TextField label="Nom du compteur (sans colonne dédiée)" value={pending.mapping.siteName} onCommit={(v) => setPending({ ...pending, mapping: { ...pending.mapping, siteName: v } })} />
      </div>
      <fieldset className="mt-3 border bg-bg p-3">
        <legend className="px-1 text-[12px] text-ink-2">Colonnes de puissance (une par compteur) : jamais d’énergie (kWh) ni d’index</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {pending.table.header.map((h, i) => (
            <label key={i} className="flex items-center gap-2 text-[13px]"><input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" checked={pending.mapping.power.includes(i)} onChange={() => setPending({ ...pending, mapping: { ...pending.mapping, power: pending.mapping.power.includes(i) ? pending.mapping.power.filter((x) => x !== i) : [...pending.mapping.power, i] } })} />{h || `Colonne ${i + 1}`}</label>
          ))}
        </div>
      </fieldset>
      <div className="mt-3 overflow-x-auto"><table className="w-full border-collapse text-[12px]"><thead><tr className="border-b text-left">{pending.table.header.map((h, i) => <th key={i} className="py-1 pr-3 eyebrow">{h || `Col. ${i + 1}`}</th>)}</tr></thead><tbody>{pending.table.rows.slice(0, 4).map((r, i) => <tr key={i} className="border-b">{pending.table.header.map((_, j) => <td key={j} className="num py-1 pr-3">{r[j]}</td>)}</tr>)}</tbody></table></div>
      <button type="button" className="btn mt-3 !border-accent !bg-accent !text-accent-ink" onClick={applyMapping}>Lire le relevé</button>
    </Section>
  );

  return (
    <div className="space-y-4">
      <div>
        <p className="eyebrow">Suivi · monitoring · IPMVP</p>
        <h1 className="text-[22px] font-semibold leading-tight tracking-tight sm:text-[26px]">Monitoring{name ? <span className="text-ink-3"> · {name}</span> : null}</h1>
        <p className="mt-0.5 max-w-prose text-[13px] text-ink-2">Importez une courbe de charge : KPIs de base, profils, coûts et dépassements, puis suivi des écarts au modèle (cartes de contrôle, CUSUM) et simulation IPMVP pour savoir quelle économie le plan de mesure peut réellement détecter.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <input ref={fileRef} type="file" accept=".csv,.txt,.xlsx" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        <button type="button" className="btn !border-accent !bg-accent !text-accent-ink" disabled={busy} onClick={() => fileRef.current?.click()}>{busy ? 'Lecture…' : 'Importer une courbe de charge'}</button>
        <button type="button" className="btn" onClick={loadExample}>Charger l’exemple</button>
        {rows && <button type="button" className="btn" onClick={exportExcel}>Exporter (Excel)</button>}
        {rows && <button type="button" className="btn" onClick={() => { setRows(null); setTemps(undefined); setSim(null); setIssues([]); setName(''); }}>Vider</button>}
      </div>
      {issues.length > 0 && (
        <ul className="space-y-1 border bg-surface p-3 text-[13px]">
          {issues.map((i, n) => <li key={n} className={`flex gap-2 ${i.level === 'erreur' ? 'text-err' : i.level === 'avertissement' ? 'text-warn' : 'text-ink-2'}`}><span className="mt-0.5">{i.level === 'erreur' ? <IconAlert /> : i.level === 'avertissement' ? <IconWarn /> : <IconInfo />}</span>{i.message}</li>)}
        </ul>
      )}
      {mapper}

      {!rows || !k ? (
        !pending && (
          <section className="grid gap-4 border bg-surface p-4 md:grid-cols-2">
            <div className="space-y-2 text-[13px] text-ink-2">
              <h2 className="text-[15px] font-semibold text-ink">Démarrer</h2>
              <p>Chargez l’exemple : trois compteurs au pas de 30 min sur 20 mois, avec une vraie action d’économie à partir de mars 2026 dont l’économie est connue exactement.</p>
              <p>Ou importez votre relevé (CSV ou Excel) : une colonne de date et une ou plusieurs colonnes de <strong className="text-ink">puissance</strong> (une par compteur), en W, kW ou MW. L’énergie se déduit de la puissance et du pas ; une colonne de kWh ou d’index est écartée.</p>
            </div>
            <div className="border-l-4 border-accent bg-accent-soft p-3 text-[13px]">
              <p className="mb-1 font-medium">Ce que l’outil fait</p>
              <ul className="list-disc space-y-1 pl-4 text-ink-2">
                <li>contrôle de qualité (trous, doublons, négatifs, paliers figés) ;</li>
                <li>KPIs : énergie, pointe, facteur de charge, talon, part hors occupation, heures d’utilisation, coût, dépassements ;</li>
                <li>modèle journalier sur la météo et le week-end, cartes de contrôle Shewhart et CUSUM ;</li>
                <li>simulation IPMVP : options A, B, C comparées à une économie connue, et puissance de détection.</li>
              </ul>
            </div>
          </section>
        )
      ) : (
        <>
          <Tabs<Tab> value={tab} onChange={setTab} label="Sections du monitoring" tabs={[{ id: 'donnees', label: 'Données et qualité' }, { id: 'kpis', label: 'KPIs et courbes' }, { id: 'suivi', label: 'Suivi et alertes' }, { id: 'simulation', label: 'Simulation IPMVP' }]} />

          {tab === 'donnees' && (
            <>
              <Section title="Relevé">
                <div className="grid gap-3 text-[13px] sm:grid-cols-2 lg:grid-cols-4">
                  <Stat label="Mesures" value={rows.length.toLocaleString('fr-FR')} hint={`${sites.length} compteur(s)`} />
                  <Stat label="Pas de mesure" value={f(step * 60, 3)} unit="min" hint="écart médian entre deux points" />
                  <Stat label="Période" value={`${bounds!.a.split('-').reverse().join('/')}`} hint={`→ ${bounds!.b.split('-').reverse().join('/')}`} />
                  <Stat label="Complétude" value={quality ? f(quality.completeness, 4) : '—'} unit="%" tone={quality && quality.completeness < 95 ? 'bad' : 'good'} hint={quality && quality.completeness < 95 ? 'sous 95 % : énergie sous-estimée' : 'relevé complet'} />
                </div>
                <h3 className="mb-1.5 mt-4 text-[13px] font-semibold">Contrôle de qualité</h3>
                {quality && <CheckList items={quality.issues.map<Item>((i, n) => ({ id: String(n), level: i.level === 'erreur' ? 'ko' : i.level === 'avertissement' ? 'warn' : 'info', detail: i.message }))} />}
              </Section>
              <Section title="Températures extérieures (pour la signature énergétique)">
                <p className="mb-3 max-w-prose text-[13px] text-ink-2">{temps ? `${temps.size} jour(s) de températures chargés.` : 'Aucune température : le modèle du suivi ne pourra utiliser que le week-end.'} Importez un fichier (Date, Tmin, Tmax) ou récupérez-les d’après la commune. Seuls la commune (ou ses coordonnées) et les dates de votre relevé partent vers open-meteo.com ; aucune puissance ni aucun nom de compteur.</p>
                <input ref={tempRef} type="file" accept=".csv,.txt,.xlsx" className="hidden" onChange={(e) => e.target.files?.[0] && onTempFile(e.target.files[0])} />
                <div className="flex flex-wrap items-end gap-3">
                  <button type="button" className="btn" onClick={() => tempRef.current?.click()}>Importer des températures</button>
                  <div className="w-64"><TextField label="Ou chercher une commune (appel réseau)" value={place} onCommit={setPlace} placeholder="Saint-Étienne" /></div>
                  <button type="button" className="btn" disabled={!place} onClick={doSearch}>Chercher</button>
                </div>
                {places.length > 0 && <ul className="mt-2 flex flex-wrap gap-2">{places.map((p) => <li key={p.label + p.lat}><button type="button" className="btn !min-h-8 !text-[12px]" onClick={() => doFetch(p)}>{p.label}</button></li>)}</ul>}
                {meteoMsg && <p className="mt-2 text-[13px] text-ink-2" aria-live="polite">{meteoMsg}</p>}
              </Section>
              <Section title="Occupation et tarif">
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <NumField label="Occupation : début" unit="h" value={prefs.occ.from} min={0} max={23} onCommit={(v) => v !== undefined && set('occ', { from: v })} />
                  <NumField label="Occupation : fin" unit="h" value={prefs.occ.to} min={1} max={24} hint="Jours ouvrés. Le reste est « hors occupation »." onCommit={(v) => v !== undefined && set('occ', { to: v })} />
                  <NumField label="Puissance souscrite" unit="kW" value={prefs.tariff.subscribedKw} hint="0 = non renseignée." onCommit={(v) => set('tariff', { subscribedKw: v ?? 0 })} />
                  <NumField label="Abonnement" unit="€/mois" value={prefs.tariff.subscriptionMonthly} onCommit={(v) => set('tariff', { subscriptionMonthly: v ?? 0 })} />
                  <NumField label="Prix heures pleines" unit="€/kWh" value={prefs.tariff.priceHp} onCommit={(v) => v !== undefined && set('tariff', { priceHp: v })} />
                  <NumField label="Prix heures creuses" unit="€/kWh" value={prefs.tariff.priceHc} onCommit={(v) => v !== undefined && set('tariff', { priceHc: v })} />
                  <NumField label="Heures creuses : début" unit="h" value={prefs.tariff.hcStart} min={0} max={23} onCommit={(v) => v !== undefined && set('tariff', { hcStart: v })} />
                  <NumField label="Heures creuses : fin" unit="h" value={prefs.tariff.hcEnd} min={0} max={23} onCommit={(v) => v !== undefined && set('tariff', { hcEnd: v })} />
                  <NumField label="Pénalité de dépassement" unit="€/kW" value={prefs.tariff.overrunPerKw} hint="Ordre de grandeur, pas le TURPE exact." onCommit={(v) => v !== undefined && set('tariff', { overrunPerKw: v })} />
                </div>
              </Section>
            </>
          )}

          {tab === 'kpis' && (
            <>
              <Section title="Filtres">
                <div className="space-y-3">
                  <SiteChips sites={sites} selected={selected} onChange={setSelected} all="Tout cocher" />
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <DateField label="Du" value={from} min={bounds!.a} max={bounds!.b} onChange={setFrom} />
                    <DateField label="Au" value={to} min={bounds!.a} max={bounds!.b} onChange={setTo} />
                    <SelectField label="Grain des graphiques" value={prefs.freq} options={(Object.keys(FREQ_LABEL) as Freq[]).map((q) => ({ value: q, label: FREQ_LABEL[q] }))} onChange={(v) => set('freq', v)} />
                  </div>
                </div>
              </Section>
              <Section title="Indicateurs de base" right={<span className="text-[12px] text-ink-3">{kPrev ? 'écarts : période de même durée juste avant' : 'pas de période précédente disponible'}</span>}>
                <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                  {tile('Énergie', f(k.energy), 'kWh', k.energy, kPrev?.energy, 'lower')}
                  {tile('Pointe', f(k.peak), 'kW', k.peak, kPrev?.peak, 'lower', k.peakAt ? k.peakAt.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : undefined)}
                  {tile('Puissance moyenne', f(k.mean), 'kW', k.mean, kPrev?.mean, 'lower')}
                  {tile('Facteur de charge', f(k.loadFactor, 3), '%', k.loadFactor, kPrev?.loadFactor, 'none', 'moyenne / pointe')}
                  {tile('Talon (P5)', f(k.baseLoad), 'kW', k.baseLoad, kPrev?.baseLoad, 'lower', `${f(k.baseShare, 3)} % de la moyenne : la charge qui ne s’arrête jamais`)}
                  {tile('Hors occupation', f(k.offShare, 3), '%', k.offShare, kPrev?.offShare, 'lower', `${f(k.offEnergy)} kWh la nuit et le week-end`)}
                  {tile('Heures d’utilisation', f(k.utilisationHours), 'h', k.utilisationHours, kPrev?.utilisationHours, 'none', 'énergie / pointe')}
                  {tile('Rapport pointe / P95', f(k.peakiness, 3), '', k.peakiness, kPrev?.peakiness, 'lower', k.peakiness > 1.3 ? 'pointe isolée : écrêtable' : 'charge régulière')}
                  {cost && <Stat label="Coût de l’énergie" value={f(cost.energyCost)} unit="€" hint={`HP ${f(cost.energyHp)} kWh · HC ${f(cost.energyHc)} kWh${prefs.tariff.subscriptionMonthly ? ` · abonnement ${f(cost.subscription)} €` : ''}`} />}
                  {dt && <Stat label="Week-end / jour ouvré" value={Number.isFinite(dt.ratio) ? f(dt.ratio * 100, 3) : '—'} unit="%" hint={`${f(dt.ouvre)} kWh/j ouvré · ${f(dt.we)} kWh/j de week-end`} />}
                  {over ? <Stat label="Dépassements" value={f(over.maxOver)} unit="kW" tone={over.maxOver > 0 ? 'bad' : 'good'} hint={`${f(over.hours, 3)} h au-dessus de ${f(prefs.tariff.subscribedKw)} kW · ≈ ${f(over.cost)} €`} /> : <Stat label="Puissance visée" value={optimal ? f(optimal) : '—'} unit="kW" hint="dépassée 1 % du temps seulement" />}
                </div>
                {k.baseShare > 40 && <p className="mt-3 border-l-4 border-warn bg-warn-soft px-3 py-2 text-[13px]">Le talon représente {f(k.baseShare, 3)} % de la puissance moyenne : une grande part de la consommation ne dépend pas de l’activité. C’est le premier gisement à chercher (veille, éclairage, ventilation).</p>}
              </Section>
              <Section title="Puissance"><PlotlyChart build={buildPower(agg, sites, FREQ_LABEL[effFreq].toLowerCase())} height={360} label="Puissance par compteur en fonction du temps" exportName="monitoring-puissance" /></Section>
              <Section title="Énergie"><PlotlyChart build={buildEnergy(aggE, sites)} height={320} label="Énergie par compteur" exportName="monitoring-energie" /></Section>
              <div className="grid gap-4 lg:grid-cols-2">
                <Section title="Monotone de charge"><PlotlyChart build={buildMonotone(ld, prefs.tariff.subscribedKw, optimal)} height={320} label="Monotone de charge" exportName="monitoring-monotone" /></Section>
                <Section title="Profils types"><PlotlyChart build={buildProfiles(pOuvre, pWe)} height={320} label="Profil horaire des jours ouvrés et des week-ends" exportName="monitoring-profils" /></Section>
              </div>
              <Section title="Carte de chaleur (heure × jour)">{heat && <PlotlyChart build={buildHeat(heat)} height={360} label="Puissance par heure et par jour" exportName="monitoring-carte-chaleur" />}</Section>
              <Section title="Journées de plus forte pointe">
                <table className="w-full max-w-lg border-collapse text-[13px]"><thead><tr className="border-b text-left"><th className="py-1 eyebrow">Jour</th><th className="py-1 eyebrow">Heure</th><th className="py-1 text-right eyebrow">Pointe (kW)</th></tr></thead>
                  <tbody>{peaks.map((p) => <tr key={p.day} className="border-b"><td className="num py-1">{p.day.split('-').reverse().join('/')}</td><td className="num py-1">{p.at.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</td><td className="num py-1 text-right">{f(p.kw)}</td></tr>)}</tbody></table>
              </Section>
            </>
          )}

          {(tab === 'suivi' || tab === 'simulation') && (
            <Section title="Plan de mesure et vérification (M&V)">
              <div className="space-y-3">
                <div><p className="mb-1 text-[12px] text-ink-2">Compteurs du périmètre mesuré (tous = installation entière)</p><SiteChips sites={sites} selected={scope} onChange={setScope} all="Tout cocher" /></div>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <SelectField label="Grain du modèle" value={prefs.mv.grain} options={[{ value: 'jour', label: 'Jour (recommandé avec le week-end)' }, { value: 'semaine', label: 'Semaine' }, { value: 'mois', label: 'Mois' }]} onChange={(g) => set('mv', { grain: g as Grain })} />
                  <NumField label="Température de non-chauffage" unit="°C" value={prefs.mv.base} min={5} max={25} onCommit={(v) => v !== undefined && set('mv', { base: v })} />
                  <DateField label="Début du suivi (fin de la référence)" value={prefs.mv.from} min={bounds!.a} max={bounds!.b} onChange={(v) => set('mv', { from: v })} hint="Aligné sur un début de semaine ou de mois selon le grain." />
                  <SelectField label="Niveau de confiance" value={String(prefs.mv.confidence)} options={[{ value: '0.8', label: '80 %' }, { value: '0.9', label: '90 % (usuel)' }, { value: '0.95', label: '95 %' }]} onChange={(v) => set('mv', { confidence: Number(v) as 0.8 | 0.9 | 0.95 })} />
                </div>
                <fieldset className="border bg-bg p-3">
                  <legend className="px-1 text-[12px] text-ink-2">Variables explicatives</legend>
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    {(['dju', 'djr', 'we'] as Regressor[]).map((r) => (
                      <label key={r} className="flex items-center gap-2 text-[13px]"><input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" checked={prefs.mv.regressors.includes(r)} onChange={() => { const has = prefs.mv.regressors.includes(r); const next = has ? prefs.mv.regressors.filter((x) => x !== r) : [...prefs.mv.regressors, r]; if (next.length >= 1) set('mv', { regressors: next }); }} />{REGRESSOR_LABEL[r]}</label>
                    ))}
                  </div>
                  {!temps && <p className="mt-1 text-[12px] text-warn">Aucune température chargée : DJU et DJR valent zéro. Importez-les dans l’onglet Données.</p>}
                </fieldset>
              </div>
            </Section>
          )}

          {tab === 'suivi' && (
            <>
              {!prefs.mv.from ? <p className="text-[13px] text-ink-2">Choisissez le début du suivi.</p> : !analysis ? null : !a ? (
                <section className="border border-err bg-err-soft p-4 text-[13px]" role="alert"><p className="mb-1 font-medium text-err">Analyse impossible</p><ul className="list-disc pl-4">{(analysis as { errors: string[] }).errors.map((e, i) => <li key={i}>{e}</li>)}</ul></section>
              ) : (
                <>
                  <Section title="Modèle et économies">
                    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                      <Stat strong label="R² du modèle" value={f(a.fit.r2, 4)} hint={`CV(RMSE) ${f(a.fit.cvrmse * 100, 3)} % · n = ${a.fit.n}`} />
                      <Stat label="Talon" value={f(a.fit.coef[0])} unit="kWh/période" />
                      {a.regressors.map((r, j) => <Stat key={r} label={r === 'we' ? 'Effet week-end' : `Sensibilité ${r === 'dju' ? 'DJU' : 'DJR'}`} value={f(a.fit.coef[j + 1])} unit="kWh/unité" hint={`t = ${f(a.fit.t[j + 1], 3)}`} />)}
                      {a.savings && <Stat strong label="Économie évitée" value={f(a.savings.total)} unit="kWh" tone={a.savings.significant ? 'good' : undefined} hint={`${pct(a.savings.pct)} · ±${f(a.savings.U)} kWh (${Math.round(prefs.mv.confidence * 100)} %)`} />}
                      {a.savings && prefs.tariff.priceHp > 0 && <Stat label="Valeur de l’économie" value={f(a.savings.total * (prefs.tariff.priceHp + prefs.tariff.priceHc) / 2)} unit="€" hint="au prix moyen HP / HC" />}
                    </div>
                    <p className="mt-3 border-l-4 border-accent bg-accent-soft px-3 py-2 text-[13px] font-medium">{a.conclusion}</p>
                  </Section>
                  <Section title="Contrôles du modèle"><CheckList items={a.checks.map<Item>((c) => ({ id: c.id, label: c.label, level: c.level, detail: c.detail }))} /></Section>
                  <Section title="Signature énergétique"><PlotlyChart build={buildSignature(a, { grain: prefs.mv.grain } as never)} height={360} label="Énergie par période en fonction des degrés-jours" exportName="monitoring-signature" /></Section>
                  <Section title="Mesuré et attendu"><PlotlyChart build={buildSeriesSuivi(a)} height={340} label="Énergie mesurée et attendue" exportName="monitoring-mesure-attendu" /></Section>
                  <Section title="CUSUM des économies"><PlotlyChart build={buildCusumSuivi(a)} height={320} label="CUSUM des économies" exportName="monitoring-cusum" /></Section>
                  {cc && (
                    <>
                      <Section title="Carte de contrôle des écarts au modèle">
                        <p className="mb-2 max-w-prose text-[12px] text-ink-2">Écart entre le mesuré et l’attendu, en écarts-types du modèle de référence. Alarmes : au-delà de ±3σ, au-delà de ±2σ, ou 8 écarts de même signe de suite. Dans la référence elles donnent le taux de fausses alarmes ; après la ligne pointillée, elles signalent un changement.</p>
                        <PlotlyChart build={buildControl(a, cc)} height={340} label="Carte de contrôle des écarts au modèle" exportName="monitoring-controle" />
                      </Section>
                      <Section title="CUSUM tabulaire (détection de dérive)">
                        <p className="mb-2 max-w-prose text-[12px] text-ink-2">Somme des écarts au-delà d’une tolérance de 0,5σ, remise à zéro à l’alarme (seuil 5σ). Plus sensible que la carte de Shewhart aux petites dérives durables.</p>
                        <PlotlyChart build={buildCusumTab(a, cc)} height={300} label="CUSUM tabulaire" exportName="monitoring-cusum-tabulaire" />
                      </Section>
                      <Section title="Alarmes">
                        {cc.alarms.length === 0 ? <p className="text-[13px] text-ink-2">Aucune alarme.</p> : (
                          <div className="max-h-72 overflow-auto"><table className="w-full max-w-2xl border-collapse text-[13px]"><thead className="sticky top-0 bg-surface"><tr className="border-b text-left"><th className="py-1 eyebrow">Période</th><th className="py-1 eyebrow">Alarme</th><th className="py-1 text-right eyebrow">Écart (kWh)</th><th className="py-1 text-right eyebrow">σ</th><th className="py-1 pl-3 eyebrow">Rôle</th></tr></thead>
                            <tbody>{[...cc.alarms].reverse().slice(0, 60).map((al, i) => { const l = a.lines[al.index]; return <tr key={i} className="border-b"><td className="num py-1">{l.period.start.split('-').reverse().join('/')}</td><td className="py-1">{al.kind}</td><td className="num py-1 text-right">{f(l.residual)}</td><td className="num py-1 text-right">{f(cc.z[al.index], 3)}</td><td className="py-1 pl-3 text-ink-2">{l.role === 'reference' ? 'Référence' : l.role === 'suivi' ? 'Suivi' : 'Hors'}</td></tr>; })}</tbody></table></div>
                        )}
                      </Section>
                    </>
                  )}
                  <Section title="Note de calcul">
                    <ul className="space-y-1 text-[13px] text-ink-2">{a.formulas.map((fm, i) => <li key={i}><span className="text-ink">{fm.label}</span>{fm.note ? ` : ${fm.note}` : ''}</li>)}</ul>
                    <p className="mt-2 text-[12px] text-ink-3">Le détail des formules, avec application numérique, est dans la page « Signature énergétique · IPÉ · CUSUM », qui utilise le même moteur.</p>
                  </Section>
                </>
              )}
            </>
          )}

          {tab === 'simulation' && (
            <>
              <Section title="Action à simuler" right={truth !== null ? <span className="text-[12px] text-ink-3">L’exemple contient déjà une vraie action (−12 % CVC) : {f(truth)} kWh</span> : undefined}>
                <p className="mb-3 max-w-prose text-[13px] text-ink-2">On applique une action fictive à la courbe mesurée à partir d’une date : l’économie vraie est connue au kWh près. Le plan de M&V (options A, B, C) la mesure ensuite comme en situation réelle, et on compare à la vérité.</p>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <SelectField label="Type d’action" value={prefs.action.kind} options={(Object.keys(ACTION_LABEL) as Action['kind'][]).map((q) => ({ value: q, label: ACTION_LABEL[q] }))} onChange={(v) => set('action', { kind: v })} />
                  <NumField label={prefs.action.kind === 'kw' ? 'Réduction' : prefs.action.kind === 'ecretage' ? 'Plafond par compteur' : 'Réduction'} unit={prefs.action.kind === 'kw' || prefs.action.kind === 'ecretage' ? 'kW' : '%'} value={prefs.action.value} onCommit={(v) => v !== undefined && set('action', { value: v })} />
                  <DateField label="Début de l’action" value={prefs.action.from} min={bounds!.a} max={bounds!.b} onChange={(v) => set('action', { from: v })} hint="Le suivi du modèle démarre à cette date." />
                  <div className="flex items-end"><button type="button" className="btn !border-accent !bg-accent !text-accent-ink" disabled={simBusy || scope.length === 0} onClick={runSimulation}>{simBusy ? 'Simulation…' : 'Lancer la simulation'}</button></div>
                </div>
                <p className="mt-2 text-[12px] text-ink-3">L’action s’applique aux compteurs cochés ci-dessus (tous cochés = tous les compteurs). L’option B isole ces compteurs ; elle n’existe que si vous en excluez au moins un.</p>
                <details className="mt-3 text-[13px]">
                  <summary className="cursor-pointer text-ink-2">Option A : mesure ponctuelle et durée stipulée</summary>
                  <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <NumField label="Durée de fonctionnement stipulée" unit="%" value={prefs.stip.hoursShare} min={1} max={100} hint="Part du temps où la charge visée fonctionne." onCommit={(v) => v !== undefined && set('stip', { hoursShare: v })} />
                    <NumField label="Incertitude de la mesure de puissance" unit="%" value={prefs.stip.uPowerPct} onCommit={(v) => v !== undefined && set('stip', { uPowerPct: v })} />
                    <NumField label="Incertitude de la durée stipulée" unit="%" value={prefs.stip.uHoursPct} onCommit={(v) => v !== undefined && set('stip', { uHoursPct: v })} />
                    <NumField label="Jours de mesure avant et après" unit="j" value={prefs.stip.spotDays} min={1} onCommit={(v) => v !== undefined && set('stip', { spotDays: Math.round(v) })} />
                  </div>
                </details>
              </Section>

              {sim && (
                <>
                  <Section title="Résultat : la vérité contre les estimations">
                    <div className="mb-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
                      <Stat strong label="Économie vraie" value={f(sim.result.trueKwh)} unit="kWh" hint="connue exactement (action simulée)" />
                      {sim.result.options.map((o) => <Stat key={o.option} label={`Option ${o.option}`} value={f(o.estimate)} unit="kWh" tone={o.within ? 'good' : 'bad'} hint={`±${f(o.U)} · erreur ${pct(o.errorPct)} · ${o.within ? 'dans l’incertitude' : 'hors incertitude'}`} />)}
                    </div>
                    {sim.result.options.length > 0 && <PlotlyChart build={buildOptions(sim.result.options, sim.result.trueKwh)} height={320} label="Économie estimée par option et incertitude, comparée à la vérité" exportName="simulation-options" />}
                    <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[40rem] border-collapse text-[13px]"><thead><tr className="border-b text-left"><th className="py-1 pr-3 eyebrow">Option</th><th className="py-1 pr-3 text-right eyebrow">Estimée (kWh)</th><th className="py-1 pr-3 text-right eyebrow">± U (kWh)</th><th className="py-1 pr-3 text-right eyebrow">Erreur (%)</th><th className="py-1 eyebrow">Lecture</th></tr></thead>
                      <tbody>{sim.result.options.map((o) => <tr key={o.option} className="border-b align-top"><td className="py-1.5 pr-3 font-medium">{o.label}</td><td className="num py-1.5 pr-3 text-right">{f(o.estimate)}</td><td className="num py-1.5 pr-3 text-right">{f(o.U)}</td><td className={`num py-1.5 pr-3 text-right ${o.within ? '' : 'text-err'}`}>{pct(o.errorPct)}</td><td className="py-1.5 text-ink-2">{o.note}</td></tr>)}</tbody></table></div>
                    {sim.result.errors.length > 0 && <ul className="mt-3 space-y-1 text-[13px] text-ink-2">{sim.result.errors.map((e, i) => <li key={i} className="flex gap-2"><span className="mt-0.5 text-ink-3"><IconInfo /></span>{e}</li>)}</ul>}
                    {(() => {
                      const C = sim.result.options.find((o) => o.option === 'C');
                      if (!C) return null;
                      const detectable = sim.result.trueKwh > C.U;
                      return <p className={`mt-3 border-l-4 px-3 py-2 text-[13px] font-medium ${detectable ? 'border-accent bg-accent-soft' : 'border-warn bg-warn-soft'}`}>{detectable ? `L’option C voit cette action : l’économie vraie (${f(sim.result.trueKwh)} kWh) dépasse l’incertitude (±${f(C.U)} kWh).` : `L’option C ne peut pas démontrer cette action : l’économie vraie (${f(sim.result.trueKwh)} kWh) est inférieure à l’incertitude (±${f(C.U)} kWh). Isolez le périmètre (option B) ou allongez le suivi.`}</p>;
                    })()}
                  </Section>

                  {detection && sim.result.analysisC && (
                    <Section title="Puissance de détection du plan de mesure">
                      <p className="mb-2 max-w-prose text-[13px] text-ink-2">Pour {sim.m} période(s) de suivi, quelle économie le modèle de référence peut-il démontrer ? Simulation de 300 suivis dont les écarts sont tirés au hasard dans ceux de la référence (graine fixe, résultat reproductible).</p>
                      <div className="mb-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
                        <Stat strong label="Économie minimale détectable" value={f(detection.minDetectable * 100, 3)} unit="%" hint={`soit ${f(detection.U)} kWh sur ${sim.m} période(s)`} />
                        <Stat label="Fausse alarme" value={f(detection.falseAlarm * 100, 3)} unit="%" hint="détection à économie nulle" />
                        <Stat label="Énergie attendue par période" value={f(detection.expectedPerPeriod)} unit="kWh" />
                        <Stat label="Erreur du modèle" value={f(sim.result.analysisC.fit.cvrmse * 100, 3)} unit="%" hint="CV(RMSE) de la référence" />
                      </div>
                      <PlotlyChart build={buildDetection(detection)} height={320} label="Probabilité de détecter une économie selon son importance" exportName="simulation-detection" />
                      <h3 className="mb-1 mt-4 text-[13px] font-semibold">Durée de suivi nécessaire pour démontrer une économie</h3>
                      <table className="w-full max-w-md border-collapse text-[13px]"><thead><tr className="border-b text-left"><th className="py-1 eyebrow">Économie visée</th><th className="py-1 text-right eyebrow">Périodes de suivi</th></tr></thead>
                        <tbody>{[0.5, 1, 2, 5, 10].map((s) => { const raw = periodsNeeded(sim.result.analysisC!, s / 100, prefs.mv.confidence); const n = Math.max(raw, MIN_PERIODS[prefs.mv.grain]); return <tr key={s} className="border-b"><td className="num py-1">{f(s, 2)} %</td><td className="num py-1 text-right">{Number.isFinite(n) ? `${n.toLocaleString('fr-FR')} ${prefs.mv.grain === 'jour' ? 'jour(s)' : prefs.mv.grain === 'semaine' ? 'semaine(s)' : 'mois'}` : '—'}</td></tr>; })}</tbody></table>
                      <p className="mt-2 text-[12px] text-ink-3">Formule : m &gt; (F·t·RMSE / (s·Ē))² · (1 + 2/n), avec F = {f(sim.result.analysisC.factor, 3)} (autocorrélation des écarts ρ = {f(sim.result.analysisC.autocorr, 3)}). Elle suppose un comportement stable après l’action. Au minimum {MIN_PERIODS[prefs.mv.grain]} {prefs.mv.grain === 'jour' ? 'jours' : prefs.mv.grain === 'semaine' ? 'semaines' : 'mois'} sont affichés : en deçà, un suivi ne couvre pas un cycle complet d’usage. TODO: source à vérifier (ASHRAE Guideline 14 annexe B).</p>
                    </Section>
                  )}
                </>
              )}
              <Section title="Les options de l’IPMVP">
                <div className="grid gap-4 text-[13px] leading-relaxed text-ink-2 md:grid-cols-3">
                  <div><h3 className="mb-1 font-semibold text-ink">Option A · paramètre clé</h3><p>Isolation du périmètre ; on mesure un paramètre clé (la puissance) et on stipule le reste (heures de fonctionnement). Simple et peu coûteux, mais l’incertitude de la durée stipulée domine et la météo n’est pas vue.</p></div>
                  <div><h3 className="mb-1 font-semibold text-ink">Option B · isolation complète</h3><p>Isolation du périmètre, tous les paramètres mesurés en continu (sous-compteur). Le bruit des autres usages disparaît : c’est la meilleure option pour une action ciblée et petite devant le compteur général.</p></div>
                  <div><h3 className="mb-1 font-semibold text-ink">Option C · installation entière</h3><p>Régression du compteur général sur la météo et l’activité. Adaptée aux actions diffuses ou à gain important ; une petite économie noyée dans la consommation totale n’est pas détectable. L’option D (simulation calibrée) n’est pas couverte.</p></div>
                </div>
                <p className="mt-3 text-[12px] text-ink-3">TODO: source à vérifier (IPMVP Core Concepts, définitions des options A, B, C, D).</p>
              </Section>
            </>
          )}
        </>
      )}
    </div>
  );
}
