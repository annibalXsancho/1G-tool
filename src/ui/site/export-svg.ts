'use client';
// Export d'un SVG affiché à l'écran en fichier autonome (SVG ou PNG), avec les couleurs du thème clair.
import { downloadBlob } from '@/lib/download';
import { EXPORT_COLORS } from './carriers';

function standalone(svg: SVGSVGElement): { text: string; width: number; height: number } {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const vb = svg.viewBox.baseVal;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(vb.width));
  clone.setAttribute('height', String(vb.height));
  clone.removeAttribute('class');
  // Variables CSS → couleurs explicites (un fichier SVG isolé ne connaît pas les tokens de la page).
  clone.querySelectorAll('*').forEach((el) => {
    for (const attr of ['fill', 'stroke']) {
      const v = el.getAttribute(attr);
      const m = v?.match(/^var\((--[\w-]+)\)$/);
      if (m) el.setAttribute(attr, EXPORT_COLORS[m[1]] ?? '#000000');
    }
  });
  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bg.setAttribute('width', '100%');
  bg.setAttribute('height', '100%');
  bg.setAttribute('fill', EXPORT_COLORS['--surface']);
  clone.insertBefore(bg, clone.firstChild);
  return { text: new XMLSerializer().serializeToString(clone), width: vb.width, height: vb.height };
}

export function exportSvg(svg: SVGSVGElement, filename: string) {
  const { text } = standalone(svg);
  downloadBlob(new Blob([text], { type: 'image/svg+xml;charset=utf-8' }), filename);
}

export async function exportPng(svg: SVGSVGElement, filename: string, scale = 2) {
  const { text, width, height } = standalone(svg);
  const url = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Rendu de l’image impossible'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas indisponible');
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
    if (blob) downloadBlob(blob, filename);
  } finally {
    URL.revokeObjectURL(url);
  }
}
