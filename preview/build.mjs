import { build } from 'esbuild';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const redirect = {
  name: 'preview-redirects',
  setup(b) {
    b.onResolve({ filter: /^next\/link$/ }, () => ({ path: path.join(root, 'preview/shims/next-link.tsx') }));
    b.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: path.join(root, 'preview/shims/next-navigation.ts') }));
    b.onResolve({ filter: /^@\/lib\/hard-nav$/ }, () => ({ path: path.join(root, 'preview/shims/hard-nav.ts') }));
    // The server catalog (database) is replaced by the in-browser catalog.
    b.onResolve({ filter: /(^@\/server\/catalog$)|(^\.\/catalog$)/ }, (a) =>
      a.importer.includes(`${path.sep}src${path.sep}server${path.sep}`) || a.path.startsWith('@/') ? { path: path.join(root, 'preview/catalog.ts') } : undefined);
    b.onResolve({ filter: /^@\// }, async (a) => {
      const r = await b.resolve('./' + a.path.slice(2), { resolveDir: path.join(root, 'src'), kind: a.kind });
      return r.errors.length ? undefined : { path: r.path };
    });
  },
};
await build({
  entryPoints: [path.join(root, 'preview/main.tsx')], bundle: true, minify: true, format: 'iife', target: 'es2020',
  outfile: path.join(root, 'preview/dist/app.js'), jsx: 'automatic', plugins: [redirect],
  define: { 'process.env.NODE_ENV': '"production"', 'process.env.NEXT_PUBLIC_SHOW_DEMO_LABELS': '"false"' }, loader: { '.json': 'json' }, logLevel: 'warning',
});
console.log('bundled');

// Tailwind + single-file HTML (publishable as a static page).
import { execSync } from 'node:child_process';
import fs from 'node:fs';
execSync('npx tailwindcss -c preview/tailwind.config.cjs -i src/app/globals.css -o preview/dist/app.css --minify', { cwd: root, stdio: 'ignore' });
const css = fs.readFileSync(path.join(root, 'preview/dist/app.css'), 'utf8');
const js = fs.readFileSync(path.join(root, 'preview/dist/app.js'), 'utf8').replaceAll('</script', '<\\/script');
fs.writeFileSync(path.join(root, 'preview/dist/honeydoo-marketplace.html'), `<title>honeydoo Marketplace</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Figtree:wght@400..800&display=swap">
<style>${css}
:root{color-scheme:light} body{background:#FFFFFF;color:#0B0B0B;font-family:Satoshi,Figtree,"Figtree Variable",ui-sans-serif,system-ui,-apple-system,sans-serif}
</style>
<div id="root"></div>
<script>${js}</script>
`);
console.log('wrote preview/dist/honeydoo-marketplace.html');
