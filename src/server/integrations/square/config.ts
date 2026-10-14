import { env } from '@/lib/env';

export const squareBase = () => (env().SQUARE_ENVIRONMENT === 'production' ? 'https://connect.squareup.com' : 'https://connect.squareupsandbox.com');

// Least privilege: read the business and catalog, create and read the orders and payments Honeydoo initiates.
// PAYMENTS_WRITE_ADDITIONAL_RECIPIENTS is only requested when Honeydoo collects its fee as a Square application fee.
export function requestedScopes(): string[] {
  const s = ['MERCHANT_PROFILE_READ', 'ITEMS_READ', 'INVENTORY_READ', 'ORDERS_READ', 'ORDERS_WRITE', 'PAYMENTS_READ', 'PAYMENTS_WRITE'];
  if (env().SQUARE_COLLECT_APP_FEE === 'true') s.push('PAYMENTS_WRITE_ADDITIONAL_RECIPIENTS');
  return s;
}

export const REQUIRED_SCOPES = ['MERCHANT_PROFILE_READ', 'ITEMS_READ', 'ORDERS_WRITE', 'PAYMENTS_WRITE'];
