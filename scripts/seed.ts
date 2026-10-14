import { getDb, runMigrations } from '../src/lib/db';
import { seedDemo } from '../db/seed/seed';

(async () => {
  const db = await getDb();
  await runMigrations(db);
  await seedDemo(db);
  const { rows } = await db.query('select count(*)::int as merchants, (select count(*)::int from products) as products from merchants where is_demo');
  console.log('Seeded demo marketplace', rows[0]);
  await db.close();
})().catch((e) => { console.error(e); process.exit(1); });
