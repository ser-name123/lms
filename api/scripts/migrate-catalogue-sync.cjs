/*
 * Joins the flat admin catalogues to the relational tables the rest of the
 * system actually runs on.
 *
 * Until now an admin creating a course got an LmsCourse row and nothing else,
 * while every enrolment, batch, class session, assignment and subscription
 * points at `Course`. The two lists never met: a course created in the admin
 * panel could not be assigned to anybody, and the course students were really
 * enrolled in did not appear in the admin panel.
 *
 * This adds the columns a Course needs, then reconciles both directions —
 * every LmsCourse gets a Course, and every Course that predates the catalogue
 * gets an LmsCourse — so neither list is missing a row the other has.
 */
const { Client } = require('pg');
require('dotenv').config();

const slugify = (s) =>
  String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'course';

// The catalogue's words for a state, and the enum's.
const TO_ENUM = { Active: 'PUBLISHED', Draft: 'DRAFT', Archived: 'ARCHIVED' };
const FROM_ENUM = { PUBLISHED: 'Active', DRAFT: 'Draft', ARCHIVED: 'Archived' };

(async () => {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const log = (...a) => console.log('  ', ...a);

  try {
    await db.query('BEGIN');

    console.log('1. Columns');
    await db.query(`ALTER TABLE "LmsCourse"  ADD COLUMN IF NOT EXISTS "price"         DOUBLE PRECISION`);
    await db.query(`ALTER TABLE "LmsCourse"  ADD COLUMN IF NOT EXISTS "durationWeeks" INTEGER`);
    await db.query(`ALTER TABLE "LmsPackage" ADD COLUMN IF NOT EXISTS "feePlanId"     TEXT`);
    log('LmsCourse.price, LmsCourse.durationWeeks, LmsPackage.feePlanId');

    console.log('2. LmsCourse -> Course');
    const { rows: cats } = await db.query(
      `SELECT c.id, c.code, c.title, c.description, c.status, c.price, c."durationWeeks"
         FROM "LmsCourse" c
    LEFT JOIN "Course" rc ON rc.id = c.id
        WHERE rc.id IS NULL`,
    );
    for (const c of cats) {
      /*
       * The slug is unique and the code may already be taken by a Course that
       * arrived some other way, so fall back to the id rather than failing the
       * whole migration over a name collision.
       */
      let slug = slugify(c.code);
      const { rows: clash } = await db.query(`SELECT 1 FROM "Course" WHERE slug = $1`, [slug]);
      if (clash.length) slug = `${slug}-${c.id.slice(0, 8)}`;
      await db.query(
        `INSERT INTO "Course" (id, title, slug, description, price, "durationWeeks", status, "createdAt", "updatedAt")
         VALUES ($1,$2,$3,$4,$5,$6,$7::"CourseStatus", now(), now())`,
        [c.id, c.title, slug, c.description, c.price ?? 0, c.durationWeeks ?? 12, TO_ENUM[c.status] ?? 'DRAFT'],
      );
      log(`created Course "${c.title}" (${slug})`);
    }
    if (!cats.length) log('nothing to create');

    console.log('3. Course -> LmsCourse');
    const { rows: orphans } = await db.query(
      `SELECT rc.id, rc.title, rc.slug, rc.description, rc.status, rc.price, rc."durationWeeks"
         FROM "Course" rc
    LEFT JOIN "LmsCourse" c ON c.id = rc.id
        WHERE c.id IS NULL`,
    );
    for (const rc of orphans) {
      let code = rc.slug.toUpperCase().slice(0, 20);
      const { rows: clash } = await db.query(`SELECT 1 FROM "LmsCourse" WHERE code = $1`, [code]);
      if (clash.length) code = `${code}-${rc.id.slice(0, 4)}`.toUpperCase();
      await db.query(
        `INSERT INTO "LmsCourse"
           (id, code, title, category, level, "studentsCount", "teachersCount", status, "createdAt", description, price, "durationWeeks")
         VALUES ($1,$2,$3,'General','All Levels',0,0,$4,to_char(now(),'YYYY-MM-DD'),$5,$6,$7)`,
        [rc.id, code, rc.title, FROM_ENUM[rc.status] ?? 'Draft', rc.description ?? '', Number(rc.price) || 0, rc.durationWeeks],
      );
      log(`catalogued "${rc.title}" as ${code}`);
    }
    if (!orphans.length) log('nothing to catalogue');

    console.log('4. LmsPackage.feePlanId <- Package.feePlanId');
    const r = await db.query(
      `UPDATE "LmsPackage" lp SET "feePlanId" = p."feePlanId"
         FROM "Package" p
        WHERE p.id = lp.id AND p."feePlanId" IS NOT NULL AND lp."feePlanId" IS NULL`,
    );
    log(`${r.rowCount} carried over`);

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
