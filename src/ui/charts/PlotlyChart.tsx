'use client';
// Graphique Plotly générique. Plotly (~4,6 Mo) est chargé à la demande, seulement sur les pages qui l'utilisent.
// `build` reçoit le thème résolu : le même code produit l'affichage (thème courant) et l'export (thème clair).
import { useEffect, useRef, useState } from 'react';
import type { Config, Data, Layout } from 'plotly.js';
import { baseLayout, exportTheme, readTheme, type ChartTheme } from './theme';

export type ChartSpec = { data: Data[]; layout?: Partial<Layout> };
export type BuildChart = (t: ChartTheme) => ChartSpec;

type PlotlyModule = typeof import('plotly.js');
let plotlyPromise: Promise<PlotlyModule> | null = null;
const loadPlotly = () => (plotlyPromise ??= import('plotly.js-dist-min').then((m) => ((m as unknown as { default?: PlotlyModule }).default ?? m) as PlotlyModule));

function merge(base: Partial<Layout>, extra: Partial<Layout> | undefined): Partial<Layout> {
  if (!extra) return base;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(extra)) {
    const b = (base as Record<string, unknown>)[k];
    out[k] = b && typeof b === 'object' && v && typeof v === 'object' && !Array.isArray(v) ? { ...(b as object), ...(v as object) } : v;
  }
  return out as Partial<Layout>;
}

const CONFIG: Partial<Config> = {
  displaylogo: false,
  responsive: true,
  locale: 'fr',
  modeBarButtonsToRemove: ['toImage', 'select2d', 'lasso2d', 'autoScale2d'],
};

/** Suit le thème clair/sombre (bascule manuelle et préférence système). */
function useThemeVersion(): number {
  const [v, setV] = useState(0);
  useEffect(() => {
    const bump = () => setV((x) => x + 1);
    const mo = new MutationObserver(bump);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const mq = matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', bump);
    return () => { mo.disconnect(); mq.removeEventListener('change', bump); };
  }, []);
  return v;
}

export async function exportChart(build: BuildChart, format: 'png' | 'svg', filename: string, size: { width: number; height: number }) {
  const Plotly = await loadPlotly();
  const t = exportTheme();
  const spec = build(t);
  const div = document.createElement('div');
  div.style.cssText = `position:fixed;left:-10000px;top:0;width:${size.width}px;height:${size.height}px`;
  document.body.appendChild(div);
  try {
    await Plotly.newPlot(div, spec.data, merge(baseLayout(t, true), { ...spec.layout, width: size.width, height: size.height }), { staticPlot: true });
    await Plotly.downloadImage(div, { format, filename, width: size.width, height: size.height, ...(format === 'png' ? { scale: 2 } : {}) } as Parameters<PlotlyModule['downloadImage']>[1]);
  } finally {
    Plotly.purge(div);
    div.remove();
  }
}

export default function PlotlyChart({ build, height = 420, label, exportName }: { build: BuildChart; height?: number; label: string; exportName?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const themeV = useThemeVersion();

  useEffect(() => {
    let alive = true;
    loadPlotly()
      .then((Plotly) => {
        if (!alive || !ref.current) return;
        const t = readTheme();
        const spec = build(t);
        return Plotly.react(ref.current, spec.data, merge(baseLayout(t), { height, ...spec.layout }), CONFIG).then(() => setLoading(false));
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => { alive = false; };
  }, [build, height, themeV]);

  useEffect(() => {
    const el = ref.current;
    return () => { if (el) loadPlotly().then((P) => P.purge(el)); };
  }, []);

  return (
    <figure className="relative m-0 w-full min-w-0">
      {exportName && (
        <div className="absolute right-0 top-0 z-10 flex gap-1">
          <button type="button" className="btn !min-h-8 !px-2 !text-[12px]" onClick={() => exportChart(build, 'png', exportName, { width: 1200, height: Math.max(height, 500) })}>PNG</button>
          <button type="button" className="btn !min-h-8 !px-2 !text-[12px]" onClick={() => exportChart(build, 'svg', exportName, { width: 1200, height: Math.max(height, 500) })}>SVG</button>
        </div>
      )}
      <div ref={ref} role="img" aria-label={label} style={{ height }} />
      {loading && !error && <div className="absolute inset-0 animate-pulse bg-sunken" aria-busy="true" />}
      {error && <p className="text-[13px] text-err">Graphique indisponible : {error}</p>}
    </figure>
  );
}
