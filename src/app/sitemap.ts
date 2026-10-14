import type { MetadataRoute } from 'next';
import { abs } from '@/lib/seo';
import { sitemapEntries } from '@/server/catalog';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { shops, products } = await sitemapEntries();
  const now = new Date();
  return [
    { url: abs('/'), lastModified: now, changeFrequency: 'daily', priority: 1 },
    { url: abs('/shops'), lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    { url: abs('/merchant/connect'), changeFrequency: 'monthly', priority: 0.5 },
    { url: abs('/privacy'), changeFrequency: 'yearly', priority: 0.2 },
    { url: abs('/terms'), changeFrequency: 'yearly', priority: 0.2 },
    ...shops.map((s) => ({ url: abs(`/shop/${s.slug}`), lastModified: new Date(s.updated_at), changeFrequency: 'daily' as const, priority: 0.8 })),
    ...products.map((p) => ({ url: abs(`/product/${p.id}`), lastModified: new Date(p.updated_at), changeFrequency: 'daily' as const, priority: 0.6 })),
  ];
}
