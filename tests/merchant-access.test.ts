import { describe, it, expect, beforeAll } from 'vitest';
import { freshDb } from './helpers';
import { setProductVisibility, readiness, publishStorefront, acceptTerms, updateSettings } from '../src/server/merchant';
import { listMerchants } from '../src/server/catalog';
import { canTransition } from '../src/server/orders';
import type { Db } from '../src/lib/db';

let db: Db; let a: string; let b: string;
beforeAll(async () => {
  db = await freshDb();
  a = (await db.query(`select id from merchants where slug = 'low-tide-coffee'`)).rows[0].id;
  b = (await db.query(`select id from merchants where slug = 'corner-smash'`)).rows[0].id;
});

describe('Merchant access control', () => {
  it("cannot change another merchant's products or locations", async () => {
    const theirs = (await db.query(`select id from products where merchant_id = $1 limit 1`, [b])).rows[0].id;
    await expect(setProductVisibility(a, theirs, false, 'attacker')).rejects.toThrow(/not found/);
    const theirLoc = (await db.query(`select id from merchant_locations where merchant_id = $1`, [b])).rows[0].id;
    await expect(updateSettings(a, { locations: [{ id: theirLoc, active: false, pickupEnabled: false, prepMinutes: 0 }] }, 'attacker')).rejects.toThrow(/not found/);
    expect((await db.query(`select active from merchant_locations where id = $1`, [theirLoc])).rows[0].active).toBe(true);
  });
});

describe('Activation gate', () => {
  it('keeps a newly connected merchant off the marketplace until every step is complete', async () => {
    const m = (await db.query(`insert into merchants(legal_name, display_name, slug, category, status) values ('New','New Shop','new-shop','gifts','onboarding') returning id`)).rows[0].id;
    await db.query(`insert into merchant_integrations(merchant_id, provider, environment, provider_merchant_id, connection_status) values ($1,'square','sandbox','SQ_NEW','connected')`, [m]);
    const loc = (await db.query(`insert into merchant_locations(merchant_id, source_provider, source_location_id, name, active, pickup_enabled) values ($1,'square','L','Main',false,false) returning id`, [m])).rows[0].id;
    await db.query(`insert into products(merchant_id, source_provider, source_item_id, name, publication_status) values ($1,'square','I1','Mug','published')`, [m]);
    expect((await listMerchants()).some((x) => x.id === m)).toBe(false);
    await expect(publishStorefront(m, 'owner')).rejects.toThrow(/Finish/);
    const r1 = await readiness(m);
    expect(r1.checks.filter((c) => !c.ok).map((c) => c.key).sort()).toEqual(['contact', 'location', 'terms']);
    await updateSettings(m, { contactEmail: 'owner@new.example', locations: [{ id: loc, active: true, pickupEnabled: true, prepMinutes: 10 }] }, 'owner');
    await acceptTerms(m, 'owner', '127.0.0.1');
    expect((await db.query(`select count(*)::int as n from merchant_consents where merchant_id = $1`, [m])).rows[0].n).toBe(3);
    await publishStorefront(m, 'owner');
    expect((await listMerchants()).some((x) => x.id === m)).toBe(true);
    expect((await db.query(`select count(*)::int as n from audit_log where entity_id = $1 and action = 'storefront_published'`, [m])).rows[0].n).toBe(1);
  });
});

describe('Order state machine', () => {
  it('only allows forward transitions', () => {
    expect(canTransition('awaiting_payment', 'paid')).toBe(true);
    expect(canTransition('paid', 'awaiting_payment')).toBe(false);
    expect(canTransition('completed', 'paid')).toBe(false);
    expect(canTransition('payment_not_configured', 'paid')).toBe(false);
    expect(canTransition('refunded', 'paid')).toBe(false);
  });
});
