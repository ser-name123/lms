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

  // DIRECT_URL (5432) is unreachable in this environment — the pooler is the
  // working connection, so prefer it and keep DIRECT_URL as the fallback.
  const conn = process.env.DATABASE_URL || process.env.DIRECT_URL;
  if (!conn) throw new Error('DATABASE_URL / DIRECT_URL is not set');

  const client = new Client({ connectionString: conn });
  await client.connect();

  const REDACTED = '__REDACTED_ON_EXPORT__';

  await client.query('BEGIN');
  try {
    await client.query('SET LOCAL session_replication_role = replica');

    /*
     * The backup redacts credential settings (Stripe/SMTP/Gmail/Zoom/VAPID) — it
     * never contains their real values. TRUNCATE below would then wipe the live
     * secrets and the import would not restore them (M4): a working install
     * would silently lose its ability to charge cards and send mail after a
     * restore. So capture the current live values for exactly the keys the
     * backup redacted BEFORE truncating, and re-insert them afterwards.
     */
    const redactedKeys = (tables.SystemSetting || [])
      .filter((r) => r.value === REDACTED)
      .map((r) => r.key);
    let preservedSecrets = [];
    if (redactedKeys.length) {
      const res = await client.query(
        `SELECT * FROM "SystemSetting" WHERE key = ANY($1)`,
        [redactedKeys],
      );
      preservedSecrets = res.rows;
    }

    const quoted = names.map((n) => `"${n}"`).join(', ');
    if (quoted) {
      await client.query(`TRUNCATE ${quoted} RESTART IDENTITY CASCADE`);
    }

    /*
     * db-export replaces credential settings (Stripe keys, SMTP password) with
     * a marker rather than writing them to a file. Restoring that marker as if
     * it were the value would leave a config that parses to nonsense, so those
     * rows are dropped instead: the setting comes back absent, the server falls
     * back to its environment, and the admin re-enters the key in Settings. A
     * restored copy that cannot charge cards until someone deliberately gives
     * it a key is the safe default.
     */
    let droppedSecrets = 0;

    let inserted = 0;
    for (const name of names) {
      let rows = tables[name] || [];
      if (name === 'SystemSetting') {
        const before = rows.length;
        rows = rows.filter((r) => r.value !== REDACTED);
        droppedSecrets += before - rows.length;
      }
      if (!rows.length) continue;
      await client.query(
        `INSERT INTO "${name}" SELECT * FROM jsonb_populate_recordset(NULL::"${name}", $1::jsonb)`,
        [JSON.stringify(rows)],
      );
      inserted += rows.length;
    }

    // Restore the live secrets captured before the truncate, so a backup that
    // redacted them does not blank out a working install's credentials (M4).
    if (preservedSecrets.length) {
      await client.query(
        `INSERT INTO "SystemSetting" SELECT * FROM jsonb_populate_recordset(NULL::"SystemSetting", $1::jsonb) ` +
          `ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [JSON.stringify(preservedSecrets)],
      );
    }

    if (droppedSecrets) {
      console.log(
        `Skipped ${droppedSecrets} redacted credential setting(s) — kept the live values already configured.`,
      );
    }
    if (preservedSecrets.length) {
      console.log(
        `Preserved ${preservedSecrets.length} live credential setting(s) across the restore.`,
      );
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
