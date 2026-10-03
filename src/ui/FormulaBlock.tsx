'use client';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { useMemo } from 'react';

export default function FormulaBlock({ latex, display = true }: { latex: string; display?: boolean }) {
  const html = useMemo(() => katex.renderToString(latex, { displayMode: display, throwOnError: false, output: 'html' }), [latex, display]);
  if (!display) return <span dangerouslySetInnerHTML={{ __html: html }} />;
  return <div className="overflow-x-auto overflow-y-hidden" dangerouslySetInnerHTML={{ __html: html }} />;
}
