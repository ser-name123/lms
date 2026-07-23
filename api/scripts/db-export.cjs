/*
 * Exports every row of every table to backup/data-backup.json.
 *
 *   npm run db:export
 *
 * Re-run any time you want to snapshot the current database. The resulting
 * file is what `db:import` reads to restore. Uses to_jsonb so dates, decimals,
 * enums and JSON columns all round-trip cleanly.
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

  const { rows: tableRows } = await client.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);

  /*
   * SystemSetting rows that hold credentials.
   *
   * This file is written to disk, copied about and sometimes attached to a
   * message. A backup carrying a live Stripe secret key or an SMTP password is
   * a credential leak waiting for someone to be helpful with it, so those
   * values are replaced with a marker. The row still exports, so an import
   * restores the shape and the admin re-enters the secret in Settings — which
   * is the correct outcome: a restored copy should not silently be able to
   * charge cards.
   */
  const SECRET_SETTINGS = new Set(['STRIPE_CONFIG', 'SMTP_CONFIG', 'GMAIL_API_CONFIG']);
  const REDACTED = '__REDACTED_ON_EXPORT__';

  const tables = {};
  let totalRows = 0;
  let redactedCount = 0;
  for (const { table_name } of tableRows) {
    const r = await client.query(
      `SELECT COALESCE(jsonb_agg(to_jsonb(t.*)), '[]'::jsonb) AS data FROM "${table_name}" t`,
    );
    let data = r.rows[0].data;
    if (table_name === 'SystemSetting') {
      data = data.map((row) => {
        if (!SECRET_SETTINGS.has(row.key)) return row;
        redactedCount++;
        return { ...row, value: REDACTED };
      });
    }
    tables[table_name] = data;
    totalRows += tables[table_name].length;
  }
  if (redactedCount) {
    console.log(`Redacted ${redactedCount} credential setting(s) — re-enter them in Settings after an import.`);
  }

  await client.end();

  const outDir = path.join(process.cwd(), 'backup');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, 'data-backup.json');

  const payload = {
    exportedAt: new Date().toISOString(),
    tableOrder: Object.keys(tables),
    tables,
  };
  fs.writeFileSync(outFile, JSON.stringify(payload, null, 2));

  console.log(
    `Exported ${totalRows} rows from ${Object.keys(tables).length} tables -> ${outFile}`,
  );
})().catch((e) => {
  console.error('Export failed:', e.message);
  process.exit(1);
});
