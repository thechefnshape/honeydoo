# Square setup (Sandbox first)

Everything below is free. You need a Square account to sign in to the Developer Console. Real money is never involved in Sandbox.

## 1. Create the application

1. Go to https://developer.squareup.com/apps and create an application named **honeydoo**.
2. Open **Credentials**. Keep the toggle on **Sandbox**. Copy:
   - Sandbox Application ID → `SQUARE_APPLICATION_ID`
   - Sandbox Application secret (under OAuth) → `SQUARE_APPLICATION_SECRET`
3. Open **OAuth** (Sandbox). Set the Redirect URL to exactly:
   - Local: `http://localhost:3000/api/v1/integrations/square/callback`
   - Deployed: `https://YOUR-DOMAIN/api/v1/integrations/square/callback`

   Put the same value in `SQUARE_REDIRECT_URI`.

## 2. Webhooks

Square must reach Honeydoo over public HTTPS. For local testing use a tunnel (for example `cloudflared tunnel --url http://localhost:3000`) or test on the deployed preview.

1. **Webhooks → Subscriptions → Add subscription** (Sandbox).
2. URL: `https://YOUR-DOMAIN/api/v1/webhooks/square`. Put the exact same URL in `SQUARE_WEBHOOK_URL` (it is part of the signature).
3. API version: the same as `SQUARE_API_VERSION` (currently `2026-09-16`).
4. Events: `payment.created`, `payment.updated`, `refund.created`, `refund.updated`, `order.updated`, `order.fulfillment.updated`, `catalog.version.updated`, `inventory.count.updated`, `oauth.authorization.revoked`.
5. Copy the **Signature key** into `SQUARE_WEBHOOK_SIGNATURE_KEY`.

## 3. Secrets

```bash
openssl rand -base64 32   # SESSION_SECRET
openssl rand -base64 32   # TOKEN_ENCRYPTION_KEY (must decode to 32 bytes)
openssl rand -hex 24      # CRON_SECRET
```

Set `SQUARE_ENVIRONMENT=sandbox`. Keep `SQUARE_COLLECT_APP_FEE=true` to test the application fee (this adds the `PAYMENTS_WRITE_ADDITIONAL_RECIPIENTS` permission to the consent screen).

## 4. Prepare a Sandbox seller

1. In the Developer Console open **Sandbox test accounts** and open the default test account's **Square Dashboard**. Keep that tab open: Sandbox OAuth only works in a browser that is signed in to the test seller.
2. In that dashboard add a few items with prices and photos (Items → Item library). Turn on inventory tracking for at least one variation and set a stock count. Add a sales tax so taxes are calculated.
3. Make sure the location has an address and business hours.

## 5. Acceptance test: connect and import (Phase 2)

1. Start Honeydoo with the env vars set and open `/merchant/connect`.
2. Click **Connect with Square (Sandbox)** and approve.
3. You land on `/merchant` with "Square is connected". Check that locations and products were imported (Products tab), with each variation's price and stock.
4. In Settings, turn on a location and pickup, confirm the contact email, accept the terms and activate.
5. Open the storefront from the dashboard. It shows the Sandbox products.

## 6. Acceptance test: real Sandbox order (Phase 3)

1. As a shopper, add a Sandbox product to the bag and check out.
2. You are sent to a Square Sandbox checkout page. Pay with test card `4111 1111 1111 1111`, any future expiry, any CVV, any ZIP.
3. Square redirects back to the order page, which shows "Confirming your payment" until the signed `payment.updated` webhook is verified, then "Paid, sent to shop".
4. In the Sandbox seller dashboard, the order appears under Orders as a pickup order at the shop's normal prices. The payment shows a $1.00 application fee deducted from the seller's proceeds.
5. Mark it ready and completed in the Square dashboard; the Honeydoo order page follows.
6. Refund it from the Square dashboard; Honeydoo shows "Refunded" and the admin ledger reverses the fee.

## Known Square constraints

- Delivery: Square restricts third-party API-created delivery orders without a partnership, so Honeydoo only offers pickup.
- Honeydoo's $1 is collected from the merchant as a Square application fee, which requires the merchant to grant `PAYMENTS_WRITE_ADDITIONAL_RECIPIENTS`. If they do not, the order still goes through at normal prices and the fee is recorded as receivable for monthly invoicing. Customers never pay a Honeydoo fee.
- Production use of OAuth and application fees may require Square app review. Apply early.
- Payment links do not expire on their own; Honeydoo expires its side after 60 minutes and honors any payment that still arrives later.
