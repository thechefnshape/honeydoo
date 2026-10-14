import { env } from './env';
import type { Hours } from './hours';
import type { MerchantCard, ProductDetail } from '@/server/catalog';

// Search and link-preview helpers. Demo shops are fictional, so they are never described to search
// engines as real businesses: no structured data, no sitemap entry, and noindex on their pages.

export const siteUrl = () => env().APP_URL.replace(/\/$/, '');
export const abs = (path: string) => `${siteUrl()}${path.startsWith('/') ? path : `/${path}`}`;
export const indexingEnabled = () => env().SITE_INDEXING === 'true';
export const SITE_NAME = 'honeydoo';
export const TAGLINE = 'Anything local. Just ask.';

export const clip = (s: string, n = 155) => {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length <= n ? t : `${t.slice(0, n - 1).replace(/[\s,.;:]+\S*$/, '')}...`;
};
export const dollars = (minor: number) => (minor / 100).toFixed(2);

/** Open Graph fields with the site-wide defaults (a page's openGraph replaces the parent's entirely). */
export const ogMeta = (o: { title: string; description: string; url?: string }) => ({ type: 'website' as const, siteName: SITE_NAME, locale: 'en_US', ...o });

/** Robots value for a page that should stay out of search. */
export const NOINDEX = { index: false, follow: false } as const;

const TYPE: Record<string, string> = {
  coffee: 'CafeOrCoffeeShop', food: 'Bakery', flowers: 'Florist', groceries: 'GroceryStore', gifts: 'Store',
  home: 'HomeGoodsStore', plants: 'GardenStore', books: 'BookStore',
};
const DAY: Record<string, string> = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };

export function openingHours(hours: Hours) {
  return Object.entries(hours).flatMap(([d, spans]) =>
    (spans ?? []).map(([opens, closes]) => ({ '@type': 'OpeningHoursSpecification', dayOfWeek: `https://schema.org/${DAY[d]}`, opens, closes })));
}

export function storeJsonLd(m: MerchantCard) {
  return {
    '@context': 'https://schema.org',
    '@type': TYPE[m.category] ?? 'Store',
    '@id': abs(`/shop/${m.slug}#store`),
    name: m.name,
    description: m.description || undefined,
    url: abs(`/shop/${m.slug}`),
    image: m.cover || undefined,
    logo: m.logo || undefined,
    telephone: m.phone || undefined,
    address: { '@type': 'PostalAddress', streetAddress: m.address, addressLocality: m.city, addressRegion: m.state, postalCode: m.postalCode || undefined, addressCountry: 'US' },
    geo: m.geo ? { '@type': 'GeoCoordinates', latitude: m.geo.lat, longitude: m.geo.lng } : undefined,
    openingHoursSpecification: openingHours(m.hours),
    potentialAction: { '@type': 'OrderAction', target: abs(`/shop/${m.slug}`), deliveryMethod: 'http://purl.org/goodrelations/v1#DeliveryModePickUp' },
  };
}

export function productJsonLd(p: ProductDetail, m: MerchantCard | null) {
  const sellable = p.variations.filter((v) => v.sellable);
  const inStock = p.availability !== 'sold_out' && sellable.length > 0;
  const availability = `https://schema.org/${inStock ? 'InStock' : 'OutOfStock'}`;
  const seller = { '@type': 'LocalBusiness', name: p.merchant.name, '@id': abs(`/shop/${p.merchant.slug}#store`) };
  const offers = p.multiplePrices
    ? { '@type': 'AggregateOffer', priceCurrency: p.currency, lowPrice: dollars(p.minPrice), highPrice: dollars(p.maxPrice), offerCount: p.variations.length, availability, seller }
    : { '@type': 'Offer', priceCurrency: p.currency, price: dollars(p.minPrice), availability, url: abs(`/product/${p.id}`), seller,
        availableDeliveryMethod: 'http://purl.org/goodrelations/v1#DeliveryModePickUp',
        ...(m ? { availableAtOrFrom: { '@type': 'Place', address: { '@type': 'PostalAddress', streetAddress: m.address, addressLocality: m.city, addressRegion: m.state, addressCountry: 'US' } } } : {}) };
  return {
    '@context': 'https://schema.org', '@type': 'Product', name: p.name, description: p.description || undefined,
    image: p.image || undefined, url: abs(`/product/${p.id}`), category: p.category || undefined, offers,
  };
}

export function breadcrumbJsonLd(items: [string, string][]) {
  return { '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: items.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: abs(path) })) };
}

export function siteJsonLd() {
  return [
    { '@context': 'https://schema.org', '@type': 'Organization', '@id': abs('/#org'), name: SITE_NAME, url: abs('/'), logo: abs('/icon.svg'), slogan: TAGLINE },
    { '@context': 'https://schema.org', '@type': 'WebSite', '@id': abs('/#site'), name: SITE_NAME, url: abs('/'), publisher: { '@id': abs('/#org') } },
  ];
}
