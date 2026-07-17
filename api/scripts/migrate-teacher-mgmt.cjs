/*
 * Raw-SQL migration for the Teacher Management module: adds teaching-assignment,
 * availability, profile-enrichment, documents and rating columns to
 * TeacherProfile. DIRECT_URL (5432) is down, so DDL runs over the pooler, then
 * `npx prisma generate`. Idempotent.
 */
require('dotenv/config');
const { Client } = require('pg');

const COLS = [
  ['subjects', 'TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]'],
  ['levels', 'TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]'],
  ['teachingModes', 'TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]'],
  ['availability', 'JSONB'],
  ['availabilityApproved', 'BOOLEAN NOT NULL DEFAULT false'],
  ['availabilitySubmittedAt', 'TIMESTAMP(3)'],
  ['gender', 'TEXT'],
  ['dateOfBirth', 'TIMESTAMP(3)'],
  ['nationality', 'TEXT'],
  ['timeZone', 'TEXT'],
  ['address', 'TEXT'],
  ['whatsapp', 'TEXT'],
  ['qualification', 'TEXT'],
  ['experienceYears', 'TEXT'],
  ['languages', 'TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]'],
  ['joiningDate', 'TIMESTAMP(3)'],
  ['documents', 'JSONB'],
  ['rating', 'DOUBLE PRECISION'],
  ['ratingCount', 'INTEGER'],
];

const DDL = COLS.map(([c, t]) => `ALTER TABLE "TeacherProfile" ADD COLUMN IF NOT EXISTS "${c}" ${t};`).join('\n');

(async () => {
  const conn = process.env.DATABASE_URL || process.env.DIRECT_URL;
  if (!conn) throw new Error('DATABASE_URL is not set');
  const client = new Client({ connectionString: conn });
  await client.connect();
  try {
    await client.query(DDL);
    const { rows } = await client.query(
      `SELECT count(*)::int AS n FROM information_schema.columns
        WHERE table_name='TeacherProfile' AND column_name = ANY($1)`,
      [COLS.map(([c]) => c)],
    );
    console.log(`OK: TeacherProfile now has ${rows[0].n}/${COLS.length} new columns.`);
  } finally {
    await client.end();
  }
})().catch((e) => { console.error('Migration failed:', e.message); process.exit(1); });
