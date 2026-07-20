/*
 * Missing-information form for a trial.
 *
 * Families frequently will not commit to a package, days, a time or a start
 * date while the trial is running. The coach sends them a link afterwards and
 * their answers update the trial row directly.
 *
 * Only the SHA-256 of the token is stored, so a leaked database does not hand
 * out working links. The unique index on the hash is what the lookup uses.
 *
 * Raw SQL over the pooler because DIRECT_URL (5432) is unreachable from here.
 * Every statement is idempotent — re-running is safe.
 *
 *   node scripts/migrate-trial-info-form.cjs
 */

require('dotenv/config');
const { Client } = require('pg');

const STATEMENTS = [
  `ALTER TABLE "LeadTrial" ADD COLUMN IF NOT EXISTS "infoTokenHash" TEXT`,
  `ALTER TABLE "LeadTrial" ADD COLUMN IF NOT EXISTS "infoTokenExpiresAt" TIMESTAMP(3)`,
  `ALTER TABLE "LeadTrial" ADD COLUMN IF NOT EXISTS "infoRequestedAt" TIMESTAMP(3)`,
  `ALTER TABLE "LeadTrial" ADD COLUMN IF NOT EXISTS "infoRequestedById" TEXT`,
  `ALTER TABLE "LeadTrial" ADD COLUMN IF NOT EXISTS "infoSubmittedAt" TIMESTAMP(3)`,

  // The public form looks a trial up by this and nothing else, so it has to be
  // both indexed and unique — two trials sharing a token would be a disaster.
  `CREATE UNIQUE INDEX IF NOT EXISTS "LeadTrial_infoTokenHash_key" ON "LeadTrial" ("infoTokenHash")`,
];

const EXPECTED = [
  'infoTokenHash', 'infoTokenExpiresAt', 'infoRequestedAt',
  'infoRequestedById', 'infoSubmittedAt',
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
    const { rows: idx } = await client.query(
      `SELECT indexname FROM pg_indexes
        WHERE tablename = 'LeadTrial' AND indexname = 'LeadTrial_infoTokenHash_key'`,
    );

    console.log(`LeadTrial info-form columns: ${rows.length}/${EXPECTED.length} · unique index: ${idx.length}/1`);

    const missing = EXPECTED.filter((c) => !rows.some((r) => r.column_name === c));
    if (missing.length || idx.length !== 1) {
      console.error(
        `Missing after migration: ${[...missing, ...(idx.length ? [] : ['unique index'])].join(', ')}`,
      );
      process.exit(1);
    }
    console.log('Trial info-form migration applied.');
  } finally {
    await client.end();
  }
})().catch((e) => {
  console.error('Migration failed:', e);
  process.exit(1);
});
