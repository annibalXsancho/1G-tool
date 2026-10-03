'use client';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { suivi } from '@/data';
import { fmtNum } from '@/core/fmt';
import { analyse, isAnalysis, suggestRegressors, type Analysis, type Check } from '@/suivi/analyse';
import { toPeriods } from '@/suivi/aggregate';
import { exempleDoc } from '@/suivi/exemple';
import { GRAIN_LABEL, IPE_LABEL, PERIODS_PER_YEAR, REGRESSOR_LABEL, defaultConfig, type Config, type Doc, type Grain, type IpeDenom, type Period, type Regressor } from '@/suivi/model';
import { csvToMatrix, parseTable, type ParseIssue } from '@/suivi/parse';
import { fileSafe } from '@/lib/download';
import { readSheets, writeSheets } from '@/lib/xlsx';
import { useUndoStore } from '@/lib/undo-store';
import { NumField, SelectField, TextField, fieldCls } from '../fields';
import { IconAlert, IconInfo, IconWarn } from '../icons';
import { FormulaStep } from '../Justification';
import PlotlyChart from '../charts/PlotlyChart';
import { buildCusum, buildSavingsBars, buildSeries, buildSignature } from './charts';

const f = (v: number, s = 4) => (Number.isFinite(v) ? fmtNum(v, s) : '—');
const pct = (v: number) => (Number.isFinite(v) ? `${v > 0 ? '+' : ''}${fmtNum(v, 3)} %` : '—');

function Section({ n, title, children, right }: { n: number; title: string; children: ReactNode; right?: ReactNode }) {
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

function Stat({ label, value, unit, hint, strong }: { label: string; value: string; unit?: string; hint?: string; strong?: boolean }) {
  return (
    <div className={`border bg-bg p-3 ${strong ? 'border-accent' : ''}`}>
      <p className="eyebrow">{label}</p>
      <p className="num mt-0.5 text-[22px] font-semibold leading-tight">{value}{unit ? <span className="ml-1 text-[13px] font-normal text-ink-3">{unit}</span> : null}</p>
      {hint && <p className="mt-0.5 text-[12px] text-ink-2">{hint}</p>}
    </div>
  );
}

function CheckList({ checks }: { checks: Check[] }) {
  const order = { ko: 0, warn: 1, ok: 2 };
  return (
    <ul className="space-y-1.5">
      {[...checks].sort((a, b) => order[a.level] - order[b.level]).map((c) => (
        <li key={c.id} className={`flex gap-2 p-2 text-[13px] ${c.level === 'ko' ? 'border-l-4 border-err bg-err-soft' : c.level === 'warn' ? 'border-l-4 border-warn bg-warn-soft' : 'border-l-4 border-accent bg-accent-soft'}`}>
          <span className={`mt-0.5 shrink-0 ${c.level === 'ko' ? 'text-err' : c.level === 'warn' ? 'text-warn' : 'text-accent'}`}>
            {c.level === 'ko' ? <IconAlert /> : c.level === 'warn' ? <IconWarn /> : <span className="inline-block w-4 text-center font-bold">✓</span>}
          </span>
          <span><span className="font-medium">{c.label}</span><span className="block text-ink-2">{c.detail}</span></span>
        </li>
      ))}
    </ul>
  );
}

function DateField({ label, value, onChange, hint }: { label: string; value: string; onChange: (v: string) => void; hint?: string }) {
  return (
    <label className="block text-[12px] text-ink-2">{label}
      <input type="date" className={`${fieldCls} num mt-0.5`} value={value} onChange={(e) => onChange(e.target.value)} />
      {hint && <span className="mt-0.5 block text-[11px] text-ink-3">{hint}</span>}
    </label>
  );
}

/** Fenêtres par défaut : la première moitié des périodes (au plus un an) en référence, le reste en suivi. */
function defaultWindows(periods: Period[], grain: Grain): Pick<Config, 'baselineFrom' | 'baselineTo' | 'reportFrom' | 'reportTo'> {
  if (periods.length < 4) return { baselineFrom: periods[0]?.start ?? '', baselineTo: periods.at(-1)?.start ?? '', reportFrom: '', reportTo: '' };
  const year = grain === 'mois' ? 12 : grain === 'semaine' ? 52 : grain === 'jour' ? 365 : 12;
  const nRef = Math.max(3, Math.min(year, Math.floor(periods.length / 2)));
  const rest = periods.slice(nRef);
  return { baselineFrom: periods[0].start, baselineTo: periods[nRef - 1].start, reportFrom: rest[0]?.start ?? '', reportTo: rest.at(-1)?.start ?? '' };
}

export default function SuiviPage() {
  const { doc, ready, replace, edit, undo, canUndo } = useUndoStore<Doc>('ee:suivi');
  const [issues, setIssues] = useState<ParseIssue[]>([]);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const cfg = doc?.config ?? defaultConfig();
  const periods = useMemo(() => (doc ? toPeriods(doc.rows, cfg) : []), [doc, cfg]);
  const result = useMemo(() => (doc ? analyse(periods, cfg) : null), [doc, periods, cfg]);
  const a: Analysis | null = result && isAnalysis(result) ? result : null;

  const setCfg = (patch: Partial<Config>, group?: string) => edit((d) => ({ ...d, config: { ...d.config, ...patch } }), group);

  // Si les fenêtres du document ne couvrent aucune période (changement de grain, nouvel import), on en propose.
  useEffect(() => {
    if (!doc || periods.length === 0) return;
    const covered = periods.some((p) => (!cfg.baselineFrom || p.start >= cfg.baselineFrom) && (!cfg.baselineTo || p.start <= cfg.baselineTo));
    if (!cfg.baselineFrom || !covered) setCfg(defaultWindows(periods, cfg.grain));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.rows, cfg.grain]);

  const signature = useMemo(() => (a ? buildSignature(a, cfg) : null), [a, cfg]);
  const series = useMemo(() => (a ? buildSeries(a) : null), [a]);
  const cusum = useMemo(() => (a ? buildCusum(a) : null), [a]);
  const bars = useMemo(() => (a ? buildSavingsBars(a) : null), [a]);

  async function onFile(file: File) {
    setBusy(true);
    try {
      let matrix;
      if (/\.xlsx$/i.test(file.name)) { const sheets = await readSheets(file); matrix = sheets[0]?.data ?? []; } else matrix = csvToMatrix(await file.text());
      const { rows, issues: iss } = parseTable(matrix);
      setIssues(iss);
      if (rows.length > 0) {
        const c = { ...defaultConfig(), nom: file.name.replace(/\.(xlsx|csv|txt)$/i, '') };
        // Relevé journalier long → mois ; relevé court avec DJU déjà fournis → périodes du fichier ; sinon semaine.
        const grain: Grain = rows.length > 500 ? 'mois' : rows.some((r) => r.dju !== undefined) && rows.length < 80 ? 'brut' : rows.length > 120 ? 'semaine' : 'brut';
        const base = { ...c, grain, periodsPerYear: PERIODS_PER_YEAR[grain] };
        const ps = toPeriods(rows, base);
        replace({ rows, config: { ...base, ...defaultWindows(ps, grain) } });
      }
    } catch (e) {
      setIssues([{ level: 'erreur', message: `Lecture impossible : ${e instanceof Error ? e.message : String(e)}. Formats : .csv ou .xlsx.` }]);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function exportExcel() {
    if (!a) return;
    writeSheets([
      { sheet: 'Périodes', data: [['Début', 'Rôle', 'Jours', 'Énergie mesurée (kWh)', 'DJU', 'DJR', 'Variable libre', 'Attendu (kWh)', 'Économie (kWh)', 'CUSUM (kWh)', 'Mesuré / attendu'], ...a.lines.map((l) => [l.period.start, l.role, l.period.days, l.period.kwh, l.period.dju, l.period.djr, l.period.x, l.expected, l.saving, l.cusum, l.ratio])] },
      { sheet: 'Modèle', data: [['Coefficient', 'Valeur', 'Erreur standard', 't'], ...a.fit.names.map((n, i) => [n, a.fit.coef[i], a.fit.se[i], a.fit.t[i]]), [], ['R²', a.fit.r2], ['CV(RMSE) %', a.fit.cvrmse * 100], ['NMBE %', a.fit.nmbe * 100], ['n', a.fit.n]] },
      ...(a.savings ? [{ sheet: 'Économies', data: [['Économie (kWh)', a.savings.total], ['Économie (%)', a.savings.pct], [`Incertitude ± (kWh, ${Math.round(cfg.confidence * 100)} %)`, a.savings.U], ['Significative', a.savings.significant ? 'oui' : 'non']] }] : []),
    ], `suivi-${fileSafe(cfg.nom || 'site')}.xlsx`);
  }

  if (!ready) return <div className="h-64 animate-pulse bg-sunken" aria-busy="true" />;

  const toggleReg = (r: Regressor) => {
    const has = cfg.regressors.includes(r);
    const next = has ? cfg.regressors.filter((x) => x !== r) : [...cfg.regressors, r];
    if (next.length >= 1 && next.length <= 2) setCfg({ regressors: next });
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="eyebrow">Suivi · ISO 50001 · IPMVP</p>
        <h1 className="text-[22px] font-semibold leading-tight tracking-tight sm:text-[26px]">Signature énergétique, IPÉ et CUSUM{cfg.nom ? <span className="text-ink-3"> · {cfg.nom}</span> : null}</h1>
        <p className="mt-0.5 max-w-prose text-[13px] text-ink-2">Ajustez la consommation de la situation de référence sur la météo ou l’activité, puis mesurez ce que le site a économisé depuis une action, avec l’incertitude, le cumul des écarts (CUSUM) et les indicateurs de performance. Les degrés-jours suivent la méthode du tableau de bord energy-dashboard.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <input ref={fileRef} type="file" accept=".csv,.txt,.xlsx" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        <button type="button" className="btn !border-accent !bg-accent !text-accent-ink" disabled={busy} onClick={() => fileRef.current?.click()}>{busy ? 'Lecture…' : 'Importer un relevé (CSV, Excel)'}</button>
        <button type="button" className="btn" onClick={() => { replace(exempleDoc()); setIssues([]); }}>Charger l’exemple</button>
        {a && <button type="button" className="btn" onClick={exportExcel}>Exporter l’analyse (Excel)</button>}
        {doc && <button type="button" className="btn" disabled={!canUndo} onClick={undo}>↶ Annuler</button>}
        {doc && <button type="button" className="btn" onClick={() => { replace(null); setIssues([]); }}>Vider</button>}
      </div>
      {issues.length > 0 && (
        <section className="border bg-surface p-4">
          <h2 className="eyebrow mb-2">Compte rendu d’import</h2>
          <ul className="space-y-1 text-[13px]">
            {issues.map((i, k) => <li key={k} className={`flex gap-2 ${i.level === 'erreur' ? 'text-err' : i.level === 'avertissement' ? 'text-warn' : 'text-ink-2'}`}><span className="mt-0.5">{i.level === 'erreur' ? <IconAlert /> : i.level === 'avertissement' ? <IconWarn /> : <IconInfo />}</span>{i.message}</li>)}
          </ul>
        </section>
      )}

      {!doc ? (
        <section className="grid gap-4 border bg-surface p-4 md:grid-cols-2">
          <div className="space-y-2 text-[13px] text-ink-2">
            <h2 className="text-[15px] font-semibold text-ink">Démarrer</h2>
            <p>Cliquez sur <strong className="text-ink">Charger l’exemple</strong> : une usine relevée au jour pendant 21 mois, avec une action d’économie à partir de mars 2026. Vous verrez la signature, le CUSUM et les économies mesurées.</p>
            <p>Ou importez un fichier CSV ou Excel avec une ligne par jour (ou par période) et les colonnes : <em>Date</em>, <em>Énergie (kWh)</em>, puis <em>Tmin</em> et <em>Tmax</em> (les DJU sont calculés), ou <em>DJU</em> déjà calculés, ou une variable libre (<em>production</em>, <em>surface</em>).</p>
          </div>
          <div className="border-l-4 border-accent bg-accent-soft p-3 text-[13px]">
            <p className="mb-1 font-medium">Ce que l’outil calcule</p>
            <ul className="list-disc space-y-1 pl-4 text-ink-2">
              <li>DJU et DJR (méthode Costic), agrégés par semaine ou par mois en écartant les périodes incomplètes ;</li>
              <li><strong className="text-ink">signature énergétique</strong> : talon et sensibilité par régression, avec R², CV(RMSE), NMBE, t de Student ;</li>
              <li><strong className="text-ink">économies évitées</strong> (IPMVP option C) avec incertitude, et économies normalisées sur un climat typique ;</li>
              <li><strong className="text-ink">CUSUM</strong> des écarts au modèle et <strong className="text-ink">IPÉ</strong> simple et de modèle (ISO 50006).</li>
            </ul>
          </div>
        </section>
      ) : (
        <>
          <Section n={1} title="Réglages">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <TextField label="Nom du site" value={cfg.nom} onCommit={(v) => setCfg({ nom: v })} />
              <SelectField label="Grain d’analyse" value={cfg.grain} options={(Object.keys(GRAIN_LABEL) as Grain[]).map((g) => ({ value: g, label: GRAIN_LABEL[g] }))} onChange={(g) => setCfg({ grain: g, periodsPerYear: PERIODS_PER_YEAR[g] })} />
              <NumField label="Température de base des DJU" unit="°C" value={cfg.base} min={5} max={25} hint="18 °C par défaut ; à ajuster au bâtiment." onCommit={(v) => v !== undefined && setCfg({ base: v }, 'base')} />
              <SelectField label="Indicateur de performance (IPÉ)" value={cfg.ipe} options={(Object.keys(IPE_LABEL) as IpeDenom[]).map((k) => ({ value: k, label: IPE_LABEL[k] }))} onChange={(v) => setCfg({ ipe: v })} />
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <fieldset className="border bg-bg p-3">
                <legend className="px-1 text-[12px] text-ink-2">Variables explicatives (1 ou 2)</legend>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {(Object.keys(REGRESSOR_LABEL) as Regressor[]).map((r) => (
                    <label key={r} className="flex items-center gap-2 text-[13px]"><input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" checked={cfg.regressors.includes(r)} onChange={() => toggleReg(r)} />{REGRESSOR_LABEL[r]}</label>
                  ))}
                  <button type="button" className="text-[12px] text-accent underline-offset-2 hover:underline" onClick={() => setCfg({ regressors: suggestRegressors(periods, cfg) })}>Suggérer</button>
                </div>
                <p className="mt-1 text-[11px] text-ink-3">« Suggérer » retient le jeu dont le R² ajusté est le meilleur avec des coefficients positifs.</p>
              </fieldset>
              <div className="grid gap-3 sm:grid-cols-2">
                <DateField label="Référence : du" value={cfg.baselineFrom} onChange={(v) => setCfg({ baselineFrom: v })} hint="Début de période inclus." />
                <DateField label="Référence : au" value={cfg.baselineTo} onChange={(v) => setCfg({ baselineTo: v })} />
                <DateField label="Suivi : du" value={cfg.reportFrom} onChange={(v) => setCfg({ reportFrom: v })} hint="Vide = pas de suivi." />
                <DateField label="Suivi : au" value={cfg.reportTo} onChange={(v) => setCfg({ reportTo: v })} />
              </div>
            </div>
            <details className="mt-3 text-[13px]">
              <summary className="cursor-pointer text-ink-2">Options avancées : confiance, normalisation, unités</summary>
              <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <SelectField label="Niveau de confiance" value={String(cfg.confidence)} options={[{ value: '0.8', label: '80 %' }, { value: '0.9', label: '90 % (usuel)' }, { value: '0.95', label: '95 %' }]} onChange={(v) => setCfg({ confidence: Number(v) as Config['confidence'] })} />
                <NumField label="DJU annuels typiques" unit="°C·j" value={cfg.djuTypique} hint="Vide = climat de la référence. Valeur de votre station, moyenne trentenaire." onCommit={(v) => setCfg({ djuTypique: v })} />
                <NumField label="DJR annuels typiques" unit="°C·j" value={cfg.djrTypique} onCommit={(v) => setCfg({ djrTypique: v })} />
                <NumField label="Variable libre annuelle typique" value={cfg.xTypique} onCommit={(v) => setCfg({ xTypique: v })} />
                {cfg.grain === 'brut' && <NumField label="Périodes par an" value={cfg.periodsPerYear} min={1} onCommit={(v) => v !== undefined && setCfg({ periodsPerYear: v })} />}
                <TextField label="Unité de la variable libre" value={cfg.unite} onCommit={(v) => setCfg({ unite: v || 'unité' })} />
              </div>
            </details>
            <p className="mt-3 text-[12px] text-ink-2">{doc.rows.length} ligne(s) lue(s) → {periods.length} période(s) au grain « {GRAIN_LABEL[cfg.grain].toLowerCase()} ».</p>
          </Section>

          {!a ? (
            <section className="border border-err bg-err-soft p-4 text-[13px]" role="alert">
              <p className="mb-1 font-medium text-err">Analyse impossible</p>
              <ul className="list-disc pl-4">{((result ?? { errors: [] }) as { errors: string[] }).errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
            </section>
          ) : (
            <>
              <Section n={2} title="Synthèse">
                <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                  <Stat strong label="Talon" value={f(a.fit.coef[0])} unit="kWh/période" hint={`≈ ${f(a.fit.coef[0] / (cfg.grain === 'mois' ? 30.4 : cfg.grain === 'semaine' ? 7 : 1))} kWh/jour`} />
                  {a.regressors.map((r, j) => <Stat key={r} strong label={`Sensibilité ${r === 'dju' ? 'DJU' : r === 'djr' ? 'DJR' : 'variable'}`} value={f(a.fit.coef[j + 1])} unit="kWh/unité" hint={`t = ${f(a.fit.t[j + 1], 3)}`} />)}
                  <Stat label="R²" value={f(a.fit.r2, 3)} hint={`CV(RMSE) ${f(a.fit.cvrmse * 100, 3)} % · n = ${a.fit.n}`} />
                  {a.savings && <Stat strong label="Économie évitée" value={f(a.savings.total)} unit="kWh" hint={`${pct(a.savings.pct)} · ±${f(a.savings.U)} kWh (${Math.round(cfg.confidence * 100)} %)`} />}
                  {a.ipe && <Stat label={`IPÉ ${a.ipe.label}`} value={f(a.ipe.suivi)} hint={`référence ${f(a.ipe.reference)} (${pct(a.ipe.change)})`} />}
                  {a.ipe && <Stat label="IPÉ de modèle" value={f(a.ipe.modelRatio, 3)} hint={`mesuré / attendu : gain ${pct(a.ipe.modelGain)}`} />}
                  {a.normalised?.saving != null && <Stat label="Économie normalisée" value={f(a.normalised.saving)} unit="kWh/an" hint={a.normalised.basis} />}
                </div>
                <p className="mt-3 border-l-4 border-accent bg-accent-soft px-3 py-2 text-[13px] font-medium">{a.conclusion}</p>
              </Section>

              <Section n={3} title="Signature énergétique">
                <p className="mb-2 max-w-prose text-[12px] text-ink-2">Chaque point est une période ; la droite est le modèle de la situation de référence. Les points de suivi qui passent sous la droite sont des économies.</p>
                {signature && <PlotlyChart build={signature} height={400} label="Énergie par période en fonction des degrés-jours, avec le modèle de référence" exportName="signature-energetique" />}
              </Section>

              <Section n={4} title="Mesuré et attendu">
                {series && <PlotlyChart build={series} height={360} label="Énergie mesurée et attendue par période" exportName="mesure-attendu" />}
              </Section>

              <Section n={5} title="CUSUM des économies">
                <p className="mb-2 max-w-prose text-[12px] text-ink-2">Somme cumulée de (attendu − mesuré). Dans la référence la courbe oscille autour de 0 et y revient ; après une action, une pente montante durable est une économie, une pente descendante est une dérive à investiguer.</p>
                {cusum && <PlotlyChart build={cusum} height={340} label="CUSUM des économies en fonction du temps" exportName="cusum" />}
                {a.suiviN > 0 && bars && (<><h3 className="mb-1 mt-4 text-[13px] font-semibold">Économie par période de suivi</h3><PlotlyChart build={bars} height={260} label="Économie par période de suivi" exportName="economies-par-periode" /></>)}
              </Section>

              <Section n={6} title="Détail par période">
                <div className="max-h-96 overflow-auto">
                  <table className="w-full min-w-[44rem] border-collapse text-[13px]">
                    <thead className="sticky top-0 bg-surface"><tr className="border-b text-left">{['Début', 'Rôle', 'Mesuré (kWh)', 'DJU', 'Attendu (kWh)', 'Économie (kWh)', 'CUSUM (kWh)', 'Mesuré / attendu'].map((h, i) => <th key={h} className={`py-1 pr-3 eyebrow ${i > 1 ? 'text-right' : ''}`}>{h}</th>)}</tr></thead>
                    <tbody>
                      {a.lines.map((l) => (
                        <tr key={l.period.id} className={`border-b ${l.role === 'suivi' ? 'bg-accent-soft' : ''}`}>
                          <td className="num py-1 pr-3">{l.period.start}</td><td className="py-1 pr-3 text-ink-2">{l.role === 'reference' ? 'Référence' : l.role === 'suivi' ? 'Suivi' : 'Hors'}</td>
                          <td className="num py-1 pr-3 text-right">{f(l.period.kwh)}</td><td className="num py-1 pr-3 text-right">{f(l.period.dju, 3)}</td>
                          <td className="num py-1 pr-3 text-right">{f(l.expected)}</td><td className={`num py-1 pr-3 text-right ${l.saving < 0 ? 'text-err' : ''}`}>{f(l.saving)}</td>
                          <td className="num py-1 pr-3 text-right">{f(l.cusum)}</td><td className="num py-1 pr-3 text-right">{f(l.ratio, 3)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {a.normalised && (
                  <p className="mt-3 text-[13px] text-ink-2">Consommation annuelle normalisée ({a.normalised.basis}) : référence <span className="num text-ink">{f(a.normalised.reference)} kWh/an</span>{a.normalised.suivi != null ? <>, après action <span className="num text-ink">{f(a.normalised.suivi)} kWh/an</span>, soit <span className="num text-ink">{f(a.normalised.saving ?? NaN)} kWh/an</span> d’économie normalisée (modèle réajusté sur la période de suivi).</> : '. Le suivi compte trop peu de périodes pour réajuster un second modèle.'}</p>
                )}
              </Section>

              <Section n={7} title="Contrôles de qualité du modèle"><CheckList checks={a.checks} /></Section>

              <Section n={8} title="Note de calcul">
                <div className="mb-3 grid gap-x-6 gap-y-2 text-[13px] leading-relaxed text-ink-2 md:grid-cols-3">
                  <p>La situation de référence (EnB, ISO 50001) fixe ce que le site consomme « normalement » en fonction du climat ou de l’activité : une droite ajustée par moindres carrés sur les périodes de référence.</p>
                  <p>Ce modèle prédit la consommation de chaque période de suivi dans ses conditions réelles. L’écart avec le mesuré est l’économie évitée (IPMVP option C) ; son cumul est le CUSUM.</p>
                  <p>L’incertitude dépend de la dispersion autour de la droite et du nombre de périodes : une économie inférieure à l’incertitude n’est pas démontrée.</p>
                </div>
                <ol>{a.formulas.map((fm, i) => <FormulaStep key={i} f={fm} n={i + 1} />)}</ol>
              </Section>

              <div className="grid gap-4 lg:grid-cols-3">
                <section className="border bg-surface p-4">
                  <h2 className="eyebrow mb-2">Hypothèses</h2>
                  <ul className="list-disc space-y-1 pl-4 text-[13px] text-ink-2">
                    <li>Relation linéaire entre la consommation et les variables choisies sur la plage observée.</li>
                    <li>Mêmes conditions d’exploitation (horaires, process, périmètre) entre référence et suivi, hors variables du modèle.</li>
                    <li>Résidus sans tendance : à vérifier sur le graphique « mesuré et attendu ».</li>
                    <li>Les périodes incomplètes (semaine, mois) sont écartées.</li>
                  </ul>
                </section>
                <section className="border bg-surface p-4">
                  <h2 className="eyebrow mb-2">Domaine de validité</h2>
                  <ul className="list-disc space-y-1 pl-4 text-[13px] text-ink-2">
                    <li>Un cycle annuel complet en référence (≥ {suivi.seuils.pointsMin.mois} mois, ou {suivi.seuils.pointsMin.semaine} semaines).</li>
                    <li>Au jour, le rythme hebdomadaire écrase la température : préférer la semaine ou le mois.</li>
                    <li>Un site qui ne chauffe ni ne refroidit ses locaux (procédé) a une signature climatique non significative : utiliser la variable libre.</li>
                  </ul>
                  <h2 className="eyebrow mb-2 mt-4">Ce que ce calcul ne couvre pas</h2>
                  <p className="text-[13px] text-ink-2">Ajustements non routiniers (changement de périmètre, arrêt prolongé), modèles à changement de pente (3 paramètres), options A et B de l’IPMVP et incertitude de mesure des compteurs.</p>
                </section>
                <section className="border bg-surface p-4">
                  <h2 className="eyebrow mb-2">Références</h2>
                  <ul className="list-disc space-y-1 pl-4 text-[13px] text-ink-2">
                    <li>Tableau de bord energy-dashboard (<code>js/weather.js</code>) : DJU Costic, signature par semaine, correction climatique.</li>
                    <li>IPMVP, Concepts de base, option C (régression). TODO: source à vérifier.</li>
                    <li>ASHRAE Guideline 14, annexe B (incertitude des économies). TODO: source à vérifier.</li>
                    <li>ISO 50001 (situation de référence) et ISO 50006 (IPÉ). TODO: source à vérifier.</li>
                    <li>Vos cours : à renseigner dès que leur contenu est accessible.</li>
                  </ul>
                  <p className="mt-2 text-[12px] text-ink-3">Seuils et quantiles : <code>src/data/suivi.json</code>.</p>
                </section>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
