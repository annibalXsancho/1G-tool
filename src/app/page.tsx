import Link from 'next/link';
import { CATEGORIES } from '@/core/categories';
import { byCategory } from '@/engines/registry';
import HomeLists from '@/ui/HomeLists';

export default function Home() {
  return (
    <div>
      <h1 className="text-[26px] font-semibold tracking-tight">Calculs d’ingénierie énergétique</h1>
      <p className="mb-6 mt-1 max-w-prose text-[13px] text-ink-2">Chaque résultat est accompagné de sa formule, de ses hypothèses et de sa source. Tout s’exécute dans le navigateur, hors ligne une fois la page chargée.</p>
      <HomeLists />
      <div className="grid gap-px border bg-rule md:grid-cols-2 xl:grid-cols-3">
        {CATEGORIES.map((cat) => {
          const tools = byCategory(cat.id);
          return (
            <section key={cat.id} className="bg-surface p-4">
              <Link href={`/outils/${cat.id}/`} className="block"><h2 className="text-[15px] font-semibold">{cat.label}</h2><p className="text-[12px] text-ink-3">{cat.blurb}</p></Link>
              <ul className="mt-3">
                {tools.length === 0 && <li className="border-t py-1.5 text-[13px] text-ink-3">Bientôt</li>}
                {tools.map((t) => (
                  <li key={t.id}>
                    <Link href={`/outils/${t.category}/${t.id}/`} className="block border-t py-2 hover:text-accent">
                      <span className="block text-[13px] font-medium">{t.title}</span>
                      <span className="block text-[12px] text-ink-2">{t.summary}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
