/*
 * TeacherRegistration.teacherProfileId had no foreign key, so deleting a
 * teacher left the application row pointing at a profile that no longer
 * existed — and still reporting status ACTIVATED. The Activated tab counted
 * those ghosts, so it disagreed with All Teachers.
 *
 * This backfills the dangling links to NULL and then adds the real FK with
 * ON DELETE SET NULL, so the database drops the link by itself from now on
 * and no service method can forget to.
 *
 *   node scripts/migrate-teacher-reg-link.cjs
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

  try {
    await client.query('BEGIN');

    // Show what is about to be archived, so the run is auditable rather than
    // a silent data change.
    const { rows: orphans } = await client.query(`
      SELECT r.id, r.email, r.status, r."approvedTeacherCode"
      FROM "TeacherRegistration" r
      WHERE r."teacherProfileId" IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM "TeacherProfile" tp WHERE tp.id = r."teacherProfileId"
        )
    `);
    if (orphans.length) {
      console.log(`Dangling links found: ${orphans.length}`);
      for (const o of orphans) {
        console.log(`  ${o.email} (${o.approvedTeacherCode}) — ${o.status}`);
      }
    } else {
      console.log('No dangling links.');
    }

    const cleared = await client.query(`
      UPDATE "TeacherRegistration" r
      SET "teacherProfileId" = NULL
      WHERE r."teacherProfileId" IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM "TeacherProfile" tp WHERE tp.id = r."teacherProfileId"
        )
    `);
    console.log(`Cleared ${cleared.rowCount} link(s).`);

    // The FK cannot be added while any dangling value survives, so this must
    // come after the backfill.
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'TeacherRegistration_teacherProfileId_fkey'
        ) THEN
          ALTER TABLE "TeacherRegistration"
            ADD CONSTRAINT "TeacherRegistration_teacherProfileId_fkey"
            FOREIGN KEY ("teacherProfileId") REFERENCES "TeacherProfile"(id)
            ON DELETE SET NULL ON UPDATE CASCADE;
        END IF;
      END $$;
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS "TeacherRegistration_teacherProfileId_idx"
        ON "TeacherRegistration"("teacherProfileId")
    `);

    await client.query('COMMIT');
    console.log('FK + index in place.');
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
