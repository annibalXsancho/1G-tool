// Formatage numérique pur (aucun accès DOM) partagé par l'interface et par les
// textes produits par les moteurs (formules LaTeX, avertissements).

const MINUS = '−';
const NNBSP = ' ';
const SUP: Record<string, string> = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };

export function fmtNum(v: number, sig = 4, mode: 'text' | 'tex' = 'text'): string {
  if (!Number.isFinite(v)) return '—';
  if (v === 0) return '0';
  const abs = Math.abs(v);
  const neg = v < 0;
  if (abs < 1e-3 || abs >= 1e12) {
    const [m, e] = v.toExponential(sig - 1).split('e');
    const mant = (m.includes('.') ? m.replace(/\.?0+$/, '') : m).replace('.', mode === 'tex' ? '{,}' : ',');
    const exp = String(Number(e));
    if (mode === 'tex') return `${mant}\\times 10^{${exp}}`;
    return `${mant.replace('-', MINUS)}×10${[...exp].map((c) => SUP[c] ?? c).join('')}`;
  }
  const dec = Math.min(20, Math.max(0, sig - 1 - Math.floor(Math.log10(abs))));
  let s = abs.toFixed(dec);
  if (Number(s) === 0) return '0';
  if (s.includes('.')) s = s.replace(/\.?0+$/, '');
  let [int, frac] = s.split('.');
  if (int.length >= 5) int = int.replace(/\B(?=(\d{3})+(?!\d))/g, mode === 'tex' ? '\\,' : NNBSP);
  const body = frac ? `${int}${mode === 'tex' ? '{,}' : ','}${frac}` : int;
  return neg ? (mode === 'tex' ? `-${body}` : `${MINUS}${body}`) : body;
}

export const tex = (v: number, sig = 4) => fmtNum(v, sig, 'tex');
