import { taxOn } from '@/lib/money';
import type { CommerceProvider } from './types';

/**
 * Demo provider for demonstration merchants. It calculates totals with a posted tax rate but has
 * NO payment capability: checkout records the order as "payment not configured" and never marks it paid.
 */
export const demoProvider: CommerceProvider = {
  id: 'demo',
  capabilities: { onlinePayments: false, pickup: true, delivery: false, inventory: true, applicationFees: false },
  async calculate({ location, lines }) {
    const taxable = lines.filter((l) => l.taxable).reduce((s, l) => s + l.lineTotal, 0);
    return { taxTotal: taxOn(taxable, location.taxRateBps), discountTotal: 0, taxNote: `Estimated at ${(location.taxRateBps / 100).toFixed(2)}% on taxable items.` };
  },
  async createCheckout() {
    return { kind: 'not_configured', reason: 'This is a demonstration shop. Payments are not enabled, so no charge was made.' };
  },
};
