// The /api/v1 routes, implemented in the browser so the real UI components run unchanged.
// Same rules as the server: catalog prices only, validated modifiers, authoritative quotes,
// idempotent checkout, and demo orders that are never marked paid.
import { taxOn, formatMoney } from '@/lib/money';
import { matchedTerms, parseQuery, searchCatalog } from '@/server/search';
import { pickupWindow, type Hours } from '@/lib/hours';
import { allMerchants, findVariation, getProduct, listMerchants } from './catalog';
import { db, me, save, uid, type CartItem, type OrderRec } from './store';

class E extends Error { constructor(public status: number, public code: string, msg: string, public details?: unknown) { super(msg); } }
const json = (data: unknown, status = 200) => new Response(JSON.stringify({ data }), { status, headers: { 'content-type': 'application/json' } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function hash(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16).padStart(8, '0').repeat(4); }

function validate(variationId: string, modifierIds: string[]) {
  const f = findVariation(variationId);
  if (!f || db().hidden.includes(f.p.id)) throw new E(404, 'product_unavailable', 'That item is no longer available on Honeydoo.');
  if (f.v.availability === 'out_of_stock') throw new E(409, 'out_of_stock', 'That option is sold out right now.');
  const lists = f.p.modifierLists.map((id) => f.m.modifierLists.find((l) => l.id === id)!);
  const allowed = new Map<string, string>(); lists.forEach((l) => l.options.forEach((o) => allowed.set(o.id, l.id)));
  const uniq = [...new Set(modifierIds)];
  for (const id of uniq) if (!allowed.has(id)) throw new E(400, 'invalid_modifier', 'One of the selected options is not valid for this item.');
  for (const l of lists) {
    const n = uniq.filter((id) => allowed.get(id) === l.id).length;
    if (n < l.min) throw new E(400, 'modifier_required', `Choose ${l.name.toLowerCase()}.`);
    if (l.max !== null && n > l.max) throw new E(400, 'too_many_modifiers', `Choose up to ${l.max} for ${l.name.toLowerCase()}.`);
  }
  return { ...f, modifierIds: uniq.sort() };
}

function cartView() {
  const s = db(); const groups = new Map<string, any>();
  for (const it of s.items) {
    const f = findVariation(it.variationId); if (!f) continue;
    const mods = it.modifierIds.map((id) => f.m.modifierLists.flatMap((l) => l.options).find((o) => o.id === id)!).filter(Boolean).map((o) => ({ id: o.id, name: o.name, price: o.price }));
    const unit = f.v.price + mods.reduce((a, b) => a + b.price, 0);
    let note: string | null = null;
    if (s.hidden.includes(f.p.id)) note = 'No longer available on Honeydoo';
    else if (f.v.availability === 'out_of_stock') note = 'Sold out';
    else if (f.v.quantity !== null && it.quantity > f.v.quantity) note = `Only ${f.v.quantity} available`;
    const line = { id: it.id, productId: f.p.id, productName: f.p.name, image: null, variationId: f.v.id, variationName: f.v.name, unitPrice: unit, modifiers: mods,
      quantity: it.quantity, lineTotal: unit * it.quantity, available: note === null, availabilityNote: note, locationId: f.m.locationId, taxable: f.p.taxable };
    const g = groups.get(f.m.id) ?? { merchant: { id: f.m.id, slug: f.m.slug, name: f.m.name, isDemo: true, serviceFee: 100 }, lines: [], subtotal: 0 };
    g.lines.push(line); if (line.available) g.subtotal += line.lineTotal; groups.set(f.m.id, g);
  }
  const list = [...groups.values()].sort((a, b) => a.merchant.name.localeCompare(b.merchant.name));
  return { id: s.cartId, version: s.cartVersion, groups: list, itemCount: list.reduce((n, g) => n + g.lines.reduce((t: number, l: any) => t + l.quantity, 0), 0) };
}

function quote(merchantId: string) {
  const g = cartView().groups.find((x) => x.merchant.id === merchantId);
  if (!g) throw new E(404, 'nothing_to_checkout', 'There are no items from this shop in your bag.');
  const m = allMerchants().find((x) => x.id === merchantId)!;
  const live = g.lines.filter((l: any) => l.available);
  if (!live.length) throw new E(409, 'items_unavailable', 'None of the items from this shop are available right now.');
  const subtotal = live.reduce((a: number, l: any) => a + l.lineTotal, 0);
  const tax = taxOn(live.filter((l: any) => l.taxable).reduce((a: number, l: any) => a + l.lineTotal, 0), 800);
  const total = subtotal + tax; // the shop pays honeydoo's $1; the customer never sees it
  const lines = live.map((l: any) => ({ cartItemId: l.id, productId: l.productId, variationId: l.variationId, sourceVariationId: l.variationId, productName: l.productName,
    variationName: l.variationName, unitPrice: l.unitPrice, quantity: l.quantity, taxable: l.taxable, modifiers: l.modifiers.map((x: any) => ({ ...x, sourceId: x.id })), lineTotal: l.lineTotal }));
  const q = {
    cartId: db().cartId, cartVersion: db().cartVersion, merchant: { id: m.id, slug: m.slug, name: m.name, isDemo: true, integrationId: null, contactEmail: null },
    location: { id: m.locationId, sourceLocationId: null, taxRateBps: 800, timezone: 'America/New_York', prepMinutes: m.prepMinutes, name: m.name, address: `${m.address}, Lakewood, OH`,
      pickupLabel: pickupWindow(m.hours as Hours, 'America/New_York', m.prepMinutes).label },
    provider: 'demo', paymentsEnabled: false, lines, merchandiseSubtotal: subtotal, taxTotal: tax, discountTotal: 0, tipTotal: 0, merchantFee: 100, merchantFeeWaived: false,
    grandTotal: total, currency: 'USD', taxNote: 'Estimated at 8.00% on taxable items.',
    issues: g.lines.filter((l: any) => !l.available).map((l: any) => `${l.productName}: ${l.availabilityNote}`), quoteHash: '',
  };
  q.quoteHash = hash(JSON.stringify([q.cartId, q.cartVersion, merchantId, lines.map((l: any) => [l.variationId, l.quantity, l.unitPrice]), subtotal, tax]));
  return q;
}

const code = () => 'HD-' + Array.from({ length: 5 }, () => 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 31)]).join('');

// Customer accounts, mirroring src/server/accounts.ts. Passwords are kept only as a salted SHA-256 in this browser.
async function pwHash(email: string, pw: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`honeydoo-preview:${email}:${pw}`));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const pub = (a: { id: string; email: string; name: string; phone: string | null; createdAt: string }) => ({ id: a.id, email: a.email, name: a.name, phone: a.phone, createdAt: a.createdAt });
function mergeInto(target: CartItem[], from: CartItem[]) {
  for (const it of from) {
    const t = target.find((x) => x.lineKey === it.lineKey);
    if (t) t.quantity = Math.min(50, t.quantity + it.quantity); else target.push({ ...it, id: uid() });
  }
  return target;
}
function startSession(id: string) {
  const s = db(); const a = s.accounts.find((x) => x.id === id)!;
  for (const o of s.orders) if (!o.customerId && o.sessionTag === s.guestTag) { o.customerId = id; o.sessionTag = undefined; }
  s.items = mergeInto(a.items.map((x) => ({ ...x })), s.items); a.items = [];
  s.customerId = id; s.cartVersion++; save();
}
function endSession() {
  const s = db(); const a = me();
  if (a) a.items = s.items;
  s.customerId = null; s.items = []; s.guestTag = uid(); s.cartId = uid(); s.cartVersion++; save();
}
async function account(method: string, path: string, b: any): Promise<Response> {
  const s = db(); const email = String(b.email ?? '').trim().toLowerCase(); const cur = me();
  const needMe = () => { if (!cur) throw new E(401, 'unauthorized', 'Sign in to continue.'); return cur; };
  const checkPw = (pw: unknown) => { if (typeof pw !== 'string' || pw.length < 8) throw new E(400, 'invalid_request', 'Use at least 8 characters.'); };
  await sleep(350);
  if (path === '/api/v1/account' && method === 'GET') return json({ customer: cur ? pub(cur) : null });
  if (path === '/api/v1/account' && method === 'PATCH') {
    const a = needMe();
    if (b.name !== undefined) { if (!String(b.name).trim()) throw new E(400, 'invalid_request', 'Enter your name.'); a.name = String(b.name).trim().slice(0, 80); }
    if (b.phone !== undefined) { if (b.phone && !/^[0-9+().\-\s]*$/.test(b.phone)) throw new E(400, 'invalid_request', 'Enter a valid phone number.'); a.phone = b.phone || null; }
    save(); return json({ customer: pub(a) });
  }
  if (path === '/api/v1/account/signup') {
    if (!String(b.name ?? '').trim()) throw new E(400, 'invalid_request', 'Enter your name.');
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new E(400, 'invalid_request', 'Enter a valid email address.');
    checkPw(b.password);
    if (s.accounts.some((a) => a.email === email && !a.deleted)) throw new E(409, 'email_taken', 'An account with that email already exists. Sign in instead.');
    const a = { id: uid(), name: String(b.name).trim(), email, phone: null, pwHash: await pwHash(email, b.password), items: [], createdAt: new Date().toISOString() };
    s.accounts.push(a); startSession(a.id); return json({ customer: pub(a) }, 201);
  }
  if (path === '/api/v1/account/signin') {
    const a = s.accounts.find((x) => x.email === email && !x.deleted);
    if (!a || a.pwHash !== (await pwHash(email, String(b.password ?? '')))) throw new E(401, 'invalid_credentials', 'That email and password do not match.');
    if (cur) endSession();
    startSession(a.id); return json({ customer: pub(a) });
  }
  if (path === '/api/v1/account/signout') { endSession(); return json({ signedOut: true }); }
  if (path === '/api/v1/account/password') {
    const a = needMe();
    if (a.pwHash !== (await pwHash(a.email, String(b.current ?? '')))) throw new E(401, 'invalid_credentials', 'Your current password is not correct.');
    checkPw(b.next); a.pwHash = await pwHash(a.email, b.next); save(); return json({ changed: true });
  }
  if (path === '/api/v1/account/forgot') throw new E(503, 'email_unavailable', 'Password reset emails are not available in this preview.');
  if (path === '/api/v1/account/reset') throw new E(400, 'invalid_token', 'This reset link has expired or was already used. Request a new one.');
  if (path === '/api/v1/account/delete') {
    const a = needMe();
    if (a.pwHash !== (await pwHash(a.email, String(b.password ?? '')))) throw new E(401, 'invalid_credentials', 'Your password is not correct.');
    for (const o of s.orders) if (o.customerId === a.id) o.customerId = 'deleted';
    a.deleted = true; a.email = ''; a.name = ''; a.phone = null; a.pwHash = ''; a.items = [];
    s.customerId = null; s.items = []; s.guestTag = uid(); s.cartId = uid(); save();
    return json({ deleted: true });
  }
  throw new E(404, 'not_found', 'Not found.');
}

async function route(method: string, path: string, body: any): Promise<Response> {
  const s = db(); let m: RegExpMatchArray | null;
  if (method === 'POST' && path === '/api/v1/cart') return json(cartView(), 201);
  if ((m = path.match(/^\/api\/v1\/cart\/[^/]+$/)) && method === 'GET') return json(cartView());
  if (path.match(/^\/api\/v1\/cart\/[^/]+\/items$/) && method === 'POST') {
    const sel = validate(body.variationId, body.modifierIds ?? []);
    const lineKey = `${body.variationId}:${sel.modifierIds.join(',')}`;
    const ex = s.items.find((i) => i.lineKey === lineKey);
    if (ex) ex.quantity = Math.min(50, ex.quantity + (body.quantity ?? 1));
    else s.items.push({ id: uid(), variationId: body.variationId, quantity: body.quantity ?? 1, modifierIds: sel.modifierIds, lineKey, createdAt: Date.now() });
    s.cartVersion++; save(); return json(cartView(), 201);
  }
  if ((m = path.match(/^\/api\/v1\/cart\/[^/]+\/items\/([^/]+)$/))) {
    const it = s.items.find((i) => i.id === m![1]);
    if (method === 'PATCH') { if (!it) throw new E(404, 'item_not_found', 'That item is no longer in your bag.'); it.quantity = body.quantity; }
    if (method === 'DELETE') s.items = s.items.filter((i) => i.id !== m![1]);
    s.cartVersion++; save(); return json(cartView());
  }
  if ((m = path.match(/^\/api\/v1\/products\/([^/]+)$/)) && method === 'GET') {
    const p = await getProduct(m[1]); if (!p) throw new E(404, 'product_not_found', 'Product not found.'); return json(p);
  }
  if (method === 'POST' && path === '/api/v1/search') {
    await sleep(120);
    return json((await searchCatalog({ query: body.query, category: body.category, maxPriceMinor: body.maxPriceMinor, pickupToday: body.pickupToday })).map((r) => r.product));
  }
  if (method === 'POST' && path === '/api/v1/ai/search') {
    await sleep(1100); // the bee gets to think, as it would while the model works
    const text = String(body.message ?? '');
    const parsed = parseQuery(text);
    let results = await searchCatalog({ query: text, availableOnly: true, limit: 6 }); let relaxed = false;
    if (!results.length && parsed.pickupToday) { results = await searchCatalog({ query: text, availableOnly: true, pickupToday: false, limit: 6 }); relaxed = results.length > 0; }
    const reason = (r: any) => { const hit = matchedTerms(r.product, parsed.terms); return [hit.length ? `Good match for ${hit.join(', ')}` : 'Related to your request', parsed.maxPriceMinor ? `within your ${formatMoney(parsed.maxPriceMinor)} budget` : '', r.product.availability === 'low_stock' ? 'only a few left' : ''].filter(Boolean).join(', '); };
    const message = relaxed ? `Nothing matching can be picked up today, since those shops have closed. These are available for pickup next${parsed.maxPriceMinor ? `, all under ${formatMoney(parsed.maxPriceMinor)}` : ''}.`
      : results.length ? `Here ${results.length === 1 ? 'is 1 match' : `are ${results.length} matches`} from local shops${parsed.maxPriceMinor ? ` under ${formatMoney(parsed.maxPriceMinor)}` : ''}.`
      : `I couldn't find anything available that matches${parsed.maxPriceMinor ? ` under ${formatMoney(parsed.maxPriceMinor)}` : ''}. Try fewer words or a higher price limit.`;
    return json({ message, recommendations: results.map((r) => ({ product: r.product, reason: reason(r) })), clarifyingQuestion: null, mode: 'fallback', filters: { terms: parsed.terms } });
  }
  if (method === 'POST' && path === '/api/v1/checkout/quote') return json(quote(body.merchantId));
  if (method === 'POST' && path === '/api/v1/checkout/create') {
    if (body.authorize !== true) throw new E(400, 'invalid_request', 'Confirm the order total to continue.');
    if (!body.contact?.name || !/^\S+@\S+\.\S+$/.test(body.contact?.email ?? '')) throw new E(400, 'invalid_request', 'Enter your name and a valid email.');
    const prior = s.orders.find((o) => o.cartId === s.cartId && o.merchantId === body.merchantId && o.quoteHash === body.quoteHash);
    if (prior) return json({ orderId: prior.id, status: prior.status, checkoutUrl: null, message: null, reused: true });
    const q = quote(body.merchantId);
    if (q.quoteHash !== body.quoteHash) throw new E(409, 'quote_changed', 'Prices or availability changed. Review your order total before paying.', { quote: q });
    if (q.issues.length) throw new E(409, 'items_unavailable', 'Some items are no longer available. Remove them to continue.');
    await sleep(700);
    const now = new Date().toISOString();
    const order: OrderRec = {
      id: uid(), code: code(), status: 'payment_not_configured', createdAt: now, merchantId: body.merchantId, cartId: s.cartId, quoteHash: q.quoteHash,
      items: q.lines.map((l: any) => ({ name: l.productName, variation: l.variationName, quantity: l.quantity, unitPrice: l.unitPrice, lineTotal: l.lineTotal, modifiers: l.modifiers.map((x: any) => ({ name: x.name, price: x.price })) })),
      merchandiseSubtotal: q.merchandiseSubtotal, taxTotal: q.taxTotal, serviceFee: 0, discountTotal: 0, tipTotal: 0, grandTotal: q.grandTotal,
      contactName: body.contact.name, pickupEstimate: q.location.pickupLabel, customerId: s.customerId, sessionTag: s.customerId ? undefined : s.guestTag,
      history: [{ status: 'awaiting_payment', at: now, reason: 'checkout created' }, { status: 'payment_not_configured', at: now, reason: 'Demonstration shop, payments not enabled' }],
    };
    s.orders.unshift(order);
    s.items = s.items.filter((i) => findVariation(i.variationId)?.m.id !== body.merchantId);
    s.cartVersion++; save();
    return json({ orderId: order.id, status: order.status, checkoutUrl: null, message: 'This is a demonstration shop. Payments are not enabled, so no charge was made.', reused: false }, 201);
  }
  if (path.startsWith('/api/v1/account')) return account(method, path, body ?? {});
  if (method === 'POST' && path === '/api/v1/market') return json({ market: body.market });
  // Merchant dashboard (demo sign-in only)
  if (method === 'POST' && path === '/api/v1/merchant/demo-login') { s.merchantSession = body.slug; save(); return json({ ok: true }); }
  if (method === 'POST' && path === '/api/v1/merchant/logout') { s.merchantSession = null; save(); return json({ ok: true }); }
  if (method === 'GET' && path.startsWith('/api/v1/merchant/products')) {
    const me = allMerchants().find((x) => x.slug === s.merchantSession); if (!me) throw new E(401, 'unauthorized', 'Sign in to manage your shop.');
    const qs = new URLSearchParams(path.split('?')[1]); const st = qs.get('status') ?? 'all'; const q = (qs.get('q') ?? '').toLowerCase();
    const rows = me.products.map((p) => ({ id: p.id, name: p.name, publication_status: 'published', visible: !s.hidden.includes(p.id), min_price: Math.min(...p.variations.map((v) => v.price)),
      variations: p.variations.length, availability: p.variations.map((v) => v.availability).join(','), primary_image_url: null }))
      .filter((r) => (st === 'all' || (st === 'published' ? r.visible : st === 'hidden' ? !r.visible : false)) && (!q || r.name.toLowerCase().includes(q)));
    return json(rows);
  }
  if ((m = path.match(/^\/api\/v1\/merchant\/products\/([^/]+)\/visibility$/)) && method === 'PATCH') {
    const me = allMerchants().find((x) => x.slug === s.merchantSession);
    if (!me?.products.some((p) => p.id === m![1])) throw new E(404, 'product_not_found', 'Product not found.');
    s.hidden = body.visible ? s.hidden.filter((id) => id !== m![1]) : [...new Set([...s.hidden, m[1]])]; save();
    return json({ id: m[1], visible: body.visible });
  }
  throw new E(404, 'not_found', 'Not found.');
}

export function installApi() {
  const real = window.fetch.bind(window);
  window.fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith('/api/')) return real(input as any, init);
    try { return await route((init.method ?? 'GET').toUpperCase(), url, init.body ? JSON.parse(String(init.body)) : undefined); }
    catch (e) {
      const err = e instanceof E ? e : new E(500, 'server_error', 'Something went wrong. Please try again.');
      return new Response(JSON.stringify({ error: { code: err.code, message: err.message, details: err.details } }), { status: err.status, headers: { 'content-type': 'application/json' } });
    }
  }) as typeof fetch;
}
export { listMerchants };
