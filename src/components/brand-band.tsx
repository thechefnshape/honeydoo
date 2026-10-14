import { BeeMark } from './brand';

/** Reversed brand moment, after the brand board's black panels. */
export function BrandBand() {
  const points = [['Ask for anything', 'Coffee, flowers, dinner, a last-minute gift. Plain words work.'], ['Pick it up today', 'Order ahead and skip the wait at shops a few blocks away.'], ['Every shop is local', 'Your money stays with the businesses that make your neighborhood.']];
  return (
    <section className="page mt-16">
      <div className="relative overflow-hidden rounded-3xl bg-ink px-6 py-12 text-white sm:px-12 sm:py-16">
        <BeeMark tone="dark" className="pointer-events-none absolute -right-10 -top-6 h-56 w-auto opacity-[0.12] sm:-right-6 sm:h-72" />
        <p className="eyebrow text-white/50">honeydoo</p>
        <h2 className="mt-3 max-w-xl text-[40px] font-bold leading-[1.02] tracking-[-0.035em] sm:text-[56px]">Your city.<br /><span className="text-honey">Everything in it.</span></h2>
        <ul className="mt-10 grid gap-6 sm:grid-cols-3">
          {points.map(([t, d]) => <li key={t} className="border-t border-white/15 pt-4"><p className="font-semibold">{t}</p><p className="mt-1 text-[15px] text-white/65">{d}</p></li>)}
        </ul>
      </div>
    </section>
  );
}
