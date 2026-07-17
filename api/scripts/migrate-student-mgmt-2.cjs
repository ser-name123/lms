/*
 * Round-2 migration for Student Management: adds StudentProfile.coachId and the
 * StudentTransfer (approval workflow) table. Raw SQL over the pooler. Idempotent.
 */
require('dotenv/config');
const { Client } = require('pg');

const DDL = `
ALTER TABLE "StudentProfile" ADD COLUMN IF NOT EXISTS "coachId" TEXT;

CREATE TABLE IF NOT EXISTS "StudentTransfer" (
  "id"              TEXT NOT NULL,
  "studentId"       TEXT NOT NULL,
  "kind"            TEXT NOT NULL,
  "reason"          TEXT NOT NULL,
  "payload"         JSONB NOT NULL,
  "fromLabel"       TEXT,
  "toLabel"         TEXT,
  "status"          TEXT NOT NULL DEFAULT 'PENDING',
  "requestedById"   TEXT,
  "requestedByName" TEXT,
  "decidedById"     TEXT,
  "decidedByName"   TEXT,
  "decidedAt"       TIMESTAMP(3),
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudentTransfer_pkey" PRIMARY KEY ("id")
);
DO $$ BEGIN
  ALTER TABLE "StudentTransfer"
    ADD CONSTRAINT "StudentTransfer_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "StudentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS "StudentTransfer_studentId_status_idx" ON "StudentTransfer"("studentId", "status");
CREATE INDEX IF NOT EXISTS "StudentTransfer_status_idx" ON "StudentTransfer"("status");
`;

(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL || process.env.DIRECT_URL });
  await client.connect();
  try {
    await client.query(DDL);
    const c = (await client.query(`SELECT count(*)::int n FROM information_schema.columns WHERE table_name='StudentProfile' AND column_name='coachId'`)).rows[0].n;
    const t = (await client.query(`SELECT to_regclass('"StudentTransfer"') IS NOT NULL AS ok`)).rows[0].ok;
    console.log(`OK: coachId=${c === 1}; StudentTransfer table: ${t}`);
  } finally { await client.end(); }
})().catch((e) => { console.error('Migration failed:', e.message); process.exit(1); });
