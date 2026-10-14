import { describe, it, expect, beforeAll } from 'vitest';
import { freshDb, fakeSquare, squareMerchant, squareCatalog, catalogRoute, inventoryRoute } from './helpers';
import { mapCatalog, availabilityFor, restrictionFor } from '../src/server/integrations/square/mapper';
import { syncSquareCatalog, applyInventoryCounts, enqueueSync, runSyncJob } from '../src/server/integrations/square/sync';
import { setProductVisibility } from '../src/server/merchant';
import type { Db } from '../src/lib/db';

describe('Catalog mapping (pure)', () => {
  const mapped = mapCatalog(squareCatalog(), 'gifts');
  it('keeps every fixed-price variation with its own price instead of one universal price', () => {
    const b = mapped.items.find((i) => i.sourceId === 'ITEM_BOUQUET')!;
    expect(b.variations.map((v) => [v.name, v.price])).toEqual([['Small', 3500], ['Large', 6000]]);
    expect(b.categorySlug).toBe('flowers');
    expect(b.taxable).toBe(true);
    expect(b.imageUrl).toContain('bouquet.jpg');
    expect(b.modifierLists[0].sourceId).toBe('ML_CARD');
  });
  it('skips variable-priced variations and flags restricted products', () => {
    const custom = mapped.items.find((i) => i.sourceId === 'ITEM_CUSTOM')!;
    expect(custom.variations).toHaveLength(0);
    expect(custom.skippedVariations[0].reason).toMatch(/variable/);
    expect(mapped.items.find((i) => i.sourceId === 'ITEM_WINE')!.restricted).toBe('alcohol');
    expect(restrictionFor('Vanilla latte')).toBeNull();
    expect(restrictionFor('Disposable vape pen')).toBe('tobacco');
  });
  it('derives availability per location without inventing quantities', () => {
    const v = mapped.items.find((i) => i.sourceId === 'ITEM_BOUQUET')!.variations[0];
    expect(availabilityFor(v, true, 'LOC1', 12)).toEqual({ status: 'in_stock', quantity: 12 });
    expect(availabilityFor(v, true, 'LOC1', 2)).toEqual({ status: 'low_stock', quantity: 2 });
    expect(availabilityFor(v, true, 'LOC1', 0).status).toBe('out_of_stock');
    expect(availabilityFor(v, true, 'LOC1', undefined).status).toBe('out_of_stock');
    expect(availabilityFor(v, true, 'LOC1', null)).toEqual({ status: 'available', quantity: null });
    const roses = mapped.items.find((i) => i.sourceId === 'ITEM_ROSES')!;
    expect(availabilityFor(roses.variations[0], roses.presentAt('LOC1'), 'LOC1', 5).status).toBe('out_of_stock');
    expect(availabilityFor(roses.variations[0], roses.presentAt('LOC2'), 'LOC2', 5).status).toBe('not_sold_here');
  });
});

describe('Catalog synchronization', () => {
  let db: Db; let ids: Awaited<ReturnType<typeof squareMerchant>>;
  beforeAll(async () => { db = await freshDb(false); await db.query(`insert into categories(name, slug) values ('Flowers','flowers'),('Gifts','gifts')`); ids = await squareMerchant(db); });
  const count = async () => (await db.query(`select count(*)::int as n from products where merchant_id = $1`, [ids.merchantId])).rows[0].n;

  it('imports items across pages, with variations, modifiers and inventory', async () => {
    fakeSquare(catalogRoute(squareCatalog(), 2), inventoryRoute({ VAR_SMALL: 9, VAR_LARGE: 1 }));
    const stats = await syncSquareCatalog(ids.integrationId);
    expect(stats.items).toBe(4);
    expect(stats.restricted).toBe(1);
    const rows = (await db.query(`select p.source_item_id, p.publication_status, v.source_variation_id, v.price_minor_units, a.availability_status, a.quantity
      from products p left join product_variations v on v.product_id = p.id left join product_location_availability a on a.variation_id = v.id order by 1, 3`)).rows;
    const by = (id: string) => rows.find((r) => r.source_variation_id === id)!;
    expect(by('VAR_SMALL')).toMatchObject({ price_minor_units: 3500, availability_status: 'in_stock', quantity: 9 });
    expect(by('VAR_LARGE')).toMatchObject({ availability_status: 'low_stock', quantity: 1 });
    expect(by('VAR_ROSES').availability_status).toBe('out_of_stock');
    expect(rows.find((r) => r.source_item_id === 'ITEM_WINE')!.publication_status).toBe('hidden');
    expect(rows.find((r) => r.source_item_id === 'ITEM_CUSTOM')!.publication_status).toBe('hidden');
    const mods = (await db.query(`select count(*)::int as n from product_modifier_lists`)).rows[0].n;
    expect(mods).toBe(1);
  });

  it('does not create duplicates when run again, and applies price changes', async () => {
    fakeSquare(catalogRoute(squareCatalog({ bouquetPrice: 3900 })), inventoryRoute({ VAR_SMALL: 9, VAR_LARGE: 1 }));
    await syncSquareCatalog(ids.integrationId);
    expect(await count()).toBe(4);
    expect((await db.query(`select count(*)::int as n from product_variations`)).rows[0].n).toBe(4); // variable-priced variation is never imported
    expect((await db.query(`select price_minor_units from product_variations where source_variation_id = 'VAR_SMALL'`)).rows[0].price_minor_units).toBe(3900);
  });

  it('marks products deleted in Square without deleting them, and keeps Honeydoo overrides', async () => {
    const pid = (await db.query(`select id from products where source_item_id = 'ITEM_BOUQUET'`)).rows[0].id;
    await setProductVisibility(ids.merchantId, pid, false, 'test');
    fakeSquare(catalogRoute(squareCatalog({ dropRoses: true })), inventoryRoute({ VAR_SMALL: 0, VAR_LARGE: 1 }));
    const stats = await syncSquareCatalog(ids.integrationId);
    expect(stats.deleted).toBe(1);
    expect((await db.query(`select publication_status from products where source_item_id = 'ITEM_ROSES'`)).rows[0].publication_status).toBe('deleted_at_source');
    expect((await db.query(`select published_in_honeydoo from product_overrides where product_id = $1`, [pid])).rows[0].published_in_honeydoo).toBe(false);
    expect((await db.query(`select a.availability_status from product_location_availability a join product_variations v on v.id = a.variation_id where v.source_variation_id = 'VAR_SMALL'`)).rows[0].availability_status).toBe('out_of_stock');
    expect(calls().every((c) => c.method !== 'POST' || !c.path.startsWith('/v2/catalog/'))).toBe(true); // never writes the POS catalog
  });

  it('applies inventory webhooks to tracked variations only', async () => {
    await applyInventoryCounts(ids.integrationId, [{ catalog_object_id: 'VAR_SMALL', location_id: 'LOC1', quantity: '7', state: 'IN_STOCK' }]);
    const r = (await db.query(`select a.availability_status, a.quantity from product_location_availability a join product_variations v on v.id = a.variation_id where v.source_variation_id = 'VAR_SMALL'`)).rows[0];
    expect(r).toMatchObject({ availability_status: 'in_stock', quantity: 7 });
  });

  it('retries failed sync jobs with backoff and records the error', async () => {
    fakeSquare(() => [500, { errors: [{ code: 'INTERNAL_SERVER_ERROR' }] }]);
    const job = await enqueueSync(ids.integrationId, 'manual_resync');
    expect(await runSyncJob(job)).toBeNull();
    const j = (await db.query(`select status, attempts, error_details from sync_jobs where id = $1`, [job])).rows[0];
    expect(j.status).toBe('queued'); expect(j.attempts).toBe(1); expect(j.error_details).toMatch(/500/);
    expect((await db.query(`select last_error from merchant_integrations where id = $1`, [ids.integrationId])).rows[0].last_error).toMatch(/500/);
  });
});

import { calls as callLog } from './helpers';
function calls() { return callLog; }
