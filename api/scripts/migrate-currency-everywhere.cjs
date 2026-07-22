/*
 * The rest of the money, in the currency it is actually in.
 *
 * Packages already carry three prices. Two places still assumed one:
 *
 *  - A fee plan held ONE amount per component plus a `currency` on the plan.
 *    So a family in Dubai was invoiced in dirhams on enrolment and in dollars
 *    every cycle after — the same package, two currencies, two amounts. The
 *    component now carries all three and the plan's own currency is dropped:
 *    an invoice is raised in the currency the student is billed in.
 *
 *  - A payout named no currency at all, so a teacher's payslip was read as
 *    dollars wherever it was shown.
 *
 * Existing amounts move to the USD column and no rate is invented for the
 * other two — the academy types those in, as it does for packages.
 */
const { Client } = require('pg');
require('dotenv').config();

(async () => {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const log = (...a) => console.log('  ', ...a);

  const hasColumn = async (table, column) =>
    (
      await db.query(
        `SELECT 1 FROM information_schema.columns
          WHERE table_schema='public' AND table_name=$1 AND column_name=$2`,
        [table, column],
      )
    ).rows.length > 0;

  try {
    await db.query('BEGIN');

    console.log('1. FeePlanComponent');
    if (await hasColumn('FeePlanComponent', 'amount')) {
      /*
       * A plan that was priced in something other than dollars would have its
       * figure land in the USD column, which is worse than leaving it empty —
       * so those move to the currency the plan actually named, and USD is
       * seeded from it only when the plan was already in dollars.
       */
      await db.query(`ALTER TABLE "FeePlanComponent" RENAME COLUMN "amount" TO "amountUSD"`);
      await db.query(`ALTER TABLE "FeePlanComponent" ADD COLUMN IF NOT EXISTS "amountAED" DECIMAL(10,2)`);
      await db.query(`ALTER TABLE "FeePlanComponent" ADD COLUMN IF NOT EXISTS "amountGBP" DECIMAL(10,2)`);

      for (const [cur, col] of [['AED', 'amountAED'], ['GBP', 'amountGBP']]) {
        const moved = await db.query(
          `UPDATE "FeePlanComponent" c
              SET "${col}" = c."amountUSD", "amountUSD" = 0
             FROM "FeePlan" p
            WHERE p.id = c."planId" AND upper(p.currency) = $1`,
          [cur],
        );
        if (moved.rowCount) log(`${moved.rowCount} component(s) were in ${cur} — moved, USD left to be set`);
      }
      log('amount -> amountUSD, amountAED + amountGBP added');
    } else {
      log('already migrated');
    }

    console.log('2. FeePlan.currency retired');
    if (await hasColumn('FeePlan', 'currency')) {
      await db.query(`ALTER TABLE "FeePlan" DROP COLUMN "currency"`);
      log('dropped — the student decides the currency now');
    } else {
      log('already dropped');
    }

    console.log('3. Payout.currency');
    await db.query(
      `ALTER TABLE "Payout" ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'USD'`,
    );
    // Existing payouts keep USD: nobody can say retrospectively what a payslip
    // with no currency on it was paid in, and guessing would rewrite history.
    const aed = await db.query(
      `UPDATE "Payout" p SET currency = 'AED' FROM "User" u
        WHERE u.id = p."userId" AND upper(coalesce(u.country,'')) IN ('AE','UAE','UNITED ARAB EMIRATES')
          AND p.status = 'PENDING'`,
    );
    const gbp = await db.query(
      `UPDATE "Payout" p SET currency = 'GBP' FROM "User" u
        WHERE u.id = p."userId" AND upper(coalesce(u.country,'')) IN ('GB','UK','UNITED KINGDOM')
          AND p.status = 'PENDING'`,
    );
    log(`${aed.rowCount} unpaid payouts moved to AED, ${gbp.rowCount} to GBP; paid ones left as they were`);

    console.log('4. What still needs a human');
    const { rows: unpriced } = await db.query(
      `SELECT p.name, count(*)::int n FROM "FeePlanComponent" c
         JOIN "FeePlan" p ON p.id = c."planId"
        WHERE c."amountAED" IS NULL OR c."amountGBP" IS NULL
        GROUP BY p.name ORDER BY p.name`,
    );
    for (const r of unpriced) {
      log(`"${r.name}" has ${r.n} component(s) with no AED/GBP amount — set them on the fee plans page`);
    }
    if (!unpriced.length) log('every component is priced in all three');

    await db.query('COMMIT');
    console.log('\nDone.');
  } catch (e) {
    await db.query('ROLLBACK');
    console.error('FAILED, rolled back:', e.message);
    process.exitCode = 1;
  } finally {
    await db.end();
  }
})();
