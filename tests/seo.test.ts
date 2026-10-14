import { describe, it, expect, beforeAll } from 'vitest';
import { freshDb, squareMerchant } from './helpers';
import { getMerchant, getProduct, sitemapEntries } from '../src/server/catalog';
import { breadcrumbJsonLd, clip, indexingEnabled, openingHours, productJsonLd, storeJsonLd } from '../src/lib/seo';
import { resetEnvForTests } from '../src/lib/env';
import type { Db } from '../src/lib/db';

let db: Db;
beforeAll(async () => { db = await freshDb(); });

describe('Search visibility', () => {
  it('keeps indexing off unless SITE_INDEXING=true', () => {
    expect(indexingEnabled()).toBe(false);
    process.env.SITE_INDEXING = 'true'; resetEnvForTests();
    expect(indexingEnabled()).toBe(true);
    delete process.env.SITE_INDEXING; resetEnvForTests();
  });

  it('never lists demo shops or their products in the sitemap', async () => {
    const before = await sitemapEntries();
    expect(before.shops).toHaveLength(0); expect(before.products).toHaveLength(0);
    const { merchantId } = await squareMerchant(db);
    await db.query(`insert into products(merchant_id, source_provider, source_item_id, name, publication_status) values ($1,'square','I1','Garden Bouquet','published')`, [merchantId]);
    await db.query(`insert into products(merchant_id, source_provider, source_item_id, name, publication_status) values ($1,'square','I2','Draft Item','draft')`, [merchantId]);
    const after = await sitemapEntries();
    expect(after.shops.map((s) => s.slug)).toEqual(['test-florist']);
    expect(after.products).toHaveLength(1);
  });
});

describe('Structured data', () => {
  it('describes a real shop as a local business with address and hours', async () => {
    await db.query(`update merchant_locations set address = '15200 Detroit Ave', city = 'Lakewood', state = 'OH', postal_code = '44107', latitude = 41.48, longitude = -81.8 where source_location_id = 'LOC1'`);
    const m = (await getMerchant('test-florist'))!;
    const ld = storeJsonLd(m) as any;
    expect(ld['@type']).toBe('Florist');
    expect(ld.address).toMatchObject({ streetAddress: '15200 Detroit Ave', addressLocality: 'Lakewood', addressRegion: 'OH', postalCode: '44107', addressCountry: 'US' });
    expect(ld.geo).toMatchObject({ latitude: 41.48, longitude: -81.8 });
    expect(ld.openingHoursSpecification).toHaveLength(7);
    expect(ld.url).toBe('http://localhost:3000/shop/test-florist');
  });

  it('prices products in dollars with stock status and the shop as seller', async () => {
    const id = (await db.query(`select p.id from products p join merchants m on m.id = p.merchant_id where m.is_demo and p.name = 'Almond Croissant'`)).rows[0].id;
    const p = (await getProduct(id))!;
    const ld = productJsonLd(p, null) as any;
    expect(ld['@type']).toBe('Product');
    expect(ld.offers.price).toBe((p.minPrice / 100).toFixed(2));
    expect(ld.offers.priceCurrency).toBe('USD');
    expect(ld.offers.availability).toMatch(/InStock|OutOfStock/);
    expect(ld.offers.seller.name).toBe(p.merchant.name);
  });

  it('formats hours, breadcrumbs and descriptions', () => {
    expect(openingHours({ mon: [['07:00', '15:00']] })).toEqual([{ '@type': 'OpeningHoursSpecification', dayOfWeek: 'https://schema.org/Monday', opens: '07:00', closes: '15:00' }]);
    expect(breadcrumbJsonLd([['Shops', '/shops']]).itemListElement[0]).toMatchObject({ position: 1, item: 'http://localhost:3000/shops' });
    const long = clip('word '.repeat(80), 40);
    expect(long.length).toBeLessThanOrEqual(43); expect(long.endsWith('...')).toBe(true);
  });
});
