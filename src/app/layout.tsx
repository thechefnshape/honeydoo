import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/figtree';
import './globals.css';
import { indexingEnabled, NOINDEX, ogMeta, siteUrl } from '@/lib/seo';
import { Header } from '@/components/header';
import { BottomNav } from '@/components/bottom-nav';
import { CartProvider } from '@/components/cart-context';
import { Footer } from '@/components/footer';
import { Splash } from '@/components/splash';
import { RouteTransition } from '@/components/route-transition';

const DESCRIPTION = 'Shop the independent businesses in your neighborhood. Coffee, flowers, food, gifts and more, ready for pickup.';
export async function generateMetadata(): Promise<Metadata> {
  return {
    metadataBase: new URL(siteUrl()),
    title: { default: 'honeydoo. Anything local. Just ask.', template: '%s | honeydoo' },
    description: DESCRIPTION,
    applicationName: 'honeydoo',
    icons: { icon: '/icon.svg' },
    openGraph: ogMeta({ title: 'honeydoo. Anything local. Just ask.', description: DESCRIPTION }),
    twitter: { card: 'summary_large_image' },
    // Off until launch (SITE_INDEXING=true) so staging and previews never appear in search.
    robots: indexingEnabled() ? { index: true, follow: true } : NOINDEX,
  };
}
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#FFFFFF' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans min-h-screen flex flex-col">
        <CartProvider>
          <Header />
          <main className="flex-1 pb-24 md:pb-0"><RouteTransition>{children}</RouteTransition></main>
          <Footer />
          <BottomNav />
          <Splash />
        </CartProvider>
      </body>
    </html>
  );
}
