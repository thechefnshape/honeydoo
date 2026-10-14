// Pure mapping from Square Catalog objects to Honeydoo's normalized catalog. No I/O, fully unit tested.

export interface SqObject {
  type: string; id: string; version?: number | string; is_deleted?: boolean; updated_at?: string;
  present_at_all_locations?: boolean; present_at_location_ids?: string[]; absent_at_location_ids?: string[];
  item_data?: any; item_variation_data?: any; modifier_data?: any; category_data?: any; modifier_list_data?: any; image_data?: any; tax_data?: any;
}

export interface MappedVariation {
  sourceId: string; name: string; sku: string | null; price: number; currency: string; ordinal: number; trackInventory: boolean;
  soldOutAt: string[]; trackAt: string[]; presentAt: (locationId: string) => boolean;
}
export interface MappedModifierList { sourceId: string; name: string; selection: 'single' | 'multiple'; min: number; max: number | null; modifiers: { sourceId: string; name: string; price: number; ordinal: number; isDefault: boolean }[] }
export interface MappedItem {
  sourceId: string; version: number | null; updatedAt: string | null; name: string; description: string; imageUrl: string | null;
  categorySlug: string; sourceCategory: string | null; taxable: boolean; archived: boolean; restricted: string | null;
  modifierLists: { sourceId: string; min?: number; max?: number | null }[]; variations: MappedVariation[]; skippedVariations: { sourceId: string; reason: string }[];
  presentAt: (locationId: string) => boolean;
}
export interface MappedCatalog { items: MappedItem[]; modifierLists: Map<string, MappedModifierList>; deletedItemIds: string[] }

// Categories excluded from Honeydoo v1 (age, legal or licensing verification required).
const RESTRICTED: [RegExp, string][] = [
  [/\b(alcohol|beer|wine|liquor|spirits?|vodka|whiske?y|bourbon|tequila|rum|gin|cider|seltzer \(alc|hard seltzer|sake|mead|ipa|lager|ale|cocktail)\b/i, 'alcohol'],
  [/\b(tobacco|cigars?|cigarettes?|vape|vaping|e-?cig|nicotine|hookah)\b/i, 'tobacco'],
  [/\b(cannabis|marijuana|thc|delta[- ]?8|cbd|hemp flower|kratom)\b/i, 'cannabis'],
  [/\b(firearms?|guns?|ammo|ammunition|knives? \(tactical\)|pepper spray|taser)\b/i, 'weapons'],
  [/\b(rx|prescription|pharmacy only)\b/i, 'prescription'],
  [/\b(lottery|gift card)\b/i, 'stored value or gaming'],
];

export function restrictionFor(...texts: (string | null | undefined)[]): string | null {
  const t = texts.filter(Boolean).join(' ');
  for (const [re, label] of RESTRICTED) if (re.test(t)) return label;
  return null;
}

const CATEGORY_RULES: [RegExp, string][] = [
  [/coffee|espresso|latte|tea\b|beverage|drinks?/i, 'coffee'],
  [/flower|floral|bouquet|stems?/i, 'flowers'],
  [/plant|succulent|planter|garden/i, 'plants'],
  [/grocery|produce|pantry|dairy|eggs|meat|cheese|market/i, 'groceries'],
  [/book|puzzle|stationery|journal/i, 'books'],
  [/candle|home|kitchen|linen|decor|ceramic|bath/i, 'home'],
  [/gift|card|toy|kids|jewelry|apparel|accessor/i, 'gifts'],
  [/food|bakery|bread|pastr|sandwich|burger|lunch|dinner|breakfast|entree|appetizer|dessert|snack|bowl|pizza|taco|meal/i, 'food'],
];

export function categoryFor(names: string[], merchantDefault: string): string {
  for (const n of names) for (const [re, slug] of CATEGORY_RULES) if (re.test(n)) return slug;
  return merchantDefault;
}

function presence(o: SqObject) {
  const all = o.present_at_all_locations !== false; // Square default is true when omitted
  const present = new Set(o.present_at_location_ids ?? []);
  const absent = new Set(o.absent_at_location_ids ?? []);
  return (loc: string) => (all ? !absent.has(loc) : present.has(loc));
}

export function mapCatalog(objects: SqObject[], merchantDefaultCategory: string): MappedCatalog {
  const byId = new Map(objects.map((o) => [o.id, o]));
  const modifierLists = new Map<string, MappedModifierList>();
  for (const o of objects) {
    if (o.type !== 'MODIFIER_LIST' || o.is_deleted) continue;
    const d = o.modifier_list_data ?? {};
    const single = d.selection_type === 'SINGLE';
    modifierLists.set(o.id, {
      sourceId: o.id, name: d.name ?? 'Options', selection: single ? 'single' : 'multiple',
      // Square uses -1 (or omission) for "no limit".
      min: Math.max(0, Number(d.min_selected_modifiers ?? 0)),
      max: Number(d.max_selected_modifiers ?? -1) >= 0 ? Number(d.max_selected_modifiers) : single ? 1 : null,
      modifiers: (d.modifiers ?? []).filter((m: SqObject) => !m.is_deleted).map((m: SqObject, i: number) => ({
        sourceId: m.id, name: m.modifier_data?.name ?? 'Option', price: Number(m.modifier_data?.price_money?.amount ?? 0),
        ordinal: Number(m.modifier_data?.ordinal ?? i), isDefault: Boolean(m.modifier_data?.on_by_default),
      })),
    });
  }

  const items: MappedItem[] = []; const deletedItemIds: string[] = [];
  for (const o of objects) {
    if (o.type !== 'ITEM') continue;
    if (o.is_deleted) { deletedItemIds.push(o.id); continue; }
    const d = o.item_data ?? {};
    const catIds: string[] = [...(d.categories ?? []).map((c: any) => c.id), d.reporting_category?.id, d.category_id].filter(Boolean);
    const catNames = catIds.map((id) => byId.get(id)?.category_data?.name).filter(Boolean) as string[];
    const imageId = (d.image_ids ?? [])[0];
    const variations: MappedVariation[] = []; const skipped: MappedItem['skippedVariations'] = [];
    for (const [i, v] of (d.variations ?? []).entries() as IterableIterator<[number, SqObject]>) {
      if (v.is_deleted) continue;
      const vd = v.item_variation_data ?? {};
      if (vd.pricing_type === 'VARIABLE_PRICING' || vd.price_money?.amount === undefined) { skipped.push({ sourceId: v.id, reason: 'variable or missing price' }); continue; }
      if (vd.sellable === false) { skipped.push({ sourceId: v.id, reason: 'not sellable' }); continue; }
      const overrides: any[] = vd.location_overrides ?? [];
      variations.push({
        sourceId: v.id, name: vd.name || 'Regular', sku: vd.sku ?? null, price: Number(vd.price_money.amount), currency: vd.price_money.currency ?? 'USD',
        ordinal: Number(vd.ordinal ?? i), trackInventory: Boolean(vd.track_inventory),
        soldOutAt: overrides.filter((x) => x.sold_out).map((x) => x.location_id),
        trackAt: overrides.filter((x) => x.track_inventory).map((x) => x.location_id),
        presentAt: presence(v),
      });
    }
    items.push({
      sourceId: o.id, version: o.version !== undefined ? Number(o.version) : null, updatedAt: o.updated_at ?? null,
      name: String(d.name ?? 'Untitled item').slice(0, 200), description: String(d.description_plaintext ?? d.description ?? '').slice(0, 2000),
      imageUrl: imageId ? byId.get(imageId)?.image_data?.url ?? null : null,
      categorySlug: categoryFor([...catNames, d.name ?? ''], merchantDefaultCategory), sourceCategory: catNames[0] ?? null,
      taxable: (d.tax_ids ?? []).length > 0, archived: Boolean(d.is_archived),
      restricted: restrictionFor(d.name, ...catNames, d.description_plaintext),
      modifierLists: (d.modifier_list_info ?? []).filter((m: any) => m.enabled !== false).map((m: any) => ({
        sourceId: m.modifier_list_id,
        min: m.min_selected_modifiers !== undefined && Number(m.min_selected_modifiers) >= 0 ? Number(m.min_selected_modifiers) : undefined,
        max: m.max_selected_modifiers !== undefined && Number(m.max_selected_modifiers) >= 0 ? Number(m.max_selected_modifiers) : undefined,
      })),
      variations, skippedVariations: skipped, presentAt: presence(o),
    });
  }
  return { items, modifierLists, deletedItemIds };
}

export type AvailabilityStatus = 'in_stock' | 'low_stock' | 'out_of_stock' | 'available' | 'not_sold_here';

/** Availability for one variation at one location. Untracked stock is "available", never an invented quantity. */
export function availabilityFor(v: MappedVariation, itemPresent: boolean, locationId: string, count: number | null | undefined /* undefined = not returned, null = not fetched */, lowThreshold = 3): { status: AvailabilityStatus; quantity: number | null } {
  if (!itemPresent || !v.presentAt(locationId)) return { status: 'not_sold_here', quantity: null };
  if (v.soldOutAt.includes(locationId)) return { status: 'out_of_stock', quantity: 0 };
  const tracked = v.trackInventory || v.trackAt.includes(locationId);
  if (!tracked || count === null) return { status: 'available', quantity: null };
  // Tracked but Square returned no IN_STOCK count: Square omits zero counts, so treat as sold out.
  if (count === undefined) return { status: 'out_of_stock', quantity: 0 };
  if (count <= 0) return { status: 'out_of_stock', quantity: 0 };
  return { status: count <= lowThreshold ? 'low_stock' : 'in_stock', quantity: count };
}
