import { db } from '@/lib/db';
import { pickupWindow, type Hours, type PickupWindow } from '@/lib/hours';
import { isDemoMode } from '@/lib/env';

export type Availability = 'in_stock' | 'low_stock' | 'out_of_stock' | 'available' | 'unknown' | 'not_sold_here';

export interface VariationView { id: string; name: string; price: number; currency: string; availability: Availability; quantity: number | null; sellable: boolean }
export interface ModifierView { id: string; name: string; price: number; isDefault: boolean }
export interface ModifierListView { id: string; name: string; selection: 'single' | 'multiple'; min: number; max: number | null; options: ModifierView[] }

export interface ProductCard {
  id: string; name: string; description: string; image: string | null; category: string | null; tags: string[];
  merchant: { id: string; slug: string; name: string; isDemo: boolean; neighborhood: string | null };
  locationId: string;
  minPrice: number; maxPrice: number; currency: string; multiplePrices: boolean;
  availability: 'available' | 'low_stock' | 'sold_out';
  pickup: PickupWindow; featured: boolean;
  variations: VariationView[];
}

export interface ProductDetail extends ProductCard { modifierLists: ModifierListView[]; taxable: boolean }

export interface MerchantCard {
  id: string; slug: string; name: string; category: string; description: string; cover: string | null; logo: string | null; isDemo: boolean;
  neighborhood: string | null; address: string; city: string; state: string; postalCode: string; phone: string | null; email: string | null;
  locationId: string; pickupEnabled: boolean; pickup: PickupWindow; hours: Hours; timezone: string; productCount: number;
  geo?: { lat: number; lng: number } | null;
}

const SELLABLE = new Set<Availability>(['in_stock', 'low_stock', 'available']);

// Publicly orderable = merchant active + location active + product published + not hidden by a Honeydoo override.
const PUBLIC_PRODUCTS = () => `
  from products p
  join merchants m on m.id = p.merchant_id and m.status = 'active' ${isDemoMode() ? '' : 'and not m.is_demo'}
  join merchant_locations l on l.merchant_id = m.id and l.active
  left join product_overrides o on o.product_id = p.id
  left join categories c on c.id = p.category_id
  where p.publication_status = 'published' and coalesce(o.published_in_honeydoo, true)`;

async function loadVariations(productIds: string[], locationIds: string[]) {
  if (!productIds.length) return new Map<string, VariationView[]>();
  const d = await db();
  const { rows } = await d.query(
    `select v.id, v.product_id, v.name, v.price_minor_units, v.currency, v.available_for_sale, v.ordinal,
            a.availability_status, a.quantity
       from product_variations v
       left join product_location_availability a on a.variation_id = v.id and a.merchant_location_id = any($2::uuid[])
      where v.product_id = any($1::uuid[])
      order by v.ordinal`, [productIds, locationIds]);
  const map = new Map<string, VariationView[]>();
  for (const r of rows) {
    const availability: Availability = !r.available_for_sale ? 'out_of_stock' : (r.availability_status ?? 'unknown');
    const v: VariationView = { id: r.id, name: r.name, price: r.price_minor_units, currency: r.currency, availability, quantity: r.quantity, sellable: SELLABLE.has(availability) };
    map.set(r.product_id, [...(map.get(r.product_id) ?? []), v]);
  }
  return map;
}

function toCard(r: any, vars: VariationView[]): ProductCard {
  const sellable = vars.filter((v) => v.sellable);
  const priced = sellable.length ? sellable : vars;
  const prices = priced.map((v) => v.price);
  const availability = !sellable.length ? 'sold_out' : sellable.every((v) => v.availability === 'low_stock') ? 'low_stock' : 'available';
  return {
    id: r.id, name: r.name, description: r.marketplace_description || r.description, image: r.featured_image_url || r.primary_image_url,
    category: r.category_slug, tags: r.tags ?? [],
    merchant: { id: r.merchant_id, slug: r.merchant_slug, name: r.merchant_name, isDemo: r.is_demo, neighborhood: r.neighborhood },
    locationId: r.location_id,
    minPrice: prices.length ? Math.min(...prices) : 0, maxPrice: prices.length ? Math.max(...prices) : 0,
    currency: vars[0]?.currency ?? 'USD', multiplePrices: new Set(prices).size > 1,
    availability, pickup: pickupWindow(r.operating_hours ?? {}, r.timezone, r.pickup_prep_minutes),
    featured: Boolean(r.featured), variations: vars,
  };
}

const CARD_COLS = `p.id, p.name, p.description, p.primary_image_url, p.tags, p.taxable, o.featured_image_url, o.marketplace_description, o.featured,
  c.slug as category_slug, m.id as merchant_id, m.slug as merchant_slug, m.display_name as merchant_name, m.is_demo,
  l.id as location_id, l.neighborhood, l.operating_hours, l.timezone, l.pickup_prep_minutes`;

export async function listProducts(f: { category?: string; merchantSlug?: string; featured?: boolean; ids?: string[]; limit?: number; offset?: number } = {}): Promise<ProductCard[]> {
  const d = await db();
  const where: string[] = []; const params: unknown[] = [];
  if (f.category && f.category !== 'all') { params.push(f.category); where.push(`c.slug = $${params.length}`); }
  if (f.merchantSlug) { params.push(f.merchantSlug); where.push(`m.slug = $${params.length}`); }
  if (f.featured) where.push(`o.featured`);
  if (f.ids) { params.push(f.ids); where.push(`p.id = any($${params.length}::uuid[])`); }
  params.push(Math.min(f.limit ?? 200, 500)); const lim = params.length;
  params.push(f.offset ?? 0); const off = params.length;
  const { rows } = await d.query(`select ${CARD_COLS} ${PUBLIC_PRODUCTS()} ${where.length ? 'and ' + where.join(' and ') : ''}
    order by o.featured desc nulls last, p.name limit $${lim} offset $${off}`, params);
  const vars = await loadVariations(rows.map((r) => r.id), [...new Set(rows.map((r) => r.location_id))]);
  return rows.map((r) => toCard(r, vars.get(r.id) ?? []));
}

export async function getProduct(id: string): Promise<ProductDetail | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const d = await db();
  const { rows } = await d.query(`select ${CARD_COLS} ${PUBLIC_PRODUCTS()} and p.id = $1 limit 1`, [id]);
  if (!rows[0]) return null;
  const vars = await loadVariations([id], [rows[0].location_id]);
  const ml = await d.query(
    `select ml.id, ml.name, ml.selection_type, ml.min_selected, ml.max_selected,
            coalesce(json_agg(json_build_object('id', md.id, 'name', md.name, 'price', md.price_minor_units, 'isDefault', md.is_default) order by md.ordinal)
                     filter (where md.id is not null), '[]') as options
       from product_modifier_lists pml join modifier_lists ml on ml.id = pml.modifier_list_id
       left join modifiers md on md.modifier_list_id = ml.id
      where pml.product_id = $1 group by ml.id, pml.ordinal order by pml.ordinal`, [id]);
  return {
    ...toCard(rows[0], vars.get(id) ?? []), taxable: rows[0].taxable,
    modifierLists: ml.rows.map((r) => ({ id: r.id, name: r.name, selection: r.selection_type, min: r.min_selected, max: r.max_selected, options: typeof r.options === 'string' ? JSON.parse(r.options) : r.options })),
  };
}

function toMerchant(r: any): MerchantCard {
  return {
    id: r.id, slug: r.slug, name: r.display_name, category: r.category, description: r.description, cover: r.cover_image_url, logo: r.logo_url,
    isDemo: r.is_demo, neighborhood: r.neighborhood, address: r.address, city: r.city, state: r.state, postalCode: r.postal_code,
    phone: r.contact_phone, email: r.contact_email, locationId: r.location_id, pickupEnabled: r.pickup_enabled,
    pickup: pickupWindow(r.operating_hours ?? {}, r.timezone, r.pickup_prep_minutes), hours: r.operating_hours ?? {}, timezone: r.timezone,
    productCount: r.product_count ?? 0,
    geo: r.latitude != null && r.longitude != null ? { lat: Number(r.latitude), lng: Number(r.longitude) } : null,
  };
}

const MERCHANT_SQL = () => `
  select m.*, l.id as location_id, l.neighborhood, l.address, l.city, l.state, l.postal_code, l.operating_hours, l.timezone,
         l.pickup_enabled, l.pickup_prep_minutes, l.latitude, l.longitude,
         (select count(*)::int from products p left join product_overrides o on o.product_id = p.id
           where p.merchant_id = m.id and p.publication_status = 'published' and coalesce(o.published_in_honeydoo, true)) as product_count
    from merchants m
    join lateral (select * from merchant_locations ml where ml.merchant_id = m.id and ml.active order by ml.created_at limit 1) l on true
   where m.status = 'active' ${isDemoMode() ? '' : 'and not m.is_demo'}`;

export async function listMerchants(f: { category?: string; market?: string } = {}): Promise<MerchantCard[]> {
  const d = await db();
  const params: unknown[] = []; let extra = '';
  if (f.category && f.category !== 'all') { params.push(f.category); extra += ` and (m.category = $1 or exists (select 1 from products p join categories c on c.id = p.category_id where p.merchant_id = m.id and c.slug = $1))`; }
  if (f.market) { params.push(f.market); extra += ` and m.market_id = (select id from markets where slug = $${params.length})`; }
  const { rows } = await d.query(`${MERCHANT_SQL()} ${extra} order by m.display_name`, params);
  return rows.map(toMerchant);
}

export async function getMerchant(slug: string): Promise<MerchantCard | null> {
  const d = await db();
  const { rows } = await d.query(`${MERCHANT_SQL()} and m.slug = $1`, [slug]);
  return rows[0] ? toMerchant(rows[0]) : null;
}

export async function listCategories() {
  const d = await db();
  const { rows } = await d.query<{ id: string; name: string; slug: string }>(`select id, name, slug from categories where parent_id is null order by display_order`);
  return rows;
}

export async function listMarkets() {
  const d = await db();
  const { rows } = await d.query<{ slug: string; name: string; state: string }>(`select slug, name, state from markets where active order by name`);
  return rows;
}

/** Real, live shops and their public products, for the sitemap. Demo shops are never included. */
export async function sitemapEntries() {
  const d = await db();
  const shops = (await d.query<{ slug: string; updated_at: Date }>(
    `select m.slug, m.updated_at from merchants m where m.status = 'active' and not m.is_demo
       and exists (select 1 from merchant_locations l where l.merchant_id = m.id and l.active) order by m.slug`)).rows;
  const products = (await d.query<{ id: string; updated_at: Date }>(
    `select p.id, p.updated_at from products p
       join merchants m on m.id = p.merchant_id and m.status = 'active' and not m.is_demo
       left join product_overrides o on o.product_id = p.id
      where p.publication_status = 'published' and coalesce(o.published_in_honeydoo, true) order by p.updated_at desc limit 45000`)).rows;
  return { shops, products };
}
