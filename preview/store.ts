// In-browser stand-in for the database. Persists per viewer when storage is available.
export interface CartItem { id: string; variationId: string; quantity: number; modifierIds: string[]; lineKey: string; createdAt: number }
export interface OrderRec {
  id: string; code: string; status: string; createdAt: string; merchantId: string; cartId: string; quoteHash: string;
  items: { name: string; variation: string; quantity: number; unitPrice: number; lineTotal: number; modifiers: { name: string; price: number }[] }[];
  merchandiseSubtotal: number; taxTotal: number; serviceFee: number; discountTotal: number; tipTotal: number; grandTotal: number;
  contactName: string; pickupEstimate: string; customerId?: string | null; sessionTag?: string; history: { status: string; at: string; reason: string | null }[];
}
export interface Account { id: string; name: string; email: string; phone: string | null; pwHash: string; items: CartItem[]; createdAt: string; deleted?: boolean }
interface State {
  cartId: string; cartVersion: number; items: CartItem[]; orders: OrderRec[]; hidden: string[]; merchantSession: string | null; terms: string[];
  guestTag: string; customerId: string | null; accounts: Account[];
}

const KEY = 'honeydoo-preview-v1';
const fresh = (): State => ({ cartId: uid(), cartVersion: 1, items: [], orders: [], hidden: [], merchantSession: null, terms: [], guestTag: uid(), customerId: null, accounts: [] });
export function uid() { return 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => ((Math.random() * 16) | 0).toString(16)); }

let state: State = (() => { try { const s = localStorage.getItem(KEY); return s ? { ...fresh(), ...JSON.parse(s) } : fresh(); } catch { return fresh(); } })();
// Orders saved before accounts existed belong to this browser's guest session.
for (const o of state.orders) if (!o.customerId && !o.sessionTag) o.sessionTag = state.guestTag;
export const db = () => state;
export const me = () => state.accounts.find((a) => a.id === state.customerId && !a.deleted) ?? null;
/** Same visibility rule as the server: account orders to the account, guest orders to the guest session. */
export const visibleOrders = () => state.orders.filter((o) => (o.customerId ? o.customerId === state.customerId : !state.customerId && o.sessionTag === state.guestTag));
export function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage unavailable: keep in memory */ } }
export function resetAll() { state = fresh(); save(); }
