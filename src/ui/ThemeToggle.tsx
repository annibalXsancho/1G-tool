'use client';
import { useEffect, useState } from 'react';
import { IconTheme } from './icons';

type Mode = 'auto' | 'light' | 'dark';
const LABEL: Record<Mode, string> = { auto: 'Thème : auto', light: 'Thème : clair', dark: 'Thème : sombre' };

export default function ThemeToggle() {
  const [mode, setMode] = useState<Mode>('auto');
  useEffect(() => {
    try {
      const s = localStorage.getItem('ee:theme');
      if (s === 'light' || s === 'dark') setMode(s);
    } catch { /* ignoré */ }
  }, []);
  const next = () => {
    const m: Mode = mode === 'auto' ? 'light' : mode === 'light' ? 'dark' : 'auto';
    setMode(m);
    if (m === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', m);
    try {
      if (m === 'auto') localStorage.removeItem('ee:theme');
      else localStorage.setItem('ee:theme', m);
    } catch { /* ignoré */ }
  };
  return (
    <button type="button" className="btn" onClick={next} title={LABEL[mode]} aria-label={LABEL[mode]}>
      <IconTheme /> <span className="hidden sm:inline text-xs text-ink-2">{mode === 'auto' ? 'Auto' : mode === 'light' ? 'Clair' : 'Sombre'}</span>
    </button>
  );
}
