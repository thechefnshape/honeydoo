import type { AnchorHTMLAttributes, ReactNode } from 'react';
type Props = AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; scroll?: boolean; children?: ReactNode };
/** next/link for the hash-routed preview. */
export default function Link({ href, scroll: _s, children, ...rest }: Props) {
  return <a href={href.startsWith('/') ? '#' + href : href} {...rest}>{children}</a>;
}
