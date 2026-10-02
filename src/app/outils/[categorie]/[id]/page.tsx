import { notFound } from 'next/navigation';
import { byId, calculators } from '@/engines/registry';
import CalculatorView from '@/ui/CalculatorView';

export const dynamicParams = false;
export const generateStaticParams = () => calculators.map((c) => ({ categorie: c.category, id: c.id }));

export async function generateMetadata({ params }: { params: Promise<{ categorie: string; id: string }> }) {
  const { id } = await params;
  return { title: byId(id)?.title };
}

export default async function ToolPage({ params }: { params: Promise<{ categorie: string; id: string }> }) {
  const { id, categorie } = await params;
  const calc = byId(id);
  if (!calc || calc.category !== categorie) notFound();
  return <CalculatorView id={id} />;
}
