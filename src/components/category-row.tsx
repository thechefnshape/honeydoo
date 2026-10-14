import Link from 'next/link';
import { CategoryIcon } from './icons';

const ROW = [
  { slug: 'all', name: 'All' }, { slug: 'food', name: 'Food' }, { slug: 'coffee', name: 'Coffee' }, { slug: 'flowers', name: 'Flowers' },
  { slug: 'groceries', name: 'Groceries' }, { slug: 'gifts', name: 'Gifts' }, { slug: 'home', name: 'Home' }, { slug: 'more', name: 'More' },
];

export function CategoryRow({ active = 'all', base = '/' }: { active?: string; base?: string }) {
  return (
    <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0" role="list">
      {ROW.map((c) => {
        const on = active === c.slug || (c.slug === 'more' && ['plants', 'books'].includes(active));
        const href = c.slug === 'all' ? base : `${base}?category=${c.slug}`;
        return (
          <Link role="listitem" key={c.slug} href={href} scroll={false} className={`chip ${on ? 'chip-active' : ''}`} aria-current={on ? 'true' : undefined}>
            <CategoryIcon slug={c.slug} className="h-[18px] w-[18px]" />{c.name}
          </Link>
        );
      })}
    </div>
  );
}
