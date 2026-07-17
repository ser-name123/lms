/*
 * Migration for the advanced Assignment Management module: enriches Assignment
 * + Submission, and extends the SubmissionStatus enum. Raw SQL over the pooler
 * (DIRECT_URL down). Idempotent. Enum ADD VALUE runs outside a txn.
 */
require('dotenv/config');
const { Client } = require('pg');

const NEW_SUBMISSION_STATUSES = ['DRAFT', 'LATE_SUBMITTED', 'UNDER_REVIEW', 'RETURNED'];

const ASSIGNMENT_COLS = [
  ['batchId', 'TEXT'],
  ['teacherId', 'TEXT'],
  ['createdById', 'TEXT'],
  ['subject', 'TEXT'],
  ['chapter', 'TEXT'],
  ['topic', 'TEXT'],
  ['difficulty', 'TEXT'],
  ['type', 'TEXT'],
  ['instructions', 'TEXT'],
  ['maxMarks', 'INTEGER NOT NULL DEFAULT 100'],
  ['passingMarks', 'INTEGER NOT NULL DEFAULT 40'],
  ['lateAllowed', 'BOOLEAN NOT NULL DEFAULT true'],
  ['latePenaltyPct', 'INTEGER NOT NULL DEFAULT 0'],
  ['publishAt', 'TIMESTAMP(3)'],
  ['status', "TEXT NOT NULL DEFAULT 'DRAFT'"],
  ['locked', 'BOOLEAN NOT NULL DEFAULT false'],
  ['targetType', "TEXT NOT NULL DEFAULT 'BATCH'"],
  ['targetStudentIds', 'TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]'],
  ['attachments', 'JSONB'],
  ['rubric', 'JSONB'],
  ['updatedAt', 'TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP'],
];

const SUBMISSION_COLS = [
  ['attachments', 'JSONB'],
  ['isLate', 'BOOLEAN NOT NULL DEFAULT false'],
  ['penaltyApplied', 'INTEGER'],
  ['rubricScores', 'JSONB'],
  ['feedbackFileUrl', 'TEXT'],
  ['returnedReason', 'TEXT'],
  ['draftSavedAt', 'TIMESTAMP(3)'],
];

(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL || process.env.DIRECT_URL });
  await client.connect();
  try {
    // Enum additions must each run in their own (auto-commit) statement.
    for (const v of NEW_SUBMISSION_STATUSES) {
      await client.query(`ALTER TYPE "SubmissionStatus" ADD VALUE IF NOT EXISTS '${v}'`);
    }

    const alters = [
      ...ASSIGNMENT_COLS.map(([c, t]) => `ALTER TABLE "Assignment" ADD COLUMN IF NOT EXISTS "${c}" ${t};`),
      ...SUBMISSION_COLS.map(([c, t]) => `ALTER TABLE "Submission" ADD COLUMN IF NOT EXISTS "${c}" ${t};`),
      `DO $$ BEGIN ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
      `DO $$ BEGIN ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "TeacherProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
      `CREATE INDEX IF NOT EXISTS "Assignment_status_idx" ON "Assignment"("status");`,
      `CREATE INDEX IF NOT EXISTS "Assignment_teacherId_idx" ON "Assignment"("teacherId");`,
      `CREATE INDEX IF NOT EXISTS "Assignment_batchId_idx" ON "Assignment"("batchId");`,
      `CREATE INDEX IF NOT EXISTS "Submission_status_idx" ON "Submission"("status");`,
    ].join('\n');
    await client.query(alters);

    const a = (await client.query(`SELECT count(*)::int n FROM information_schema.columns WHERE table_name='Assignment' AND column_name = ANY($1)`, [ASSIGNMENT_COLS.map(([c]) => c)])).rows[0].n;
    const s = (await client.query(`SELECT count(*)::int n FROM information_schema.columns WHERE table_name='Submission' AND column_name = ANY($1)`, [SUBMISSION_COLS.map(([c]) => c)])).rows[0].n;
    console.log(`OK: Assignment +${a}/${ASSIGNMENT_COLS.length} cols; Submission +${s}/${SUBMISSION_COLS.length} cols; enum values added.`);
  } finally { await client.end(); }
})().catch((e) => { console.error('Migration failed:', e.message); process.exit(1); });
