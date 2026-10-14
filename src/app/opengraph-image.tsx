import { ogCard, OG_SIZE } from '@/lib/og';

export const size = OG_SIZE;
export const contentType = 'image/png';
export const alt = 'honeydoo. Anything local. Just ask.';

export default function Image() {
  return ogCard({ title: 'Anything local. Just ask.', detail: 'Shop the independent businesses in your neighborhood, ready for pickup.' });
}
