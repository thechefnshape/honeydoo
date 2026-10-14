import { db, type Queryable } from '@/lib/db';
import { log } from '@/lib/http';
import { squareRequest } from './client';
import { accessTokenFor } from './credentials';
import { availabilityFor, mapCatalog, type SqObject } from './mapper';

const DAY: Record<string, string> = { MON: 'mon', TUE: 'tue', WED: 'wed', THU: 'thu', FRI: 'fri', SAT: 'sat', SUN: 'sun' };

/** Square business_hours.periods -> Honeydoo hours JSON. */
export function mapHours(bh: any): Record<string, [string, string][]> {
  const out: Record<string, [string, string][]> = {};
  for (const p of bh?.periods ?? []) {
    const d = DAY[p.day_of_week]; if (!d) continue;
    (out[d] ??= []).push([String(p.start_local_time).slice(0, 5), String(p.end_local_time).slice(0, 5)]);
  }
  return out;
}

/** Imports authorized Square locations as INACTIVE Honeydoo locations. The merchant chooses which to publish. */
export async function importLocations(integrationId: string) {
  const d = await db();
  const integ = (await d.query(`select merchant_id from merchant_integrations where id = $1`, [integrationId])).rows[0];
  const token = await accessTokenFor(integrationId, d);
  const { locations = [] } = await squareRequest<{ locations?: any[] }>('/v2/locations', { token });
  let n = 0;
  for (const l of locations) {
    if (l.status && l.status !== 'ACTIVE') continue;
    const a = l.address ?? {};
    await d.query(
      `insert into merchant_locations(merchant_id, source_provider, source_location_id, name, address, city, state, postal_code,
         latitude, longitude, timezone, operating_hours, pickup_enabled, active)
       values ($1,'square',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,false,false)
       on conflict (merchant_id, source_provider, source_location_id) do update set
         name = excluded.name, address = excluded.address, city = excluded.city, state = excluded.state, postal_code = excluded.postal_code,
         latitude = excluded.latitude, longitude = excluded.longitude, timezone = excluded.timezone,
         operating_hours = excluded.operating_hours, updated_at = now()`,
      [integ.merchant_id, l.id, l.name ?? l.business_name ?? 'Main location', [a.address_line_1, a.address_line_2].filter(Boolean).join(' '),
       a.locality ?? '', a.administrative_district_level_1 ?? '', a.postal_code ?? '', l.coordinates?.latitude ?? null, l.coordinates?.longitude ?? null,
       l.timezone ?? 'America/New_York', JSON.stringify(mapHours(l.business_hours))]);
    n++;
  }
  return n;
}

async function listAllCatalog(token: string): Promise<SqObject[]> {
  const out: SqObject[] = []; let cursor: string | undefined; let pages = 0;
  do {
    const qs = new URLSearchParams({ types: 'ITEM,CATEGORY,MODIFIER_LIST,IMAGE,TAX' });
    if (cursor) qs.set('cursor', cursor);
    const page = await squareRequest<{ objects?: SqObject[]; cursor?: string }>(`/v2/catalog/list?${qs}`, { token });
    out.push(...(page.objects ?? []));
    cursor = page.cursor; pages++;
    if (pages > 500) throw new Error('catalog pagination exceeded safety limit');
  } while (cursor);
  return out;
}

async function inventoryCounts(token: string, variationIds: string[], locationIds: string[]) {
  const counts = new Map<string, number>(); // `${variation}:${location}` -> qty
  for (let i = 0; i < variationIds.length; i += 500) {
    let cursor: string | undefined;
    do {
      const r = await squareRequest<{ counts?: any[]; cursor?: string }>('/v2/inventory/counts/batch-retrieve', {
        token, body: { catalog_object_ids: variationIds.slice(i, i + 500), location_ids: locationIds, states: ['IN_STOCK'], cursor },
      });
      for (const c of r.counts ?? []) counts.set(`${c.catalog_object_id}:${c.location_id}`, Math.floor(Number(c.quantity)));
      cursor = r.cursor;
    } while (cursor);
  }
  return counts;
}

export interface SyncStats { items: number; variations: number; deleted: number; archived: number; restricted: number; skippedVariations: number; locations: number }

/**
 * Full catalog reconciliation for one Square integration. Safe to run any number of times:
 * every write is an upsert on (merchant, provider, source id), and items missing from Square are marked
 * deleted_at_source instead of being duplicated or silently left orderable. Honeydoo overrides are never touched.
 */
export async function syncSquareCatalog(integrationId: string): Promise<SyncStats> {
  const d = await db();
  const integ = (await d.query(`select i.*, m.category as merchant_category from merchant_integrations i join merchants m on m.id = i.merchant_id where i.id = $1`, [integrationId])).rows[0];
  const token = await accessTokenFor(integrationId, d);
  const objects = await listAllCatalog(token);
  const mapped = mapCatalog(objects, integ.merchant_category ?? 'gifts');
  const locs = (await d.query(`select id, source_location_id from merchant_locations where merchant_id = $1 and source_provider = 'square'`, [integ.merchant_id])).rows;
  const varIds = mapped.items.flatMap((i) => i.variations.map((v) => v.sourceId));
  let counts = new Map<string, number>(); let inventoryOk = true;
  try { if (varIds.length && locs.length) counts = await inventoryCounts(token, varIds, locs.map((l) => l.source_location_id)); }
  catch (e) { inventoryOk = false; log('warn', 'inventory_fetch_failed', { integrationId, error: e instanceof Error ? e.message : String(e) }); }

  const cats = new Map((await d.query(`select id, slug from categories`)).rows.map((r) => [r.slug, r.id]));
  const stats: SyncStats = { items: 0, variations: 0, deleted: 0, archived: 0, restricted: 0, skippedVariations: 0, locations: locs.length };

  await d.tx(async (q: Queryable) => {
    const listIds = new Map<string, string>();
    for (const ml of mapped.modifierLists.values()) {
      const r = await q.query<{ id: string }>(
        `insert into modifier_lists(merchant_id, source_provider, source_id, name, selection_type, min_selected, max_selected)
         values ($1,'square',$2,$3,$4,$5,$6)
         on conflict (merchant_id, source_provider, source_id) do update set name = excluded.name, selection_type = excluded.selection_type,
           min_selected = excluded.min_selected, max_selected = excluded.max_selected returning id`,
        [integ.merchant_id, ml.sourceId, ml.name, ml.selection, ml.min, ml.max]);
      listIds.set(ml.sourceId, r.rows[0].id);
      const keep: string[] = [];
      for (const m of ml.modifiers) {
        await q.query(`insert into modifiers(modifier_list_id, source_id, name, price_minor_units, ordinal, is_default) values ($1,$2,$3,$4,$5,$6)
                       on conflict (modifier_list_id, source_id) do update set name = excluded.name, price_minor_units = excluded.price_minor_units,
                         ordinal = excluded.ordinal, is_default = excluded.is_default`, [r.rows[0].id, m.sourceId, m.name, m.price, m.ordinal, m.isDefault]);
        keep.push(m.sourceId);
      }
      await q.query(`delete from modifiers where modifier_list_id = $1 and not (source_id = any($2::text[]))`, [r.rows[0].id, keep]);
    }

    const seen: string[] = [];
    for (const it of mapped.items) {
      seen.push(it.sourceId);
      const status = it.restricted ? 'hidden' : it.archived ? 'archived' : !it.variations.length ? 'hidden' : null;
      if (it.restricted) stats.restricted++;
      if (it.archived) stats.archived++;
      stats.skippedVariations += it.skippedVariations.length;
      // New items start published (merchant reviews them in the storefront preview before activation).
      // Existing items keep the merchant's choice unless Square archived them or they were restored.
      const pr = await q.query<{ id: string }>(
        `insert into products(merchant_id, source_provider, source_item_id, name, description, category_id, source_category, primary_image_url,
           taxable, publication_status, source_version, source_updated_at)
         values ($1,'square',$2,$3,$4,$5,$6,$7,$8,coalesce($9,'published'),$10,$11)
         on conflict (merchant_id, source_provider, source_item_id) do update set
           name = excluded.name, description = excluded.description, category_id = excluded.category_id, source_category = excluded.source_category,
           primary_image_url = excluded.primary_image_url, taxable = excluded.taxable, source_version = excluded.source_version,
           source_updated_at = excluded.source_updated_at, updated_at = now(),
           publication_status = case
             when $9::text is not null then $9::text
             when products.publication_status in ('archived','deleted_at_source') then 'published'
             else products.publication_status end
         returning id`,
        [integ.merchant_id, it.sourceId, it.name, it.description, cats.get(it.categorySlug) ?? null, it.sourceCategory, it.imageUrl, it.taxable,
         status, it.version, it.updatedAt]);
      const pid = pr.rows[0].id; stats.items++;

      await q.query(`delete from product_modifier_lists where product_id = $1`, [pid]);
      for (const [i, ml] of it.modifierLists.entries()) {
        const lid = listIds.get(ml.sourceId); if (!lid) continue;
        await q.query(`insert into product_modifier_lists(product_id, modifier_list_id, ordinal) values ($1,$2,$3) on conflict do nothing`, [pid, lid, i]);
      }

      const keepVars: string[] = [];
      for (const v of it.variations) {
        const vr = await q.query<{ id: string }>(
          `insert into product_variations(product_id, source_variation_id, name, sku, price_minor_units, currency, available_for_sale, track_inventory, ordinal)
           values ($1,$2,$3,$4,$5,$6,true,$7,$8)
           on conflict (product_id, source_variation_id) do update set name = excluded.name, sku = excluded.sku, price_minor_units = excluded.price_minor_units,
             currency = excluded.currency, available_for_sale = true, track_inventory = excluded.track_inventory, ordinal = excluded.ordinal, updated_at = now()
           returning id`, [pid, v.sourceId, v.name, v.sku, v.price, v.currency, v.trackInventory, v.ordinal]);
        keepVars.push(v.sourceId); stats.variations++;
        for (const l of locs) {
          const key = `${v.sourceId}:${l.source_location_id}`;
          const a = availabilityFor(v, it.presentAt(l.source_location_id), l.source_location_id, inventoryOk ? counts.get(key) : null);
          await q.query(
            `insert into product_location_availability(variation_id, merchant_location_id, quantity, availability_status, source_updated_at, last_checked_at)
             values ($1,$2,$3,$4,now(),now())
             on conflict (variation_id, merchant_location_id) do update set quantity = excluded.quantity, availability_status = excluded.availability_status,
               source_updated_at = excluded.source_updated_at, last_checked_at = now()`, [vr.rows[0].id, l.id, a.quantity, a.status]);
        }
      }
      // Variations removed in Square stop being sellable but stay for order history.
      await q.query(`update product_variations set available_for_sale = false, updated_at = now() where product_id = $1 and not (source_variation_id = any($2::text[]))`, [pid, keepVars]);
    }

    const del = await q.query(
      `update products set publication_status = 'deleted_at_source', updated_at = now()
        where merchant_id = $1 and source_provider = 'square' and publication_status <> 'deleted_at_source' and not (source_item_id = any($2::text[])) returning id`,
      [integ.merchant_id, seen]);
    stats.deleted = del.rows.length;
    await q.query(`update merchant_integrations set last_sync_at = now(), last_error = $2, updated_at = now() where id = $1`,
      [integrationId, inventoryOk ? null : 'Inventory counts could not be read; stock shown as available where untracked.']);
  });
  return stats;
}

/** Applies inventory.count.updated webhook payloads without a full sync. */
export async function applyInventoryCounts(integrationId: string, counts: { catalog_object_id: string; location_id: string; quantity: string; state: string; calculated_at?: string }[]) {
  const d = await db();
  const integ = (await d.query(`select merchant_id from merchant_integrations where id = $1`, [integrationId])).rows[0];
  for (const c of counts) {
    if (c.state !== 'IN_STOCK') continue;
    const qty = Math.floor(Number(c.quantity));
    await d.query(
      `update product_location_availability a set quantity = $1,
              availability_status = case when $1 <= 0 then 'out_of_stock' when $1 <= 3 then 'low_stock' else 'in_stock' end,
              source_updated_at = coalesce($5::timestamptz, now()), last_checked_at = now()
         from product_variations v, products p, merchant_locations l
        where a.variation_id = v.id and v.product_id = p.id and a.merchant_location_id = l.id
          and p.merchant_id = $2 and v.source_variation_id = $3 and l.source_location_id = $4 and v.track_inventory`,
      [qty, integ.merchant_id, c.catalog_object_id, c.location_id, c.calculated_at ?? null]);
  }
}

// ---------- Job queue (sync_jobs). Run by cron, webhook triggers, or the merchant's "Sync now". ----------

export async function enqueueSync(integrationId: string, jobType: 'full_import' | 'reconcile' | 'webhook_update' | 'manual_resync' | 'inventory') {
  const d = await db();
  // Collapse duplicates: one queued job per integration is enough.
  const existing = await d.query(`select id from sync_jobs where integration_id = $1 and status = 'queued' limit 1`, [integrationId]);
  if (existing.rows[0]) return existing.rows[0].id as string;
  const r = await d.query<{ id: string }>(`insert into sync_jobs(integration_id, job_type) values ($1,$2) returning id`, [integrationId, jobType]);
  return r.rows[0].id;
}

export async function runSyncJob(jobId: string, runner: (integrationId: string) => Promise<SyncStats> = syncSquareCatalog) {
  const d = await db();
  const claimed = (await d.query(`update sync_jobs set status = 'running', started_at = now(), attempts = attempts + 1 where id = $1 and status = 'queued' returning integration_id, attempts`, [jobId])).rows[0];
  if (!claimed) return null;
  try {
    const stats = await runner(claimed.integration_id);
    await d.query(`update sync_jobs set status = 'succeeded', finished_at = now(), stats = $2, error_details = null where id = $1`, [jobId, JSON.stringify(stats)]);
    return stats;
  } catch (e) {
    const msg = e instanceof Error ? e.message.slice(0, 500) : 'sync failed';
    const retry = claimed.attempts < 5;
    // Exponential backoff: 1, 4, 9, 16 minutes.
    await d.query(`update sync_jobs set status = $2, finished_at = now(), error_details = $3, run_after = now() + ($4 || ' minutes')::interval where id = $1`,
      [jobId, retry ? 'queued' : 'failed', msg, String(claimed.attempts ** 2)]);
    await d.query(`update merchant_integrations set last_error = $2, updated_at = now() where id = $1`, [claimed.integration_id, msg]);
    log('error', 'sync_job_failed', { jobId, attempt: claimed.attempts, error: msg });
    return null;
  }
}

export async function processDueJobs(limit = 10) {
  const d = await db();
  const due = (await d.query(`select id from sync_jobs where status = 'queued' and run_after <= now() order by run_after limit $1`, [limit])).rows;
  const results = [];
  for (const j of due) results.push({ id: j.id, stats: await runSyncJob(j.id) });
  return results;
}
