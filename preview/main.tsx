import { createRoot } from 'react-dom/client';
import { installApi } from './api';
installApi();
import { CartProvider } from '@/components/cart-context';
import { BottomNav } from '@/components/bottom-nav';
import { Footer } from '@/components/footer';
import { Splash } from '@/components/splash';
import { RouteTransition } from '@/components/route-transition';
import BagPage from '@/app/bag/page';
import CheckoutPage from '@/app/checkout/[merchantId]/page';
import { SearchExperience } from '@/app/search/search-experience';
import { AuthForm } from '@/components/account/auth-form';
import Forgot from '@/app/account/forgot/page';
import Reset from '@/app/account/reset/page';
import { safeNext } from '@/lib/safe-next';
import Privacy from '@/app/privacy/page';
import Terms from '@/app/terms/page';
import { useLocation, setRouteParams, navigate } from './shims/router';
import { me, resetAll } from './store';
import { Header, Home, ProfilePage, MerchantPage, NotFoundPage, OrderPage, Orders, ProductPage, Shops, Storefront } from './pages';

function Routes() {
  const { path, search } = useLocation();
  const seg = path.split('/').filter(Boolean);
  setRouteParams({});
  switch (seg[0] ?? '') {
    case '': return <Home />;
    case 'shops': return <Shops />;
    case 'shop': return <Storefront key={seg[1]} slug={seg[1]} />;
    case 'product': return <ProductPage key={seg[1]} id={seg[1]} />;
    case 'search': return <SearchExperience />;
    case 'bag': return <BagPage />;
    case 'checkout': setRouteParams({ merchantId: seg[1] }); return <CheckoutPage key={seg[1]} />;
    case 'orders': return seg[1] ? <OrderPage id={seg[1]} /> : <Orders />;
    case 'profile': return <ProfilePage />;
    case 'signin': case 'signup': {
      const next = safeNext(search.get('next'));
      if (me()) { setTimeout(() => navigate(next)); return null; }
      return <AuthForm key={seg[0]} mode={seg[0] as "signin" | "signup"} next={next} />;
    }
    case 'account': return seg[1] === 'reset' ? <Reset /> : <Forgot />;
    case 'privacy': return <Privacy />;
    case 'terms': return <Terms />;
    case 'merchant': return <MerchantPage />;
    default: return <NotFoundPage />;
  }
}

function App() {
  return (
    <CartProvider>
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="flex-1 pb-24 md:pb-0"><RouteTransition><Routes /></RouteTransition></main>
        <Footer />
        <button onClick={() => { resetAll(); location.hash = '/'; location.reload(); }} className="hidden pb-4 text-center text-[11px] text-muted/60 hover:text-muted md:block">Reset</button>
        <BottomNav />
        <Splash />
      </div>
    </CartProvider>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
