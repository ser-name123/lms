/*
 * Schema for taking money with Stripe.
 *
 *  - StudentProfile.stripeCustomerId — the family's Stripe customer, so a
 *    returning family is not asked for their card again and refunds land on one
 *    customer rather than a new one per invoice.
 *
 *  - StripeWebhookEvent — every event we have handled, keyed by Stripe's own
 *    event id. Stripe redelivers on a timeout, a non-2xx or a manual retry, and
 *    two deliveries of one payment_intent.succeeded would record the payment
 *    twice. The primary key IS the lock: a duplicate fails the insert and is
 *    answered 200 without touching the invoice.
 *
 * Idempotent — safe to re-run.
 */
const { Client } = require('pg');
require('dotenv').config();

(async () => {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const log = (...a) => console.log('  ', ...a);

  try {
    await db.query('BEGIN');

    await db.query(`
      ALTER TABLE "StudentProfile"
        ADD COLUMN IF NOT EXISTS "stripeCustomerId" TEXT
    `);
    // Unique, but many families have none yet — Postgres allows repeated NULLs
    // in a unique index, so this does not force one blank customer per family.
    await db.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "StudentProfile_stripeCustomerId_key"
        ON "StudentProfile" ("stripeCustomerId")
    `);
    log('StudentProfile.stripeCustomerId ready');

    await db.query(`
      CREATE TABLE IF NOT EXISTS "StripeWebhookEvent" (
        "id"          TEXT PRIMARY KEY,
        "type"        TEXT NOT NULL,
        "payload"     JSONB NOT NULL,
        "handled"     BOOLEAN NOT NULL DEFAULT false,
        "error"       TEXT,
        "invoiceId"   TEXT,
        "receivedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "processedAt" TIMESTAMP(3)
      )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS "StripeWebhookEvent_type_idx" ON "StripeWebhookEvent" ("type")`);
    await db.query(`CREATE INDEX IF NOT EXISTS "StripeWebhookEvent_handled_idx" ON "StripeWebhookEvent" ("handled")`);
    log('StripeWebhookEvent ready');

    await db.query('COMMIT');
    console.log('\nStripe schema migration complete.');
  } catch (e) {
    await db.query('ROLLBACK').catch(() => undefined);
    console.error('FAILED:', e.message);
    process.exitCode = 1;
  } finally {
    await db.end();
  }
})();
