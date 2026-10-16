'use client';
import { useEffect } from 'react';

export default function SwRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
      const base = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
      navigator.serviceWorker.register(`${base}/sw.js`, { scope: `${base}/` }).catch(() => { /* hors ligne non disponible : l'app reste utilisable en ligne */ });
    }
  }, []);
  return null;
}
