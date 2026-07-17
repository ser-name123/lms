/* Round-2 assignment migration: file-type/size config + plagiarism similarity. */
require('dotenv/config');
const { Client } = require('pg');

const DDL = `
ALTER TABLE "Assignment" ADD COLUMN IF NOT EXISTS "allowedFileTypes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Assignment" ADD COLUMN IF NOT EXISTS "maxFileSizeMb" INTEGER;
ALTER TABLE "Submission" ADD COLUMN IF NOT EXISTS "similarityPct" INTEGER;
`;

(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL || process.env.DIRECT_URL });
  await client.connect();
  try {
    await client.query(DDL);
    const a = (await client.query(`SELECT count(*)::int n FROM information_schema.columns WHERE table_name='Assignment' AND column_name = ANY($1)`, [['allowedFileTypes', 'maxFileSizeMb']])).rows[0].n;
    const s = (await client.query(`SELECT count(*)::int n FROM information_schema.columns WHERE table_name='Submission' AND column_name='similarityPct'`)).rows[0].n;
    console.log(`OK: Assignment +${a}/2, Submission +${s}/1`);
  } finally { await client.end(); }
})().catch((e) => { console.error('Migration failed:', e.message); process.exit(1); });
