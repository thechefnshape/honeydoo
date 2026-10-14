import type { Db, Queryable } from '../../src/lib/db';
import { CATEGORIES, MERCHANTS, MODIFIER_LISTS } from './data';
import images from './images.json';

const IMG = images as Record<string, string | null>;
const img = (key: string, w: number) => (IMG[key] ? `${IMG[key]}?auto=format&fit=crop&w=${w}&q=70` : null);

export const DEMO_TERMS_VERSION = 'demo-2026-10';

/** Repeatable: removes previous demo merchants (cascades their data) and recreates them. Real merchants are untouched. */
export async function seedDemo(db: Db) {
  await db.tx(async (q: Queryable) => {
    await q.query(`delete from merchants where is_demo = true`);
    const market = await q.query<{ id: string }>(
      `insert into markets(slug, name, state, latitude, longitude) values ('lakewood-oh','Lakewood','OH',41.4819,-81.7982)
       on conflict (slug) do update set name = excluded.name returning id`);
    const marketId = market.rows[0].id;

    const catIds: Record<string, string> = {};
    for (const [i, c] of CATEGORIES.entries()) {
      const r = await q.query<{ id: string }>(
        `insert into categories(name, slug, display_order) values ($1,$2,$3)
         on conflict (slug) do update set name = excluded.name, display_order = excluded.display_order returning id`, [c.name, c.slug, i]);
      catIds[c.slug] = r.rows[0].id;
    }

    for (const m of MERCHANTS) {
      const mr = await q.query<{ id: string }>(
        `insert into merchants(market_id, legal_name, display_name, slug, description, category, status, is_demo,
           cover_image_url, contact_email, contact_phone, referral_code, activated_at)
         values ($1,$2,$3,$4,$5,$6,'active',true,$7,$8,$9,$10, now()) returning id`,
        [marketId, `${m.name} (Demo)`, m.name, m.slug, m.description, m.category, img(m.cover, 1600),
         `hello@${m.slug}.example`, m.phone, `${m.slug.split('-')[0]}-demo`]);
      const mid = mr.rows[0].id;

      const lr = await q.query<{ id: string }>(
        `insert into merchant_locations(merchant_id, source_provider, source_location_id, name, address, neighborhood, city, state,
           postal_code, latitude, longitude, operating_hours, pickup_enabled, pickup_prep_minutes, tax_rate_bps, active)
         values ($1,'demo',$2,$3,$4,$5,'Lakewood','OH','44107',$6,$7,$8,true,$9,800,true) returning id`,
        [mid, `${m.slug}-main`, m.name, m.address, m.neighborhood, m.lat, m.lng, JSON.stringify(m.hours), m.prepMinutes]);
      const lid = lr.rows[0].id;

      await q.query(
        `insert into merchant_integrations(merchant_id, provider, environment, provider_merchant_id, connection_status, authorized_at, last_sync_at)
         values ($1,'demo','demo',$2,'connected',now(),now())`, [mid, `demo-${m.slug}`]);
      await q.query(
        `insert into merchant_consents(merchant_id, consent_type, terms_version, accepted_by) values ($1,'merchant_terms',$2,'demo-seed')`,
        [mid, DEMO_TERMS_VERSION]);

      const modIds: Record<string, string> = {};
      const used = new Set(m.products.flatMap((p) => p.modifiers ?? []));
      for (const key of used) {
        const ml = MODIFIER_LISTS[key];
        const r = await q.query<{ id: string }>(
          `insert into modifier_lists(merchant_id, source_provider, source_id, name, selection_type, min_selected, max_selected)
           values ($1,'demo',$2,$3,$4,$5,$6) returning id`, [mid, `${m.slug}-${key}`, ml.name, ml.selection, ml.min, ml.max]);
        modIds[key] = r.rows[0].id;
        for (const [i, [name, price, def]] of ml.options.entries()) {
          await q.query(`insert into modifiers(modifier_list_id, source_id, name, price_minor_units, ordinal, is_default) values ($1,$2,$3,$4,$5,$6)`,
            [modIds[key], `${m.slug}-${key}-${i}`, name, price, i, Boolean(def)]);
        }
      }

      for (const p of m.products) {
        const pr = await q.query<{ id: string }>(
          `insert into products(merchant_id, source_provider, source_item_id, name, description, category_id, source_category, tags,
             primary_image_url, taxable, publication_status, source_updated_at)
           values ($1,'demo',$2,$3,$4,$5,$6,$7,$8,$9,'published',now()) returning id`,
          [mid, `${m.slug}-${p.key}`, p.name, p.description, catIds[p.category], p.category, p.tags, img(p.key, 900), p.taxable ?? true]);
        const pid = pr.rows[0].id;
        if (p.featured) await q.query(`insert into product_overrides(product_id, featured, updated_by) values ($1,true,'demo-seed')`, [pid]);
        for (const [i, key] of (p.modifiers ?? []).entries()) {
          await q.query(`insert into product_modifier_lists(product_id, modifier_list_id, ordinal) values ($1,$2,$3)`, [pid, modIds[key], i]);
        }
        for (const [i, [vname, price, avail, qty]] of p.variations.entries()) {
          const tracked = avail !== undefined;
          const vr = await q.query<{ id: string }>(
            `insert into product_variations(product_id, source_variation_id, name, price_minor_units, track_inventory, ordinal, sku)
             values ($1,$2,$3,$4,$5,$6,$7) returning id`,
            [pid, `${m.slug}-${p.key}-v${i}`, vname, price, tracked, i, `${p.key.toUpperCase()}-${i + 1}`]);
          await q.query(
            `insert into product_location_availability(variation_id, merchant_location_id, quantity, availability_status, source_updated_at)
             values ($1,$2,$3,$4,now())`, [vr.rows[0].id, lid, tracked ? qty ?? null : null, avail ?? 'available']);
        }
      }
    }
  });
}
