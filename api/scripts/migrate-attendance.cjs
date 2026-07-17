/*
 * Raw-SQL migration for the Online Attendance Management module: Batch +
 * BatchStudent, ClassSession lifecycle columns, ClassAttendee join/leave/status
 * columns, and AttendanceCorrection. DIRECT_URL (5432) is unreachable, so we
 * apply plain DDL over the pooler, then run `npx prisma generate`. Idempotent.
 */
require('dotenv/config');
const { Client } = require('pg');

const DDL = `
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='BatchStatus') THEN
    CREATE TYPE "BatchStatus" AS ENUM ('ACTIVE','PAUSED','COMPLETED','CANCELLED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='StudentAttendanceStatus') THEN
    CREATE TYPE "StudentAttendanceStatus" AS ENUM ('PRESENT','LATE','ABSENT','EXCUSED','LEAVE_APPROVED','NO_SHOW');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='TeacherAttendanceStatus') THEN
    CREATE TYPE "TeacherAttendanceStatus" AS ENUM ('PRESENT','LATE','ABSENT','CLASS_CANCELLED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='CorrectionStatus') THEN
    CREATE TYPE "CorrectionStatus" AS ENUM ('PENDING','APPROVED','REJECTED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "Batch" (
  "id"         TEXT NOT NULL,
  "code"       TEXT NOT NULL,
  "name"       TEXT NOT NULL,
  "courseId"   TEXT NOT NULL,
  "teacherId"  TEXT,
  "level"      TEXT,
  "status"     "BatchStatus" NOT NULL DEFAULT 'ACTIVE',
  "startDate"  TIMESTAMP(3),
  "endDate"    TIMESTAMP(3),
  "daysOfWeek" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "startTime"  TEXT,
  "endTime"    TEXT,
  "timeZone"   TEXT,
  "capacity"   INTEGER,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Batch_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Batch_code_key" ON "Batch" ("code");
CREATE INDEX IF NOT EXISTS "Batch_courseId_idx" ON "Batch" ("courseId");
CREATE INDEX IF NOT EXISTS "Batch_teacherId_idx" ON "Batch" ("teacherId");
CREATE INDEX IF NOT EXISTS "Batch_status_idx" ON "Batch" ("status");

CREATE TABLE IF NOT EXISTS "BatchStudent" (
  "id"        TEXT NOT NULL,
  "batchId"   TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "addedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BatchStudent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "BatchStudent_batchId_studentId_key" ON "BatchStudent" ("batchId","studentId");
CREATE INDEX IF NOT EXISTS "BatchStudent_studentId_idx" ON "BatchStudent" ("studentId");

-- ClassSession lifecycle columns
ALTER TABLE "ClassSession" ADD COLUMN IF NOT EXISTS "batchId"            TEXT;
ALTER TABLE "ClassSession" ADD COLUMN IF NOT EXISTS "reminder24hSentAt"  TIMESTAMP(3);
ALTER TABLE "ClassSession" ADD COLUMN IF NOT EXISTS "reminder1hSentAt"   TIMESTAMP(3);
ALTER TABLE "ClassSession" ADD COLUMN IF NOT EXISTS "reminder15mSentAt"  TIMESTAMP(3);
ALTER TABLE "ClassSession" ADD COLUMN IF NOT EXISTS "teacherJoinedAt"    TIMESTAMP(3);
ALTER TABLE "ClassSession" ADD COLUMN IF NOT EXISTS "actualStartAt"      TIMESTAMP(3);
ALTER TABLE "ClassSession" ADD COLUMN IF NOT EXISTS "actualEndAt"        TIMESTAMP(3);
ALTER TABLE "ClassSession" ADD COLUMN IF NOT EXISTS "meetingId"          TEXT;
ALTER TABLE "ClassSession" ADD COLUMN IF NOT EXISTS "sessionId"          TEXT;
ALTER TABLE "ClassSession" ADD COLUMN IF NOT EXISTS "teacherStatus"      "TeacherAttendanceStatus";
ALTER TABLE "ClassSession" ADD COLUMN IF NOT EXISTS "teacherLateMinutes" INTEGER;
ALTER TABLE "ClassSession" ADD COLUMN IF NOT EXISTS "attendanceLocked"   BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ClassSession" ADD COLUMN IF NOT EXISTS "lockedAt"           TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "ClassSession_batchId_startsAt_idx" ON "ClassSession" ("batchId","startsAt");
CREATE INDEX IF NOT EXISTS "ClassSession_status_idx" ON "ClassSession" ("status");

-- ClassAttendee join/leave/status columns
ALTER TABLE "ClassAttendee" ADD COLUMN IF NOT EXISTS "leftAt"       TIMESTAMP(3);
ALTER TABLE "ClassAttendee" ADD COLUMN IF NOT EXISTS "durationMins" INTEGER;
ALTER TABLE "ClassAttendee" ADD COLUMN IF NOT EXISTS "device"       TEXT;
ALTER TABLE "ClassAttendee" ADD COLUMN IF NOT EXISTS "browser"      TEXT;
ALTER TABLE "ClassAttendee" ADD COLUMN IF NOT EXISTS "ipAddress"    TEXT;
ALTER TABLE "ClassAttendee" ADD COLUMN IF NOT EXISTS "status"       "StudentAttendanceStatus";
ALTER TABLE "ClassAttendee" ADD COLUMN IF NOT EXISTS "lateMinutes"  INTEGER;
ALTER TABLE "ClassAttendee" ADD COLUMN IF NOT EXISTS "remarks"      TEXT;
CREATE INDEX IF NOT EXISTS "ClassAttendee_studentId_idx" ON "ClassAttendee" ("studentId");

CREATE TABLE IF NOT EXISTS "AttendanceCorrection" (
  "id"              TEXT NOT NULL,
  "classId"         TEXT NOT NULL,
  "targetType"      TEXT NOT NULL,
  "studentId"       TEXT,
  "attendeeId"      TEXT,
  "fromStatus"      TEXT,
  "toStatus"        TEXT NOT NULL,
  "reason"          TEXT NOT NULL,
  "requestedById"   TEXT NOT NULL,
  "requestedByName" TEXT,
  "status"          "CorrectionStatus" NOT NULL DEFAULT 'PENDING',
  "reviewedById"    TEXT,
  "reviewedByName"  TEXT,
  "reviewNotes"     TEXT,
  "reviewedAt"      TIMESTAMP(3),
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AttendanceCorrection_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AttendanceCorrection_classId_idx" ON "AttendanceCorrection" ("classId");
CREATE INDEX IF NOT EXISTS "AttendanceCorrection_status_idx" ON "AttendanceCorrection" ("status");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='Batch_courseId_fkey') THEN
    ALTER TABLE "Batch" ADD CONSTRAINT "Batch_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='Batch_teacherId_fkey') THEN
    ALTER TABLE "Batch" ADD CONSTRAINT "Batch_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "TeacherProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='BatchStudent_batchId_fkey') THEN
    ALTER TABLE "BatchStudent" ADD CONSTRAINT "BatchStudent_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='BatchStudent_studentId_fkey') THEN
    ALTER TABLE "BatchStudent" ADD CONSTRAINT "BatchStudent_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "StudentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ClassSession_batchId_fkey') THEN
    ALTER TABLE "ClassSession" ADD CONSTRAINT "ClassSession_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='AttendanceCorrection_classId_fkey') THEN
    ALTER TABLE "AttendanceCorrection" ADD CONSTRAINT "AttendanceCorrection_classId_fkey" FOREIGN KEY ("classId") REFERENCES "ClassSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
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
         (SELECT count(*) FROM information_schema.tables WHERE table_name IN ('Batch','BatchStudent','AttendanceCorrection'))::int AS tables,
         (SELECT count(*) FROM information_schema.columns WHERE table_name='ClassSession')::int AS cs_cols,
         (SELECT count(*) FROM information_schema.columns WHERE table_name='ClassAttendee')::int AS ca_cols`,
    );
    console.log(`OK: ${rows[0].tables}/3 new tables · ClassSession ${rows[0].cs_cols} cols · ClassAttendee ${rows[0].ca_cols} cols.`);
  } finally {
    await client.end();
  }
})().catch((e) => { console.error('Migration failed:', e.message); process.exit(1); });
