// Browser version of src/server/catalog.ts with the same shapes, reading the demo seed.
import data from './data.json';
import { pickupWindow, type Hours } from '@/lib/hours';
import { db } from './store';
import type { MerchantCard, ProductCard, ProductDetail, VariationView, ModifierListView } from '../src/server/catalog';

export type { MerchantCard, ProductCard, ProductDetail, VariationView, ModifierListView };
type M = (typeof data.merchants)[number];
type P = M['products'][number];

const SELLABLE = new Set(['in_stock', 'low_stock', 'available']);
const visible = (p: P) => !db().hidden.includes(p.id);

function vars(p: P): VariationView[] {
  return p.variations.map((v) => ({ id: v.id, name: v.name, price: v.price, currency: 'USD', availability: v.availability as VariationView['availability'], quantity: v.quantity, sellable: SELLABLE.has(v.availability) }));
}
function card(m: M, p: P): ProductCard {
  const vs = vars(p); const sellable = vs.filter((v) => v.sellable); const priced = sellable.length ? sellable : vs;
  const prices = priced.map((v) => v.price);
  return {
    id: p.id, name: p.name, description: p.description, image: null, category: p.category, tags: p.tags,
    merchant: { id: m.id, slug: m.slug, name: m.name, isDemo: true, neighborhood: m.neighborhood }, locationId: m.locationId,
    minPrice: Math.min(...prices), maxPrice: Math.max(...prices), currency: 'USD', multiplePrices: new Set(prices).size > 1,
    availability: !sellable.length ? 'sold_out' : sellable.every((v) => v.availability === 'low_stock') ? 'low_stock' : 'available',
    pickup: pickupWindow(m.hours as Hours, 'America/New_York', m.prepMinutes), featured: p.featured, variations: vs,
  };
}
function mcard(m: M): MerchantCard {
  return {
    id: m.id, slug: m.slug, name: m.name, category: m.category, description: m.description, cover: null, logo: null, isDemo: true,
    neighborhood: m.neighborhood, address: m.address, city: 'Lakewood', state: 'OH', postalCode: '44107', phone: m.phone, email: `hello@${m.slug}.example`,
    locationId: m.locationId, pickupEnabled: true, pickup: pickupWindow(m.hours as Hours, 'America/New_York', m.prepMinutes), hours: m.hours as Hours,
    timezone: 'America/New_York', productCount: m.products.filter(visible).length,
  };
}

export const allMerchants = () => data.merchants;
export function findVariation(id: string) {
  for (const m of data.merchants) for (const p of m.products) { const v = p.variations.find((x) => x.id === id); if (v) return { m, p, v }; }
  return null;
}
export async function listProducts(f: { category?: string; merchantSlug?: string; featured?: boolean; limit?: number } = {}): Promise<ProductCard[]> {
  const out: ProductCard[] = [];
  for (const m of data.merchants) {
    if (f.merchantSlug && m.slug !== f.merchantSlug) continue;
    for (const p of m.products) {
      if (!visible(p)) continue;
      if (f.category && f.category !== 'all' && p.category !== f.category) continue;
      if (f.featured && !p.featured) continue;
      out.push(card(m, p));
    }
  }
  out.sort((a, b) => Number(b.featured) - Number(a.featured) || a.name.localeCompare(b.name));
  return out.slice(0, f.limit ?? 500);
}
export async function getProduct(id: string): Promise<ProductDetail | null> {
  for (const m of data.merchants) {
    const p = m.products.find((x) => x.id === id);
    if (p && visible(p)) {
      const lists: ModifierListView[] = p.modifierLists.map((lid) => m.modifierLists.find((l) => l.id === lid)!).map((l) => ({ id: l.id, name: l.name, selection: l.selection as 'single' | 'multiple', min: l.min, max: l.max, options: l.options }));
      return { ...card(m, p), modifierLists: lists, taxable: p.taxable };
    }
  }
  return null;
}
export async function listMerchants(f: { category?: string } = {}): Promise<MerchantCard[]> {
  return data.merchants
    .filter((m) => !f.category || f.category === 'all' || m.category === f.category || m.products.some((p) => p.category === f.category))
    .map(mcard).sort((a, b) => a.name.localeCompare(b.name));
}
export async function getMerchant(slug: string) { const m = data.merchants.find((x) => x.slug === slug); return m ? mcard(m) : null; }
export async function listCategories() { return data.categories.map((c, i) => ({ id: String(i), ...c })); }
export async function listMarkets() { return [{ slug: 'lakewood-oh', name: 'Lakewood', state: 'OH' }]; }
