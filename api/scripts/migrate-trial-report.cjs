/*
 * Teacher trial report.
 *
 * The teacher a trial is assigned to runs the session and records it: what was
 * covered, the details collected from the family, and the level / course they
 * recommend. All of it hangs off LeadTrial, not Lead, because one student can
 * sit several trials and each teacher records what they were actually told.
 *
 * Raw SQL over the pooler because DIRECT_URL (5432) is unreachable from here,
 * so `prisma migrate` cannot run. Every statement is idempotent — re-running is
 * safe and is how this gets applied to each environment.
 *
 *   node scripts/migrate-trial-report.cjs
 */

require('dotenv/config');
const { Client } = require('pg');

const STATEMENTS = [
  // What the teacher covered during the session.
  `ALTER TABLE "LeadTrial" ADD COLUMN IF NOT EXISTS "coveredIntro" BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE "LeadTrial" ADD COLUMN IF NOT EXISTS "coveredPresentation" BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE "LeadTrial" ADD COLUMN IF NOT EXISTS "coveredDemoLesson" BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE "LeadTrial" ADD COLUMN IF NOT EXISTS "coveredPackages" BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE "LeadTrial" ADD COLUMN IF NOT EXISTS "verifiedDetails" BOOLEAN NOT NULL DEFAULT false`,

  // Details collected from the family.
  `ALTER TABLE "LeadTrial" ADD COLUMN IF NOT EXISTS "studentAge" INTEGER`,
  `ALTER TABLE "LeadTrial" ADD COLUMN IF NOT EXISTS "studentDob" TIMESTAMP(3)`,
  `ALTER TABLE "LeadTrial" ADD COLUMN IF NOT EXISTS "guardianName" TEXT`,
  `ALTER TABLE "LeadTrial" ADD COLUMN IF NOT EXISTS "guardianRelation" TEXT`,
  `ALTER TABLE "LeadTrial" ADD COLUMN IF NOT EXISTS "guardianPhone" TEXT`,
  `ALTER TABLE "LeadTrial" ADD COLUMN IF NOT EXISTS "guardianEmail" TEXT`,
  `ALTER TABLE "LeadTrial" ADD COLUMN IF NOT EXISTS "preferredPackage" TEXT`,
  `ALTER TABLE "LeadTrial" ADD COLUMN IF NOT EXISTS "preferredDays" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]`,
  `ALTER TABLE "LeadTrial" ADD COLUMN IF NOT EXISTS "preferredTime" TEXT`,
  `ALTER TABLE "LeadTrial" ADD COLUMN IF NOT EXISTS "preferredStartDate" TIMESTAMP(3)`,

  // Assessment and recommendation.
  `ALTER TABLE "LeadTrial" ADD COLUMN IF NOT EXISTS "assessedLevel" TEXT`,
  `ALTER TABLE "LeadTrial" ADD COLUMN IF NOT EXISTS "recommendedCourseId" TEXT`,
  `ALTER TABLE "LeadTrial" ADD COLUMN IF NOT EXISTS "recommendedCourse" TEXT`,
  `ALTER TABLE "LeadTrial" ADD COLUMN IF NOT EXISTS "reportNotes" TEXT`,
  `ALTER TABLE "LeadTrial" ADD COLUMN IF NOT EXISTS "reportSubmittedAt" TIMESTAMP(3)`,

  // The coach's queue is "which trials are still waiting on a report".
  `CREATE INDEX IF NOT EXISTS "LeadTrial_reportSubmittedAt_idx" ON "LeadTrial" ("reportSubmittedAt")`,
];

const EXPECTED = [
  'coveredIntro', 'coveredPresentation', 'coveredDemoLesson', 'coveredPackages',
  'verifiedDetails', 'studentAge', 'studentDob', 'guardianName', 'guardianRelation',
  'guardianPhone', 'guardianEmail', 'preferredPackage', 'preferredDays',
  'preferredTime', 'preferredStartDate', 'assessedLevel', 'recommendedCourseId',
  'recommendedCourse', 'reportNotes', 'reportSubmittedAt',
];

(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    for (const sql of STATEMENTS) {
      await client.query(sql);
    }

    const { rows } = await client.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'LeadTrial' AND column_name = ANY($1::text[])`,
      [EXPECTED],
    );

    console.log(`LeadTrial report columns: ${rows.length}/${EXPECTED.length}`);

    const missing = EXPECTED.filter((c) => !rows.some((r) => r.column_name === c));
    if (missing.length) {
      console.error(`Missing after migration: ${missing.join(', ')}`);
      process.exit(1);
    }
    console.log('Trial report migration applied.');
  } finally {
    await client.end();
  }
})().catch((e) => {
  console.error('Migration failed:', e);
  process.exit(1);
});
