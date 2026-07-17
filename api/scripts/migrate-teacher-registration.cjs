/*
 * One-off raw-SQL migration for the TeacherRegistration model.
 *
 * DIRECT_URL (5432) is unreachable, so `prisma db push` (which needs the direct
 * connection for its advisory lock) can't run. Plain DDL works fine over the
 * pgbouncer pooler, so we create the enum + table by hand here, then run
 * `npx prisma generate` (needs no DB) to update the client.
 *
 * Idempotent: safe to run more than once.
 */
require('dotenv/config');
const { Client } = require('pg');

const DDL = `
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TeacherRegistrationStatus') THEN
    CREATE TYPE "TeacherRegistrationStatus" AS ENUM (
      'APPLIED', 'SCREENING', 'INTERVIEW', 'DEMO_CLASS',
      'APPROVAL', 'TRAINING', 'ACTIVATED', 'REJECTED', 'NEEDS_INFO'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "TeacherRegistration" (
  "id"                    TEXT NOT NULL,
  "firstName"             TEXT NOT NULL,
  "middleName"            TEXT,
  "lastName"              TEXT NOT NULL,
  "gender"                TEXT,
  "dateOfBirth"           TIMESTAMP(3),
  "nationality"           TEXT,
  "country"               TEXT,
  "state"                 TEXT,
  "city"                  TEXT,
  "address"               TEXT,
  "email"                 TEXT NOT NULL,
  "mobile"                TEXT,
  "whatsappNumber"        TEXT,
  "highestQualification"  TEXT,
  "university"            TEXT,
  "passingYear"           TEXT,
  "experienceYears"       TEXT,
  "currentEmployer"       TEXT,
  "expectedSalary"        TEXT,
  "subjects"              TEXT,
  "languages"             TEXT,
  "teachingMode"          TEXT,
  "availabilityDays"      TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "availabilitySlots"     TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "technicalSkills"       TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "accountNumber"         TEXT,
  "ifsc"                  TEXT,
  "bankName"              TEXT,
  "upi"                   TEXT,
  "taxNumber"             TEXT,
  "resumeUrl"             TEXT,
  "degreeUrl"             TEXT,
  "certificatesUrl"       TEXT,
  "govIdUrl"              TEXT,
  "photoUrl"              TEXT,
  "experienceLetterUrl"   TEXT,
  "policeVerificationUrl" TEXT,
  "username"              TEXT,
  "passwordHash"          TEXT NOT NULL,
  "status"                "TeacherRegistrationStatus" NOT NULL DEFAULT 'APPLIED',
  "reviewNotes"           TEXT,
  "interviewDate"         TIMESTAMP(3),
  "interviewNotes"        TEXT,
  "demoDate"              TIMESTAMP(3),
  "demoNotes"             TEXT,
  "reviewedAt"            TIMESTAMP(3),
  "reviewedById"          TEXT,
  "teacherProfileId"      TEXT,
  "approvedTeacherCode"   TEXT,
  "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TeacherRegistration_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "TeacherRegistration_status_idx"
  ON "TeacherRegistration" ("status");
`;

(async () => {
  const conn = process.env.DATABASE_URL || process.env.DIRECT_URL;
  if (!conn) throw new Error('DATABASE_URL is not set');

  const client = new Client({ connectionString: conn });
  await client.connect();
  try {
    await client.query(DDL);
    const { rows } = await client.query(
      `SELECT count(*)::int AS n FROM information_schema.columns
       WHERE table_name = 'TeacherRegistration'`,
    );
    console.log(`OK: TeacherRegistration table ready with ${rows[0].n} columns.`);
  } finally {
    await client.end();
  }
})().catch((e) => {
  console.error('Migration failed:', e.message);
  process.exit(1);
});
