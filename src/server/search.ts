import { listProducts, type ProductCard } from './catalog';

// Deterministic keyword + filter search. Powers normal search and is the fallback when AI is unavailable.

export interface SearchParams {
  query?: string;
  category?: string;            // category slug
  maxPriceMinor?: number;
  minPriceMinor?: number;
  pickupToday?: boolean;
  availableOnly?: boolean;
  limit?: number;
}

export interface ParsedQuery extends SearchParams { terms: string[] }

const STOP = new Set(('a an the and or of for to in on at near nearby me my i im i\'m we us our you your it is are be can could would like want need looking ' +
  'find show get give some something anything any thing things where what which who that this please just today now pick up pickup ' +
  'under below less than cheaper max maximum around about dollars dollar bucks usd with from by loves love likes like good great nice best one ' +
  'buy order shop store local around here there').split(/\s+/));

const SYNONYMS: Record<string, string[]> = {
  flower: ['flowers', 'bouquet'], florist: ['flowers', 'bouquet'], bouquet: ['flowers'], rose: ['roses'],
  latte: ['latte', 'espresso'], espresso: ['espresso'], coffee: ['coffee', 'espresso', 'latte'], caffeine: ['coffee'],
  gift: ['gift'], present: ['gift'], birthday: ['birthday', 'gift'], anniversary: ['anniversary', 'romantic', 'gift'],
  plant: ['plant', 'houseplant'], houseplant: ['houseplant', 'plant'],
  lunch: ['lunch'], dinner: ['dinner'], breakfast: ['breakfast'], bread: ['bread', 'loaf'], sourdough: ['sourdough', 'bread'],
  kid: ['kids'], kids: ['kids'], child: ['kids'], children: ['kids'], son: ['kids'], daughter: ['kids'],
  candle: ['candle'], book: ['book'], grocery: ['groceries', 'pantry'], groceries: ['groceries'], dessert: ['dessert', 'sweet'],
  cookie: ['cookies'], vegetarian: ['vegetarian'], healthy: ['healthy', 'salad'], sandwich: ['sandwich'],
};

const CATEGORY_WORDS: Record<string, string> = {
  flowers: 'flowers', coffee: 'coffee', groceries: 'groceries', grocery: 'groceries', gifts: 'gifts', home: 'home',
  plants: 'plants', books: 'books', food: 'food',
};

const stem = (w: string) => (w.length > 4 && w.endsWith('ies') ? w.slice(0, -3) + 'y' : w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);

/** Extracts price limits, pickup intent, age hints and meaningful terms from free text. */
export function parseQuery(text: string): ParsedQuery {
  const t = text.toLowerCase().replace(/[’']/g, "'");
  const out: ParsedQuery = { terms: [] };
  const under = t.match(/(?:under|below|less than|cheaper than|max(?:imum)?|up to|no more than|within)\s*\$?\s*(\d+(?:\.\d{1,2})?)/) ||
    t.match(/\$\s*(\d+(?:\.\d{1,2})?)\s*(?:or less|or under|max|and under)/);
  if (under) out.maxPriceMinor = Math.round(Number(under[1]) * 100);
  const over = t.match(/(?:over|more than|at least|above)\s*\$?\s*(\d+(?:\.\d{1,2})?)/);
  if (over) out.minPriceMinor = Math.round(Number(over[1]) * 100);
  if (/\b(today|tonight|right now|now|this afternoon|this morning|asap)\b/.test(t)) out.pickupToday = true;

  const terms = new Set<string>();
  const age = t.match(/(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)[\s-]*(?:year|yr)[\s-]*old/);
  if (age) { terms.add('kids'); const n = wordNum(age[1]); if (n) terms.add(`age ${n}`); }
  if (/\btoddler|baby|kid|child/.test(t)) terms.add('kids');

  const words = t.replace(/\$\s*\d+(\.\d+)?/g, ' ').replace(/[^a-z0-9\s-]/g, ' ').split(/[\s-]+/).filter(Boolean);
  for (const raw of words) {
    if (STOP.has(raw) || /^\d+$/.test(raw) || raw.length < 2) continue;
    const w = stem(raw);
    if (STOP.has(w)) continue;
    terms.add(w);
    for (const s of SYNONYMS[w] ?? SYNONYMS[raw] ?? []) terms.add(s);
  }
  out.terms = [...terms];
  return out;
}

function wordNum(s: string) {
  const m: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
  return /^\d+$/.test(s) ? Number(s) : m[s];
}

function score(p: ProductCard, terms: string[]): number {
  if (!terms.length) return 1;
  const name = p.name.toLowerCase(), desc = p.description.toLowerCase(), merch = p.merchant.name.toLowerCase();
  const tags = p.tags.map((x) => x.toLowerCase());
  let s = 0; let hits = 0;
  for (const term of terms) {
    let h = 0;
    if (new RegExp(`\\b${esc(term)}`).test(name)) h += 6;
    if (tags.some((tg) => tg === term || tg.startsWith(term) || stem(tg) === term)) h += 4;
    if (p.category === term || CATEGORY_WORDS[term] === p.category) h += 3;
    if (merch.includes(term)) h += 2;
    if (new RegExp(`\\b${esc(term)}`).test(desc)) h += 1;
    if (h) hits++;
    s += h;
  }
  // Reward products that satisfy more of the request, not just one strong word.
  return s ? s * (0.5 + hits / terms.length) : 0;
}
/** The request words a product actually matched, for short human-readable reasons. */
export function matchedTerms(p: ProductCard, terms: string[]): string[] {
  const hay = `${p.name} ${p.tags.join(' ')} ${p.category ?? ''}`.toLowerCase();
  return terms.filter((t) => !t.includes(' ') && new RegExp(`\\b${esc(t)}`).test(hay)).slice(0, 3);
}
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export interface SearchResult { product: ProductCard; score: number; eligiblePrice: number }

/** Searches published catalog. Prices and availability come only from the database. */
export async function searchCatalog(p: SearchParams & { terms?: string[] }): Promise<SearchResult[]> {
  const parsed = p.query ? parseQuery(p.query) : { terms: [] as string[] };
  const terms = [...new Set([...(p.terms ?? []), ...parsed.terms])];
  const max = p.maxPriceMinor ?? parsed.maxPriceMinor;
  const min = p.minPriceMinor ?? parsed.minPriceMinor;
  const pickupToday = p.pickupToday ?? parsed.pickupToday;
  const products = await listProducts({ category: p.category, limit: 500 });

  const results: SearchResult[] = [];
  for (const prod of products) {
    const sc = score(prod, terms);
    if (sc <= 0) continue;
    // A product qualifies on price if at least one SELLABLE variation is within range.
    const candidates = prod.variations.filter((v) => (p.availableOnly ? v.sellable : true) && (max === undefined || v.price <= max) && (min === undefined || v.price >= min));
    if (!candidates.length) continue;
    if (p.availableOnly && prod.availability === 'sold_out') continue;
    if (pickupToday && !prod.pickup.pickupToday) continue;
    const sellable = candidates.filter((v) => v.sellable);
    results.push({ product: prod, score: sc + (prod.availability === 'sold_out' ? -100 : 0), eligiblePrice: Math.min(...(sellable.length ? sellable : candidates).map((v) => v.price)) });
  }
  results.sort((a, b) => b.score - a.score || a.eligiblePrice - b.eligiblePrice);
  return results.slice(0, p.limit ?? 40);
}
