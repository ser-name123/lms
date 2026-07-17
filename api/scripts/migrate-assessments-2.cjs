/* Round-2 migration for Assessment Management: coding test cases, proctoring,
 * issued certificate number, per-question time. Raw SQL over the pooler
 * (DIRECT_URL down). Idempotent. */
require('dotenv/config');
const { Client } = require('pg');

const COLS = [
  ['Question', 'language', 'TEXT'],
  ['Question', 'testCases', 'JSONB'],
  ['Assessment', 'proctored', 'BOOLEAN NOT NULL DEFAULT false'],
  ['AssessmentAttempt', 'certificateNo', 'TEXT'],
  ['AssessmentAttempt', 'violations', 'INTEGER NOT NULL DEFAULT 0'],
  ['AssessmentAttempt', 'proctorLog', 'JSONB'],
];

(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL || process.env.DIRECT_URL });
  await client.connect();
  try {
    for (const [table, col, type] of COLS) {
      await client.query(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "${col}" ${type};`);
    }
    const n = (await client.query(
      `SELECT count(*)::int n FROM information_schema.columns WHERE (table_name,column_name) IN (${COLS.map((_, i) => `($${i * 2 + 1},$${i * 2 + 2})`).join(',')})`,
      COLS.flatMap(([t, c]) => [t, c]),
    )).rows[0].n;
    console.log(`OK: ${n}/${COLS.length} round-2 columns present.`);
    if (n < COLS.length) process.exit(1);
  } finally { await client.end(); }
})().catch((e) => { console.error('Migration failed:', e.message); process.exit(1); });
