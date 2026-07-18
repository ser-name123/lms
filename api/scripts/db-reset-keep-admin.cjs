/*
 * Wipes ALL data and keeps only the ADMIN user(s).
 *
 *   npm run db:reset-admin
 *
 * A pre-wipe safety snapshot is written to backup/pre-reset-backup.json first,
 * so nothing is lost irrecoverably. Aborts if there is no admin to keep, so you
 * can never lock yourself out.
 */
require('dotenv/config');
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

(async () => {
  // DIRECT_URL (5432) is unreachable in this environment — the pooler is the
  // working connection, so prefer it and keep DIRECT_URL as the fallback.
  const conn = process.env.DATABASE_URL || process.env.DIRECT_URL;
  if (!conn) throw new Error('DATABASE_URL / DIRECT_URL is not set');

  const client = new Client({ connectionString: conn });
  await client.connect();

  // 1. Capture the admin user(s) we must preserve.
  const adminRes = await client.query(
    `SELECT COALESCE(jsonb_agg(to_jsonb(u.*)), '[]'::jsonb) AS data FROM "User" u WHERE role = 'ADMIN'`,
  );
  const admins = adminRes.rows[0].data;
  if (!admins.length) {
    await client.end();
    throw new Error('No ADMIN user found — aborting so you are not locked out.');
  }

  // 2. Safety snapshot of the ENTIRE database before we touch anything.
  const { rows: tableRows } = await client.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);
  const names = tableRows.map((t) => t.table_name);

  const snapshot = { exportedAt: new Date().toISOString(), tableOrder: names, tables: {} };
  for (const name of names) {
    const r = await client.query(
      `SELECT COALESCE(jsonb_agg(to_jsonb(t.*)), '[]'::jsonb) AS data FROM "${name}" t`,
    );
    snapshot.tables[name] = r.rows[0].data;
  }
  const outDir = path.join(process.cwd(), 'backup');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, 'pre-reset-backup.json'),
    JSON.stringify(snapshot, null, 2),
  );

  // 3. Wipe everything, then re-insert the admin row(s).
  await client.query('BEGIN');
  try {
    await client.query('SET LOCAL session_replication_role = replica');
    const quoted = names.map((n) => `"${n}"`).join(', ');
    await client.query(`TRUNCATE ${quoted} RESTART IDENTITY CASCADE`);
    await client.query(
      `INSERT INTO "User" SELECT * FROM jsonb_populate_recordset(NULL::"User", $1::jsonb)`,
      [JSON.stringify(admins)],
    );
    await client.query('COMMIT');
    console.log(
      `Wiped all data. Kept ${admins.length} admin user(s): ${admins.map((a) => a.email).join(', ')}`,
    );
    console.log('Pre-wipe safety snapshot saved to backup/pre-reset-backup.json');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Reset failed, rolled back (no changes made):', e.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
})().catch((e) => {
  console.error('Reset failed:', e.message);
  process.exit(1);
});
