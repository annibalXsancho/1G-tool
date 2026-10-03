'use client';
// Projet d'unifilaires courant (localStorage). Le fichier Excel exporté fait office de sauvegarde.
import type { UProject } from '@/unifilaire/model';
import { useUndoStore } from './undo-store';

export function useUnifilaires() {
  const s = useUndoStore<UProject>('ee:unifilaire');
  return { project: s.doc, ready: s.ready, replace: s.replace, edit: s.edit, undo: s.undo, canUndo: s.canUndo };
}
