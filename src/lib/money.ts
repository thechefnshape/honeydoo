// All money is integer minor units (cents). Never use floats for stored amounts.
export type Minor = number;

export function assertMinor(n: number): Minor {
  if (!Number.isInteger(n)) throw new Error(`Non-integer money amount: ${n}`);
  return n;
}

export function formatMoney(minor: Minor, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(minor / 100);
}

/** Tax on a taxable base using basis points, rounded half-up to the cent. */
export function taxOn(base: Minor, rateBps: number): Minor {
  return Math.floor((base * rateBps + 5000) / 10000);
}

/** Parses "$40", "40 dollars", "40.50" into cents. */
export function dollarsToMinor(s: string | number): Minor {
  const n = typeof s === 'number' ? s : Number(String(s).replace(/[^0-9.]/g, ''));
  return Math.round(n * 100);
}
