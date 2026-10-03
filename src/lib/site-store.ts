'use client';
// Modèle de site courant, conservé dans le navigateur (localStorage). Le fichier Excel exporté fait office de sauvegarde.
// Historique d'annulation en mémoire (50 états) pour les modifications faites dans l'outil.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { SiteModel } from '@/site/model';

const KEY = 'ee:site';
const MAX_UNDO = 50;

function persist(m: SiteModel | null) {
  try {
    if (m) localStorage.setItem(KEY, JSON.stringify(m));
    else localStorage.removeItem(KEY);
  } catch { /* stockage indisponible : on continue sans persistance */ }
}

export type SiteStore = {
  model: SiteModel | null;
  ready: boolean;
  /** Remplace le modèle (import, exemple, vider) et réinitialise l'historique. */
  replace: (m: SiteModel | null) => void;
  /** Applique une modification annulable. Des modifications successives de même `groupKey` (frappes dans un même
   * champ, à moins de 2 s d'intervalle) forment une seule étape d'annulation. */
  edit: (fn: (m: SiteModel) => SiteModel, groupKey?: string) => void;
  undo: () => void;
  canUndo: boolean;
};

export function useSiteModel(): SiteStore {
  const [model, setModel] = useState<SiteModel | null>(null);
  const [ready, setReady] = useState(false);
  const history = useRef<SiteModel[]>([]);
  const lastGroup = useRef<{ key: string; t: number } | null>(null);
  const [, force] = useState(0);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setModel(JSON.parse(raw) as SiteModel);
    } catch { /* contenu illisible : modèle vide */ }
    setReady(true);
  }, []);

  const replace = useCallback((m: SiteModel | null) => {
    history.current = [];
    lastGroup.current = null;
    setModel(m);
    persist(m);
    force((x) => x + 1);
  }, []);

  const edit = useCallback((fn: (m: SiteModel) => SiteModel, groupKey?: string) => {
    const now = Date.now();
    const grouped = !!groupKey && lastGroup.current?.key === groupKey && now - lastGroup.current.t < 2000;
    lastGroup.current = groupKey ? { key: groupKey, t: now } : null;
    setModel((cur) => {
      if (!cur) return cur;
      const next = fn(cur);
      if (!grouped) history.current = [...history.current.slice(-(MAX_UNDO - 1)), cur];
      persist(next);
      return next;
    });
    force((x) => x + 1);
  }, []);

  const undo = useCallback(() => {
    lastGroup.current = null;
    const prev = history.current.pop();
    if (!prev) return;
    setModel(prev);
    persist(prev);
    force((x) => x + 1);
  }, []);

  return { model, ready, replace, edit, undo, canUndo: history.current.length > 0 };
}
