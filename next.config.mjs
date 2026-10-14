/** @type {import('next').NextConfig} */
// Personal and staff pages never belong in search results.
const PRIVATE = ['/bag', '/checkout/:path*', '/orders/:path*', '/orders', '/profile', '/signin', '/signup', '/account/:path*', '/admin/:path*', '/admin', '/merchant', '/merchant/:path((?!connect$).*)', '/api/:path*'];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ['@electric-sql/pglite', 'pg'],
  // OG card fonts are read from disk at runtime; make sure they ship with the server bundle.
  outputFileTracingIncludes: { '/**/opengraph-image*': ['./assets/fonts/**'] },
  // Turbopack needs native binaries; browser-hosted previews (Bolt) run webpack instead. Both are configured.
  turbopack: {},
  webpack(config, { dev }) {
    if (dev) {
      // Only watch app code. Watching data, docs and generated folders overwhelms browser-hosted file systems.
      config.watchOptions = { ...config.watchOptions, ignored: ['**/node_modules/**', '**/.git/**', '**/.next/**', '**/.data/**', '**/preview/**', '**/docs/**', '**/supabase/**', '**/tests/**', '**/scripts/**', '**/coverage/**'] };
    }
    return config;
  },
  images: { remotePatterns: [{ protocol: 'https', hostname: 'images.unsplash.com' }] },
  async headers() {
    return [{
      source: '/(.*)',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Permissions-Policy', value: 'geolocation=(self), camera=(), microphone=()' },
      ],
    }, ...PRIVATE.map((source) => ({ source, headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] }))];
  },
};
export default nextConfig;
