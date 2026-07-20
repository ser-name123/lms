/*
 * Trial booking form rework.
 *
 * Adds the fields the new /get-started form collects (one concrete date + a
 * 30-minute slot chosen from merged teacher availability, siblings on the same
 * booking, dial code, source) and the Zoom ids a trial needs so its meeting can
 * be updated or deleted later.
 *
 * Raw SQL over the pooler because DIRECT_URL (5432) is unreachable from here,
 * so `prisma migrate` cannot run. Every statement is idempotent — re-running is
 * safe and is how this gets applied to each environment.
 *
 *   node scripts/migrate-trial-form.cjs
 */

require('dotenv/config');
const { Client } = require('pg');

const STATEMENTS = [
  // ── Lead: the new form's fields ──────────────────────────────────────────
  `ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "preferredDate" TIMESTAMP(3)`,
  `ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "preferredSlot" TEXT`,
  `ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "preferredSlotTz" TEXT`,
  `ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "sessionFor" TEXT`,
  `ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "howFound" TEXT`,
  `ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "countryCode" TEXT`,
  `ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "siblings" JSONB`,
  `ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "convertedStudents" JSONB`,

  // ── LeadTrial: Zoom identifiers ──────────────────────────────────────────
  `ALTER TABLE "LeadTrial" ADD COLUMN IF NOT EXISTS "meetingId" TEXT`,
  `ALTER TABLE "LeadTrial" ADD COLUMN IF NOT EXISTS "meetingHostUrl" TEXT`,

  // Leads are listed and filtered by the date the visitor picked.
  `CREATE INDEX IF NOT EXISTS "Lead_preferredDate_idx" ON "Lead" ("preferredDate")`,
];

const EXPECTED_LEAD_COLUMNS = [
  'preferredDate', 'preferredSlot', 'preferredSlotTz', 'sessionFor',
  'howFound', 'countryCode', 'siblings', 'convertedStudents',
];
const EXPECTED_TRIAL_COLUMNS = ['meetingId', 'meetingHostUrl'];

(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    for (const sql of STATEMENTS) {
      await client.query(sql);
    }

    const { rows: leadCols } = await client.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'Lead' AND column_name = ANY($1::text[])`,
      [EXPECTED_LEAD_COLUMNS],
    );
    const { rows: trialCols } = await client.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'LeadTrial' AND column_name = ANY($1::text[])`,
      [EXPECTED_TRIAL_COLUMNS],
    );

    console.log(
      `Lead columns: ${leadCols.length}/${EXPECTED_LEAD_COLUMNS.length} · ` +
        `LeadTrial columns: ${trialCols.length}/${EXPECTED_TRIAL_COLUMNS.length}`,
    );

    const missing = [
      ...EXPECTED_LEAD_COLUMNS.filter((c) => !leadCols.some((r) => r.column_name === c))
        .map((c) => `Lead.${c}`),
      ...EXPECTED_TRIAL_COLUMNS.filter((c) => !trialCols.some((r) => r.column_name === c))
        .map((c) => `LeadTrial.${c}`),
    ];
    if (missing.length) {
      console.error(`Missing after migration: ${missing.join(', ')}`);
      process.exit(1);
    }
    console.log('Trial form migration applied.');
  } finally {
    await client.end();
  }
})().catch((e) => {
  console.error('Migration failed:', e);
  process.exit(1);
});
