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
  const conn = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!conn) throw new Error('DATABASE_URL / DIRECT_URL is not set');

  const client = new Client({ connectionString: conn });
  await client.connect();

  const { rows: tableRows } = await client.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);

  const tables = {};
  let totalRows = 0;
  for (const { table_name } of tableRows) {
    const r = await client.query(
      `SELECT COALESCE(jsonb_agg(to_jsonb(t.*)), '[]'::jsonb) AS data FROM "${table_name}" t`,
    );
    tables[table_name] = r.rows[0].data;
    totalRows += tables[table_name].length;
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
