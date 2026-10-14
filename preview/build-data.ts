// Turns the demo seed into a static catalog for the in-browser preview.
import fs from 'node:fs';
import { CATEGORIES, MERCHANTS, MODIFIER_LISTS } from '../db/seed/data';
const out = {
  categories: CATEGORIES,
  merchants: MERCHANTS.map((m) => ({
    id: `m-${m.slug}`, locationId: `l-${m.slug}`, slug: m.slug, name: m.name, category: m.category, description: m.description,
    neighborhood: m.neighborhood, address: m.address, lat: m.lat, lng: m.lng, phone: m.phone, hours: m.hours, prepMinutes: m.prepMinutes,
    referral: `${m.slug.split('-')[0]}-demo`,
    modifierLists: [...new Set(m.products.flatMap((p) => p.modifiers ?? []))].map((k) => ({
      id: `ml-${m.slug}-${k}`, key: k, name: MODIFIER_LISTS[k].name, selection: MODIFIER_LISTS[k].selection, min: MODIFIER_LISTS[k].min, max: MODIFIER_LISTS[k].max,
      options: MODIFIER_LISTS[k].options.map(([name, price, def], i) => ({ id: `mod-${m.slug}-${k}-${i}`, name, price, isDefault: Boolean(def) })),
    })),
    products: m.products.map((p) => ({
      id: `p-${m.slug}-${p.key}`, key: p.key, name: p.name, description: p.description, category: p.category, tags: p.tags, taxable: p.taxable ?? true,
      featured: Boolean(p.featured), modifierLists: (p.modifiers ?? []).map((k) => `ml-${m.slug}-${k}`),
      variations: p.variations.map(([name, price, avail, qty], i) => ({ id: `v-${m.slug}-${p.key}-${i}`, name, price, availability: avail ?? 'available', quantity: avail ? qty ?? null : null })),
    })),
  })),
};
fs.writeFileSync('preview/data.json', JSON.stringify(out));
console.log('merchants', out.merchants.length, 'products', out.merchants.reduce((s, m) => s + m.products.length, 0));
