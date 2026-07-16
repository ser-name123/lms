/*
 * Restores the database from backup/data-backup.json.
 *
 *   npm run db:import
 *
 * Clears every table that appears in the backup, then re-inserts all rows.
 * Foreign-key checks are disabled for the transaction (session_replication_role
 * = replica) so table order does not matter; the whole thing is one atomic
 * transaction, so a failure rolls back and leaves the DB untouched.
 *
 * WARNING: this OVERWRITES current data with the contents of the backup file.
 */
require('dotenv/config');
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

(async () => {
  const file = path.join(process.cwd(), 'backup', 'data-backup.json');
  if (!fs.existsSync(file)) {
    throw new Error(`No backup file found at ${file}. Run "npm run db:export" first.`);
  }

  const payload = JSON.parse(fs.readFileSync(file, 'utf8'));
  const tables = payload.tables || {};
  const names = payload.tableOrder || Object.keys(tables);

  const conn = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!conn) throw new Error('DATABASE_URL / DIRECT_URL is not set');

  const client = new Client({ connectionString: conn });
  await client.connect();

  await client.query('BEGIN');
  try {
    await client.query('SET LOCAL session_replication_role = replica');

    const quoted = names.map((n) => `"${n}"`).join(', ');
    if (quoted) {
      await client.query(`TRUNCATE ${quoted} RESTART IDENTITY CASCADE`);
    }

    let inserted = 0;
    for (const name of names) {
      const rows = tables[name] || [];
      if (!rows.length) continue;
      await client.query(
        `INSERT INTO "${name}" SELECT * FROM jsonb_populate_recordset(NULL::"${name}", $1::jsonb)`,
        [JSON.stringify(rows)],
      );
      inserted += rows.length;
    }

    await client.query('COMMIT');
    console.log(
      `Restored ${inserted} rows into ${names.length} tables from backup taken ${payload.exportedAt}.`,
    );
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Import failed, rolled back (no changes made):', e.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
})().catch((e) => {
  console.error('Import failed:', e.message);
  process.exit(1);
});
