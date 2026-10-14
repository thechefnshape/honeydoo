# honeydoo master build prompt

How to use this in Bolt:

1. Start a new, empty Bolt project with Bolt Database turned on.
2. Attach the three files from this folder to your first message: `honeydoo-logo.svg`, `honeydoo-bee.svg` and `demo-catalog.json`.
3. Paste **Part 0** as the first message, together with **Phase 1**.
4. Paste each later phase as its own message, only after the previous phase passes its acceptance checks. Test them yourself in the preview.
5. If Bolt drifts from a rule, paste the rule back and ask it to correct only that.

The reference implementation lives at github.com/thechefnshape/honeydoo (Next.js). Where this prompt and the reference disagree, this prompt wins for the Bolt build.

---

## Part 0: Master brief (paste first, together with Phase 1)

You are building **honeydoo**, an AI-native hyperlocal marketplace launching in Lakewood, Ohio, designed to expand to any city. Customers find products at independent local shops, order ahead and pick up in store. Shops connect the Square account they already use: their catalog syncs into honeydoo, customers pay on the shop's own Square checkout, and paid orders arrive in Square. Build it in phases. Do only the current phase, and keep everything from earlier phases working.

### Business model (never violate)

- Customers pay the shop's regular prices plus sales tax. honeydoo adds **no** service fee, markup or charge of any kind to the customer.
- The **shop** pays honeydoo a flat **$1 per completed order**, collected automatically as a Square application fee (`app_fee_money`) taken from the shop's proceeds. If the shop has not granted the permission that allows this, record the $1 as a receivable instead. Never move it onto the customer.
- Pickup only. One shop per checkout: a bag with items from three shops produces three separate checkouts.

### Stack

- React 18 + TypeScript + Vite + Tailwind CSS + React Router. Zod for every input. Vitest for tests.
- Bolt Database (Supabase Postgres) with row-level security on every table.
- Supabase Auth: anonymous sign-in for guests, email and password for customer accounts, TOTP multi-factor for staff.
- Supabase Edge Functions for anything that touches money, secrets or third parties (pricing, checkout, Square, webhooks, AI, admin metrics).
- Postgres functions (`security definer`, called through RPC) for anything that must happen atomically (creating an order from a quote, applying a payment, merging a guest bag into an account).

### Rules you must not break

1. **Money is integer cents** everywhere: database, functions, UI math. Format only at display time.
2. **Totals are computed only on the server.** The browser sends item ids, quantities and option ids, never prices. Every checkout re-prices from the database.
3. **Idempotency:** one quote maps to one order. Double clicks, retries and refreshes never create a second order or a second payment link. Use a unique idempotency key derived from the bag, shop, bag version and quote hash.
4. **An order becomes paid only** when a Square webhook with a verified signature arrives *and* the payment is read back from Square's API and matches. Never because the customer returned to a success page.
5. **Order status changes only through an allow-list state machine**, and every change is written to a history table. A late or replayed event can never move an order backwards.
6. **Secrets** (Square app secret, OAuth tokens, Anthropic key, webhook signature key) live only in Edge Function secrets. Never in the browser bundle, never in a table readable by the client, never in logs. Merchant OAuth tokens are encrypted at rest (AES-256-GCM, key from a secret).
7. **Demo shops are fictional** (`is_demo = true`). They are hidden when the `DEMO_MODE` setting is off, are never presented to search engines as real businesses, and demo orders are recorded as "not charged" and never marked paid.
8. **Accounts are optional.** Browsing and guest checkout never require signing in.
9. **Restricted categories** are never listed: alcohol, tobacco and vaping, cannabis, THC, CBD and kratom, firearms, ammunition and other weapons, prescription items, lottery and gift cards. Exclude them during catalog import by matching item names, descriptions and categories.
10. **Precise location only on opt-in.** The city picker never asks for device location unless the person taps "Use my current location", and the position is used only in the browser.
11. **Row-level security everywhere.** Public can read active, non-hidden catalog data only. Customers read only their own bag and orders. Merchants read only their own shop. Staff tables are not readable by clients at all.

### Writing and design rules

- **No em dashes anywhere**: UI copy, content, code comments, commit messages. Use commas, periods, parentheses or colons.
- **No emojis anywhere**: UI, content or code. Use plain text symbols such as + if needed.
- Minimal, Silicon Valley aesthetic: generous white space, few borders, soft rounded corners (cards 16 to 24 px, buttons fully rounded), one accent color, no gradients, no stock illustration.
- Palette: honey `#FFC629` (accent), ink `#0B0B0B` (text, primary buttons), charcoal `#333333` (secondary text), stone `#EDEDED` (lines, fills), soft stone `#F7F7F6`, honey soft `#FFF4D1`, white background. Success green `#1F7A4D`, error red `#B42318`, used sparingly.
- Type: Figtree (Google Fonts), weights 400, 500, 600, 700. Headlines tight (letter spacing -0.02em). Use Satoshi later if the files are provided.
- The brand is lowercase **honeydoo** in copy (Honeydoo only at the start of a sentence in legal text).
- **The logo**: use the attached `honeydoo-logo.svg` (wordmark) and `honeydoo-bee.svg` (the bee on its own) exactly. The double "oo" of the wordmark is the bee: two honey rings are its body, with one ink wing (`#wing-a`) and one honey wing (`#wing-b`). Never redraw, recolor or restyle it. Build it as an inline React component so the wings can animate. The wings rotate around their roots: wing-a around (562.5, 73.5) and wing-b around (571.5, 74.5) in the SVG's coordinate space.
- Respect `prefers-reduced-motion` in every animation (show a still frame instead).
- Mobile first. Bottom tab bar on phones (Home, Search, Orders, Profile), top navigation on desktop.

### Data model (create in Phase 1, extend only by adding new migrations)

`markets`, `categories`, `merchants` (slug, display name, category, description, status draft/active/paused/disconnected, `is_demo`, cover image, contact, referral code, `fee_enabled`), `merchant_members` (user id, merchant id, role), `merchant_locations` (address, neighborhood, city, state, postal code, latitude, longitude, timezone, operating hours as JSON by weekday, pickup enabled, prep minutes, tax rate in basis points, active), `merchant_integrations` (provider, environment, provider merchant id, encrypted credentials, granted scopes, token expiry, status, last sync, last error), `oauth_states`, `products` (source ids, name, description, category, tags, image, taxable, publication status), `product_overrides` (hide from honeydoo, featured, marketplace description), `product_variations` (name, price cents, available, ordinal), `modifier_lists` and `modifiers` (option groups with min, max, single or multiple), `product_modifier_lists`, `product_location_availability` (quantity, status), `customers` (profile linked to auth user: name, email, phone, deleted_at), `carts` (owner user id, status, version), `cart_items` (variation, location, quantity, selected option ids, line key unique per cart), `orders` (public code like HD-7KQ2M, customer user id, merchant, location, provider, idempotency key unique, status, subtotal, tax, discount, tip, grand total, `merchant_fee`, `merchant_fee_waived`, pickup details JSON, contact name and email, quote hash), `order_items` (name, variation, unit price and option snapshots), `order_status_history`, `payments` (provider ids, checkout url, status, amount, application fee, processing fee, refunded), `refunds`, `transactions` (ledger: gross, merchandise, tax, tips, honeydoo revenue, fee receivable, processing cost, estimated variable cost, merchant proceeds, refunds, contribution margin), `sync_jobs` (retry queue with backoff), `webhook_events` (provider event id unique, for de-duplication), `merchant_consents` (terms version, accepted by, IP, time), `analytics_events`, `audit_log`, `ai_requests`, `staff` (user id, role owner or analyst, disabled_at).

### Order statuses and the words customers see

| Status | Label |
| --- | --- |
| awaiting_payment | Waiting for payment |
| payment_not_configured | Order received (demo shops: recorded, not charged) |
| paid | Paid, sent to shop |
| accepted | Shop is preparing it |
| ready | Ready for pickup |
| completed | Picked up |
| canceled | Canceled |
| payment_failed | Payment failed |
| expired | Checkout expired |
| refunded / partially_refunded | Refunded / Partly refunded |
| needs_reconciliation | Payment received, confirming with shop |

Allowed transitions: awaiting_payment to paid, payment_failed, expired, canceled, needs_reconciliation. payment_failed to paid, expired, canceled. expired to paid, needs_reconciliation. needs_reconciliation to paid, canceled, refunded. paid to accepted, ready, completed, canceled, refunded, partially_refunded. accepted to ready, completed, canceled, refunds. ready to completed, canceled, refunds. completed to refunds. payment_not_configured to canceled only. Anything else is rejected and logged.

### Pages

Home `/`, Shops `/shops`, Storefront `/shop/:slug`, Product `/product/:id`, Search `/search`, Bag `/bag`, Checkout `/checkout/:merchantId`, Orders `/orders`, Order `/orders/:id`, Profile `/profile`, Sign in `/signin`, Create account `/signup`, Forgot password `/account/forgot`, Reset password `/account/reset`, Sell on honeydoo `/merchant/connect`, Merchant dashboard `/merchant`, Admin `/admin` (+ `/admin/staff`, `/admin/login`), Privacy `/privacy`, Terms `/terms`, and a branded 404.

### Working rules

- Smallest change that does the job. Keep names and structure stable across phases.
- After each phase: run type checks and tests, then list what you built, what you tested, and anything mocked or not finished. Never claim something works that you did not run.
- Ask before adding any dependency that needs a paid service.

---

## Phase 1: Foundation, brand and browsing

Build:

1. **Project setup** with the stack above, Tailwind theme tokens for the palette, Figtree, and React Router with all routes (placeholder pages are fine for later phases).
2. **Database**: all tables from Part 0 as migrations, with row-level security and policies. Seed function or migration that imports the attached `demo-catalog.json`: 1 market (Lakewood, OH), 8 categories (Food, Coffee, Flowers, Groceries, Gifts, Home, Plants, Books), 9 fictional shops, 51 products with variations, option groups, stock and hours, all `is_demo = true`. Keep the import repeatable (delete demo shops, then insert).
3. **Brand components**: `Wordmark` and `BeeMark` from the attached SVGs, inline, with optional wing flutter (wings rotate up to 11 degrees in opposite directions at about 11 Hz, body still). The bee flutters while anything is loading or "thinking".
4. **Splash** on the first visit of each browser session (sessionStorage), about 2.8 seconds on white: the wordmark fades in, the bee's wings flutter, the bee lifts a few pixels, makes one small loop with a faint dotted honey trail and returns exactly home, a final flutter, then the tagline "Anything local. Just ask." fades in beneath and the whole splash fades out. Tap or any key skips to the fade. Tapping the header logo while already on Home replays it.
5. **Header**: wordmark (bee hops a little on each route change), desktop links (Shops, Search, Orders, For businesses), city picker ("Lakewood, OH", with an opt-in "Use my current location"), bag button with item count. **Bottom tab bar** on phones; the active tab's icon becomes the bee.
6. **Home**:
   - Hero with the headline "Anything local." / "Just ask." (two lines, very large, ink) and subtext "Shop the independent businesses around you. Order ahead, pick up today." No city name in the hero.
   - A large search box (placeholder "Find food, gifts, flowers, coffee... or just ask"). No sample prompt chips under it.
   - **Living town behind the hero**: a minimal line-drawn street of storefronts that frames the headline from both sides on desktop and runs along the bottom on phones, drawn behind the text so the hero reads as one composition. Five storefront styles (tall, striped awning, market stall, arched window, round-top), small round trees between buildings that sway gently, benches and planters. Idle shops are faint outlines at about 50 percent opacity.
   - A bee flies shop to shop on a loop with a dotted ink flight path that trails behind it and fades after landing. When the bee visits a shop, that whole storefront comes alive: ink outlines, honey awning and accents, windows light up honey one after another, a soft glow at the door, a ring pulse, and a small black "ready" tag over the window. No people. Pause when off screen; still frame for reduced motion.
   - Then: a category row, "Shops near you" cards, featured products, and an "Own a local shop?" call to action ("Connect the Square account you already use. Your products sync automatically and paid orders arrive in Square. Free to join. $1 per completed order, and customers pay your regular prices.").
7. **Shops** list with category filter. **Storefront**: cover image, name, category and neighborhood, description, address, hours table, open or closed now, pickup estimate ("Pickup today from 7 am", "Ready in about 15 min"), phone, in-store search and category filter, product grid. **Product page**: image, shop link, price or price range, description, variation picker, option groups with min and max rules, stock notes ("Only 4 available", "Sold out"), quantity, Add to bag.
8. **Keyword search** (no AI yet): matches names, descriptions, tags, shop names and categories; understands "under $20" and "today"; filters for category, max price and pickup today.
9. **Footer**, city-neutral: "Your city. Everything in it. Order ahead and pick up from the independent shops near you." Columns Shop, Businesses, Company.
10. **Route transitions**: each page fades and rises 8 px on enter.

Acceptance: splash plays once per session and replays from the logo on Home; the town animates behind the hero with the bee lighting each shop it visits; all 9 shops and 51 products browse correctly with correct prices; a sold-out item cannot be added; search for "flowers under $40" returns only matching items; no em dashes or emojis anywhere.

---

## Phase 2: Bag, checkout and orders (guest)

Build:

1. **Guest identity**: Supabase anonymous sign-in on first visit, so every visitor owns a bag without an account.
2. **Bag**: grouped by shop, quantity steppers, remove, live prices and availability warnings, a separate "Check out" per shop with that shop's subtotal. Identical item plus options merge into one line. When something is added, the bag button animates like the bee: it hops up, swaps briefly to the bee and settles, and the count bumps. Empty state: "Your bag is empty" with "Start shopping".
3. **Quote** Edge Function: re-prices one shop's lines from the database, validates options and stock, computes tax at the location's rate on the taxable subtotal only, rounded half up to the cent, returns lines, subtotal, tax, total, pickup estimate, any issues, and a quote hash.
4. **Checkout** page: pickup location and estimate, optional note for the shop, name and email ("Used only for this order: your receipt and a pickup message from the shop."), line items, Items, Sales tax, Total, then "You pay {shop}'s regular prices. No service fees, no markups." A required checkbox: "I authorize this pickup order from {shop} for {total}." No promo code field. No fee row.
5. **Create checkout** Edge Function plus an atomic Postgres function: verifies the quote hash still matches (otherwise returns the new quote with "Prices or availability changed. Review your order total before paying."), creates the order with snapshots and the idempotency key, records status history, computes `merchant_fee` (100 cents unless waived; capped at 90 percent of the total), and starts payment through the shop's provider. For demo shops the provider is "demo": the order ends as `payment_not_configured`, nothing is charged, and those lines are removed from the bag.
6. **Order placed moment**: a short full-screen confirmation with the bee and "Order placed", then the order page.
7. **Orders** list and **Order** detail: status label, progress bar (Paid, Preparing, Ready, Picked up), items, totals, pickup info, shop phone. A guest only ever sees orders from their own session.

Acceptance: double-clicking Place order creates exactly one order; changing a price in the database between quote and submit shows the changed-total message; tax only applies to taxable items; the customer total never includes $1; another browser cannot open your order URL.

---

## Phase 3: Customer accounts

Build:

1. **Create account** (`/signup`): name, email, password (at least 8 characters, show/hide toggle). "By creating an account you agree to the Terms and Privacy policy. You never need an account to browse or check out."
2. **Sign in** (`/signin`) with "Forgot password?". Unknown email and wrong password show the same message: "That email and password do not match." Rate limit attempts.
3. **Guest to account**: when someone signs up or signs in, everything from their guest session moves into the account: orders, and the bag. If the account already has a bag from another device, merge line by line (quantities add, max 50). Upgrade the anonymous user in place where possible; otherwise merge in an atomic Postgres function.
4. **Profile**: signed out shows "Shopping as a guest" with a Create account card; signed in shows an avatar circle (ink, honey initial), name, email, editable name and optional phone, Change password (signs out other devices), Sign out, and Delete account (requires password; erases name, email and phone; shops keep their order records for refunds and taxes, unlinked from the person).
5. **Header**: "Sign in" on desktop when signed out, the initial avatar when signed in.
6. **Checkout** pre-fills name and email for signed-in customers, and offers "Have an account? Sign in" to guests. The order page offers guests "Keep this order with you" with Create account.
7. **Password reset** by email link (single use, 30 minutes). If email sending is not configured, say so plainly instead of pretending it was sent.
8. **Privacy page** lists exactly what an account stores.

Acceptance: a guest order appears in the account after signing up; bags from two devices merge; signing out leaves no account data visible in that browser; deleting the account blocks sign-in and erases personal details.

---

## Phase 4: Merchants and Square connection

Build:

1. **Sell on honeydoo** page: benefits, "$1 per completed order, deducted automatically by Square. Customers pay your regular prices.", "What honeydoo asks Square for" (plain-language list of permissions), and Connect Square. If Square is not configured in this environment, disable the button and say so. Include "Preview the dashboard as one of the demonstration shops. Demo shops are fictional."
2. **Square OAuth** in Edge Functions: least-privilege scopes (merchant profile, items, inventory, orders read and write, payments read and write, plus the additional-recipients permission needed for the $1 app fee). Single-use state bound to the user, 10-minute expiry. Store tokens encrypted. Refresh tokens within 7 days of expiry. Handle revoked access by marking the shop disconnected. Support sandbox and production from configuration.
3. **Catalog import and sync**: locations (imported inactive until the merchant turns them on), items, variations, option groups, taxes, images, per-location availability, inventory counts, paging, archived and deleted items, price changes, restricted-category exclusion. Upsert by (shop, provider, source id) so re-syncs never duplicate. Failed syncs go to a retry queue with exponential backoff. Never write anything back to the merchant's Square item library.
4. **Merchant dashboard**: overview tiles (orders, revenue, items live), a go-live checklist (connect, choose locations, review products, accept terms, publish), terms acceptance with recorded consent ("including the $1 fee per completed order, paid by the shop and never added to the customer's total"), product visibility toggles (honeydoo-only overrides), recent orders, storefront link and a QR code with referral attribution, settings (profile, locations, pickup on or off, prep minutes, pickup hours), pause storefront, disconnect Square with confirmation.
5. Demo sign-in to any demo shop's dashboard for previewing (clearly labeled as demo).

Acceptance: with Square sandbox credentials, connect a sandbox shop, sync its catalog, see it on the marketplace after publishing; a second sync changes nothing; a restricted item never appears; disconnecting removes the shop immediately.

---

## Phase 5: Payments, webhooks and the ledger

Build:

1. For Square shops, checkout creates a Square **payment link** with the shop's catalog ids, pickup fulfillment, the customer's contact, and `app_fee_money` of the order's `merchant_fee` (when the permission was granted; otherwise record a fee receivable). Before redirecting, confirm Square's calculated total equals the approved quote, or stop with "The total changed while preparing payment. Review your order again."
2. **Webhook** Edge Function: verify the signature (HMAC-SHA256 of the notification URL plus the raw body, base64, constant-time compare), de-duplicate by event id, then for payments read the payment back from Square before applying it. Handle payment completed and failed, refunds, order fulfillment updates (ready, picked up), inventory changes, catalog changes (trigger a resync) and authorization revoked.
3. Unknown or mismatched payments are never dropped: flag them for reconciliation (`needs_reconciliation`).
4. **Order page while paying**: "Complete payment on Square" with the link, then "Confirming your payment with the shop" and "This page updates by itself. It only shows paid once Square confirms it." Poll status.
5. **Ledger** row per paid order: gross, merchandise, tax, tips, honeydoo revenue (app fee actually collected), fee receivable, processing cost (from Square), estimated honeydoo variable cost, merchant proceeds, refunds, estimated contribution margin. $1 gross is never treated as $1 profit.
6. **Scheduled job** every 10 minutes: retry failed syncs, refresh tokens, expire stale checkouts, retry unprocessed webhooks.

Acceptance with Square sandbox: pay with a test card; the order turns paid only after the webhook; the shop's proceeds show the $1 app fee; refunding in Square updates honeydoo; replaying the same webhook changes nothing.

---

## Phase 6: AI search

Build:

1. Search page with one box ("Find food, gifts, flowers, coffee... or just ask"). While thinking, the bee's wings flutter.
2. **AI search Edge Function** using the Anthropic Messages API (model from configuration, default `claude-sonnet-5-5`) with tool calling: `search_catalog` (keywords, category, max price, pickup today) and `recommend` (product ids with a one-line reason each). The model can only recommend products that `search_catalog` actually returned; drop any id it invents or anything over the stated budget. Wrap user text as data, never instructions. Short, friendly answer plus product cards with reasons; ask one clarifying question only when the request is genuinely ambiguous.
3. **Fallback**: with no API key, a timeout, an error or the daily budget reached, use the Phase 1 keyword search and say so subtly. Search must never break.
4. Rate limit per visitor, log every request (latency, tokens, results, fallback used, rejected ids) without storing personal data.

Acceptance: "a birthday gift for a 10 year old under $30" returns only real in-stock items under $30 with reasons; turning off the key still returns keyword results.

---

## Phase 7: Admin and analytics

Build:

1. **Staff access**: invite-only (an owner invites by email; the very first owner is created by a one-time setup script). Each staff member signs in with password **and** a TOTP authenticator code (Supabase MFA). Roles: owner (can invite and remove staff) and analyst (view only). Lock out after 5 failures for 15 minutes. Removing someone ends their sessions immediately. Every sign-in, failure and staff change goes to the audit log. The admin area is never open without sign-in, including in demo mode. Shopper controls (bag, customer sign-in) are hidden on admin pages.
2. **Network dashboard** with a scope toggle (Real merchants / Include demo): connected merchants, live merchants, monthly active merchants, selling locations, published products and categories, gross merchandise value, paid orders, completed pickups, repeat customer rate, order completion rate, honeydoo revenue, revenue per transaction, contribution margin per order, refunds, average onboarding time, disconnected merchants. A 30-day funnel. Reliability (syncs, webhooks, orders needing reconciliation, unmatched payments). AI usage (requests, fallback rate, latency). Merchants by city.
3. **Analytics events**, first party only, no third-party trackers or ad identifiers: marketplace_visit, search_performed, ai_search_performed, merchant_viewed, product_viewed, product_added_to_bag, checkout_started, checkout_completed, checkout_failed, order_fulfilled, repeat_purchase, merchant_signup_started, merchant_connected, merchant_published, merchant_first_order, account_created.

Acceptance: an analyst cannot invite staff; a removed staff member is signed out at once; the dashboard numbers match the database.

---

## Phase 8: Search visibility, legal pages and launch polish

Build:

1. Page titles and descriptions for every page. A default link-preview image (1200 x 630: wordmark top left, "Anything local. Just ask." large in ink, a honey bar with "Order ahead. Pick up local.", the bee on a stone panel on the right).
2. `robots.txt` and `sitemap.xml` (live, non-demo shops and their products only). Indexing stays **off** until a `SITE_INDEXING` setting is turned on at launch. Demo shops are never indexed. Personal and staff pages are never indexed.
3. Structured data on real shop pages (local business type by category, address, map position, hours) and product pages (price, currency, stock). Note: this is a single-page app, so per-page link previews and structured data need prerendering or an Edge Function that serves the meta tags for shop and product URLs. Build that, or report clearly that only the default preview is in place.
4. **Privacy** and **Terms** pages as drafts marked for counsel review. Terms state that customers pay shop prices with no honeydoo fees and that shops pay $1 per completed order.
5. Security headers (Content Security Policy, HSTS, no framing, nosniff, strict referrer policy, location permission self only), a `/health` check, error boundaries with a branded error page.
6. Accessibility pass (keyboard, focus rings, labels, contrast, reduced motion) and a performance pass on phones (the hero animation must stay smooth).

Acceptance: robots.txt blocks everything until indexing is turned on; no demo shop appears in the sitemap; every page is usable by keyboard alone.
