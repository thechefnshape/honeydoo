import { db } from '@/lib/db';
import { HttpError } from '@/lib/http';
import { audit, track } from '@/lib/analytics';
import { pickupWindow } from '@/lib/hours';

export const MERCHANT_TERMS_VERSION = '2026-10-v1';

export async function merchantOverview(merchantId: string) {
  const d = await db();
  const m = (await d.query(`select * from merchants where id = $1`, [merchantId])).rows[0];
  const stats = (await d.query(
    `select
       count(*) filter (where status in ('paid','accepted','ready','completed') and created_at >= date_trunc('day', now()))::int as today_orders,
       coalesce(sum(merchandise_subtotal) filter (where status in ('paid','accepted','ready','completed','partially_refunded')),0)::int as sales,
       count(*) filter (where status = 'completed')::int as completed,
       count(*) filter (where status in ('paid','accepted','ready'))::int as open_orders
     from orders where merchant_id = $1`, [merchantId])).rows[0];
  const integ = (await d.query(`select id, provider, environment, connection_status, last_sync_at, last_error, granted_scopes, authorized_at from merchant_integrations where merchant_id = $1 order by updated_at desc limit 1`, [merchantId])).rows[0] ?? null;
  const products = (await d.query(
    `select count(*)::int as imported,
            count(*) filter (where p.publication_status = 'published' and coalesce(o.published_in_honeydoo, true))::int as published,
            count(*) filter (where p.publication_status = 'hidden' or o.published_in_honeydoo = false)::int as hidden,
            count(*) filter (where p.publication_status in ('archived','deleted_at_source'))::int as removed
       from products p left join product_overrides o on o.product_id = p.id where p.merchant_id = $1`, [merchantId])).rows[0];
  const lastJob = integ ? (await d.query(`select status, job_type, finished_at, error_details, stats from sync_jobs where integration_id = $1 order by created_at desc limit 1`, [integ.id])).rows[0] ?? null : null;
  const consent = (await d.query(`select terms_version, accepted_at, accepted_by from merchant_consents where merchant_id = $1 and consent_type = 'merchant_terms' order by accepted_at desc limit 1`, [merchantId])).rows[0] ?? null;
  const locations = (await d.query(`select * from merchant_locations where merchant_id = $1 order by created_at`, [merchantId])).rows.map((l) => ({
    id: l.id, name: l.name, address: [l.address, l.city, l.state, l.postal_code].filter(Boolean).join(', '), active: l.active, pickupEnabled: l.pickup_enabled,
    prepMinutes: l.pickup_prep_minutes, hours: l.operating_hours, timezone: l.timezone, sourceLocationId: l.source_location_id,
    pickup: pickupWindow(l.operating_hours ?? {}, l.timezone, l.pickup_prep_minutes),
  }));
  return { merchant: m, stats, integration: integ, products, lastJob, consent, locations };
}

export async function merchantProducts(merchantId: string, f: { status?: 'all' | 'published' | 'hidden' | 'removed'; q?: string; limit?: number; offset?: number }) {
  const d = await db();
  const params: unknown[] = [merchantId]; const where = ['p.merchant_id = $1'];
  if (f.status === 'published') where.push(`p.publication_status = 'published' and coalesce(o.published_in_honeydoo, true)`);
  if (f.status === 'hidden') where.push(`(p.publication_status = 'hidden' or o.published_in_honeydoo = false)`);
  if (f.status === 'removed') where.push(`p.publication_status in ('archived','deleted_at_source')`);
  if (f.q) { params.push(`%${f.q.toLowerCase()}%`); where.push(`lower(p.name) like $${params.length}`); }
  params.push(Math.min(f.limit ?? 100, 200), f.offset ?? 0);
  const { rows } = await d.query(
    `select p.id, p.name, p.publication_status, p.primary_image_url, p.source_provider, p.updated_at, coalesce(o.published_in_honeydoo, true) as visible,
            (select min(price_minor_units) from product_variations v where v.product_id = p.id and v.available_for_sale) as min_price,
            (select count(*)::int from product_variations v where v.product_id = p.id and v.available_for_sale) as variations,
            (select string_agg(distinct a.availability_status, ',') from product_variations v join product_location_availability a on a.variation_id = v.id where v.product_id = p.id) as availability
       from products p left join product_overrides o on o.product_id = p.id
      where ${where.join(' and ')} order by p.name limit $${params.length - 1} offset $${params.length}`, params);
  return rows;
}

/** Honeydoo-only visibility. Writes product_overrides, never the merchant's POS catalog. */
export async function setProductVisibility(merchantId: string, productId: string, visible: boolean, actor: string) {
  const d = await db();
  const p = (await d.query(`select id from products where id = $1 and merchant_id = $2`, [productId, merchantId])).rows[0];
  if (!p) throw new HttpError(404, 'product_not_found', 'Product not found.');
  await d.query(`insert into product_overrides(product_id, published_in_honeydoo, updated_by, updated_at) values ($1,$2,$3,now())
                 on conflict (product_id) do update set published_in_honeydoo = excluded.published_in_honeydoo, updated_by = excluded.updated_by, updated_at = now()`, [productId, visible, actor]);
  await audit(actor, visible ? 'product_shown' : 'product_hidden', 'product', productId, { merchantId });
}

export async function merchantOrders(merchantId: string, limit = 50) {
  const d = await db();
  const { rows } = await d.query(
    `select o.id, o.public_code, o.status, o.grand_total, o.merchandise_subtotal, o.service_fee, o.created_at, o.contact_name, o.pickup_details,
            (select status from payments p where p.order_id = o.id order by created_at desc limit 1) as payment_status,
            (select json_agg(json_build_object('name', i.product_name_snapshot, 'variation', i.variation_name_snapshot, 'qty', i.quantity)) from order_items i where i.order_id = o.id) as items
       from orders o where o.merchant_id = $1 order by o.created_at desc limit $2`, [merchantId, limit]);
  return rows.map((r) => ({ ...r, items: typeof r.items === 'string' ? JSON.parse(r.items) : r.items ?? [] }));
}

export async function updateSettings(merchantId: string, s: {
  displayName?: string; description?: string; contactEmail?: string; contactPhone?: string;
  locations?: { id: string; active: boolean; pickupEnabled: boolean; prepMinutes: number; pickupHours?: Record<string, [string, string][]> | null }[];
}, actor: string) {
  const d = await db();
  await d.tx(async (q) => {
    await q.query(`update merchants set display_name = coalesce($2, display_name), description = coalesce($3, description), contact_email = coalesce($4, contact_email),
                   contact_phone = coalesce($5, contact_phone), updated_at = now() where id = $1`,
      [merchantId, s.displayName ?? null, s.description ?? null, s.contactEmail ?? null, s.contactPhone ?? null]);
    for (const l of s.locations ?? []) {
      const r = await q.query(`update merchant_locations set active = $3, pickup_enabled = $4, pickup_prep_minutes = $5, pickup_hours = coalesce($6, pickup_hours), updated_at = now()
                               where id = $1 and merchant_id = $2 returning id`, [l.id, merchantId, l.active, l.pickupEnabled, l.prepMinutes, l.pickupHours ? JSON.stringify(l.pickupHours) : null]);
      if (!r.rows[0]) throw new HttpError(404, 'location_not_found', 'Location not found.');
    }
  });
  await audit(actor, 'settings_updated', 'merchant', merchantId, { fields: Object.keys(s) });
}

/** Activation gate: nobody becomes publicly orderable without authorization, a pickup location, products, and accepted terms. */
export async function readiness(merchantId: string) {
  const o = await merchantOverview(merchantId);
  const checks = [
    { key: 'connected', label: 'Commerce system connected', ok: o.integration?.connection_status === 'connected' },
    { key: 'location', label: 'At least one pickup location selected', ok: o.locations.some((l) => l.active && l.pickupEnabled) },
    { key: 'products', label: 'At least one product published', ok: o.products.published > 0 },
    { key: 'contact', label: 'Business contact confirmed', ok: Boolean(o.merchant.contact_email) },
    { key: 'terms', label: 'Merchant terms accepted', ok: o.consent?.terms_version === MERCHANT_TERMS_VERSION || (o.merchant.is_demo && Boolean(o.consent)) },
  ];
  return { checks, ready: checks.every((c) => c.ok) };
}

export async function acceptTerms(merchantId: string, actor: string, ip: string | null) {
  const d = await db();
  await d.query(`insert into merchant_consents(merchant_id, consent_type, terms_version, accepted_by, accepted_ip) values ($1,'merchant_terms',$2,$3,$4),($1,'service_fee',$2,$3,$4),($1,'data_access',$2,$3,$4)`,
    [merchantId, MERCHANT_TERMS_VERSION, actor, ip]);
  await audit(actor, 'terms_accepted', 'merchant', merchantId, { version: MERCHANT_TERMS_VERSION });
}

export async function publishStorefront(merchantId: string, actor: string) {
  const r = await readiness(merchantId);
  if (!r.ready) throw new HttpError(409, 'not_ready', 'Finish the remaining steps before going live.', { checks: r.checks.filter((c) => !c.ok) });
  const d = await db();
  await d.query(`update merchants set status = 'active', activated_at = coalesce(activated_at, now()), updated_at = now() where id = $1`, [merchantId]);
  await audit(actor, 'storefront_published', 'merchant', merchantId);
  await track('merchant_published', { merchantId });
}

export async function pauseStorefront(merchantId: string, actor: string) {
  const d = await db();
  await d.query(`update merchants set status = 'paused', updated_at = now() where id = $1`, [merchantId]);
  await audit(actor, 'storefront_paused', 'merchant', merchantId);
}
