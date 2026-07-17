/*
 * Raw-SQL migration for the Lead management module (Lead + LeadActivity +
 * Notification). DIRECT_URL (5432) is unreachable, so we apply plain DDL over
 * the pooler, then run `npx prisma generate`. Idempotent.
 */
require('dotenv/config');
const { Client } = require('pg');

const DDL = `
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'LeadStatus') THEN
    CREATE TYPE "LeadStatus" AS ENUM (
      'NEW','CONTACT_PENDING','CONTACTED','EVALUATION_SCHEDULED','EVALUATION_COMPLETED',
      'TEACHER_ASSIGNED','TRIAL_SCHEDULED','TRIAL_COMPLETED','WAITING_PARENT_DECISION',
      'CONVERTED','REJECTED','CLOSED'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'LeadPriority') THEN
    CREATE TYPE "LeadPriority" AS ENUM ('LOW','MEDIUM','HIGH','URGENT');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "Lead" (
  "id"                     TEXT NOT NULL,
  "leadNumber"             TEXT NOT NULL,
  "studentFirstName"       TEXT NOT NULL,
  "studentLastName"        TEXT NOT NULL,
  "gender"                 TEXT,
  "dateOfBirth"            TIMESTAMP(3),
  "currentGrade"           TEXT,
  "currentSchool"          TEXT,
  "country"                TEXT,
  "timeZone"               TEXT,
  "parentName"             TEXT,
  "relationship"           TEXT,
  "email"                  TEXT NOT NULL,
  "mobile"                 TEXT NOT NULL,
  "whatsappNumber"         TEXT,
  "interestedSubject"      TEXT,
  "currentLevel"           TEXT,
  "preferredLanguage"      TEXT,
  "preferredTeacherGender" TEXT,
  "preferredDays"          TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "preferredTimeSlots"     TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "learningGoal"           TEXT,
  "previousCoaching"       TEXT,
  "specialRequirements"    TEXT,
  "medicalDisability"      TEXT,
  "acceptPrivacy"          BOOLEAN NOT NULL DEFAULT false,
  "acceptTerms"            BOOLEAN NOT NULL DEFAULT false,
  "recaptchaToken"         TEXT,
  "leadSource"             TEXT NOT NULL DEFAULT 'Website',
  "ipAddress"              TEXT,
  "browser"                TEXT,
  "device"                 TEXT,
  "referralUrl"            TEXT,
  "utmSource"              TEXT,
  "utmCampaign"            TEXT,
  "utmMedium"              TEXT,
  "status"                 "LeadStatus" NOT NULL DEFAULT 'NEW',
  "priority"               "LeadPriority" NOT NULL DEFAULT 'MEDIUM',
  "assignedCoachId"        TEXT,
  "assignedCoachAt"        TIMESTAMP(3),
  "evaluationScores"       JSONB,
  "overallScore"           DOUBLE PRECISION,
  "evaluationNotes"        TEXT,
  "evaluatedAt"            TIMESTAMP(3),
  "evaluatedById"          TEXT,
  "recommendedLevel"       TEXT,
  "recommendedBatch"       TEXT,
  "recommendedTeacherId"   TEXT,
  "assignedTeacherId"      TEXT,
  "assignedTeacherAt"      TIMESTAMP(3),
  "convertedStudentId"     TEXT,
  "convertedAt"            TIMESTAMP(3),
  "createdAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Lead_leadNumber_key" ON "Lead" ("leadNumber");
CREATE INDEX IF NOT EXISTS "Lead_status_idx" ON "Lead" ("status");
CREATE INDEX IF NOT EXISTS "Lead_assignedCoachId_idx" ON "Lead" ("assignedCoachId");
CREATE INDEX IF NOT EXISTS "Lead_email_idx" ON "Lead" ("email");

CREATE TABLE IF NOT EXISTS "LeadActivity" (
  "id"        TEXT NOT NULL,
  "leadId"    TEXT NOT NULL,
  "type"      TEXT NOT NULL,
  "message"   TEXT NOT NULL,
  "actorId"   TEXT,
  "actorName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LeadActivity_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "LeadActivity_leadId_idx" ON "LeadActivity" ("leadId");

CREATE TABLE IF NOT EXISTS "Notification" (
  "id"        TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "type"      TEXT NOT NULL,
  "title"     TEXT NOT NULL,
  "body"      TEXT,
  "link"      TEXT,
  "read"      BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Notification_userId_read_idx" ON "Notification" ("userId", "read");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LeadActivity_leadId_fkey') THEN
    ALTER TABLE "LeadActivity" ADD CONSTRAINT "LeadActivity_leadId_fkey"
      FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Notification_userId_fkey') THEN
    ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
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
         (SELECT count(*) FROM information_schema.columns WHERE table_name='Lead')::int AS lead_cols,
         (SELECT count(*) FROM information_schema.tables WHERE table_name IN ('Lead','LeadActivity','Notification'))::int AS tables`,
    );
    console.log(`OK: ${rows[0].tables}/3 tables, Lead has ${rows[0].lead_cols} columns.`);
  } finally {
    await client.end();
  }
})().catch((e) => {
  console.error('Migration failed:', e.message);
  process.exit(1);
});
