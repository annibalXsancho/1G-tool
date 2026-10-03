'use client';
// Projet de plans de comptage courant (localStorage). Le fichier Excel exporté fait office de sauvegarde.
import type { Project } from '@/metering/model';
import { useUndoStore } from './undo-store';

export function useProject() {
  const s = useUndoStore<Project>('ee:plans');
  return { project: s.doc, ready: s.ready, replace: s.replace, edit: s.edit, undo: s.undo, canUndo: s.canUndo };
}
