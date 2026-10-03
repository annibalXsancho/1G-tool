'use client';
// Stockage local d'un document modifiable avec annulation (50 étapes). Les frappes successives d'un même champ
// (même `groupKey`, à moins de 2 s d'intervalle) forment une seule étape d'annulation.
import { useCallback, useEffect, useRef, useState } from 'react';

const MAX_UNDO = 50;

export type UndoStore<T> = {
  doc: T | null;
  ready: boolean;
  /** Remplace le document (import, exemple, vider) et réinitialise l'historique. */
  replace: (d: T | null) => void;
  edit: (fn: (d: T) => T, groupKey?: string) => void;
  undo: () => void;
  canUndo: boolean;
};

export function useUndoStore<T>(key: string): UndoStore<T> {
  const [doc, setDoc] = useState<T | null>(null);
  const [ready, setReady] = useState(false);
  const history = useRef<T[]>([]);
  const lastGroup = useRef<{ key: string; t: number } | null>(null);
  const [, force] = useState(0);

  const persist = useCallback((d: T | null) => {
    try {
      if (d) localStorage.setItem(key, JSON.stringify(d));
      else localStorage.removeItem(key);
    } catch { /* stockage indisponible : on continue sans persistance */ }
  }, [key]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) setDoc(JSON.parse(raw) as T);
    } catch { /* contenu illisible : document vide */ }
    setReady(true);
  }, [key]);

  const replace = useCallback((d: T | null) => {
    history.current = [];
    lastGroup.current = null;
    setDoc(d);
    persist(d);
    force((x) => x + 1);
  }, [persist]);

  const edit = useCallback((fn: (d: T) => T, groupKey?: string) => {
    const now = Date.now();
    const grouped = !!groupKey && lastGroup.current?.key === groupKey && now - lastGroup.current.t < 2000;
    lastGroup.current = groupKey ? { key: groupKey, t: now } : null;
    setDoc((cur) => {
      if (!cur) return cur;
      const next = fn(cur);
      if (!grouped) history.current = [...history.current.slice(-(MAX_UNDO - 1)), cur];
      persist(next);
      return next;
    });
    force((x) => x + 1);
  }, [persist]);

  const undo = useCallback(() => {
    lastGroup.current = null;
    const prev = history.current.pop();
    if (!prev) return;
    setDoc(prev);
    persist(prev);
    force((x) => x + 1);
  }, [persist]);

  return { doc, ready, replace, edit, undo, canUndo: history.current.length > 0 };
}
