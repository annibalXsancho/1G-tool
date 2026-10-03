'use client';
// Modèle de site courant, conservé dans le navigateur (localStorage). Le fichier Excel exporté fait office de sauvegarde.
import { useCallback, useEffect, useState } from 'react';
import type { SiteModel } from '@/site/model';

const KEY = 'ee:site';

export function useSiteModel(): [SiteModel | null, (m: SiteModel | null) => void, boolean] {
  const [model, setModel] = useState<SiteModel | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setModel(JSON.parse(raw) as SiteModel);
    } catch { /* stockage indisponible ou contenu illisible */ }
    setReady(true);
  }, []);
  const set = useCallback((m: SiteModel | null) => {
    setModel(m);
    try {
      if (m) localStorage.setItem(KEY, JSON.stringify(m));
      else localStorage.removeItem(KEY);
    } catch { /* ignoré */ }
  }, []);
  return [model, set, ready];
}
