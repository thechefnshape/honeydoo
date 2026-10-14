export const metadata = { title: 'Terms' };
export default function Terms() {
  return (
    <article className="page max-w-2xl pt-10 text-[16px] leading-relaxed text-charcoal">
      <h1 className="text-3xl font-bold text-ink">Terms</h1>
      <p className="mt-2 text-sm text-muted">Draft for review by counsel before launch. Version 2026-10-v1.</p>
      <h2 className="mt-8 text-xl font-semibold text-ink">For shoppers</h2>
      <p className="mt-2">Each order is a purchase from the shop shown at checkout, at the prices that shop sets. honeydoo does not add service fees or markups: you pay the shop's regular prices plus applicable tax. Pickup times are estimates provided by the shop.</p>
      <h2 className="mt-8 text-xl font-semibold text-ink">For businesses</h2>
      <p className="mt-2">Joining is free. honeydoo charges the business a flat $1 per completed order, deducted automatically from the order payment through your payment processor where supported, or invoiced monthly otherwise. Customers pay your regular prices with no added fees. You keep control of your prices and catalog in your own system; honeydoo stores only marketplace display settings and never edits your POS catalog. You can pause your storefront or disconnect at any time.</p>
      <p className="mt-2">Restricted products (alcohol, tobacco, cannabis, weapons, prescription drugs and other age or license-restricted items) are not sold on honeydoo.</p>
    </article>
  );
}
