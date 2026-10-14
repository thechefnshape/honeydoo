import { ogCard, OG_SIZE } from '@/lib/og';
import { getProduct } from '@/server/catalog';
import { formatMoney } from '@/lib/money';

export const size = OG_SIZE;
export const contentType = 'image/png';
export const alt = 'Product on honeydoo';

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const p = await getProduct((await params).id);
  if (!p) return ogCard({ title: 'Anything local. Just ask.' });
  const price = p.multiplePrices ? `From ${formatMoney(p.minPrice)}` : formatMoney(p.minPrice);
  return ogCard({ eyebrow: p.merchant.name, title: p.name, detail: `${price} · Ready for pickup`, image: p.image });
}
