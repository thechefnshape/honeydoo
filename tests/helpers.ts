import crypto from 'node:crypto';
process.env.SESSION_SECRET = 'test-session-secret-0123456789abcdef';
process.env.TOKEN_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
process.env.SQUARE_APPLICATION_ID = 'sandbox-sq0idb-test';
process.env.SQUARE_APPLICATION_SECRET = 'sandbox-sq0csb-test';
process.env.SQUARE_REDIRECT_URI = 'http://localhost:3000/api/v1/integrations/square/callback';
process.env.SQUARE_WEBHOOK_SIGNATURE_KEY = 'whsec-test-key';
process.env.SQUARE_WEBHOOK_URL = 'https://honeydoo.test/api/v1/webhooks/square';
process.env.SQUARE_ENVIRONMENT = 'sandbox';
process.env.APP_URL = 'http://localhost:3000';
process.env.AI_PROVIDER = 'none';
process.env.HONEYDOO_FEE_PROMO_CODES = 'LAUNCHWEEK';

import { createPglite, runMigrations, setDbForTests, type Db } from '../src/lib/db';
import { seedDemo } from '../db/seed/seed';
import { setSquareFetch } from '../src/server/integrations/square/client';
import { sealTokens } from '../src/server/integrations/square/credentials';

export async function freshDb(seed = true): Promise<Db> {
  const db = await createPglite();
  await runMigrations(db);
  if (seed) await seedDemo(db);
  setDbForTests(db);
  return db;
}

export const SESSION = 'test-session-aaaaaaaaaaaaaaaaaaaa';

/** Minimal fake of the Square API. Handlers receive (method, path, body) and return [status, json]. */
export type Route = (method: string, path: string, body: any) => [number, any] | undefined;
export const calls: { method: string; path: string; body: any }[] = [];
export function fakeSquare(...routes: Route[]) {
  calls.length = 0;
  setSquareFetch((async (url: string, init: RequestInit = {}) => {
    const u = new URL(url); const path = u.pathname + u.search; const method = init.method ?? 'GET';
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, path, body });
    for (const r of routes) { const out = r(method, path, body); if (out) return new Response(JSON.stringify(out[1]), { status: out[0] }); }
    return new Response(JSON.stringify({ errors: [{ code: 'NOT_FOUND', detail: `no fake for ${method} ${path}` }] }), { status: 404 });
  }) as unknown as typeof fetch);
}

/** Creates a Square-connected merchant with one location, as if OAuth had completed. */
export async function squareMerchant(db: Db, opts: { status?: string; scopes?: string[] } = {}) {
  const m = (await db.query(`insert into merchants(legal_name, display_name, slug, category, status, contact_email) values ('Test Florist LLC','Test Florist','test-florist','flowers',$1,'owner@test.example') returning id`, [opts.status ?? 'active'])).rows[0].id;
  const l = (await db.query(`insert into merchant_locations(merchant_id, source_provider, source_location_id, name, operating_hours, pickup_enabled, active, timezone)
    values ($1,'square','LOC1','Main', $2, true, true, 'America/New_York') returning id`, [m, JSON.stringify(allDay())])).rows[0].id;
  const i = (await db.query(`insert into merchant_integrations(merchant_id, provider, environment, provider_merchant_id, encrypted_credentials_reference, granted_scopes, token_expires_at, authorized_at)
    values ($1,'square','sandbox','SQ_MERCHANT_1',$2,$3, now() + interval '30 days', now()) returning id`,
    [m, sealTokens({ accessToken: 'EAAA-access', refreshToken: 'EQAA-refresh' }), opts.scopes ?? ['MERCHANT_PROFILE_READ', 'ITEMS_READ', 'INVENTORY_READ', 'ORDERS_READ', 'ORDERS_WRITE', 'PAYMENTS_READ', 'PAYMENTS_WRITE', 'PAYMENTS_WRITE_ADDITIONAL_RECIPIENTS']])).rows[0].id;
  await db.query(`insert into merchant_members(merchant_id, user_ref) values ($1,'square:SQ_MERCHANT_1')`, [m]);
  return { merchantId: m as string, locationId: l as string, integrationId: i as string };
}

export const allDay = () => Object.fromEntries(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].map((d) => [d, [['00:00', '23:59']]]));

/** A small Square catalog: bouquet with 2 variations + modifier list, a variable-priced item, a restricted item, a tax and an image. */
export function squareCatalog(over: { bouquetPrice?: number; dropRoses?: boolean } = {}) {
  const objs: any[] = [
    { type: 'TAX', id: 'TAX1', tax_data: { name: 'Sales tax', percentage: '8.0' } },
    { type: 'CATEGORY', id: 'CAT_FLOWERS', category_data: { name: 'Bouquets' } },
    { type: 'IMAGE', id: 'IMG1', image_data: { url: 'https://items-images-sandbox.example/bouquet.jpg' } },
    { type: 'MODIFIER_LIST', id: 'ML_CARD', modifier_list_data: { name: 'Card', selection_type: 'SINGLE', modifiers: [{ type: 'MODIFIER', id: 'MOD_CARD', modifier_data: { name: 'Gift card note', price_money: { amount: 400, currency: 'USD' } } }] } },
    { type: 'ITEM', id: 'ITEM_BOUQUET', version: 11, item_data: {
        name: 'Garden Bouquet', description_plaintext: 'Seasonal stems', categories: [{ id: 'CAT_FLOWERS' }], tax_ids: ['TAX1'], image_ids: ['IMG1'],
        modifier_list_info: [{ modifier_list_id: 'ML_CARD', enabled: true }],
        variations: [
          { type: 'ITEM_VARIATION', id: 'VAR_SMALL', item_variation_data: { name: 'Small', pricing_type: 'FIXED_PRICING', price_money: { amount: over.bouquetPrice ?? 3500, currency: 'USD' }, track_inventory: true } },
          { type: 'ITEM_VARIATION', id: 'VAR_LARGE', item_variation_data: { name: 'Large', pricing_type: 'FIXED_PRICING', price_money: { amount: 6000, currency: 'USD' }, track_inventory: true } },
        ] } },
    { type: 'ITEM', id: 'ITEM_CUSTOM', item_data: { name: 'Custom Arrangement', variations: [{ type: 'ITEM_VARIATION', id: 'VAR_CUSTOM', item_variation_data: { name: 'Custom', pricing_type: 'VARIABLE_PRICING' } }] } },
    { type: 'ITEM', id: 'ITEM_WINE', item_data: { name: 'Bottle of Red Wine', variations: [{ type: 'ITEM_VARIATION', id: 'VAR_WINE', item_variation_data: { name: 'Bottle', pricing_type: 'FIXED_PRICING', price_money: { amount: 2200, currency: 'USD' } } }] } },
  ];
  if (!over.dropRoses) objs.push({ type: 'ITEM', id: 'ITEM_ROSES', present_at_all_locations: false, present_at_location_ids: ['LOC1'], item_data: { name: 'Roses', variations: [
    { type: 'ITEM_VARIATION', id: 'VAR_ROSES', present_at_all_locations: false, present_at_location_ids: ['LOC1'], item_variation_data: { name: 'Dozen', pricing_type: 'FIXED_PRICING', price_money: { amount: 6800, currency: 'USD' }, location_overrides: [{ location_id: 'LOC1', sold_out: true }] } }] } });
  return objs;
}

export const catalogRoute = (objects: any[], pageSize = 3): Route => (m, p) => {
  if (m !== 'GET' || !p.startsWith('/v2/catalog/list')) return;
  const cursor = Number(new URLSearchParams(p.split('?')[1]).get('cursor') ?? 0);
  const page = objects.slice(cursor, cursor + pageSize);
  return [200, { objects: page, ...(cursor + pageSize < objects.length ? { cursor: String(cursor + pageSize) } : {}) }];
};
export const inventoryRoute = (counts: Record<string, number>): Route => (m, p) =>
  m === 'POST' && p === '/v2/inventory/counts/batch-retrieve'
    ? [200, { counts: Object.entries(counts).map(([id, q]) => ({ catalog_object_id: id, location_id: 'LOC1', state: 'IN_STOCK', quantity: String(q) })) }] : undefined;
