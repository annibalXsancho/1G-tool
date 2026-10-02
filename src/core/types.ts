import type { Dimension } from './units';

export type Category = 'thermique' | 'fluides' | 'electricite' | 'utilites' | 'suivi';

/** Condition d'affichage d'un champ : la valeur brute du champ `key` doit appartenir à `in`. */
export type Condition = { key: string; in: string[] };

type FieldBase = { key: string; label: string; help?: string; showIf?: Condition };

export type NumberField = FieldBase & {
  type: 'number';
  dimension: Dimension;
  /** Unités acceptées ; la première est l'unité par défaut. Par défaut : toutes celles de la dimension. */
  units?: string[];
  /** Valeur par défaut en SI. */
  default: number;
  /** Bornes en SI. */
  min?: number;
  max?: number;
};

export type ChoiceField = FieldBase & {
  type: 'choice';
  options: { value: string; label: string }[];
  default: string;
};

export type RowColumn = Omit<NumberField, 'showIf' | 'help'> | Omit<ChoiceField, 'showIf' | 'help'>;

export type RowsField = FieldBase & {
  type: 'rows';
  columns: RowColumn[];
  /** Lignes par défaut ; valeurs numériques en SI. */
  default: Record<string, number | string>[];
  minRows?: number;
  maxRows?: number;
  rowLabel?: string;
};

export type InputField = NumberField | ChoiceField | RowsField;

export type Reference = { source: string; section?: string; note?: string };

export type Quantity = {
  key: string;
  label: string;
  /** Valeur en SI. */
  value: number;
  dimension: Dimension;
  /** Unité d'affichage suggérée (sinon celle de la dimension). */
  unit?: string;
};

export type Warning = {
  /** `validity` = sortie du domaine de validité du moteur ; `info` = simple remarque. */
  level: 'info' | 'validity';
  message: string;
};

export type Formula = { label: string; symbolic: string; substituted: string };

export type FieldError = { key?: string; message: string };

/** Rendu sur mesure optionnel ; l'interface ignore les types qu'elle ne connaît pas. */
export type Display = {
  type: 'scatter-regression';
  xLabel: string;
  yLabel: string;
  points: { x: number; y: number }[];
  line: { x: number; y: number }[];
};

export type ResultOk<O> = {
  ok: true;
  main: Quantity[];
  intermediates: Quantity[];
  warnings: Warning[];
  formulas: Formula[];
  display?: Display;
  data: O;
};
export type ResultErr = { ok: false; errors: FieldError[] };
export type Result<O> = ResultOk<O> | ResultErr;

export type Calculator<I, O> = {
  id: string;
  title: string;
  category: Category;
  summary: string;
  inputs: InputField[];
  compute: (input: I) => Result<O>;
  references: Reference[];
  assumptions: string[];
  validity: string[];
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyCalculator = Calculator<any, any>;

export function defineCalculator<I, O>(c: Calculator<I, O>): Calculator<I, O> {
  return c;
}
