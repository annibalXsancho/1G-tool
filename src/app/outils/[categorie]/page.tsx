import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CATEGORIES } from '@/core/categories';
import { byCategory } from '@/engines/registry';

export const dynamicParams = false;
export const generateStaticParams = () => CATEGORIES.map((c) => ({ categorie: c.id }));

export async function generateMetadata({ params }: { params: Promise<{ categorie: string }> }) {
  const { categorie } = await params;
  return { title: CATEGORIES.find((c) => c.id === categorie)?.label };
}

export default async function CategoryPage({ params }: { params: Promise<{ categorie: string }> }) {
  const { categorie } = await params;
  const cat = CATEGORIES.find((c) => c.id === categorie);
  if (!cat) notFound();
  const tools = byCategory(cat.id);
  return (
    <div>
      <p className="eyebrow">Catégorie</p>
      <h1 className="text-[26px] font-semibold tracking-tight">{cat.label}</h1>
      <p className="mb-5 text-[13px] text-ink-2">{cat.blurb}</p>
      <ul className="border bg-surface">
        {tools.length === 0 && <li className="p-4 text-[13px] text-ink-3">Aucun outil dans cette catégorie pour l’instant.</li>}
        {tools.map((t) => (
          <li key={t.id} className="border-t first:border-t-0">
            <Link href={`/outils/${t.category}/${t.id}/`} className="block p-4 hover:bg-sunken">
              <span className="block text-[14px] font-medium">{t.title}</span>
              <span className="block text-[13px] text-ink-2">{t.summary}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
