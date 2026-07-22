/*
 * Three currencies per package, entered rather than converted.
 *
 * The single `price` column becomes `priceUSD` — renamed, not copied, so a
 * package still holds exactly one number per currency and there is nothing to
 * keep in step. AED and GBP start empty: nobody has typed them yet, and
 * inventing them from an exchange rate would quote a family a figure the
 * academy never agreed to.
 *
 * Students get a billing currency, backfilled from the country on their
 * account. It is stored rather than resolved per request so a family opening
 * the site abroad is not re-quoted.
 */
const { Client } = require('pg');
require('dotenv').config();

// UAE -> AED, UK -> GBP, everywhere else -> USD. Held as ISO codes and the
// country names this database actually stores, since both appear.
const AED = ['AE', 'United Arab Emirates', 'UAE'];
const GBP = ['GB', 'UK', 'United Kingdom'];

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

    console.log('1. Package');
    if (await hasColumn('Package', 'price')) {
      await db.query(`ALTER TABLE "Package" RENAME COLUMN "price" TO "priceUSD"`);
      log('price -> priceUSD');
    } else {
      log('already renamed');
    }
    await db.query(`ALTER TABLE "Package" ADD COLUMN IF NOT EXISTS "priceAED" DECIMAL(10,2)`);
    await db.query(`ALTER TABLE "Package" ADD COLUMN IF NOT EXISTS "priceGBP" DECIMAL(10,2)`);
    log('priceAED, priceGBP added (empty — nobody has set them)');

    console.log('2. LmsPackage');
    if (await hasColumn('LmsPackage', 'price')) {
      await db.query(`ALTER TABLE "LmsPackage" RENAME COLUMN "price" TO "priceUSD"`);
      log('price -> priceUSD');
    } else {
      log('already renamed');
    }
    await db.query(`ALTER TABLE "LmsPackage" ADD COLUMN IF NOT EXISTS "priceAED" DOUBLE PRECISION`);
    await db.query(`ALTER TABLE "LmsPackage" ADD COLUMN IF NOT EXISTS "priceGBP" DOUBLE PRECISION`);
    log('priceAED, priceGBP added');

    console.log('3. StudentProfile.billingCurrency');
    await db.query(
      `ALTER TABLE "StudentProfile"
         ADD COLUMN IF NOT EXISTS "billingCurrency" TEXT NOT NULL DEFAULT 'USD'`,
    );
    const aed = await db.query(
      `UPDATE "StudentProfile" sp SET "billingCurrency" = 'AED'
         FROM "User" u WHERE u.id = sp."userId" AND u.country = ANY($1)`,
      [AED],
    );
    const gbp = await db.query(
      `UPDATE "StudentProfile" sp SET "billingCurrency" = 'GBP'
         FROM "User" u WHERE u.id = sp."userId" AND u.country = ANY($1)`,
      [GBP],
    );
    log(`${aed.rowCount} on AED, ${gbp.rowCount} on GBP, the rest USD`);

    console.log('4. What still needs a human');
    const { rows: unpriced } = await db.query(
      `SELECT name, "priceUSD" FROM "Package"
        WHERE "priceAED" IS NULL OR "priceGBP" IS NULL ORDER BY name`,
    );
    for (const p of unpriced) {
      log(`"${p.name}" has no AED/GBP price — set them on the packages page`);
    }
    if (!unpriced.length) log('every package is priced in all three');

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
