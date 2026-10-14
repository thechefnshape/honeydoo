// Minimal line icons (1.75px stroke). No emoji anywhere in the product.
type P = { className?: string };
const S = ({ className = 'h-5 w-5', children }: P & { children: React.ReactNode }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>{children}</svg>
);
export const SearchIcon = (p: P) => <S {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></S>;
export const BagIcon = (p: P) => <S {...p}><path d="M5 8h14l-1 12H6L5 8Z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></S>;
export const PinIcon = (p: P) => <S {...p}><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z" /><circle cx="12" cy="9.5" r="2.5" /></S>;
export const HomeIcon = (p: P) => <S {...p}><path d="M4 11 12 4l8 7" /><path d="M6 10v10h12V10" /></S>;
export const ReceiptIcon = (p: P) => <S {...p}><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" /><path d="M9 8h6M9 12h6" /></S>;
export const UserIcon = (p: P) => <S {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></S>;
export const PlusIcon = (p: P) => <S {...p}><path d="M12 5v14M5 12h14" /></S>;
export const MinusIcon = (p: P) => <S {...p}><path d="M5 12h14" /></S>;
export const CheckIcon = (p: P) => <S {...p}><path d="m5 12 4.5 4.5L19 7" /></S>;
export const ClockIcon = (p: P) => <S {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></S>;
export const ChevronRight = (p: P) => <S {...p}><path d="m9 6 6 6-6 6" /></S>;
export const ChevronLeft = (p: P) => <S {...p}><path d="m15 6-6 6 6 6" /></S>;
export const CloseIcon = (p: P) => <S {...p}><path d="M6 6l12 12M18 6 6 18" /></S>;
export const PhoneIcon = (p: P) => <S {...p}><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1Z" /></S>;
export const StoreIcon = (p: P) => <S {...p}><path d="M4 9 5.5 4h13L20 9" /><path d="M4 9a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0A2.7 2.7 0 0 0 20 9" /><path d="M5 11v9h14v-9M10 20v-5h4v5" /></S>;
export const TrashIcon = (p: P) => <S {...p}><path d="M5 7h14M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></S>;

export const CategoryIcon = ({ slug, className = 'h-5 w-5' }: { slug: string; className?: string }) => {
  switch (slug) {
    case 'all': return <S className={className}><rect x="4" y="4" width="6.5" height="6.5" rx="1.5" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" /><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" /><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" /></S>;
    case 'food': return <S className={className}><path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10" /><path d="M16 21V3c-2 1-3 4-3 8h3" /></S>;
    case 'coffee': return <S className={className}><path d="M4 9h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V9Z" /><path d="M16 10h1.5a2.5 2.5 0 0 1 0 5H16" /><path d="M8 3c0 1.5 1 1.5 1 3M12 3c0 1.5 1 1.5 1 3" /></S>;
    case 'flowers': return <S className={className}><circle cx="12" cy="8" r="2.2" /><path d="M12 5.8c0-2 2.8-2 2.8 0M12 5.8c0-2-2.8-2-2.8 0M14.2 8c2 0 2 2.8 0 2.8M9.8 8c-2 0-2 2.8 0 2.8M12 10.2V21M12 16c-2.5 0-4-1.5-4-3.5 2.5 0 4 1.5 4 3.5ZM12 18c2.5 0 4-1.5 4-3.5-2.5 0-4 1.5-4 3.5Z" /></S>;
    case 'groceries': return <S className={className}><path d="M3 5h2l2 11h11l2-8H6" /><circle cx="9" cy="20" r="1.3" /><circle cx="17" cy="20" r="1.3" /></S>;
    case 'gifts': return <S className={className}><rect x="4" y="9" width="16" height="11" rx="1.5" /><path d="M3 9h18M12 9v11M12 9c-1.5-3-5-3.5-5-1.5S10.5 9 12 9Zm0 0c1.5-3 5-3.5 5-1.5S13.5 9 12 9Z" /></S>;
    case 'home': return <S className={className}><path d="M9 21h6M10 21v-4h4v4M8 17h8l-1.5-8h-5L8 17Z" /><path d="M12 9V6M10.5 4.5c0 .8.7 1.5 1.5 1.5s1.5-.7 1.5-1.5S12 2 12 2s-1.5 1.7-1.5 2.5Z" /></S>;
    case 'plants': return <S className={className}><path d="M7 14h10l-1.5 7h-7L7 14Z" /><path d="M12 14V8M12 9c0-3 2.5-5 6-5 0 3.5-2.5 5-6 5ZM12 11c0-2.5-2-4-5-4 0 3 2 4 5 4Z" /></S>;
    case 'books': return <S className={className}><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5v-13ZM20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5v-13Z" /></S>;
    default: return <S className={className}><circle cx="6" cy="12" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle cx="18" cy="12" r="1.3" /></S>;
  }
};
