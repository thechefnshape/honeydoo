import fs from 'node:fs';
(async () => {
  if (process.env.DATABASE_URL) { console.error('db:reset only removes the local embedded database. Refusing because DATABASE_URL is set.'); process.exit(1); }
  fs.rmSync(process.env.PGLITE_DIR || '.data/pglite', { recursive: true, force: true });
  console.log('Local database removed. It will be recreated and seeded on next start or `npm run db:seed`.');
})();
