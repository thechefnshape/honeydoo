# Architecture

## Shape

One Next.js 16 (App Router, TypeScript) application. Server code lives in `src/server` and never ships to the browser. All money is integer cents. All input is validated with Zod at the API boundary.

```
Browser ── /api/v1 ── domain services ── Postgres
                           │
                           └── provider adapters ── Square (OAuth, Catalog, Inventory, Orders, Payment Links, Webhooks)
                                                └── demo (fictional shops, no payments)
AI search ── provider interface ── Claude (tool calling) ── same catalog search as keyword search
Scheduler ── /api/v1/internal/jobs ── sync jobs, webhook retries, token refresh, checkout expiry
```

## Provider adapter layer

`src/server/integrations/types.ts` defines `CommerceProvider` with explicit capabilities (online payments, pickup, delivery, inventory, application fees). The marketplace asks the registry for a merchant's provider and never calls Square directly. Shopify, Clover or Toast are added by implementing the same interface plus a catalog sync module; nothing in the marketplace changes.

## Catalog sync

- Full import on connect, manual "Sync now", webhook-triggered (`catalog.version.updated`) and scheduled reconciliation every 6 hours.
- Upserts keyed on (merchant, provider, source id), so repeated runs never duplicate. Items missing in Square become `deleted_at_source`; variations removed in Square stop being sellable but stay for order history.
- Every fixed-price variation keeps its own price. Variable-priced items are not imported as orderable.
- Inventory: tracked variations use Square counts (low stock at 3 or fewer). Untracked items are shown as "available" with no invented quantity. Square location overrides (sold out, per-location presence) are honored.
- Restricted categories (alcohol, tobacco, cannabis, weapons, prescription, stored value) are imported as hidden and never orderable.
- Honeydoo-only settings live in `product_overrides` and are never written back to the POS.

## Checkout and the $1 fee (merchant pays, like Bites)

Customers pay the shop's regular prices plus tax. Nothing is added. Honeydoo's flat $1 per completed order is paid by the **merchant**, taken out of the payment as a Square application fee.

| $4 coffee | Customer pays | Merchant pays Honeydoo |
| --- | --- | --- |
| Honeydoo | $4.00 + tax | $1.00 |

1. The bag stores only variation ids, modifier ids and quantities. Prices are always read from the catalog.
2. `POST /checkout/quote` builds an authoritative quote for one merchant. For Square merchants, tax and discounts come from Square's CalculateOrder, and line totals are cross-checked against Square; a mismatch triggers a resync and asks the shopper to refresh. The quote also carries `merchantFee` (internal, never added to the total).
3. The quote has a hash. `POST /checkout/create` requires the shopper's explicit authorization and the same hash; any change returns 409 with the new quote.
4. Orders are idempotent: the same approved quote always maps to the same order and payment link.
5. Square payment link request: catalog variation ids, modifiers, a PICKUP fulfillment and `auto_apply_taxes`. **No Honeydoo line item or service charge.** `checkout_options.app_fee_money` = $1, which Square deducts from the merchant's proceeds and routes to Honeydoo. Requires the merchant to grant `PAYMENTS_WRITE_ADDITIONAL_RECIPIENTS`; if they do not, or the order is too small for the full fee, the uncollected part is recorded as `fee_receivable` and invoiced.
6. If Square's order total differs from the approved total, the link is deleted and the shopper reviews again.
7. An order becomes paid only when a signed webhook arrives **and** the payment is re-read from Square's API.
8. Admins can waive a merchant's fee for promotions (`merchants.service_fee_enabled = false`); there is no customer promo code because customers never pay a fee.

### Ledger (`transactions`)

Per paid order: gross (what the customer paid), merchandise, tax, discounts, tips, Honeydoo revenue (app fee actually collected, net of fee refunds), fee receivable (owed but not collected through Square), merchant-borne processing fees (from Square), estimated Honeydoo variable cost, merchant proceeds (gross minus app fee, processing and refunds), refunds, and estimated contribution margin. $1 gross is not treated as $1 profit.

Note for your accountant: the $1 is now a business-to-business fee to the merchant, not a charge to consumers, so it is not part of the customer's taxable sale. Square still charges the merchant processing on the full payment.

## Order states

`awaiting_payment → paid → accepted → ready → completed`, with `payment_failed`, `expired`, `canceled`, `refunded`, `partially_refunded`, `payment_not_configured` (demo) and `needs_reconciliation`. Transitions are whitelisted; replays or late events cannot move an order backwards. A payment that arrives after expiry is honored. A payment that cannot be matched, or whose amount differs from the approved total, is recorded and surfaced on the admin page; nothing is silently dropped.

## AI search

- The model only chooses search filters through a `search_catalog` tool and then calls `recommend` with product ids.
- The server runs the search against the database, and keeps only recommended ids that the search actually returned, re-checked against the price limit and availability. Invented ids are counted and dropped.
- Shopper text is wrapped as data; catalog text is truncated and stripped of markup; the system prompt forbids orders, discounts and totals.
- Rate limits per IP, a global daily budget, a 12 second timeout and request logging (`ai_requests`). Any failure falls back to the deterministic search, so the marketplace works with AI turned off.

## Security

- Square tokens: AES-256-GCM at rest, never logged, never sent to the browser.
- OAuth state: random, single use, 10 minute expiry, bound to the browser session.
- Webhooks: HMAC-SHA256 over notification URL + raw body, constant-time compare (verified in tests against Square's own SDK helper), event de-duplication.
- Shopper sessions are random httpOnly cookies; carts and orders are only visible to their session.
- Merchant sessions are HMAC-signed and re-checked against `merchant_members` on every request.
- Supabase RLS policies in `db/supabase/rls.sql` deny everything to public keys except the published catalog.

## Customer accounts

Accounts are optional. Browsing and guest checkout never require one.

- **Sign-in**: email and password. Passwords are hashed with scrypt (N=16384, r=8, p=1, 16-byte salt). Unknown email and wrong password return the same error and take the same time.
- **Sessions**: a random 32-byte token in the httpOnly `hd_c` cookie (60 days). Only its SHA-256 is stored in `customer_sessions`, so tokens can be revoked one at a time or all together.
- **Guest to account**: every browser keeps the anonymous `hd_sid` session. On sign-up or sign-in, orders placed in that browser and its open bag move to the account; if the account already has a bag from another device, lines merge.
- **Visibility**: account orders and bags are visible only to the account. Guest orders and bags are visible only to the browser session that created them. Sign-out revokes the session and issues a fresh `hd_sid`, so nothing from the account stays visible on a shared device.
- **Password reset**: single-use tokens (hash stored), 30 minutes, sent through `src/server/email.ts` (Resend). A reset signs out every device. Without `RESEND_API_KEY` the endpoint says plainly that email is not set up.
- **Deletion**: erases name, email, phone and password hash, revokes sessions and unlinks orders. Shops keep the order records they need for refunds and tax.
- **Moving to Supabase Auth later**: `customers.id` can be set to `auth.users.id`, and `currentCustomer()` in `src/server/customer-session.ts` is the only place that needs to change.
