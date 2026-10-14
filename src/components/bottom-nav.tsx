'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { HomeIcon, ReceiptIcon, SearchIcon, UserIcon } from './icons';
import { BeeMark } from './brand';

const items = [
  { href: '/', label: 'Home', icon: 'home' },
  { href: '/search', label: 'Search', icon: 'search' },
  { href: '/orders', label: 'Orders', icon: 'orders' },
  { href: '/profile', label: 'Profile', icon: 'user' },
] as const;

export function BottomNav() {
  const path = usePathname();
  if (path.startsWith('/merchant') || path.startsWith('/admin')) return null;
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-stone-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden" aria-label="Primary">
      <ul className="grid grid-cols-4">
        {items.map((it) => {
          const active = it.href === '/' ? path === '/' : path.startsWith(it.href);
          return (
            <li key={it.href}>
              <Link href={it.href} className={`flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium ${active ? 'text-ink' : 'text-muted'}`} aria-current={active ? 'page' : undefined}>
                {active ? <span key={path} className="tab-arrive flex h-[22px] items-center"><BeeMark className="h-[22px] w-auto" /></span> : <>
                  {it.icon === 'home' && <HomeIcon className="h-[22px] w-[22px]" />}
                  {it.icon === 'search' && <SearchIcon className="h-[22px] w-[22px]" />}
                  {it.icon === 'orders' && <ReceiptIcon className="h-[22px] w-[22px]" />}
                  {it.icon === 'user' && <UserIcon className="h-[22px] w-[22px]" />}
                </>}
                {it.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
