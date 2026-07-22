/*
 * Bulk delete across the five catalogues.
 *
 * The point of these checks is not that deletion works — that is one line —
 * but that it refuses the right things. A "select all, delete" control is the
 * fastest way in the product to destroy student work, and the guards are the
 * whole feature.
 *
 *   node scripts/smoke-bulk-delete.cjs
 *
 * Needs the API on localhost:5000 and JWT_ACCESS_SECRET in .env.
 */

require('dotenv/config');
const jwt = require('jsonwebtoken');
const { Client } = require('pg');

const BASE = process.env.SMOKE_BASE || 'http://localhost:5000/api';
const SECRET = process.env.JWT_ACCESS_SECRET;
const MARKER = 'ZZ-SMOKE-BULK';

let pass = 0;
let fail = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) {
    pass += 1;
    console.log(`  ok   ${name}`);
  } else {
    fail += 1;
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const token = (userId, role, email) =>
  jwt.sign({ sub: userId, email, role }, SECRET, { expiresIn: '15m' });

async function req(method, path, auth, payload, expect = 200) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) headers.Authorization = `Bearer ${auth}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  const text = await res.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body, ok: res.status === expect };
}

(async () => {
  if (!SECRET) throw new Error('JWT_ACCESS_SECRET is not set');
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();

  const admin = (
    await db.query(
      `SELECT id, email FROM "User" WHERE role='ADMIN' AND status='ACTIVE' ORDER BY "createdAt" LIMIT 1`,
    )
  ).rows[0];
  if (!admin) throw new Error('No ACTIVE ADMIN to test with');
  const adminToken = token(admin.id, 'ADMIN', admin.email);

  const made = {
    lmsCourses: [], kb: [], packages: [], courses: [],
    assignments: [], assessments: [], users: [], profiles: [],
  };

  /*
   * A student and a teacher of our own. These used to be picked from whatever
   * the database happened to hold, so on an empty database the checks that
   * matter most — the ones stopping a bulk delete from destroying submissions
   * and results — skipped, and the run still reported everything green.
   */
  /*
   * Clear anything a previous crashed run left behind. The fixtures are built
   * before the try block, so a failure while building them skips the cleanup
   * entirely and the next run collides on the unique email.
   */
  await db.query(
    `DELETE FROM "StudentProfile" WHERE "userId" IN (SELECT id FROM "User" WHERE email LIKE $1)`,
    [`${MARKER.toLowerCase()}%`],
  );
  await db.query(`DELETE FROM "User" WHERE email LIKE $1`, [`${MARKER.toLowerCase()}%`]);

  const mkUser = async (role, email) => {
    const { rows } = await db.query(
      `INSERT INTO "User" (id,email,"passwordHash","firstName","lastName",role,status,"updatedAt")
       VALUES (gen_random_uuid(),$1,'x','Smoke',$2,$3,'ACTIVE',now()) RETURNING id, email`,
      [email, role, role],
    );
    made.users.push(rows[0].id);
    return rows[0];
  };

  const studentUser = await mkUser('STUDENT', `${MARKER.toLowerCase()}-student@example.test`);
  const student = (
    await db.query(
      `INSERT INTO "StudentProfile" (id,"studentCode","userId")
       VALUES (gen_random_uuid(),$1,$2) RETURNING id`,
      [`${MARKER}-ST`, studentUser.id],
    )
  ).rows[0];
  made.profiles.push(student.id);

  const teacherUser = await mkUser('TEACHER', `${MARKER.toLowerCase()}-teacher@example.test`);

  try {
    // ── The shared contract ──────────────────────────────────────────────────
    console.log('\n── Contract ──');

    const empty = await req('POST', '/lms-data/courses/bulk-delete', adminToken, { ids: [] }, 400);
    check('an empty selection is refused', empty.ok, `status ${empty.status}`);

    const tooMany = await req(
      'POST',
      '/lms-data/courses/bulk-delete',
      adminToken,
      { ids: Array.from({ length: 101 }, (_, i) => `id-${i}`) },
      400,
    );
    check('a selection larger than the ceiling is refused', tooMany.ok, `status ${tooMany.status}`);

    const missing = await req('POST', '/lms-data/courses/bulk-delete', adminToken, {
      ids: ['does-not-exist'],
    }, 201);
    check(
      'an id that does not exist is reported, not thrown',
      missing.ok && missing.body.deleted === 0 && missing.body.failed === 1,
      JSON.stringify(missing.body).slice(0, 120),
    );

    // ── Courses ──────────────────────────────────────────────────────────────
    console.log('\n── Courses ──');

    /*
     * `students` is the number typed into the old admin form, which is stored
     * and no longer believed — `enrol` is whether a real Enrollment exists.
     * The guard counts enrolments now, because the stored figure was a claim:
     * it read 20 for a course nobody was enrolled in, and blocked the delete
     * for students who did not exist.
     *
     * A relational Course is created alongside, which is what the admin panel
     * does now and what an enrolment has to point at.
     */
    const mkCourse = async (suffix, students, enrol = false) => {
      const { rows } = await db.query(
        `INSERT INTO "LmsCourse" (id,code,title,description,category,level,"studentsCount","createdAt")
         VALUES (gen_random_uuid(),$1,$2,'smoke','Quran','Beginner',$3,now()) RETURNING id`,
        [`${MARKER}-${suffix}`, `${MARKER} ${suffix}`, students],
      );
      const id = rows[0].id;
      made.lmsCourses.push(id);
      await db.query(
        `INSERT INTO "Course" (id,title,slug,price,"updatedAt")
         VALUES ($1,$2,$3,0,now())`,
        [id, `${MARKER} ${suffix}`, `${MARKER}-${suffix}`.toLowerCase()],
      );
      if (enrol) {
        await db.query(
          `INSERT INTO "Enrollment" (id,"studentId","courseId",status,"updatedAt")
           VALUES (gen_random_uuid(),$1,$2,'ACTIVE',now())`,
          [student.id, id],
        );
      }
      return id;
    };

    // The claimed count is deliberately the wrong way round: the course with
    // nobody in it claims 4, and the one with a real student claims 0.
    const freeCourse = await mkCourse('free', 4);
    const busyCourse = await mkCourse('busy', 0, true);

    const courseRes = await req('POST', '/lms-data/courses/bulk-delete', adminToken, {
      ids: [freeCourse, busyCourse],
    }, 201);
    check('an empty course is deleted', courseRes.ok && courseRes.body.deleted === 1, `${courseRes.body?.deleted}`);
    check(
      'a course with enrolled students is refused rather than orphaning them',
      courseRes.ok &&
        courseRes.body.failed === 1 &&
        /enrolled student/i.test(courseRes.body.failures[0].reason),
      courseRes.body?.failures?.[0]?.reason,
    );
    const survivor = (
      await db.query(`SELECT count(*)::int n FROM "LmsCourse" WHERE id=$1`, [busyCourse])
    ).rows[0];
    check('and it is still there afterwards', survivor.n === 1);

    /*
     * Knowledgebase material is filed under a course code, so deleting the
     * course would leave that material pointing at nothing.
     */
    const codedCourse = await mkCourse('coded', 0);
    const { rows: kbRows } = await db.query(
      `INSERT INTO "LmsKnowledgebase" (id,title,"courseCode","courseTitle",format,"sizeMB",category,description)
       VALUES (gen_random_uuid(),$1,$2,$3,'PDF',1,'Quran','smoke') RETURNING id`,
      [`${MARKER} material`, `${MARKER}-coded`, `${MARKER} coded`],
    );
    made.kb.push(kbRows[0].id);

    const codedRes = await req('POST', '/lms-data/courses/bulk-delete', adminToken, {
      ids: [codedCourse],
    }, 201);
    check(
      'a course with material filed under it is refused too',
      codedRes.ok && codedRes.body.failed === 1 && /knowledgebase/i.test(codedRes.body.failures[0].reason),
      codedRes.body?.failures?.[0]?.reason,
    );

    // ── Knowledgebase ────────────────────────────────────────────────────────
    console.log('\n── Knowledgebase ──');
    const kbRes = await req('POST', '/lms-data/knowledgebase/bulk-delete', adminToken, {
      ids: [kbRows[0].id],
    }, 201);
    check('a knowledgebase item is deleted', kbRes.ok && kbRes.body.deleted === 1, `${kbRes.body?.deleted}`);
    check(
      'and the result names it rather than returning a bare count',
      kbRes.ok && kbRes.body.deletedItems[0].label === `${MARKER} material`,
      kbRes.body?.deletedItems?.[0]?.label,
    );

    // The course it was blocking can now go.
    const nowFree = await req('POST', '/lms-data/courses/bulk-delete', adminToken, {
      ids: [codedCourse],
    }, 201);
    check(
      'clearing the material unblocks its course',
      nowFree.ok && nowFree.body.deleted === 1,
      JSON.stringify(nowFree.body?.failures ?? []).slice(0, 120),
    );

    // ── Packages ─────────────────────────────────────────────────────────────
    console.log('\n── Packages ──');
    const mkPackage = async (suffix) => {
      const { rows } = await db.query(
        `INSERT INTO "LmsPackage" (id,title,"priceUSD",billing,level,description)
         VALUES (gen_random_uuid(),$1,50,'MONTHLY','All Levels','smoke') RETURNING id`,
        [`${MARKER} ${suffix}`],
      );
      made.packages.push(rows[0].id);
      return rows[0].id;
    };
    const freePkg = await mkPackage('pkg-free');
    const pkgRes = await req('POST', '/lms-data/packages/bulk-delete', adminToken, { ids: [freePkg] }, 201);
    check('an unused package is deleted', pkgRes.ok && pkgRes.body.deleted === 1, `${pkgRes.body?.deleted}`);

    // ── Assignments: student work is not collateral ──────────────────────────
    console.log('\n── Assignments ──');
    const course = (
      await db.query(
        `INSERT INTO "Course" (id,title,slug,price,"durationWeeks",status,"updatedAt")
         VALUES (gen_random_uuid(),$1,$2,0,4,'PUBLISHED',now()) RETURNING id`,
        [`${MARKER} course`, `${MARKER.toLowerCase()}-course`],
      )
    ).rows[0];
    made.courses.push(course.id);

    const mkAssignment = async (suffix) => {
      const { rows } = await db.query(
        `INSERT INTO "Assignment" (id,title,"courseId","updatedAt")
         VALUES (gen_random_uuid(),$1,$2,now()) RETURNING id`,
        [`${MARKER} ${suffix}`, course.id],
      );
      made.assignments.push(rows[0].id);
      return rows[0].id;
    };
    const cleanAssignment = await mkAssignment('a-clean');
    const workedAssignment = await mkAssignment('a-worked');

    {
      await db.query(
        `INSERT INTO "Submission" (id,"assignmentId","studentId")
         VALUES (gen_random_uuid(),$1,$2)`,
        [workedAssignment, student.id],
      );

      const aRes = await req('POST', '/assignments/bulk-delete', adminToken, {
        ids: [cleanAssignment, workedAssignment],
      }, 201);
      check('an assignment nobody has submitted to is deleted', aRes.ok && aRes.body.deleted === 1, `${aRes.body?.deleted}`);
      check(
        'an assignment holding student work is refused, not quietly destroyed',
        aRes.ok && aRes.body.failed === 1 && /submission/i.test(aRes.body.failures[0].reason),
        aRes.body?.failures?.[0]?.reason,
      );
      const work = (
        await db.query(`SELECT count(*)::int n FROM "Submission" WHERE "assignmentId"=$1`, [
          workedAssignment,
        ])
      ).rows[0];
      check('and the submission survives', work.n === 1, `${work.n} submissions`);

      /*
       * The single-delete route has to agree. A rule that holds for a
       * selection and not for one click is not a rule.
       */
      const single = await req('DELETE', `/assignments/${workedAssignment}`, adminToken, undefined, 400);
      check('deleting it one at a time is refused too', single.ok, `status ${single.status}`);
    }

    // ── Assessments: results are not collateral ──────────────────────────────
    console.log('\n── Assessments ──');
    const mkAssessment = async (suffix) => {
      const { rows } = await db.query(
        `INSERT INTO "Assessment" (id,title,"courseId","updatedAt")
         VALUES (gen_random_uuid(),$1,$2,now()) RETURNING id`,
        [`${MARKER} ${suffix}`, course.id],
      );
      made.assessments.push(rows[0].id);
      return rows[0].id;
    };
    const cleanAssessment = await mkAssessment('t-clean');
    const satAssessment = await mkAssessment('t-sat');

    {
      await db.query(
        `INSERT INTO "AssessmentAttempt" (id,"assessmentId","studentId")
         VALUES (gen_random_uuid(),$1,$2)`,
        [satAssessment, student.id],
      );

      const tRes = await req('POST', '/assessments/bulk-delete', adminToken, {
        ids: [cleanAssessment, satAssessment],
      }, 201);
      check('an assessment nobody has sat is deleted', tRes.ok && tRes.body.deleted === 1, `${tRes.body?.deleted}`);
      check(
        'an assessment students have sat is refused — those are their results',
        tRes.ok && tRes.body.failed === 1 && /attempt/i.test(tRes.body.failures[0].reason),
        tRes.body?.failures?.[0]?.reason,
      );
      const attempts = (
        await db.query(`SELECT count(*)::int n FROM "AssessmentAttempt" WHERE "assessmentId"=$1`, [
          satAssessment,
        ])
      ).rows[0];
      check('and the attempt survives', attempts.n === 1, `${attempts.n} attempts`);
    }

    // ── Who may do this ─────────────────────────────────────────────────────
    console.log('\n── Access ──');
    {
      const teacherToken = token(teacherUser.id, 'TEACHER', teacherUser.email);
      const blocked = await req(
        'POST',
        '/lms-data/courses/bulk-delete',
        teacherToken,
        { ids: [freeCourse] },
        403,
      );
      check('a teacher cannot bulk-delete the catalogue', blocked.ok, `status ${blocked.status}`);
    }

    const anonymous = await req(
      'POST',
      '/lms-data/courses/bulk-delete',
      null,
      { ids: [freeCourse] },
      401,
    );
    check('and neither can somebody signed out', anonymous.ok, `status ${anonymous.status}`);
  } finally {
    // ── Cleanup ──────────────────────────────────────────────────────────────
    console.log('\n── Cleanup ──');
    await db.query(`DELETE FROM "Submission" WHERE "assignmentId" = ANY($1::text[])`, [made.assignments]);
    await db.query(`DELETE FROM "AssessmentAttempt" WHERE "assessmentId" = ANY($1::text[])`, [made.assessments]);
    await db.query(`DELETE FROM "Assignment" WHERE id = ANY($1::text[])`, [made.assignments]);
    await db.query(`DELETE FROM "Assessment" WHERE id = ANY($1::text[])`, [made.assessments]);
    // Catalogue courses now carry a relational Course of the same id, and
    // enrolments cascade off it — so this list has to include them or the
    // student profile below cannot be deleted.
    await db.query(`DELETE FROM "Course" WHERE id = ANY($1::text[])`, [
      [...made.courses, ...made.lmsCourses],
    ]);
    await db.query(`DELETE FROM "LmsKnowledgebase" WHERE id = ANY($1::text[])`, [made.kb]);
    await db.query(`DELETE FROM "LmsPackage" WHERE id = ANY($1::text[])`, [made.packages]);
    await db.query(`DELETE FROM "LmsCourse" WHERE id = ANY($1::text[])`, [made.lmsCourses]);
    await db.query(`DELETE FROM "StudentProfile" WHERE id = ANY($1::text[])`, [made.profiles]);
    await db.query(`DELETE FROM "User" WHERE id = ANY($1::text[])`, [made.users]);

    /*
     * Counted by the marker, not by the id lists the deletes used — a check
     * that shares its predicate with the delete can only ever agree with it.
     */
    const { rows } = await db.query(
      `SELECT (SELECT count(*)::int FROM "LmsCourse" WHERE code LIKE $1) AS courses,
              (SELECT count(*)::int FROM "LmsKnowledgebase" WHERE title LIKE $1) AS kb,
              (SELECT count(*)::int FROM "LmsPackage" WHERE title LIKE $1) AS packages,
              (SELECT count(*)::int FROM "Assignment" WHERE title LIKE $1) AS assignments,
              (SELECT count(*)::int FROM "Assessment" WHERE title LIKE $1) AS assessments,
              (SELECT count(*)::int FROM "Course" WHERE title LIKE $1) AS "relCourses",
              (SELECT count(*)::int FROM "User" WHERE email LIKE $2) AS "smokeUsers"`,
      [`${MARKER}%`, `${MARKER.toLowerCase()}%`],
    );
    const r = rows[0];
    console.log(
      `Cleanup: ${r.courses} courses · ${r.kb} kb · ${r.packages} packages · ` +
        `${r.assignments} assignments · ${r.assessments} assessments · ${r.relCourses} rel-courses · ${r.smokeUsers} fixture users remaining`,
    );

    await db.end();
    console.log(`\n${pass}/${pass + fail} checks passed`);
    if (failures.length) {
      console.log('\nFailures:');
      failures.forEach((f) => console.log(`  · ${f}`));
      process.exitCode = 1;
    }
  }
})().catch((e) => {
  console.error('Smoke run failed:', e);
  process.exit(1);
});
