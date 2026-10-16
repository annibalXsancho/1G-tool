import type { Metadata, Viewport } from 'next';
import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-500.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import './globals.css';
import Shell from '@/ui/Shell';
import SwRegister from '@/ui/SwRegister';

export const metadata: Metadata = {
  title: { default: 'Énergie · Calculs', template: '%s · Énergie · Calculs' },
  description: 'Calculs d’ingénierie énergétique avec formules, hypothèses et sources.',
  manifest: `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/manifest.webmanifest`,
  icons: { icon: `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/icons/icon-192.png`, apple: `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/icons/icon-192.png` },
};
export const viewport: Viewport = { themeColor: '#0f6b5c' };

// Thème appliqué avant le premier rendu pour éviter tout flash.
const themeScript = `try{var t=localStorage.getItem('ee:theme');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t)}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body>
        <Shell>{children}</Shell>
        <SwRegister />
      </body>
    </html>
  );
}
