'use client';
// Favoris et historique récent : localStorage, jamais bloquant (peut être indisponible).
import { useCallback, useEffect, useState } from 'react';

export type HistoryEntry = { sid: string; id: string; title: string; search: string; ts: number; summary: string };

function read<T>(key: string): T[] {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
function write(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* stockage indisponible : on continue sans persistance */
  }
}

const FAV = 'ee:favoris';
const HIST = 'ee:historique';

export function useFavorites(): [string[], (id: string) => void] {
  const [favs, setFavs] = useState<string[]>([]);
  useEffect(() => setFavs(read<string>(FAV)), []);
  const toggle = useCallback((id: string) => {
    setFavs((cur) => {
      const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
      write(FAV, next);
      return next;
    });
  }, []);
  return [favs, toggle];
}

export function useHistory(): HistoryEntry[] {
  const [h, setH] = useState<HistoryEntry[]>([]);
  useEffect(() => setH(read<HistoryEntry>(HIST)), []);
  return h;
}

/** Une entrée par session de saisie (sid) : elle est mise à jour au fil des modifications. */
export function recordHistory(e: HistoryEntry) {
  const rest = read<HistoryEntry>(HIST).filter((x) => x.sid !== e.sid);
  write(HIST, [e, ...rest].slice(0, 20));
}
