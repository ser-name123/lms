/*
 * Raw-SQL migration for the Student Progress Tracking module.
 * DIRECT_URL (5432) is unreachable, so we apply plain DDL over the pooler
 * (DATABASE_URL), then run `npx prisma generate`. Fully idempotent.
 *
 * Adds: ProgressSkill, StudentSkillProgress, TeacherFeedback, LearningGoal,
 * MonthlyReview, Badge, StudentBadge, ProgressRiskFlag, ParentMeeting,
 * ProgressSnapshot + Assignment.skillId / Assessment.skillId columns.
 */
require('dotenv/config');
const { Client } = require('pg');

const DDL = `
CREATE TABLE IF NOT EXISTS "ProgressSkill" (
  "id"        TEXT NOT NULL,
  "courseId"  TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "order"     INTEGER NOT NULL DEFAULT 0,
  "archived"  BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProgressSkill_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ProgressSkill_courseId_name_key" ON "ProgressSkill" ("courseId","name");
CREATE INDEX IF NOT EXISTS "ProgressSkill_courseId_idx" ON "ProgressSkill" ("courseId");

CREATE TABLE IF NOT EXISTS "StudentSkillProgress" (
  "id"         TEXT NOT NULL,
  "studentId"  TEXT NOT NULL,
  "skillId"    TEXT NOT NULL,
  "percentage" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "sampleSize" INTEGER NOT NULL DEFAULT 0,
  "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudentSkillProgress_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "StudentSkillProgress_studentId_skillId_key" ON "StudentSkillProgress" ("studentId","skillId");
CREATE INDEX IF NOT EXISTS "StudentSkillProgress_studentId_idx" ON "StudentSkillProgress" ("studentId");

CREATE TABLE IF NOT EXISTS "TeacherFeedback" (
  "id"             TEXT NOT NULL,
  "studentId"      TEXT NOT NULL,
  "teacherId"      TEXT,
  "classSessionId" TEXT,
  "kind"           TEXT NOT NULL DEFAULT 'CLASS',
  "participation"  INTEGER,
  "homework"       INTEGER,
  "communication"  INTEGER,
  "understanding"  INTEGER,
  "behavior"       INTEGER,
  "remarks"        TEXT,
  "suggestions"    TEXT,
  "actorId"        TEXT,
  "actorName"      TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TeacherFeedback_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "TeacherFeedback_studentId_kind_idx" ON "TeacherFeedback" ("studentId","kind");
CREATE INDEX IF NOT EXISTS "TeacherFeedback_studentId_createdAt_idx" ON "TeacherFeedback" ("studentId","createdAt");
CREATE INDEX IF NOT EXISTS "TeacherFeedback_teacherId_idx" ON "TeacherFeedback" ("teacherId");

CREATE TABLE IF NOT EXISTS "LearningGoal" (
  "id"            TEXT NOT NULL,
  "studentId"     TEXT NOT NULL,
  "title"         TEXT NOT NULL,
  "description"   TEXT,
  "skillId"       TEXT,
  "currentPct"    INTEGER NOT NULL DEFAULT 0,
  "targetPct"     INTEGER NOT NULL DEFAULT 100,
  "deadline"      TIMESTAMP(3),
  "status"        TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdById"   TEXT,
  "createdByName" TEXT,
  "achievedAt"    TIMESTAMP(3),
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LearningGoal_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "LearningGoal_studentId_status_idx" ON "LearningGoal" ("studentId","status");

CREATE TABLE IF NOT EXISTS "MonthlyReview" (
  "id"             TEXT NOT NULL,
  "studentId"      TEXT NOT NULL,
  "coachId"        TEXT,
  "periodStart"    TIMESTAMP(3) NOT NULL,
  "periodEnd"      TIMESTAMP(3) NOT NULL,
  "monthLabel"     TEXT NOT NULL,
  "academic"       INTEGER,
  "attendance"     INTEGER,
  "behavior"       INTEGER,
  "participation"  INTEGER,
  "learningSpeed"  INTEGER,
  "homework"       INTEGER,
  "communication"  INTEGER,
  "recommendation" TEXT,
  "remarks"        TEXT,
  "actorId"        TEXT,
  "actorName"      TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MonthlyReview_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "MonthlyReview_studentId_periodStart_key" ON "MonthlyReview" ("studentId","periodStart");
CREATE INDEX IF NOT EXISTS "MonthlyReview_studentId_idx" ON "MonthlyReview" ("studentId");

CREATE TABLE IF NOT EXISTS "Badge" (
  "id"          TEXT NOT NULL,
  "code"        TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "description" TEXT,
  "icon"        TEXT,
  "tone"        TEXT,
  "active"      BOOLEAN NOT NULL DEFAULT true,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Badge_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Badge_code_key" ON "Badge" ("code");

CREATE TABLE IF NOT EXISTS "StudentBadge" (
  "id"        TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "badgeId"   TEXT NOT NULL,
  "awardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "meta"      JSONB,
  CONSTRAINT "StudentBadge_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "StudentBadge_studentId_badgeId_key" ON "StudentBadge" ("studentId","badgeId");
CREATE INDEX IF NOT EXISTS "StudentBadge_studentId_idx" ON "StudentBadge" ("studentId");

CREATE TABLE IF NOT EXISTS "ProgressRiskFlag" (
  "id"            TEXT NOT NULL,
  "studentId"     TEXT NOT NULL,
  "level"         TEXT NOT NULL DEFAULT 'AT_RISK',
  "reasons"       TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "attendancePct" DOUBLE PRECISION,
  "assignmentPct" DOUBLE PRECISION,
  "assessmentPct" DOUBLE PRECISION,
  "status"        TEXT NOT NULL DEFAULT 'OPEN',
  "note"          TEXT,
  "resolvedById"  TEXT,
  "resolvedAt"    TIMESTAMP(3),
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProgressRiskFlag_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ProgressRiskFlag_studentId_status_idx" ON "ProgressRiskFlag" ("studentId","status");
CREATE INDEX IF NOT EXISTS "ProgressRiskFlag_status_idx" ON "ProgressRiskFlag" ("status");

CREATE TABLE IF NOT EXISTS "ParentMeeting" (
  "id"           TEXT NOT NULL,
  "studentId"    TEXT NOT NULL,
  "coachId"      TEXT,
  "scheduledAt"  TIMESTAMP(3) NOT NULL,
  "status"       TEXT NOT NULL DEFAULT 'SCHEDULED',
  "agenda"       TEXT,
  "notes"        TEXT,
  "actionItems"  JSONB,
  "nextReviewAt" TIMESTAMP(3),
  "actorId"      TEXT,
  "actorName"    TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ParentMeeting_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ParentMeeting_studentId_status_idx" ON "ParentMeeting" ("studentId","status");

CREATE TABLE IF NOT EXISTS "ProgressSnapshot" (
  "id"            TEXT NOT NULL,
  "studentId"     TEXT NOT NULL,
  "periodStart"   TIMESTAMP(3) NOT NULL,
  "periodEnd"     TIMESTAMP(3) NOT NULL,
  "monthLabel"    TEXT NOT NULL,
  "attendancePct" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "assignmentPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "assessmentPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "feedbackScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "coachScore"    DOUBLE PRECISION NOT NULL DEFAULT 0,
  "overallScore"  DOUBLE PRECISION NOT NULL DEFAULT 0,
  "statusLabel"   TEXT NOT NULL DEFAULT 'AVERAGE',
  "rank"          INTEGER,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProgressSnapshot_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ProgressSnapshot_studentId_periodStart_key" ON "ProgressSnapshot" ("studentId","periodStart");
CREATE INDEX IF NOT EXISTS "ProgressSnapshot_studentId_idx" ON "ProgressSnapshot" ("studentId");

-- Skill link columns on existing tables
ALTER TABLE "Assignment" ADD COLUMN IF NOT EXISTS "skillId" TEXT;
ALTER TABLE "Assessment" ADD COLUMN IF NOT EXISTS "skillId" TEXT;

-- Foreign keys (cascade integrity)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ProgressSkill_courseId_fkey') THEN
    ALTER TABLE "ProgressSkill" ADD CONSTRAINT "ProgressSkill_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='StudentSkillProgress_studentId_fkey') THEN
    ALTER TABLE "StudentSkillProgress" ADD CONSTRAINT "StudentSkillProgress_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "StudentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='StudentSkillProgress_skillId_fkey') THEN
    ALTER TABLE "StudentSkillProgress" ADD CONSTRAINT "StudentSkillProgress_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "ProgressSkill"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='TeacherFeedback_studentId_fkey') THEN
    ALTER TABLE "TeacherFeedback" ADD CONSTRAINT "TeacherFeedback_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "StudentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='LearningGoal_studentId_fkey') THEN
    ALTER TABLE "LearningGoal" ADD CONSTRAINT "LearningGoal_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "StudentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='MonthlyReview_studentId_fkey') THEN
    ALTER TABLE "MonthlyReview" ADD CONSTRAINT "MonthlyReview_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "StudentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='StudentBadge_studentId_fkey') THEN
    ALTER TABLE "StudentBadge" ADD CONSTRAINT "StudentBadge_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "StudentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='StudentBadge_badgeId_fkey') THEN
    ALTER TABLE "StudentBadge" ADD CONSTRAINT "StudentBadge_badgeId_fkey" FOREIGN KEY ("badgeId") REFERENCES "Badge"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ProgressRiskFlag_studentId_fkey') THEN
    ALTER TABLE "ProgressRiskFlag" ADD CONSTRAINT "ProgressRiskFlag_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "StudentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ParentMeeting_studentId_fkey') THEN
    ALTER TABLE "ParentMeeting" ADD CONSTRAINT "ParentMeeting_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "StudentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ProgressSnapshot_studentId_fkey') THEN
    ALTER TABLE "ProgressSnapshot" ADD CONSTRAINT "ProgressSnapshot_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "StudentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
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
      `SELECT (SELECT count(*) FROM information_schema.tables WHERE table_name IN
         ('ProgressSkill','StudentSkillProgress','TeacherFeedback','LearningGoal','MonthlyReview','Badge','StudentBadge','ProgressRiskFlag','ParentMeeting','ProgressSnapshot'))::int AS tables,
        (SELECT count(*) FROM information_schema.columns WHERE table_name='Assignment' AND column_name='skillId')::int AS asg_skill,
        (SELECT count(*) FROM information_schema.columns WHERE table_name='Assessment' AND column_name='skillId')::int AS ass_skill`,
    );
    console.log(`OK: ${rows[0].tables}/10 progress tables · Assignment.skillId ${rows[0].asg_skill} · Assessment.skillId ${rows[0].ass_skill}`);
  } finally {
    await client.end();
  }
})().catch((e) => { console.error('Migration failed:', e.message); process.exit(1); });
