'use client';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ecs } from '@/data';
import { fmtNum } from '@/core/fmt';
import {
  DWELLING_TYPES, GENERATOR_LABEL, MODE_LABEL, compute, defaultInput, isOk,
  type Check, type EcsInput, type EcsResult, type Generator, type LoopBasis, type Mode,
} from '@/ecs/calc';
import { exportPngElement, exportSvgElement } from '@/lib/svg-export';
import { fileSafe } from '@/lib/download';
import { NumField, SelectField } from '../fields';
import { IconAlert, IconPrint, IconWarn } from '../icons';
import { FormulaStep } from '../Justification';
import PlotlyChart from '../charts/PlotlyChart';
import SchemaSvg, { PART_LABEL, type Part } from './SchemaSvg';
import { buildCompare, buildCouples, buildCumulative, MODE_TOKEN } from './charts';

const STORE = 'ee:ecs:v1';
const MODES: Mode[] = ['accumulation', 'semi', 'instantane'];
const MODE_HELP: Record<Mode, string> = {
  accumulation: 'Le ballon stocke le besoin d’une journée et se recharge lentement : grand volume, faible puissance.',
  semi: 'Un ballon tampon couvre les pointes courtes, l’échangeur fournit le reste : compromis volume / puissance.',
  instantane: 'Aucun stockage : l’échangeur couvre la pointe de 10 minutes, d’où une forte puissance.',
};
const f = (v: number, s = 4) => fmtNum(v, s);

function load(): EcsInput {
  const d = defaultInput();
  try {
    const raw = JSON.parse(localStorage.getItem(STORE) ?? 'null');
    if (raw && typeof raw === 'object') return { ...d, ...raw, logements: { ...d.logements, ...raw.logements }, volumes40: { ...d.volumes40, ...raw.volumes40 }, tertiaire: { ...d.tertiaire, ...raw.tertiaire } };
  } catch { /* stockage indisponible ou contenu invalide : valeurs par défaut */ }
  return d;
}

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

function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="flex items-start gap-2 text-[13px]">
      <input type="checkbox" className="mt-1 h-4 w-4 accent-[var(--accent)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}{hint && <span className="block text-[11px] text-ink-3">{hint}</span>}</span>
    </label>
  );
}

function CheckList({ checks }: { checks: Check[] }) {
  const order = { ko: 0, warn: 1, ok: 2 };
  return (
    <ul className="space-y-1.5">
      {[...checks].sort((a, b) => order[a.level] - order[b.level]).map((c) => (
        <li key={c.id} className={`flex gap-2 p-2 text-[13px] ${c.level === 'ko' ? 'border-l-4 border-err bg-err-soft' : c.level === 'warn' ? 'border-l-4 border-warn bg-warn-soft' : 'border-l-4 border-accent bg-accent-soft'}`}>
          <span className={`mt-0.5 shrink-0 ${c.level === 'ko' ? 'text-err' : c.level === 'warn' ? 'text-warn' : 'text-accent'}`} aria-label={c.level === 'ko' ? 'Non conforme' : c.level === 'warn' ? 'Réserve' : 'Conforme'}>
            {c.level === 'ko' ? <IconAlert /> : c.level === 'warn' ? <IconWarn /> : <span className="inline-block w-4 text-center font-bold">✓</span>}
          </span>
          <span><span className="font-medium">{c.label}</span><span className="block text-ink-2">{c.detail}</span></span>
        </li>
      ))}
    </ul>
  );
}

type FieldKey = 'Tfroide' | 'Tstock' | 'hPointe' | 'Tambiance' | 'a' | 'volume' | 'mode' | 'tReconstitution' | 'generateur' | 'Pdispo' | 'boucle' | 'PboucleSaisie' | 'TretourBoucle' | 'hCirculateur' | 'circulateurArretable' | 'limitation50';

const PART_FIELDS: Record<Part, FieldKey[]> = {
  generateur: ['generateur', 'Pdispo'],
  echangeur: ['mode', 'tReconstitution', 'Pdispo'],
  ballon: ['volume', 'Tstock', 'a', 'Tambiance'],
  boucle: ['boucle', 'PboucleSaisie', 'TretourBoucle', 'hCirculateur', 'circulateurArretable', 'limitation50'],
  'eau-froide': ['Tfroide', 'hPointe'],
};

const PART_TEXT: Record<Part, (i: EcsInput, r: EcsResult) => string> = {
  generateur: (i, r) => `${GENERATOR_LABEL[i.generateur]} : doit fournir ${f(r.retained.P)} kW à l’échangeur${i.Pdispo !== undefined ? ` (${f(i.Pdispo)} kW disponibles)` : ''}.`,
  echangeur: (_i, r) => `Puissance retenue ${f(r.retained.P)} kW. Bilan des pointes : ${f(r.retained.Pbilan)} kW.`,
  ballon: (i, r) => (r.retained.V > 0 ? `Volume utile a·V = ${f(i.a * r.retained.V)} L sur ${f(r.retained.V)} L ; pertes statiques ${f(r.retained.pertesStatiques)} kWh/an.` : 'Aucun ballon en production instantanée.'),
  boucle: (i, r) => `Pertes de boucle ${f(r.Pboucle)} kW, soit ${f(r.Pboucle * i.hCirculateur * 365)} kWh/an.`,
  'eau-froide': (i, r) => `Un litre à ${f(i.Tstock, 3)} °C utile = ${f(r.needs.eLitre * 1000, 4)} Wh ; pointe de 10 min = ${f(r.needs.V10)} L.`,
};

export default function EcsPage() {
  const [input, setInput] = useState<EcsInput>(defaultInput);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<'besoins' | 'temp' | 'systeme'>('besoins');
  const [part, setPart] = useState<Part | null>('ballon');
  const [minute, setMinute] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [flows, setFlows] = useState(true);
  const sheetRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    setInput(load());
    setFlows(!matchMedia('(prefers-reduced-motion: reduce)').matches);
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(STORE, JSON.stringify(input)); } catch { /* stockage indisponible */ }
  }, [input, ready]);

  const set = useCallback((patch: Partial<EcsInput>) => setInput((p) => ({ ...p, ...patch })), []);
  const res = useMemo(() => compute(input), [input]);
  const result = isOk(res) ? res : null;
  const maxMinute = Math.round(input.hPointe * 60);

  useEffect(() => { setMinute((m) => Math.min(m, maxMinute)); }, [maxMinute]);
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setMinute((m) => { if (m >= maxMinute) { setPlaying(false); return m; } return Math.min(maxMinute, m + 2); }), 120);
    return () => clearInterval(id);
  }, [playing, maxMinute]);

  const cumulative = useMemo(() => (result ? buildCumulative(input, result, minute) : null), [input, result, minute]);
  const couples = useMemo(() => (result ? buildCouples(input, result) : null), [input, result]);
  const cmpV = useMemo(() => (result ? buildCompare(result, 'V', input.mode) : null), [result, input.mode]);
  const cmpP = useMemo(() => (result ? buildCompare(result, 'P', input.mode) : null), [result, input.mode]);
  const cmpL = useMemo(() => (result ? buildCompare(result, 'pertesTotal', input.mode) : null), [result, input.mode]);

  const num = (key: 'Tfroide' | 'Tstock' | 'hPointe' | 'Tambiance' | 'a' | 'tReconstitution' | 'PboucleSaisie' | 'TretourBoucle' | 'hCirculateur', label: string, unit: string, o: { min?: number; max?: number; hint?: string } = {}) => (
    <NumField key={key} label={label} unit={unit} value={input[key]} min={o.min ?? 0} max={o.max} hint={o.hint} onCommit={(v) => v !== undefined && set({ [key]: v } as Partial<EcsInput>)} />
  );
  const field = (k: FieldKey): ReactNode => {
    switch (k) {
      case 'Tfroide': return num('Tfroide', 'Température d’eau froide', '°C', { min: 0, max: 30, hint: 'Hiver : 10 °C usuel ; les formules de pointe sont établies à 9 °C.' });
      case 'Tstock': return num('Tstock', 'Température de stockage', '°C', { min: 20, max: 95, hint: '≥ 55 °C pour un stockage de 400 L et plus.' });
      case 'hPointe': return num('hPointe', 'Fenêtre de pointe', 'h', { min: 1, max: 8, hint: '8 h par défaut (matin ou soir).' });
      case 'Tambiance': return num('Tambiance', 'Température du local ballon', '°C', { min: -10, max: 40 });
      case 'a': return num('a', 'Coefficient de stratification a', '', { min: 0.3, max: 1, hint: `Volume utile = a × volume. ${ecs.stratification.min} (mélange complet) à ${ecs.stratification.max} (charge stratifiée) ; ${ecs.stratification.defaut} par défaut.` });
      case 'tReconstitution': return num('tReconstitution', 'Durée de reconstitution (accumulation)', 'h', { min: 1, max: 24, hint: '6 à 8 h usuellement.' });
      case 'PboucleSaisie': return input.boucle === 'saisie' ? num('PboucleSaisie', 'Pertes de boucle saisies', 'kW') : null;
      case 'TretourBoucle': return num('TretourBoucle', 'Température de retour de boucle', '°C', { min: 20, max: 90, hint: '≥ 50 °C en tout point.' });
      case 'hCirculateur': return num('hCirculateur', 'Fonctionnement du circulateur', 'h/j', { min: 0, max: 24 });
      case 'Pdispo': return (
        <NumField key={k} label="Puissance disponible au générateur" unit="kW" value={input.Pdispo} hint="Vide = non limitée. Vérifiée contre la puissance requise." onCommit={(v) => set({ Pdispo: v })} />
      );
      case 'mode': return (
        <div key={k} className="space-y-1">
          <p className="text-[12px] text-ink-2">Mode de production</p>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Mode de production">
            {MODES.map((m) => (
              <button key={m} type="button" role="radio" aria-checked={input.mode === m} onClick={() => set({ mode: m })}
                className={`min-h-9 border px-3 text-[13px] ${input.mode === m ? 'border-accent bg-accent-soft font-medium' : 'border-rule-strong bg-bg text-ink-2 hover:text-ink'}`}>{MODE_LABEL[m]}</button>
            ))}
          </div>
          <p className="text-[11px] text-ink-3">{MODE_HELP[input.mode]}</p>
        </div>
      );
      case 'generateur': return <SelectField key={k} label="Générateur" value={input.generateur} options={(Object.keys(GENERATOR_LABEL) as Generator[]).map((g) => ({ value: g, label: GENERATOR_LABEL[g] }))} onChange={(g) => set({ generateur: g })} />;
      case 'volume': return (
        <SelectField key={k} label="Volume du ballon (semi-instantané)" value={String(input.volume)}
          options={[{ value: 'auto', label: result && input.volume === 'auto' ? `Automatique (${f(result.modes.semi.V)} L)` : 'Automatique' }, ...ecs.taillesCommerciales_L.map((v) => ({ value: String(v), label: `${f(v)} L` }))]}
          onChange={(v) => set({ volume: v === 'auto' ? 'auto' : Number(v) })} />
      );
      case 'boucle': return <SelectField key={k} label="Pertes de boucle" value={input.boucle} options={[{ value: 'neuf' as LoopBasis, label: `${ecs.boucle.neuf.label} : 0,6 × besoin / 24` }, { value: 'ancien' as LoopBasis, label: `${ecs.boucle.ancien.label} : 1 × besoin / 24` }, { value: 'saisie' as LoopBasis, label: 'Saisie directe (kW)' }]} onChange={(b) => set({ boucle: b })} />;
      case 'circulateurArretable': return <Toggle key={k} label="Circulateur de boucle arrêtable" checked={input.circulateurArretable} onChange={(v) => set({ circulateurArretable: v })} hint="Corrélation à 17·V^-0,385, avec volume minimal V1." />;
      case 'limitation50': return <Toggle key={k} label="Limitation à 50 °C aux points de puisage" checked={input.limitation50} onChange={(v) => set({ limitation50: v })} hint="Mitigeurs thermostatiques (protection contre les brûlures)." />;
    }
  };
  const fields = (keys: FieldKey[]) => keys.map((k) => <div key={k}>{field(k)}</div>);

  const ter = ecs.tertiaire;
  const needsCard = result?.needs;
  const base = fileSafe(`schema-ecs-${input.mode}`);
  const verdict = result ? (result.checks.some((c) => c.level === 'ko') ? 'ko' : result.checks.some((c) => c.level === 'warn') ? 'warn' : 'ok') : null;

  if (!ready) return <div className="h-64 animate-pulse bg-sunken" aria-busy="true" />;

  return (
    <>
      <div className="screen-only space-y-4">
        <div>
          <p className="eyebrow">Plomberie · production d’eau chaude</p>
          <h1 className="text-[22px] font-semibold leading-tight tracking-tight sm:text-[26px]">Production et stockage d’ECS collective</h1>
          <p className="mt-0.5 max-w-prose text-[13px] text-ink-2">Dimensionnez le ballon et l’échangeur d’une production d’eau chaude sanitaire collective : besoins, pointes, couples puissance-volume, comparaison accumulation / semi-instantané / instantané, pertes et vérifications réglementaires.</p>
        </div>

        <Section n={1} title="Données" right={<button type="button" className="btn !min-h-8 !text-[12px]" onClick={() => { if (confirm('Rétablir toutes les valeurs par défaut ?')) setInput(defaultInput()); }}>Valeurs par défaut</button>}>
          <div className="mb-3 flex flex-wrap gap-1.5" role="tablist" aria-label="Catégories de données">
            {([['besoins', 'Bâtiment et besoins'], ['temp', 'Températures et profil'], ['systeme', 'Système et boucle']] as const).map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
                className={`min-h-9 border px-3 text-[13px] ${tab === id ? 'border-accent bg-accent-soft font-medium' : 'border-rule-strong bg-bg text-ink-2 hover:text-ink'}`}>{label}</button>
            ))}
          </div>
          {tab === 'besoins' && (
            <div className="space-y-4">
              <div>
                <h3 className="mb-1 text-[13px] font-semibold">Logements collectifs</h3>
                <p className="mb-2 text-[12px] text-ink-3">Besoins journaliers à 40 °C : valeurs COSTIC / ADEME 2016 (parc social), modifiables.</p>
                <div className="grid grid-cols-[3rem_1fr_1fr_4rem] items-end gap-x-3 gap-y-2 sm:max-w-xl">
                  <span /><span className="eyebrow">Nombre</span><span className="eyebrow">L/j à 40 °C</span><span className="eyebrow text-right">Coef. Ns</span>
                  {DWELLING_TYPES.map((t) => (
                    <div key={t} className="contents">
                      <span className="pb-2 text-[13px] font-medium">{t}</span>
                      <NumField label="" value={input.logements[t]} min={0} placeholder="0" onCommit={(v) => set({ logements: { ...input.logements, [t]: Math.round(v ?? 0) } })} />
                      <NumField label="" value={input.volumes40[t]} min={1} onCommit={(v) => v !== undefined && set({ volumes40: { ...input.volumes40, [t]: v } })} />
                      <span className="num pb-2 text-right text-[13px] text-ink-2">{ecs.logements[t].ns}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="mb-1 text-[13px] font-semibold">Usages tertiaires (optionnel)</h3>
                <p className="mb-2 text-[12px] text-ink-3">Ratios en litres à 40 °C par unité et par jour : la fourchette observée est indiquée, la valeur est modifiable.</p>
                <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2 xl:grid-cols-3">
                  {Object.entries(ter).map(([id, u]) => (
                    <div key={id} className="grid grid-cols-2 gap-2 border bg-bg p-2">
                      <p className="col-span-2 text-[13px] font-medium">{u.label}</p>
                      <NumField label={`Nombre de ${u.unite}s`} value={input.tertiaire[id]?.n ?? 0} onCommit={(v) => set({ tertiaire: { ...input.tertiaire, [id]: { n: Math.round(v ?? 0), ratio: input.tertiaire[id]?.ratio ?? u.defaut } } })} placeholder="0" />
                      <NumField label="L/unité/jour" value={input.tertiaire[id]?.ratio ?? u.defaut} min={1} hint={u.min === u.max ? undefined : `observé : ${u.min} à ${u.max}`} onCommit={(v) => v !== undefined && set({ tertiaire: { ...input.tertiaire, [id]: { n: input.tertiaire[id]?.n ?? 0, ratio: v } } })} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          {tab === 'temp' && <div className="grid max-w-3xl gap-4 sm:grid-cols-2">{fields(['Tfroide', 'Tstock', 'hPointe', 'Tambiance'])}</div>}
          {tab === 'systeme' && <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{fields(['mode', 'generateur', 'Pdispo', 'volume', 'a', 'tReconstitution', 'boucle', 'PboucleSaisie', 'TretourBoucle', 'hCirculateur', 'circulateurArretable', 'limitation50'])}</div>}
        </Section>

        {!result ? (
          <section className="border border-err bg-err-soft p-4 text-[13px]" role="alert">
            <p className="mb-1 font-medium text-err">Calcul impossible</p>
            <ul className="list-disc pl-4">{(res as { errors: string[] }).errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
          </section>
        ) : (
          <>
            <Section n={2} title="Dimensionnement retenu" right={
              <span className={`border px-2 py-0.5 text-[12px] font-medium ${verdict === 'ko' ? 'border-err bg-err-soft text-err' : verdict === 'warn' ? 'border-warn bg-warn-soft text-warn' : 'border-accent bg-accent-soft text-accent'}`}>
                {verdict === 'ko' ? 'Non conforme' : verdict === 'warn' ? 'Conforme avec réserves' : 'Conforme'}
              </span>}>
              <div className="mb-3 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Mode retenu">
                {MODES.map((m) => (
                  <button key={m} type="button" role="radio" aria-checked={input.mode === m} onClick={() => set({ mode: m })}
                    className={`min-h-9 border px-3 text-[13px] ${input.mode === m ? 'border-accent bg-accent-soft font-medium' : 'border-rule-strong bg-bg text-ink-2 hover:text-ink'}`}>{MODE_LABEL[m]}</button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                <Stat strong label="Volume du ballon" value={result.retained.V > 0 ? f(result.retained.V) : '—'} unit={result.retained.V > 0 ? 'L' : undefined} hint={result.retained.ballons > 1 ? `${result.retained.ballons} ballons en parallèle` : result.retained.V > 0 ? `utile : ${f(input.a * result.retained.V)} L` : 'pas de stockage'} />
                <Stat strong label="Puissance d’échangeur" value={f(result.retained.P)} unit="kW" hint={`bilan des pointes : ${f(result.retained.Pbilan)} kW`} />
                <Stat label="Pertes annuelles" value={f(result.retained.pertesTotal)} unit="kWh/an" hint={`statiques ${f(result.retained.pertesStatiques)} · boucle ${f(result.retained.pertesBoucle)}`} />
                <Stat label="Besoin journalier" value={f(needsCard!.Ejour)} unit="kWh/j" hint={`${f(needsCard!.V40)} L/j à 40 °C · Ns = ${f(needsCard!.Ns)}`} />
              </div>
              <p className="mt-3 border-l-4 border-accent bg-accent-soft px-3 py-2 text-[13px] font-medium">{result.conclusion}</p>
            </Section>

            <Section n={3} title="Schéma de principe interactif" right={
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className="btn !min-h-8 !text-[12px]" onClick={() => sheetRef.current && exportPngElement(sheetRef.current, `${base}.png`)}>PNG</button>
                <button type="button" className="btn !min-h-8 !text-[12px]" onClick={() => sheetRef.current && exportSvgElement(sheetRef.current, `${base}.svg`)}>SVG</button>
                <button type="button" className="btn !min-h-8 !text-[12px]" onClick={() => window.print()}><IconPrint /> Imprimer</button>
              </div>}>
              <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 border bg-bg p-2">
                <button type="button" className="btn !min-h-8 !text-[12px]" aria-pressed={playing} onClick={() => { if (!playing && minute >= maxMinute) setMinute(0); setPlaying((p) => !p); }}>{playing ? '❚❚ Pause' : '▶ Lire la pointe'}</button>
                <button type="button" className="btn !min-h-8 !text-[12px]" onClick={() => { setPlaying(false); setMinute(0); }}>⟲ Début</button>
                <label className="flex min-w-48 flex-1 items-center gap-2 text-[12px] text-ink-2">
                  <span className="whitespace-nowrap">t = <span className="num text-ink">{minute}</span> min</span>
                  <input type="range" className="w-full accent-[var(--accent)]" min={0} max={maxMinute} step={1} value={minute} aria-label="Instant dans la pointe (minutes)" onChange={(e) => { setPlaying(false); setMinute(Number(e.target.value)); }} />
                </label>
                <Toggle label="Écoulements animés" checked={flows} onChange={setFlows} />
              </div>
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_17rem]">
                <div className="min-w-0 border bg-bg p-2">
                  <SchemaSvg input={input} result={result} minute={minute} animate={flows} paused={!flows} selected={part} onSelect={(p) => setPart(p)} variant="screen" />
                </div>
                <aside className="space-y-3 border bg-bg p-3" aria-live="polite">
                  {part ? (
                    <>
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-[14px] font-semibold">{PART_LABEL[part]}</h3>
                        <button type="button" className="text-[12px] text-ink-3 hover:text-ink" onClick={() => setPart(null)} aria-label="Fermer le panneau">Fermer ✕</button>
                      </div>
                      <p className="text-[12px] text-ink-2">{PART_TEXT[part](input, result)}</p>
                      <div className="space-y-3">{fields(PART_FIELDS[part])}</div>
                    </>
                  ) : (
                    <p className="text-[13px] text-ink-2">Cliquez sur un élément du schéma (générateur, échangeur, ballon, boucle, arrivée d’eau froide) pour régler ses paramètres sans quitter le schéma. Le ballon se vide et se recharge au fil de la pointe : lancez la lecture ou déplacez le curseur.</p>
                  )}
                </aside>
              </div>
              <div className="mt-2 hidden"><SchemaSvg ref={sheetRef} input={input} result={result} minute={minute} animate={false} variant="sheet" /></div>
            </Section>

            <Section n={4} title="Besoin cumulé et production sur la pointe">
              <p className="mb-2 max-w-prose text-[12px] text-ink-2">Le ballon est supposé chargé au début de la pointe. Tant que « stock utile + production » reste au-dessus du besoin cumulé, le service est assuré ; le curseur suit l’instant du schéma.</p>
              {cumulative && <PlotlyChart build={cumulative} height={380} label="Besoin cumulé, production et stock utile en fonction du temps" exportName={`ecs-cumul-${input.mode}`} />}
            </Section>

            <Section n={5} title="Couples puissance-volume (semi-instantané)">
              <p className="mb-2 max-w-prose text-[12px] text-ink-2">Pour chaque taille de ballon, la puissance minimale d’échangeur qui assure le même service : plus le ballon est grand, moins la puissance est élevée. Cliquez un point pour retenir ce volume.</p>
              {couples && <PlotlyChart build={couples} height={380} label="Puissance d’échangeur en fonction du volume du ballon" exportName="ecs-couples-p-v" onClick={(p) => { const v = Number(p.customdata); if (Number.isFinite(v)) set({ volume: v, mode: 'semi' }); }} />}
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[34rem] border-collapse text-[13px]">
                  <thead><tr className="border-b text-left"><th className="py-1 pr-3 eyebrow">Ballon</th><th className="py-1 pr-3 text-right eyebrow">Bilan (kW)</th><th className="py-1 pr-3 text-right eyebrow">COSTIC 2019 (kW)</th><th className="py-1 pr-3 text-right eyebrow">Retenu (kW)</th><th /></tr></thead>
                  <tbody>
                    {result.couples.map((c) => (
                      <tr key={c.V} className={`border-b ${c.V === result.modes.semi.V ? 'bg-accent-soft font-medium' : ''}`}>
                        <td className="num py-1 pr-3">{f(c.V)} L</td><td className="num py-1 pr-3 text-right">{f(c.Pbilan)}</td>
                        <td className="num py-1 pr-3 text-right">{c.Pcostic === null ? '—' : f(c.Pcostic)}</td><td className="num py-1 pr-3 text-right">{f(c.P)}</td>
                        <td className="py-1 text-right"><button type="button" className="text-[12px] text-accent underline-offset-2 hover:underline" onClick={() => set({ volume: c.V, mode: 'semi' })}>Retenir</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {input.circulateurArretable && <p className="mt-1 text-[12px] text-ink-2">V1 = {f(result.V1)} L : en dessous, la corrélation à circulateur arrêtable n’est pas applicable.</p>}
              </div>
            </Section>

            <Section n={6} title="Comparaison des trois modes">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[40rem] border-collapse text-[13px]">
                  <thead><tr className="border-b text-left"><th className="py-1 pr-3 eyebrow">Mode</th><th className="py-1 pr-3 text-right eyebrow">Volume (L)</th><th className="py-1 pr-3 text-right eyebrow">Puissance (kW)</th><th className="py-1 pr-3 text-right eyebrow">Pertes statiques (kWh/an)</th><th className="py-1 pr-3 text-right eyebrow">Pertes boucle (kWh/an)</th><th className="py-1 pr-3 text-right eyebrow">Total (kWh/an)</th><th /></tr></thead>
                  <tbody>
                    {MODES.map((m) => { const r = result.modes[m]; return (
                      <tr key={m} className={`border-b ${input.mode === m ? 'bg-accent-soft font-medium' : ''}`}>
                        <td className="py-1.5 pr-3"><span className="mr-2 inline-block h-2.5 w-2.5 align-middle" style={{ background: `var(${MODE_TOKEN[m]})` }} />{MODE_LABEL[m]}</td>
                        <td className="num py-1.5 pr-3 text-right">{r.V > 0 ? `${r.ballons > 1 ? `${r.ballons} × ` : ''}${f(r.V / Math.max(1, r.ballons))}` : '—'}</td>
                        <td className="num py-1.5 pr-3 text-right">{f(r.P)}</td><td className="num py-1.5 pr-3 text-right">{f(r.pertesStatiques)}</td>
                        <td className="num py-1.5 pr-3 text-right">{f(r.pertesBoucle)}</td><td className="num py-1.5 pr-3 text-right">{f(r.pertesTotal)}</td>
                        <td className="py-1.5 text-right"><button type="button" className="text-[12px] text-accent underline-offset-2 hover:underline" disabled={input.mode === m} onClick={() => set({ mode: m })}>{input.mode === m ? 'Retenu' : 'Retenir'}</button></td>
                      </tr>
                    ); })}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                {cmpV && <PlotlyChart build={cmpV} height={280} label="Volume de stockage par mode" exportName="ecs-comparaison-volume" />}
                {cmpP && <PlotlyChart build={cmpP} height={280} label="Puissance d’échangeur par mode" exportName="ecs-comparaison-puissance" />}
                {cmpL && <PlotlyChart build={cmpL} height={280} label="Pertes annuelles par mode" exportName="ecs-comparaison-pertes" />}
              </div>
            </Section>

            <Section n={7} title="Vérifications réglementaires et de cohérence"><CheckList checks={result.checks} /></Section>

            <Section n={8} title="Note de calcul">
              <div className="mb-3 grid gap-x-6 gap-y-2 text-[13px] leading-relaxed text-ink-2 md:grid-cols-3">
                <p>Le besoin d’une journée est converti à la température de stockage par conservation de l’énergie. Les pointes de 10 min, 1 h et 8 h (formules COSTIC) donnent le besoin cumulé sur la fenêtre choisie.</p>
                <p>À chaque instant, le stock utile du ballon (a × volume) plus la production de l’échangeur, diminuée des pertes de boucle, doit couvrir le besoin cumulé : cela fixe la puissance pour un volume donné.</p>
                <p>En semi-instantané, on retient le maximum entre ce bilan et la corrélation COSTIC 2019 ; en accumulation, le ballon stocke le besoin journalier ; en instantané, il n’y a pas de stock.</p>
              </div>
              <ol>{result.formulas.map((fm, i) => <FormulaStep key={i} f={fm} n={i + 1} />)}</ol>
            </Section>

            <div className="grid gap-4 lg:grid-cols-3">
              <section className="border bg-surface p-4">
                <h2 className="eyebrow mb-2">Hypothèses</h2>
                <ul className="list-disc space-y-1 pl-4 text-[13px] text-ink-2">
                  <li>Ballon entièrement chargé au début de la pointe, température uniforme dans la zone utile.</li>
                  <li>Profil de besoin cumulé interpolé linéairement entre 0, 10 min, 1 h et 8 h.</li>
                  <li>Pertes de boucle forfaitaires (0,6 ou 1 × besoin journalier / 24) sauf saisie.</li>
                  <li>Rendement de l’échangeur pris égal à 1 ; rendement de charge 0,9 en accumulation.</li>
                  <li>Pertes statiques : plafond du règlement (UE) 814/2013, majorant.</li>
                </ul>
              </section>
              <section className="border bg-surface p-4">
                <h2 className="eyebrow mb-2">Domaine de validité</h2>
                <ul className="list-disc space-y-1 pl-4 text-[13px] text-ink-2">
                  <li>Logements collectifs d’au moins {ecs.pointes.Ns_minimal} logements standard.</li>
                  <li>Corrélations semi-instantanées : ballons de {ecs.semiInstantane.domaineVolume_L[0]} à {f(ecs.semiInstantane.domaineVolume_L[1])} L.</li>
                  <li>Usages tertiaires : ratios à confirmer sur site ; formules de pointe issues du logement.</li>
                </ul>
                <h2 className="eyebrow mb-2 mt-4">Ce que ce calcul ne couvre pas</h2>
                <p className="text-[13px] text-ink-2">Dimensionnement de la boucle (débit, diamètres), du vase d’expansion, du traitement légionelles (choc thermique), de la production solaire ou thermodynamique et de la régulation.</p>
              </section>
              <section className="border bg-surface p-4">
                <h2 className="eyebrow mb-2">Références</h2>
                <ul className="list-disc space-y-1 pl-4 text-[13px] text-ink-2">
                  <li>COSTIC / ADEME, étude de consommations d’ECS collective, 2016 (besoins et pointes). TODO: source à vérifier.</li>
                  <li>COSTIC, abaques semi-instantané, 2019. TODO: source à vérifier (unité et V1).</li>
                  <li>Arrêté du 30 novembre 2005 (légionelles, limitation à 50 °C).</li>
                  <li>Règlement (UE) n° 814/2013, annexe II (pertes statiques).</li>
                </ul>
                <p className="mt-2 text-[12px] text-ink-3">Données et sources : <code>src/data/ecs.json</code>.</p>
              </section>
            </div>
          </>
        )}
      </div>

      {result && (
        <div className="print-only print-plan">
          <h1 style={{ fontSize: 16, fontWeight: 600 }}>Production et stockage d’ECS collective : {MODE_LABEL[input.mode]}</h1>
          <SchemaSvg input={input} result={result} minute={0} animate={false} variant="sheet" />
          <p style={{ fontSize: 11, margin: '6px 0' }}>{result.conclusion}</p>
          <table style={{ fontSize: 10, borderCollapse: 'collapse', width: '100%' }}>
            <thead><tr>{['Mode', 'Volume (L)', 'Puissance (kW)', 'Pertes (kWh/an)'].map((h) => <th key={h} style={{ border: '1px solid #999', padding: 3, textAlign: 'left' }}>{h}</th>)}</tr></thead>
            <tbody>{MODES.map((m) => <tr key={m}><td style={{ border: '1px solid #999', padding: 3 }}>{MODE_LABEL[m]}{input.mode === m ? ' (retenu)' : ''}</td><td style={{ border: '1px solid #999', padding: 3 }}>{f(result.modes[m].V)}</td><td style={{ border: '1px solid #999', padding: 3 }}>{f(result.modes[m].P)}</td><td style={{ border: '1px solid #999', padding: 3 }}>{f(result.modes[m].pertesTotal)}</td></tr>)}</tbody>
          </table>
          <ul style={{ fontSize: 10, marginTop: 6 }}>{result.checks.map((c) => <li key={c.id}>{c.level === 'ko' ? '✗' : c.level === 'warn' ? '!' : '✓'} {c.label} : {c.detail}</li>)}</ul>
        </div>
      )}
    </>
  );
}
