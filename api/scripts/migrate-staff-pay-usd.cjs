/*
 * Staff are paid in USD, wherever they live.
 *
 * Payroll used to stamp each payout with `currencyForCountry(employee.country)`,
 * so a teacher in Dubai got a row labelled AED. Nothing was ever converted — the
 * amount is computed from `User.salary`, `TeacherProfile.hourlyRate` and the
 * PayrollConfig rates, all of which are dollars — so the stamp relabelled the
 * figure and nothing more. Meanwhile every screen that showed it printed a "$",
 * and the admin payslip printed a literal "USD": one row, two answers.
 *
 * This corrects the label. It is safe precisely BECAUSE no conversion ever
 * happened; if a future version starts paying staff in local currency, that
 * needs a stored rate and a real migration, not this one.
 *
 * Idempotent: re-running finds nothing to do.
 */
const { Client } = require('pg');
require('dotenv').config();

(async () => {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  try {
    const before = await db.query(
      `SELECT currency, count(*)::int AS n FROM "Payout" GROUP BY currency ORDER BY n DESC`,
    );
    console.log('Payouts by currency, before:');
    if (!before.rows.length) console.log('   (no payouts yet)');
    for (const r of before.rows) console.log(`   ${r.currency ?? 'NULL'}: ${r.n}`);

    const fixed = await db.query(
      `UPDATE "Payout" SET currency = 'USD'
        WHERE currency IS DISTINCT FROM 'USD'`,
    );
    console.log(`\nRelabelled ${fixed.rowCount} payout(s) to USD.`);

    // The column default backs the policy up for any writer that forgets.
    await db.query(`ALTER TABLE "Payout" ALTER COLUMN currency SET DEFAULT 'USD'`);
    await db.query(`ALTER TABLE "Payout" ALTER COLUMN currency SET NOT NULL`);
    console.log("Payout.currency: default 'USD', NOT NULL.");
  } catch (e) {
    console.error('FAILED:', e.message);
    process.exitCode = 1;
  } finally {
    await db.end();
  }
})();
