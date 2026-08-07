/*
 * Prove the baseline migration can build the database from nothing.
 *
 * There is no spare Postgres here (no local server, no Docker), so instead of a
 * throwaway DATABASE this uses a throwaway SCHEMA on the same server: the
 * baseline SQL names every object unqualified, so a search_path pointing at an
 * empty schema sends the whole thing there. `public` is never written to — the
 * one qualified statement in the file is `CREATE SCHEMA IF NOT EXISTS "public"`,
 * which is a no-op — and the test schema is dropped at the end, including on
 * failure.
 *
 * What it proves: the SQL is valid and self-consistent (every FK, index and
 * enum resolves), and it produces the same object set as the live database.
 */
require('dotenv/config');
const fs = require('node:fs');
const { Client } = require('pg');

const TEST_SCHEMA = 'zz_baseline_verify';

(async () => {
  const sql = fs.readFileSync(process.argv[2] || require('node:path').join(__dirname,'..','prisma','migrations','20260807120000_baseline','migration.sql'), 'utf8');
  if (/"public"\./.test(sql)) throw new Error('SQL writes into public — refusing to run');

  const db = new Client({ connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL });
  await db.connect();
  let ok = false;
  try {
    await db.query(`DROP SCHEMA IF EXISTS ${TEST_SCHEMA} CASCADE`);
    await db.query(`CREATE SCHEMA ${TEST_SCHEMA}`);
    // Only the test schema is on the path, so an unqualified CREATE lands there.
    await db.query(`SET search_path TO ${TEST_SCHEMA}`);
    await db.query(sql);

    const t = await db.query(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema=$1 AND table_type='BASE TABLE' ORDER BY table_name`, [TEST_SCHEMA]);
    const e = await db.query(
      `SELECT ty.typname FROM pg_type ty JOIN pg_namespace n ON n.oid=ty.typnamespace
        WHERE n.nspname=$1 AND ty.typtype='e' ORDER BY 1`, [TEST_SCHEMA]);
    const fk = await db.query(
      `SELECT count(*)::int n FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace
        WHERE n.nspname=$1 AND c.contype='f'`, [TEST_SCHEMA]);
    const idx = await db.query(
      `SELECT count(*)::int n FROM pg_indexes WHERE schemaname=$1`, [TEST_SCHEMA]);

    const live = await db.query(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name`);
    const liveFk = await db.query(
      `SELECT count(*)::int n FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace
        WHERE n.nspname='public' AND c.contype='f'`);

    const built = t.rows.map((r) => r.table_name);
    // The live schema also carries Prisma's own bookkeeping table, which no
    // migration creates — exclude it or the comparison is off by one.
    const liveTables = live.rows.map((r) => r.table_name).filter((x) => x !== '_prisma_migrations');
    const missing = liveTables.filter((x) => !built.includes(x));
    const extra = built.filter((x) => !liveTables.includes(x));

    console.log(`built from baseline : ${built.length} tables, ${e.rows.length} enums, ${fk.rows[0].n} FKs, ${idx.rows[0].n} indexes`);
    console.log(`live database       : ${liveTables.length} tables, ${liveFk.rows[0].n} FKs`);
    console.log(`missing vs live     : ${missing.length ? missing.join(', ') : 'none'}`);
    console.log(`extra vs live       : ${extra.length ? extra.join(', ') : 'none'}`);
    ok = missing.length === 0 && extra.length === 0 && fk.rows[0].n === liveFk.rows[0].n;
    console.log(ok ? '\nOK — the baseline reproduces the live schema from empty.' : '\nMISMATCH');
  } finally {
    await db.query(`DROP SCHEMA IF EXISTS ${TEST_SCHEMA} CASCADE`).catch(() => undefined);
    await db.end();
  }
  process.exit(ok ? 0 : 1);
})();
