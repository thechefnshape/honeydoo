import fs from 'node:fs';
import path from 'node:path';

export type Row = Record<string, any>;
export interface Queryable {
  query<T extends Row = Row>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}
export interface Db extends Queryable {
  exec(sql: string): Promise<void>;
  tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

const g = globalThis as unknown as { __honeydooDb?: Promise<Db>; __honeydooReady?: Promise<void> };

async function createPg(url: string): Promise<Db> {
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: url, max: 10, ssl: url.includes('localhost') ? undefined : { rejectUnauthorized: false } });
  return {
    query: (sql, params) => pool.query(sql, params as any[]) as any,
    exec: async (sql) => { await pool.query(sql); },
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query('begin');
        const out = await fn({ query: (s, p) => client.query(s, p as any[]) as any });
        await client.query('commit');
        return out;
      } catch (e) { await client.query('rollback'); throw e; } finally { client.release(); }
    },
    close: () => pool.end(),
  };
}

export async function createPglite(dir?: string): Promise<Db> {
  const { PGlite } = await import('@electric-sql/pglite');
  const inMemory = !dir || dir.startsWith('memory://');
  if (!inMemory) fs.mkdirSync(path.dirname(dir), { recursive: true });
  const pg = inMemory ? new PGlite() : new PGlite(dir);
  await pg.waitReady;
  return {
    query: (sql, params) => pg.query(sql, params as any[]) as any,
    exec: async (sql) => { await pg.exec(sql); },
    tx: async (fn) => (await pg.transaction((t) => fn({ query: (s, p) => t.query(s, p as any[]) as any }))) as any,
    close: () => pg.close(),
  };
}

/**
 * True inside a browser-hosted Node.js runtime (Bolt and StackBlitz previews). Their file system is
 * simulated in the browser, so the embedded database runs in memory there instead of writing hundreds
 * of files the dev server would also be watching. Data resets when the preview restarts.
 */
export function isWebContainer() {
  return !!(process.versions as Record<string, string | undefined>).webcontainer || !!process.env.WEBCONTAINER;
}

/** Process-wide database handle. Uses Postgres when DATABASE_URL is set, otherwise embedded Postgres. */
export function getDb(): Promise<Db> {
  if (!g.__honeydooDb) {
    const url = process.env.DATABASE_URL;
    g.__honeydooDb = url ? createPg(url) : createPglite(process.env.PGLITE_DIR || (isWebContainer() ? 'memory://' : '.data/pglite'));
  }
  return g.__honeydooDb;
}

export function setDbForTests(db: Db) { g.__honeydooDb = Promise.resolve(db); g.__honeydooReady = Promise.resolve(); }

export async function runMigrations(db: Db, dir = path.join(process.cwd(), 'db/migrations')) {
  await db.exec('create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())');
  const done = new Set((await db.query<{ name: string }>('select name from schema_migrations')).rows.map((r) => r.name));
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) {
    if (done.has(f)) continue;
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    await db.exec(sql);
    await db.query('insert into schema_migrations(name) values ($1)', [f]);
  }
}

/** Ensures schema exists. In local embedded mode it also seeds the demo marketplace on first boot. */
export async function db(): Promise<Db> {
  const d = await getDb();
  if (!g.__honeydooReady) {
    g.__honeydooReady = (async () => {
      if (!process.env.DATABASE_URL) {
        await runMigrations(d);
        const { rows } = await d.query<{ n: number }>('select count(*)::int as n from merchants');
        if (rows[0].n === 0) {
          const { seedDemo } = await import('../../db/seed/seed');
          await seedDemo(d);
        }
      }
    })();
  }
  await g.__honeydooReady;
  return d;
}
