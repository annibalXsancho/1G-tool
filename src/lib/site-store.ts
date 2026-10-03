'use client';
// Modèle de site courant (localStorage). Le fichier Excel exporté fait office de sauvegarde.
import type { SiteModel } from '@/site/model';
import { useUndoStore } from './undo-store';

export function useSiteModel() {
  const s = useUndoStore<SiteModel>('ee:site');
  return { model: s.doc, ready: s.ready, replace: s.replace, edit: s.edit, undo: s.undo, canUndo: s.canUndo };
}
