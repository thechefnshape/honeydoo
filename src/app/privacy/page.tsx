export const metadata = { title: 'Privacy' };
export default function Privacy() {
  return (
    <article className="page max-w-2xl pt-10 text-[16px] leading-relaxed text-charcoal">
      <h1 className="text-3xl font-bold text-ink">Privacy at honeydoo</h1>
      <p className="mt-2 text-sm text-muted">Draft for review by counsel before launch. Version 2026-10.</p>
      <h2 className="mt-8 text-xl font-semibold text-ink">What we collect</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>Your bag and orders, linked to a random identifier stored in a cookie in this browser.</li>
        <li>If you create an account: your name, email, optional phone number and a one-way hash of your password (never the password itself). Accounts are optional; you can browse and check out as a guest.</li>
        <li>The name and email you enter at checkout, shared with the shop you order from so they can hand over your order.</li>
        <li>Searches and page views, recorded without advertising identifiers, to improve the marketplace.</li>
        <li>The city you choose. If you tap "Use my current location", your position is used once in your browser to pick the nearest city and is never sent to us.</li>
      </ul>
      <h2 className="mt-8 text-xl font-semibold text-ink">What we never do</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>We never see or store card numbers. Payments happen on the shop&apos;s own Square checkout.</li>
        <li>We do not sell personal information or share it with advertisers.</li>
        <li>You can delete your account from your profile at any time. That erases your name, email and phone; shops keep their own records of orders you placed, which they need for refunds and taxes.</li>
      </ul>
      <h2 className="mt-8 text-xl font-semibold text-ink">AI search</h2>
      <p className="mt-2">When you ask honeydoo a question, the text of your request is sent to our AI provider to understand it. Results always come from real shop listings. Do not include sensitive personal details in requests.</p>
    </article>
  );
}
