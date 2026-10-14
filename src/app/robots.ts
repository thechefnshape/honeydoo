import type { MetadataRoute } from 'next';
import { abs, indexingEnabled } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export default function robots(): MetadataRoute.Robots {
  // Staging, previews and pre-launch: keep everything out of search.
  if (!indexingEnabled()) return { rules: { userAgent: '*', disallow: '/' } };
  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/merchant/connect'],
      disallow: ['/api/', '/admin', '/merchant', '/checkout', '/bag', '/orders', '/profile', '/signin', '/signup', '/account', '/search?'],
    },
    sitemap: abs('/sitemap.xml'),
  };
}
