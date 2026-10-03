'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { CATEGORIES } from '@/core/categories';
import { byCategory } from '@/engines/registry';
import ThemeToggle from './ThemeToggle';
import { IconClose, IconMenu } from './icons';

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const path = usePathname();
  return (
    <nav aria-label="Outils" className="flex flex-col gap-5">
      <div>
        <p className="eyebrow py-1">Site & livrables</p>
        <Link
          href="/site/" onClick={onNavigate} aria-current={path === '/site/' ? 'page' : undefined}
          className={`block border-l-2 py-1.5 pl-3 text-[13px] leading-snug transition-colors ${path === '/site/' ? 'border-accent font-medium text-ink' : 'border-rule text-ink-2 hover:text-ink'}`}
        >
          Modèle de site · Sankey · bilans
        </Link>
        <Link
          href="/comptage/" onClick={onNavigate} aria-current={path === '/comptage/' ? 'page' : undefined}
          className={`block border-l-2 py-1.5 pl-3 text-[13px] leading-snug transition-colors ${path === '/comptage/' ? 'border-accent font-medium text-ink' : 'border-rule text-ink-2 hover:text-ink'}`}
        >
          Plans de comptage
        </Link>
        <Link
          href="/unifilaire/" onClick={onNavigate} aria-current={path === '/unifilaire/' ? 'page' : undefined}
          className={`block border-l-2 py-1.5 pl-3 text-[13px] leading-snug transition-colors ${path === '/unifilaire/' ? 'border-accent font-medium text-ink' : 'border-rule text-ink-2 hover:text-ink'}`}
        >
          Schémas unifilaires
        </Link>
        <Link
          href="/ecs/" onClick={onNavigate} aria-current={path === '/ecs/' ? 'page' : undefined}
          className={`block border-l-2 py-1.5 pl-3 text-[13px] leading-snug transition-colors ${path === '/ecs/' ? 'border-accent font-medium text-ink' : 'border-rule text-ink-2 hover:text-ink'}`}
        >
          Production et stockage d’ECS
        </Link>
        <Link
          href="/suivi/" onClick={onNavigate} aria-current={path === '/suivi/' ? 'page' : undefined}
          className={`block border-l-2 py-1.5 pl-3 text-[13px] leading-snug transition-colors ${path === '/suivi/' ? 'border-accent font-medium text-ink' : 'border-rule text-ink-2 hover:text-ink'}`}
        >
          Signature énergétique · IPÉ · CUSUM
        </Link>
        <Link
          href="/monitoring/" onClick={onNavigate} aria-current={path === '/monitoring/' ? 'page' : undefined}
          className={`block border-l-2 py-1.5 pl-3 text-[13px] leading-snug transition-colors ${path === '/monitoring/' ? 'border-accent font-medium text-ink' : 'border-rule text-ink-2 hover:text-ink'}`}
        >
          Monitoring · simulation IPMVP
        </Link>
      </div>
      {CATEGORIES.map((cat) => {
        const tools = byCategory(cat.id);
        return (
          <div key={cat.id}>
            <Link href={`/outils/${cat.id}/`} onClick={onNavigate} className="eyebrow hover:text-ink block py-1">{cat.label}</Link>
            {tools.length === 0 ? (
              <p className="py-1 text-[13px] text-ink-3">Bientôt</p>
            ) : (
              <ul>
                {tools.map((t) => {
                  const href = `/outils/${t.category}/${t.id}/`;
                  const active = path === href;
                  return (
                    <li key={t.id}>
                      <Link
                        href={href}
                        onClick={onNavigate}
                        aria-current={active ? 'page' : undefined}
                        className={`block border-l-2 py-1.5 pl-3 text-[13px] leading-snug transition-colors ${active ? 'border-accent text-ink font-medium' : 'border-rule text-ink-2 hover:text-ink'}`}
                      >
                        {t.title}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </nav>
  );
}

export default function Shell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="screen-only hidden lg:block border-r bg-surface">
        <div className="sticky top-0 flex max-h-dvh flex-col gap-6 overflow-y-auto p-5">
          <Link href="/" className="block">
            <span className="block text-[15px] font-semibold tracking-tight">Énergie · Calculs</span>
            <span className="eyebrow">Notes de calcul d’audit</span>
          </Link>
          <NavList />
        </div>
      </aside>
      <div className="min-w-0">
        <header className="screen-only sticky top-0 z-20 flex items-center justify-between gap-3 border-b bg-surface px-4 py-2 lg:static lg:bg-transparent lg:px-6">
          <button type="button" className="btn lg:hidden" onClick={() => setOpen(true)} aria-label="Ouvrir le menu"><IconMenu /> Outils</button>
          <Link href="/" className="text-sm font-semibold lg:hidden">Énergie · Calculs</Link>
          <div className="ml-auto"><ThemeToggle /></div>
        </header>
        {open && (
          <div className="screen-only fixed inset-0 z-30 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
            <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
            <div className="absolute inset-y-0 left-0 w-[85%] max-w-xs overflow-y-auto bg-surface p-5">
              <button type="button" className="btn mb-4" onClick={() => setOpen(false)}><IconClose /> Fermer</button>
              <NavList onNavigate={() => setOpen(false)} />
            </div>
          </div>
        )}
        <main className="px-4 py-5 lg:px-6">{children}</main>
      </div>
    </div>
  );
}
