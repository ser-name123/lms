/*
 * Three loose ends on the subscription module.
 *
 *   node scripts/migrate-subscription-extras.cjs
 *
 * 1. LmsPackage.classesPerMonth — how many classes a package actually buys.
 *    Until now this was GUESSED from the marketing copy with a regex and a
 *    silent default of 8 (parseClassesPerMonth). That number is shown to a
 *    student, drives the "hours difference" a coach approves on, and rides
 *    along with the billing. It has to be something the academy types in, not
 *    something inferred from the word "2024" appearing in a feature list.
 *    Backfilled from the existing guess so nothing changes value today.
 *
 * 2. The st.subscription dashboard widget, so the read-only panel appears on
 *    the student's dashboard as well as its own page.
 *
 * Idempotent: safe to re-run.
 */
require('dotenv/config');
const { Client } = require('pg');

// Same rules the service used, kept here only to seed existing rows once.
function guessClasses(features = [], title = '') {
  const text = `${title} ${(features || []).join(' ')}`.toLowerCase();
  const week = text.match(/(\d+)\s*(?:classes|sessions|hours|days)?\s*(?:\/|per)\s*week/);
  if (week) {
    const v = parseInt(week[1], 10);
    if (!isNaN(v)) return v * 4;
  }
  const month = text.match(/(\d+)\s*(?:classes|sessions|hours|days)?\s*(?:\/|per)\s*month/);
  if (month) {
    const v = parseInt(month[1], 10);
    if (!isNaN(v)) return v;
  }
  const numbers = text.match(/\b\d+\b/g);
  if (numbers) {
    for (const n of numbers) {
      const v = parseInt(n, 10);
      if (v >= 4 && v <= 30) return v;
    }
  }
  return 8;
}

(async () => {
  const conn = process.env.DATABASE_URL || process.env.DIRECT_URL;
  if (!conn) throw new Error('DATABASE_URL / DIRECT_URL is not set');

  const client = new Client({ connectionString: conn });
  await client.connect();

  try {
    await client.query('BEGIN');

    await client.query(
      `ALTER TABLE "LmsPackage" ADD COLUMN IF NOT EXISTS "classesPerMonth" INTEGER`,
    );
    console.log('  ok  LmsPackage.classesPerMonth');

    // Seed from the old guess, and print each one so the values that were
    // being used silently are visible at least once.
    const { rows: pkgs } = await client.query(
      `SELECT id, title, features FROM "LmsPackage" WHERE "classesPerMonth" IS NULL`,
    );
    for (const p of pkgs) {
      const guessed = guessClasses(p.features, p.title);
      await client.query(
        `UPDATE "LmsPackage" SET "classesPerMonth" = $1 WHERE id = $2`,
        [guessed, p.id],
      );
      console.log(`      "${p.title}" → ${guessed} classes/month (from the old guess — check it)`);
    }
    if (!pkgs.length) console.log('      nothing to backfill');

    await client.query(
      `INSERT INTO "DashboardWidget" (key, title, description, category, "defaultSize", roles, "order")
       VALUES ('st.subscription', 'My subscription',
               'Package, schedule, cycle and status — read only',
               'ACADEMIC', 'LG', ARRAY['STUDENT']::text[], 15)
       ON CONFLICT (key) DO NOTHING`,
    );
    console.log('  ok  st.subscription widget');

    await client.query('COMMIT');
    console.log('\nDone.');
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
