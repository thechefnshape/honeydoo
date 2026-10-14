import { ogCard, OG_SIZE } from '@/lib/og';
import { getMerchant } from '@/server/catalog';

export const size = OG_SIZE;
export const contentType = 'image/png';
export const alt = 'Shop on honeydoo';

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const m = await getMerchant((await params).slug);
  if (!m) return ogCard({ title: 'Anything local. Just ask.' });
  return ogCard({ eyebrow: m.category, title: m.name, detail: [m.neighborhood, `${m.city}, ${m.state}`].filter(Boolean).join(' · '), image: m.cover });
}
