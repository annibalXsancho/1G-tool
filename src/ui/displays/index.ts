import type { ComponentType } from 'react';
import type { Display } from '@/core/types';
import TableView from './TableView';

// Table type → composant de rendu sur mesure. Un type absent de cette table est ignoré :
// le rendu général (résultat principal + grandeurs intermédiaires) reste intact.
export const displays: Record<string, ComponentType<{ display: Display }>> = {
  table: TableView,
  // 'scatter-regression' : ajouté avec le calculateur « signature énergétique ».
};
