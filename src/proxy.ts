import { NextResponse, type NextRequest } from 'next/server';

// Gives every visitor an anonymous, random shopper session so guests can keep a bag and see their own orders.
export function proxy(req: NextRequest) {
  const ref = req.nextUrl.searchParams.get('ref');
  if (req.cookies.get('hd_sid')) {
    const res = NextResponse.next();
    if (ref) setRef(res, ref);
    return res;
  }

  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const id = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  // Forward the new cookie to this request's server code, and set it for future requests.
  const headers = new Headers(req.headers);
  const existing = headers.get('cookie');
  headers.set('cookie', existing ? `${existing}; hd_sid=${id}` : `hd_sid=${id}`);
  const res = NextResponse.next({ request: { headers } });
  res.cookies.set('hd_sid', id, {
    httpOnly: true, sameSite: 'lax', secure: req.nextUrl.protocol === 'https:', path: '/', maxAge: 60 * 60 * 24 * 180,
  });
  if (ref) setRef(res, ref);
  return res;
}

// Merchant referral attribution (storefront links and QR codes). First-party, 30 days, no personal data.
function setRef(res: NextResponse, ref: string) {
  if (/^[a-z0-9-]{2,60}$/.test(ref)) res.cookies.set('hd_ref', ref, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30 });
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|api/v1/webhooks).*)'] };
