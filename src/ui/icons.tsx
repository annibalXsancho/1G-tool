import type { ReactNode } from 'react';

const I = ({ children, size = 16 }: { children: ReactNode; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" aria-hidden="true">{children}</svg>
);
export const IconStar = ({ filled }: { filled?: boolean }) => (
  <I><path d="M12 3l2.7 5.8 6.3.7-4.7 4.3 1.3 6.2L12 17l-5.6 3 1.3-6.2L3 9.5l6.3-.7z" fill={filled ? 'currentColor' : 'none'} /></I>
);
export const IconPrint = () => <I><path d="M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z" /></I>;
export const IconLink = () => <I><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></I>;
export const IconMenu = () => <I><path d="M4 7h16M4 12h16M4 17h16" /></I>;
export const IconClose = () => <I><path d="M6 6l12 12M18 6L6 18" /></I>;
export const IconTheme = () => <I><circle cx="12" cy="12" r="8" /><path d="M12 4v16" /><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" /></I>;
export const IconWarn = () => <I><path d="M12 3l10 18H2zM12 10v5M12 18v.5" /></I>;
export const IconAlert = () => <I><circle cx="12" cy="12" r="9" /><path d="M12 7v6M12 16v.5" /></I>;
export const IconInfo = () => <I><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.5" /></I>;
