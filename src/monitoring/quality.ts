// Qualité d'un relevé : trous, doublons, valeurs négatives, paliers figés, valeurs aberrantes. Pur.
// Une courbe de charge mal vérifiée donne des KPIs faux avec aplomb : ce contrôle précède toute analyse.
import { quantile } from './series';
import type { Issue, Measure } from './types';

export type Quality = { issues: Issue[]; completeness: number; gaps: number; duplicates: number; negatives: number; flat: number; outliers: number };

export function checkQuality(rows: Measure[], stepHours: number): Quality {
  const stepMs = stepHours * 3600000;
  const bySite = new Map<string, Measure[]>();
  for (const r of rows) { const a = bySite.get(r.site); if (a) a.push(r); else bySite.set(r.site, [r]); }
  let gaps = 0; let missing = 0; let expectedTotal = 0; let duplicates = 0; let negatives = 0; let flat = 0; let outliers = 0;
  const issues: Issue[] = [];
  for (const [site, list] of bySite) {
    const ts = list.map((r) => r.t); // trié globalement par instant
    expectedTotal += Math.round((ts[ts.length - 1] - ts[0]) / stepMs) + 1;
    let run = 1; let siteFlat = 0; let siteGaps = 0; let siteMissing = 0;
    for (let i = 1; i < list.length; i++) {
      const dt = list[i].t - list[i - 1].t;
      if (dt === 0) { duplicates++; continue; }
      if (dt > 1.5 * stepMs) { siteGaps++; siteMissing += Math.round(dt / stepMs) - 1; }
      if (list[i].kw === list[i - 1].kw && list[i].kw !== 0) { run++; if (run === Math.ceil(24 / stepHours)) siteFlat++; } else run = 1;
    }
    gaps += siteGaps; missing += siteMissing; flat += siteFlat;
    const kws = list.map((r) => r.kw);
    negatives += kws.filter((v) => v < 0).length;
    const sorted = [...kws].sort((a, b) => a - b);
    const q1 = quantile(sorted, 0.25); const q3 = quantile(sorted, 0.75); const iqr = q3 - q1;
    if (iqr > 0) outliers += kws.filter((v) => v > q3 + 6 * iqr || v < q1 - 6 * iqr).length;
    if (siteGaps) issues.push({ level: siteGaps > 3 || siteMissing > 0.02 * list.length ? 'avertissement' : 'info', message: `« ${site} » : ${siteGaps} trou(s), ${siteMissing} mesure(s) manquante(s).` });
    if (siteFlat) issues.push({ level: 'avertissement', message: `« ${site} » : ${siteFlat} palier(s) figé(s) sur 24 h ou plus (compteur gelé ou valeur reportée ?).` });
  }
  if (duplicates) issues.push({ level: 'avertissement', message: `${duplicates} horodatage(s) en double : les valeurs sont additionnées, ce qui peut gonfler l'énergie.` });
  if (negatives) issues.push({ level: 'avertissement', message: `${negatives} puissance(s) négative(s) (production injectée, signe inversé ou erreur de lecture).` });
  if (outliers) issues.push({ level: 'avertissement', message: `${outliers} valeur(s) très éloignée(s) de la distribution (plus de 6 écarts interquartiles) : vérifier l'unité ou un pic de mesure.` });
  const completeness = expectedTotal ? Math.max(0, Math.min(100, ((expectedTotal - missing) / expectedTotal) * 100)) : 100;
  if (completeness < 95) issues.unshift({ level: 'avertissement', message: `Complétude de ${completeness.toFixed(1).replace('.', ',')} % : les moyennes et l'énergie sous-estiment la consommation réelle.` });
  if (!issues.length) issues.push({ level: 'info', message: 'Aucune anomalie détectée : pas de trou, de doublon, de valeur négative ni de palier figé.' });
  return { issues, completeness, gaps, duplicates, negatives, flat, outliers };
}
