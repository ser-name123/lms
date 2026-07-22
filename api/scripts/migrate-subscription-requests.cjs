/*
 * Subscription change requests.
 *
 * A student can ask to change their package or their class schedule; an
 * academic coach decides; an approved change is written to the next cycle and
 * only lands when the billing cycle turns.
 *
 *   node scripts/migrate-subscription-requests.cjs
 *
 * Adds:
 *   - SubscriptionRequestType / SubscriptionRequestStatus enums
 *   - SubscriptionRequest        (the request itself)
 *   - SubscriptionNextCycle      (what the subscription becomes next cycle)
 *   - Package.feePlanId          (so a package change can move the billing too)
 *
 * Idempotent: safe to re-run.
 */
require('dotenv/config');
const { Client } = require('pg');

(async () => {
  const conn = process.env.DATABASE_URL || process.env.DIRECT_URL;
  if (!conn) throw new Error('DATABASE_URL / DIRECT_URL is not set');

  const client = new Client({ connectionString: conn });
  await client.connect();

  const run = async (label, sql) => {
    await client.query(sql);
    console.log(`  ok  ${label}`);
  };

  try {
    await client.query('BEGIN');

    // Enum creation is not IF NOT EXISTS in older servers; guard on pg_type.
    await run(
      'SubscriptionRequestType enum',
      `DO $$ BEGIN
         IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SubscriptionRequestType') THEN
           CREATE TYPE "SubscriptionRequestType" AS ENUM ('PACKAGE_CHANGE', 'SCHEDULE_CHANGE');
         END IF;
       END $$;`,
    );

    await run(
      'SubscriptionRequestStatus enum',
      `DO $$ BEGIN
         IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SubscriptionRequestStatus') THEN
           CREATE TYPE "SubscriptionRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'APPLIED');
         END IF;
       END $$;`,
    );

    await run(
      'Package.feePlanId',
      `ALTER TABLE "Package"
         ADD COLUMN IF NOT EXISTS "feePlanId" TEXT`,
    );
    await run(
      'Package.feePlanId FK',
      `DO $$ BEGIN
         IF NOT EXISTS (
           SELECT 1 FROM pg_constraint WHERE conname = 'Package_feePlanId_fkey'
         ) THEN
           ALTER TABLE "Package"
             ADD CONSTRAINT "Package_feePlanId_fkey"
             FOREIGN KEY ("feePlanId") REFERENCES "FeePlan"(id)
             ON DELETE SET NULL ON UPDATE CASCADE;
         END IF;
       END $$;`,
    );
    await run(
      'Package.feePlanId index',
      `CREATE INDEX IF NOT EXISTS "Package_feePlanId_idx" ON "Package"("feePlanId")`,
    );

    await run(
      'SubscriptionRequest table',
      `CREATE TABLE IF NOT EXISTS "SubscriptionRequest" (
         "id"                 TEXT PRIMARY KEY,
         "studentId"          TEXT NOT NULL,
         "type"               "SubscriptionRequestType" NOT NULL,
         "status"             "SubscriptionRequestStatus" NOT NULL DEFAULT 'PENDING',
         "reason"             TEXT,
         "requestedPackageId" TEXT,
         "requestedDays"      TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
         "requestedTime"      TEXT,
         "requestedStartDate" TIMESTAMP(3),
         "batchId"            TEXT,
         "targetBatchId"      TEXT,
         "fromLabel"          TEXT,
         "toLabel"            TEXT,
         "decidedById"        TEXT,
         "decidedByName"      TEXT,
         "decidedAt"          TIMESTAMP(3),
         "reviewNotes"        TEXT,
         "appliedAt"          TIMESTAMP(3),
         "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
         "updatedAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
       )`,
    );

    await run(
      'SubscriptionRequest FKs',
      `DO $$ BEGIN
         IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SubscriptionRequest_studentId_fkey') THEN
           ALTER TABLE "SubscriptionRequest"
             ADD CONSTRAINT "SubscriptionRequest_studentId_fkey"
             FOREIGN KEY ("studentId") REFERENCES "StudentProfile"(id)
             ON DELETE CASCADE ON UPDATE CASCADE;
         END IF;
         IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SubscriptionRequest_requestedPackageId_fkey') THEN
           ALTER TABLE "SubscriptionRequest"
             ADD CONSTRAINT "SubscriptionRequest_requestedPackageId_fkey"
             FOREIGN KEY ("requestedPackageId") REFERENCES "Package"(id)
             ON DELETE SET NULL ON UPDATE CASCADE;
         END IF;
       END $$;`,
    );

    await run(
      'SubscriptionRequest indexes',
      `CREATE INDEX IF NOT EXISTS "SubscriptionRequest_studentId_status_idx"
         ON "SubscriptionRequest"("studentId", "status");
       CREATE INDEX IF NOT EXISTS "SubscriptionRequest_status_idx"
         ON "SubscriptionRequest"("status");
       CREATE INDEX IF NOT EXISTS "SubscriptionRequest_requestedPackageId_idx"
         ON "SubscriptionRequest"("requestedPackageId");`,
    );

    await run(
      'SubscriptionNextCycle table',
      `CREATE TABLE IF NOT EXISTS "SubscriptionNextCycle" (
         "id"            TEXT PRIMARY KEY,
         "studentId"     TEXT NOT NULL UNIQUE,
         "nextPackageId" TEXT,
         "nextDays"      TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
         "nextTime"      TEXT,
         "nextStartDate" TIMESTAMP(3),
         "nextBatchId"   TEXT,
         "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
       )`,
    );

    await run(
      'SubscriptionNextCycle FKs',
      `DO $$ BEGIN
         IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SubscriptionNextCycle_studentId_fkey') THEN
           ALTER TABLE "SubscriptionNextCycle"
             ADD CONSTRAINT "SubscriptionNextCycle_studentId_fkey"
             FOREIGN KEY ("studentId") REFERENCES "StudentProfile"(id)
             ON DELETE CASCADE ON UPDATE CASCADE;
         END IF;
         IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SubscriptionNextCycle_nextPackageId_fkey') THEN
           ALTER TABLE "SubscriptionNextCycle"
             ADD CONSTRAINT "SubscriptionNextCycle_nextPackageId_fkey"
             FOREIGN KEY ("nextPackageId") REFERENCES "Package"(id)
             ON DELETE SET NULL ON UPDATE CASCADE;
         END IF;
       END $$;`,
    );

    await run(
      'SubscriptionNextCycle index',
      `CREATE INDEX IF NOT EXISTS "SubscriptionNextCycle_nextPackageId_idx"
         ON "SubscriptionNextCycle"("nextPackageId")`,
    );

    await client.query('COMMIT');
    console.log('\nSubscription requests migration complete.');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    await client.end();
  }
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
