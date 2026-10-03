'use client';
// Export d'un SVG de la page (couleurs déjà explicites) en fichier SVG ou PNG.
import { downloadBlob } from './download';

function standalone(svg: SVGSVGElement): { text: string; width: number; height: number } {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const vb = svg.viewBox.baseVal;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(vb.width));
  clone.setAttribute('height', String(vb.height));
  clone.style.width = '';
  clone.style.height = '';
  clone.style.maxWidth = '';
  clone.style.maxHeight = '';
  return { text: new XMLSerializer().serializeToString(clone), width: vb.width, height: vb.height };
}

export function exportSvgElement(svg: SVGSVGElement, filename: string) {
  downloadBlob(new Blob([standalone(svg).text], { type: 'image/svg+xml;charset=utf-8' }), filename);
}

export async function exportPngElement(svg: SVGSVGElement, filename: string, scale = 2) {
  const { text, width, height } = standalone(svg);
  const url = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = new Image();
    await new Promise<void>((ok, ko) => { img.onload = () => ok(); img.onerror = () => ko(new Error('Rendu de l’image impossible')); img.src = url; });
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
