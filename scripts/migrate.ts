import fs from 'node:fs';
import { getDb, runMigrations } from '../src/lib/db';

(async () => {
  const db = await getDb();
  await runMigrations(db);
  if (process.argv.includes('--supabase')) await db.exec(fs.readFileSync('db/supabase/rls.sql', 'utf8'));
  console.log('Migrations applied');
  await db.close();
})().catch((e) => { console.error(e); process.exit(1); });
