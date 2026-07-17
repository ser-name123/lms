/*
 * Migration for the advanced Assessment Management module: creates the five new
 * tables (Question bank, Assessment, AssessmentQuestion, AssessmentAttempt,
 * AssessmentAnswer). Raw SQL over the pooler (DIRECT_URL down). Idempotent —
 * CREATE TABLE / INDEX / CONSTRAINT all guarded with IF NOT EXISTS or a
 * duplicate-object catch. No enum changes (all status fields are TEXT).
 */
require('dotenv/config');
const { Client } = require('pg');

const STATEMENTS = [
  // ── Question bank ──────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS "Question" (
    "id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "chapter" TEXT,
    "topic" TEXT,
    "category" TEXT,
    "difficulty" TEXT NOT NULL DEFAULT 'MEDIUM',
    "type" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "options" JSONB,
    "correctAnswer" TEXT,
    "marks" INTEGER NOT NULL DEFAULT 1,
    "negativeMarks" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "estimatedTime" INTEGER NOT NULL DEFAULT 60,
    "explanation" TEXT,
    "media" JSONB,
    "rubric" JSONB,
    "createdById" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
  );`,
  `CREATE INDEX IF NOT EXISTS "Question_subject_idx" ON "Question"("subject");`,
  `CREATE INDEX IF NOT EXISTS "Question_type_idx" ON "Question"("type");`,
  `CREATE INDEX IF NOT EXISTS "Question_difficulty_idx" ON "Question"("difficulty");`,
  `CREATE INDEX IF NOT EXISTS "Question_archived_idx" ON "Question"("archived");`,

  // ── Assessment ─────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS "Assessment" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "courseId" TEXT,
    "batchId" TEXT,
    "teacherId" TEXT,
    "createdById" TEXT,
    "subject" TEXT,
    "chapter" TEXT,
    "topic" TEXT,
    "category" TEXT,
    "type" TEXT NOT NULL DEFAULT 'QUIZ',
    "instructions" TEXT,
    "durationMin" INTEGER NOT NULL DEFAULT 60,
    "totalMarks" INTEGER NOT NULL DEFAULT 100,
    "passingMarks" INTEGER NOT NULL DEFAULT 40,
    "attemptsAllowed" INTEGER NOT NULL DEFAULT 1,
    "questionOrder" TEXT NOT NULL DEFAULT 'FIXED',
    "allowBack" BOOLEAN NOT NULL DEFAULT true,
    "showResultImmediately" BOOLEAN NOT NULL DEFAULT false,
    "negativeMarking" BOOLEAN NOT NULL DEFAULT false,
    "selectionMode" TEXT NOT NULL DEFAULT 'MANUAL',
    "randomRules" JSONB,
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "publishAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "targetType" TEXT NOT NULL DEFAULT 'BATCH',
    "targetStudentIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "certificateEnabled" BOOLEAN NOT NULL DEFAULT false,
    "certificateThreshold" INTEGER NOT NULL DEFAULT 70,
    "attachments" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Assessment_pkey" PRIMARY KEY ("id")
  );`,
  `CREATE INDEX IF NOT EXISTS "Assessment_status_idx" ON "Assessment"("status");`,
  `CREATE INDEX IF NOT EXISTS "Assessment_teacherId_idx" ON "Assessment"("teacherId");`,
  `CREATE INDEX IF NOT EXISTS "Assessment_batchId_idx" ON "Assessment"("batchId");`,
  `CREATE INDEX IF NOT EXISTS "Assessment_courseId_idx" ON "Assessment"("courseId");`,
  `DO $$ BEGIN ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
  `DO $$ BEGIN ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
  `DO $$ BEGIN ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "TeacherProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,

  // ── AssessmentQuestion (join) ──────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS "AssessmentQuestion" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "marks" INTEGER,
    CONSTRAINT "AssessmentQuestion_pkey" PRIMARY KEY ("id")
  );`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "AssessmentQuestion_assessmentId_questionId_key" ON "AssessmentQuestion"("assessmentId", "questionId");`,
  `CREATE INDEX IF NOT EXISTS "AssessmentQuestion_assessmentId_idx" ON "AssessmentQuestion"("assessmentId");`,
  `DO $$ BEGIN ALTER TABLE "AssessmentQuestion" ADD CONSTRAINT "AssessmentQuestion_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
  `DO $$ BEGIN ALTER TABLE "AssessmentQuestion" ADD CONSTRAINT "AssessmentQuestion_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,

  // ── AssessmentAttempt ──────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS "AssessmentAttempt" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "attemptNo" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "evaluatedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "autoSubmitted" BOOLEAN NOT NULL DEFAULT false,
    "timeSpentSec" INTEGER,
    "autoScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "manualScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalMarks" INTEGER NOT NULL DEFAULT 0,
    "percentage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "passed" BOOLEAN NOT NULL DEFAULT false,
    "rank" INTEGER,
    "correctCount" INTEGER NOT NULL DEFAULT 0,
    "wrongCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "teacherFeedback" TEXT,
    "certificateUrl" TEXT,
    CONSTRAINT "AssessmentAttempt_pkey" PRIMARY KEY ("id")
  );`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "AssessmentAttempt_assessmentId_studentId_attemptNo_key" ON "AssessmentAttempt"("assessmentId", "studentId", "attemptNo");`,
  `CREATE INDEX IF NOT EXISTS "AssessmentAttempt_assessmentId_idx" ON "AssessmentAttempt"("assessmentId");`,
  `CREATE INDEX IF NOT EXISTS "AssessmentAttempt_studentId_idx" ON "AssessmentAttempt"("studentId");`,
  `CREATE INDEX IF NOT EXISTS "AssessmentAttempt_status_idx" ON "AssessmentAttempt"("status");`,
  `DO $$ BEGIN ALTER TABLE "AssessmentAttempt" ADD CONSTRAINT "AssessmentAttempt_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
  `DO $$ BEGIN ALTER TABLE "AssessmentAttempt" ADD CONSTRAINT "AssessmentAttempt_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "StudentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,

  // ── AssessmentAnswer ───────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS "AssessmentAnswer" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "response" JSONB,
    "markedForReview" BOOLEAN NOT NULL DEFAULT false,
    "isCorrect" BOOLEAN,
    "awardedMarks" DOUBLE PRECISION,
    "maxMarks" INTEGER NOT NULL DEFAULT 1,
    "rubricScores" JSONB,
    "feedback" TEXT,
    "autoGraded" BOOLEAN NOT NULL DEFAULT false,
    "timeSpentSec" INTEGER,
    CONSTRAINT "AssessmentAnswer_pkey" PRIMARY KEY ("id")
  );`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "AssessmentAnswer_attemptId_questionId_key" ON "AssessmentAnswer"("attemptId", "questionId");`,
  `CREATE INDEX IF NOT EXISTS "AssessmentAnswer_attemptId_idx" ON "AssessmentAnswer"("attemptId");`,
  `DO $$ BEGIN ALTER TABLE "AssessmentAnswer" ADD CONSTRAINT "AssessmentAnswer_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "AssessmentAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
  `DO $$ BEGIN ALTER TABLE "AssessmentAnswer" ADD CONSTRAINT "AssessmentAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
];

(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL || process.env.DIRECT_URL });
  await client.connect();
  try {
    for (const sql of STATEMENTS) await client.query(sql);
    const tables = ['Question', 'Assessment', 'AssessmentQuestion', 'AssessmentAttempt', 'AssessmentAnswer'];
    const { rows } = await client.query(
      `SELECT table_name FROM information_schema.tables WHERE table_name = ANY($1)`,
      [tables],
    );
    const present = rows.map((r) => r.table_name);
    const missing = tables.filter((t) => !present.includes(t));
    console.log(`OK: ${present.length}/${tables.length} assessment tables present${missing.length ? ` (missing: ${missing.join(', ')})` : ''}.`);
    if (missing.length) process.exit(1);
  } finally {
    await client.end();
  }
})().catch((e) => { console.error('Migration failed:', e.message); process.exit(1); });
