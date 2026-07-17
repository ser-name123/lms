/*
 * Raw-SQL migration for the Student Management module: adds academic, parent,
 * profile-enrichment, documents and hold columns to StudentProfile, and creates
 * the append-only StudentActivity table (Timeline / Audit / Notes / Comms).
 * DIRECT_URL (5432) is down, so DDL runs over the pooler, then `npx prisma
 * generate`. Idempotent.
 */
require('dotenv/config');
const { Client } = require('pg');

const COLS = [
  ['nationality', 'TEXT'],
  ['address', 'TEXT'],
  ['timeZone', 'TEXT'],
  ['currentGrade', 'TEXT'],
  ['currentSchool', 'TEXT'],
  ['board', 'TEXT'],
  ['learningLevel', 'TEXT'],
  ['preferredLanguage', 'TEXT'],
  ['learningGoal', 'TEXT'],
  ['parentName', 'TEXT'],
  ['parentRelationship', 'TEXT'],
  ['parentEmail', 'TEXT'],
  ['parentMobile', 'TEXT'],
  ['parentWhatsapp', 'TEXT'],
  ['documents', 'JSONB'],
  ['onHoldReason', 'TEXT'],
  ['onHoldAt', 'TIMESTAMP(3)'],
];

const ALTERS = COLS.map(
  ([c, t]) => `ALTER TABLE "StudentProfile" ADD COLUMN IF NOT EXISTS "${c}" ${t};`,
).join('\n');

const CREATE_ACTIVITY = `
CREATE TABLE IF NOT EXISTS "StudentActivity" (
  "id"          TEXT NOT NULL,
  "studentId"   TEXT NOT NULL,
  "kind"        TEXT NOT NULL,
  "type"        TEXT NOT NULL,
  "title"       TEXT NOT NULL,
  "description" TEXT,
  "channel"     TEXT,
  "visibility"  TEXT NOT NULL DEFAULT 'STAFF',
  "meta"        JSONB,
  "actorId"     TEXT,
  "actorName"   TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudentActivity_pkey" PRIMARY KEY ("id")
);
DO $$ BEGIN
  ALTER TABLE "StudentActivity"
    ADD CONSTRAINT "StudentActivity_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "StudentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS "StudentActivity_studentId_kind_idx" ON "StudentActivity"("studentId", "kind");
CREATE INDEX IF NOT EXISTS "StudentActivity_studentId_createdAt_idx" ON "StudentActivity"("studentId", "createdAt");
`;

(async () => {
  const conn = process.env.DATABASE_URL || process.env.DIRECT_URL;
  if (!conn) throw new Error('DATABASE_URL is not set');
  const client = new Client({ connectionString: conn });
  await client.connect();
  try {
    await client.query(ALTERS);
    await client.query(CREATE_ACTIVITY);
    const { rows } = await client.query(
      `SELECT count(*)::int AS n FROM information_schema.columns
        WHERE table_name='StudentProfile' AND column_name = ANY($1)`,
      [COLS.map(([c]) => c)],
    );
    const { rows: t } = await client.query(
      `SELECT to_regclass('"StudentActivity"') IS NOT NULL AS ok`,
    );
    console.log(`OK: StudentProfile has ${rows[0].n}/${COLS.length} new columns; StudentActivity table: ${t[0].ok}`);
  } finally {
    await client.end();
  }
})().catch((e) => { console.error('Migration failed:', e.message); process.exit(1); });
