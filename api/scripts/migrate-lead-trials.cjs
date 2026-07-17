/*
 * Raw-SQL migration for Lead CRM Phase 3 + 4 (trial scheduling, reminders,
 * attendance, feedback, coach decision, conversion). DIRECT_URL (5432) is
 * unreachable, so we apply plain DDL over the pooler, then run
 * `npx prisma generate`. Idempotent.
 */
require('dotenv/config');
const { Client } = require('pg');

const DDL = `
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'LeadTrialStatus') THEN
    CREATE TYPE "LeadTrialStatus" AS ENUM (
      'SCHEDULED','RESCHEDULED','COMPLETED','NO_SHOW','CANCELLED'
    );
  END IF;
END $$;

-- Phase 4 conversion / coach-decision columns on Lead
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "coachDecision"        TEXT;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "coachDecisionNotes"   TEXT;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "coachDecisionAt"      TIMESTAMP(3);
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "convertedStudentCode" TEXT;

CREATE TABLE IF NOT EXISTS "LeadTrial" (
  "id"                      TEXT NOT NULL,
  "leadId"                  TEXT NOT NULL,
  "teacherId"               TEXT,
  "scheduledAt"             TIMESTAMP(3) NOT NULL,
  "durationMins"            INTEGER NOT NULL DEFAULT 30,
  "timeZone"                TEXT,
  "meetingProvider"         TEXT,
  "meetingLink"             TEXT,
  "status"                  "LeadTrialStatus" NOT NULL DEFAULT 'SCHEDULED',
  "reminder24hSentAt"       TIMESTAMP(3),
  "reminder1hSentAt"        TIMESTAMP(3),
  "attendance"              TEXT,
  "attendedAt"              TIMESTAMP(3),
  "teacherRating"           INTEGER,
  "teacherFeedback"         TEXT,
  "teacherRecommendsEnroll" BOOLEAN,
  "parentRating"            INTEGER,
  "parentFeedback"          TEXT,
  "parentInterested"        BOOLEAN,
  "notes"                   TEXT,
  "createdById"             TEXT,
  "createdAt"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LeadTrial_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "LeadTrial_leadId_idx"      ON "LeadTrial" ("leadId");
CREATE INDEX IF NOT EXISTS "LeadTrial_teacherId_idx"   ON "LeadTrial" ("teacherId");
CREATE INDEX IF NOT EXISTS "LeadTrial_scheduledAt_idx" ON "LeadTrial" ("scheduledAt");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LeadTrial_leadId_fkey') THEN
    ALTER TABLE "LeadTrial" ADD CONSTRAINT "LeadTrial_leadId_fkey"
      FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
`;

(async () => {
  const conn = process.env.DATABASE_URL || process.env.DIRECT_URL;
  if (!conn) throw new Error('DATABASE_URL is not set');
  const client = new Client({ connectionString: conn });
  await client.connect();
  try {
    await client.query(DDL);
    const { rows } = await client.query(
      `SELECT
         (SELECT count(*) FROM information_schema.columns WHERE table_name='LeadTrial')::int AS trial_cols,
         (SELECT count(*) FROM information_schema.columns WHERE table_name='Lead' AND column_name IN
            ('coachDecision','coachDecisionNotes','coachDecisionAt','convertedStudentCode'))::int AS lead_new_cols`,
    );
    console.log(
      `OK: LeadTrial has ${rows[0].trial_cols} columns, Lead gained ${rows[0].lead_new_cols}/4 new columns.`,
    );
  } finally {
    await client.end();
  }
})().catch((e) => {
  console.error('Migration failed:', e.message);
  process.exit(1);
});
