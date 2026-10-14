// Commerce provider adapter. Each POS / commerce platform implements this so the marketplace never
// depends on one vendor. Capabilities differ by provider; callers must check them.
import type { Queryable } from '@/lib/db';

export interface QuoteLine {
  cartItemId: string; productId: string; variationId: string; sourceVariationId: string;
  productName: string; variationName: string; unitPrice: number; quantity: number; taxable: boolean;
  modifiers: { id: string; sourceId: string; name: string; price: number }[]; lineTotal: number;
}

export interface LocationRef { id: string; sourceLocationId: string | null; taxRateBps: number; timezone: string; prepMinutes: number; name: string }
export interface MerchantRef { id: string; name: string; isDemo: boolean; integrationId: string | null; contactEmail: string | null }

export interface ProviderCapabilities { onlinePayments: boolean; pickup: boolean; delivery: boolean; inventory: boolean; applicationFees: boolean }

export interface CheckoutRequest {
  orderId: string; publicCode: string; idempotencyKey: string; merchant: MerchantRef; location: LocationRef; lines: QuoteLine[];
  /** Honeydoo's fee, taken from the merchant's proceeds (not added to the total). */
  merchantFee: number; tip: number; total: number; currency: string; contact: { name: string; email: string }; pickupNote?: string; redirectUrl: string;
}

export type CheckoutResult =
  | { kind: 'redirect'; url: string; providerOrderId: string; providerLinkId: string; expiresAt: Date | null; appFee: number }
  | { kind: 'not_configured'; reason: string };

export interface CommerceProvider {
  id: 'demo' | 'square';
  capabilities: ProviderCapabilities;
  /** Authoritative tax/discount for these lines at this location. */
  calculate(args: { q: Queryable; merchant: MerchantRef; location: LocationRef; lines: QuoteLine[] }): Promise<{ taxTotal: number; discountTotal: number; taxNote: string }>;
  createCheckout(args: { q: Queryable; req: CheckoutRequest }): Promise<CheckoutResult>;
}
