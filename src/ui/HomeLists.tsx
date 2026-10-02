'use client';
import Link from 'next/link';
import { byId } from '@/engines/registry';
import { useFavorites, useHistory } from '@/lib/storage';

export default function HomeLists() {
  const [favs] = useFavorites();
  const hist = useHistory();
  const favCalcs = favs.map((id) => byId(id)).filter((c) => !!c);
  if (favCalcs.length === 0 && hist.length === 0) return null;
  return (
    <div className="mb-8 grid gap-px border bg-rule md:grid-cols-2">
      <section className="bg-surface p-4">
        <h2 className="eyebrow mb-2">Favoris</h2>
        {favCalcs.length === 0 ? <p className="text-[13px] text-ink-3">Aucun favori.</p> : (
          <ul>{favCalcs.map((c) => <li key={c!.id}><Link className="block border-t py-1.5 text-[13px] hover:text-accent" href={`/outils/${c!.category}/${c!.id}/`}>{c!.title}</Link></li>)}</ul>
        )}
      </section>
      <section className="bg-surface p-4">
        <h2 className="eyebrow mb-2">Calculs récents</h2>
        {hist.length === 0 ? <p className="text-[13px] text-ink-3">Aucun calcul récent.</p> : (
          <ul>
            {hist.slice(0, 6).map((h) => {
              const c = byId(h.id);
              if (!c) return null;
              return (
                <li key={h.sid}>
                  <Link className="flex items-baseline justify-between gap-3 border-t py-1.5 text-[13px] hover:text-accent" href={`/outils/${c.category}/${c.id}/${h.search ? `?${h.search}` : ''}`}>
                    <span>{h.title}</span><span className="num text-ink-2">{h.summary}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
