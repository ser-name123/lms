/*
 * The course and package catalogues, and the relational rows behind them.
 *
 * The defect this suite exists for: an admin created a course, it appeared on
 * the courses page, and nowhere else. Enrolments, batches, class sessions and
 * subscriptions all point at `Course`, and nothing ever created one — so the
 * course could not be assigned to anybody, and there was no sign of that on
 * screen. Packages had the mirror but wrote it inside a try/catch that only
 * logged, so a failure produced a package nothing could reference.
 *
 * Most checks below are of the form "write through the API, then read the
 * OTHER table directly" — the two halves agreeing is the whole point.
 *
 *   node scripts/smoke-catalogue.cjs
 *
 * Needs the API on localhost:5000 and JWT_ACCESS_SECRET in .env.
 * Builds its own student, teacher, course, batch, package and fee plan.
 */

require('dotenv/config');
const jwt = require('jsonwebtoken');
const { Client } = require('pg');

const BASE = process.env.SMOKE_BASE || 'http://localhost:5000/api';
const SECRET = process.env.JWT_ACCESS_SECRET;
const MARKER = 'zz-smoke-cat';

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
  jwt.sign({ sub: userId, email, role }, SECRET, { expiresIn: '30m' });

async function req(method, path, auth, payload) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
    },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body };
}

const today = () => new Date().toISOString().slice(0, 10);

(async () => {
  if (!SECRET) throw new Error('JWT_ACCESS_SECRET is not set');
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();

  const emails = {
    coach: `${MARKER}-coach@example.test`,
    teacher: `${MARKER}-teacher@example.test`,
    student: `${MARKER}-student@example.test`,
  };

  const cleanup = async () => {
    // Batches and enrolments cascade off Course, so courses go last.
    await db.query(`DELETE FROM "Batch" WHERE name LIKE $1`, [`${MARKER}%`]);
    await db.query(`DELETE FROM "LmsKnowledgebase" WHERE title LIKE $1`, [`${MARKER}%`]);
    const { rows } = await db.query(`SELECT id FROM "User" WHERE email = ANY($1)`, [
      Object.values(emails),
    ]);
    for (const r of rows) await db.query(`DELETE FROM "User" WHERE id = $1`, [r.id]);
    await db.query(`DELETE FROM "LmsCourse" WHERE title LIKE $1`, [`${MARKER}%`]);
    await db.query(`DELETE FROM "Course" WHERE title LIKE $1`, [`${MARKER}%`]);
    await db.query(`DELETE FROM "LmsPackage" WHERE title LIKE $1`, [`${MARKER}%`]);
    await db.query(`DELETE FROM "Package" WHERE name LIKE $1`, [`${MARKER}%`]);
    await db.query(`DELETE FROM "FeePlan" WHERE name LIKE $1`, [`${MARKER}%`]);
  };

  const courseRow = (id) =>
    db.query(`SELECT * FROM "Course" WHERE id = $1`, [id]).then((r) => r.rows[0]);
  const pkgRow = (id) =>
    db.query(`SELECT * FROM "Package" WHERE id = $1`, [id]).then((r) => r.rows[0]);

  try {
    await cleanup();

    const { rows: admins } = await db.query(
      `SELECT id, email FROM "User" WHERE role = 'ADMIN' AND status = 'ACTIVE' LIMIT 1`,
    );
    if (!admins.length) throw new Error('no ACTIVE ADMIN user to authenticate as');
    const adminToken = token(admins[0].id, 'ADMIN', admins[0].email);

    // ── Fixtures ─────────────────────────────────────────────────────────────
    console.log('\nFixtures');

    const mkUser = async (email, first, last, role) => {
      const { rows } = await db.query(
        `INSERT INTO "User" (id,email,"passwordHash","firstName","lastName",role,status,"updatedAt")
         VALUES (gen_random_uuid(),$1,'x',$2,$3,$4::"Role",'ACTIVE',now()) RETURNING id`,
        [email, first, last, role],
      );
      return rows[0].id;
    };

    const coachId = await mkUser(emails.coach, 'Smoke', 'Coach', 'ACADEMIC_COACH');
    const coachToken = token(coachId, 'ACADEMIC_COACH', emails.coach);
    const teacherUserId = await mkUser(emails.teacher, 'Smoke', 'Teacher', 'TEACHER');
    const teacherToken = token(teacherUserId, 'TEACHER', emails.teacher);
    const studentUserId = await mkUser(emails.student, 'Smoke', 'Student', 'STUDENT');

    const { rows: tp } = await db.query(
      `INSERT INTO "TeacherProfile" (id,"userId","teacherCode")
       VALUES (gen_random_uuid(),$1,$2) RETURNING id`,
      [teacherUserId, `${MARKER}-T1`.slice(0, 20)],
    );
    const teacherId = tp[0].id;

    const { rows: sp } = await db.query(
      `INSERT INTO "StudentProfile" (id,"userId","studentCode")
       VALUES (gen_random_uuid(),$1,$2) RETURNING id`,
      [studentUserId, `${MARKER}-S1`.slice(0, 20)],
    );
    const studentId = sp[0].id;

    const { rows: planRows } = await db.query(
      `INSERT INTO "FeePlan" (id,name,cycle,currency,active,"updatedAt")
       VALUES (gen_random_uuid(),$1,'MONTHLY','USD',true,now()) RETURNING id`,
      [`${MARKER}-plan`],
    );
    const feePlanId = planRows[0].id;
    check('fixtures built (coach, teacher, student, fee plan)', !!coachId && !!teacherId && !!studentId && !!feePlanId);

    // ── 1. Creating a course creates the row students are enrolled in ────────
    console.log('\n1. Course create mirrors into Course');

    const created = await req('POST', '/lms-data/courses', adminToken, {
      code: `${MARKER}-C1`,
      title: `${MARKER} Tajweed`,
      category: 'General',
      level: 'Beginner',
      status: 'Active',
      description: 'Smoke course',
      price: 55.5,
      durationWeeks: 20,
      createdAt: today(),
    });
    check('POST /lms-data/courses returns 201', created.status === 201, `got ${created.status}`);
    const courseId = created.body?.id;
    check('catalogue row has an id', !!courseId);

    const rel = courseId ? await courseRow(courseId) : null;
    check('a relational Course exists with the same id', !!rel);
    check('  title carried over', rel?.title === `${MARKER} Tajweed`, rel?.title);
    check('  price carried over', Number(rel?.price) === 55.5, String(rel?.price));
    check('  durationWeeks carried over', rel?.durationWeeks === 20, String(rel?.durationWeeks));
    check('  Active became PUBLISHED', rel?.status === 'PUBLISHED', rel?.status);
    check('  slug derived from the code', rel?.slug === `${MARKER}-c1`.toLowerCase(), rel?.slug);

    // ── 2. Updating one updates the other ────────────────────────────────────
    console.log('\n2. Course update propagates');

    const updated = await req('PUT', `/lms-data/courses/${courseId}`, adminToken, {
      code: `${MARKER}-C1`,
      title: `${MARKER} Tajweed II`,
      category: 'General',
      level: 'Advanced',
      status: 'Archived',
      description: 'Smoke course edited',
      price: 70,
      durationWeeks: 24,
    });
    check('PUT returns 200', updated.status === 200, `got ${updated.status}`);
    const rel2 = await courseRow(courseId);
    check('  new title on the relational row', rel2?.title === `${MARKER} Tajweed II`, rel2?.title);
    check('  new price on the relational row', Number(rel2?.price) === 70, String(rel2?.price));
    check('  Archived became ARCHIVED', rel2?.status === 'ARCHIVED', rel2?.status);

    // Draft is the third word the catalogue uses, and it has its own enum.
    await req('PUT', `/lms-data/courses/${courseId}`, adminToken, { status: 'Draft' });
    const rel3 = await courseRow(courseId);
    check('  Draft became DRAFT', rel3?.status === 'DRAFT', rel3?.status);
    check('  a partial update leaves the title alone', rel3?.title === `${MARKER} Tajweed II`, rel3?.title);

    // ── 2b. Renaming the code takes everything filed under it along ──────────
    /*
     * Classes, assignments, assessments, material and registrations all name a
     * course by its code as plain text — no foreign key holds them. Deleting a
     * course was guarded; renaming one was not, so a rename detached all of
     * them at once. Nothing errors; the rows just stop appearing.
     */
    console.log('\n2b. Renaming the course code re-files its dependents');

    await db.query(
      `INSERT INTO "LmsKnowledgebase" (id,title,"courseCode","courseTitle",format,"sizeMB",category,description)
       VALUES (gen_random_uuid(),$1,$2,$3,'PDF',1,'Quran','smoke')`,
      [`${MARKER} material`, `${MARKER}-C1`, `${MARKER} Tajweed II`],
    );
    await db.query(
      `INSERT INTO "LmsAssessment" (id,title,"courseCode","courseTitle","questionsCount",duration,category,description)
       VALUES (gen_random_uuid(),$1,$2,$3,10,30,'Quran','smoke')`,
      [`${MARKER} quiz`, `${MARKER}-C1`, `${MARKER} Tajweed II`],
    );

    const renamed = await req('PUT', `/lms-data/courses/${courseId}`, adminToken, {
      code: `${MARKER}-C1B`,
      title: `${MARKER} Tajweed III`,
    });
    check('the rename is accepted', renamed.status === 200, `got ${renamed.status}`);

    const filedUnder = async (table) =>
      (await db.query(`SELECT "courseCode","courseTitle" FROM "${table}" WHERE title LIKE $1`, [`${MARKER}%`])).rows;

    const kb = await filedUnder('LmsKnowledgebase');
    check('material followed the new code', kb[0]?.courseCode === `${MARKER}-C1B`, kb[0]?.courseCode);
    check('  and shows the new title, not the old one', kb[0]?.courseTitle === `${MARKER} Tajweed III`, kb[0]?.courseTitle);

    const quiz = await filedUnder('LmsAssessment');
    check('an assessment followed it too', quiz[0]?.courseCode === `${MARKER}-C1B`, quiz[0]?.courseCode);

    // The relational half must not have been left behind by the rename.
    const relRenamed = await courseRow(courseId);
    check('the relational Course took the new title', relRenamed?.title === `${MARKER} Tajweed III`, relRenamed?.title);

    await db.query(`DELETE FROM "LmsKnowledgebase" WHERE title LIKE $1`, [`${MARKER}%`]);
    await db.query(`DELETE FROM "LmsAssessment" WHERE title LIKE $1`, [`${MARKER}%`]);
    // Put the code back so the duplicate-code check below still collides.
    await req('PUT', `/lms-data/courses/${courseId}`, adminToken, { code: `${MARKER}-C1` });

    // ── 3. A failed create leaves nothing behind ─────────────────────────────
    console.log('\n3. Create is all-or-nothing');

    const dupe = await req('POST', '/lms-data/courses', adminToken, {
      code: `${MARKER}-C1`, // already taken
      title: `${MARKER} Duplicate`,
      category: 'General', level: 'Beginner', status: 'Active',
      description: 'should not survive', createdAt: today(),
    });
    check('duplicate code is refused', dupe.status >= 400, `got ${dupe.status}`);
    const { rows: leftovers } = await db.query(
      `SELECT id FROM "Course" WHERE title = $1`,
      [`${MARKER} Duplicate`],
    );
    check('  no orphan Course was left behind', leftovers.length === 0, `${leftovers.length} found`);

    // ── 4. Counts come from real enrolments, not from a typed-in number ──────
    console.log('\n4. Student count is counted, not claimed');

    // Lie in the stored column the old form used to write.
    await db.query(`UPDATE "LmsCourse" SET "studentsCount" = 99 WHERE id = $1`, [courseId]);
    let list = (await req('GET', '/lms-data/courses', adminToken)).body;
    let mine = list.find((c) => c.id === courseId);
    check('a course with no enrolments reports 0, not the stored 99', mine?.studentsCount === 0, String(mine?.studentsCount));

    await db.query(
      `INSERT INTO "Enrollment" (id,"studentId","courseId",status,"updatedAt")
       VALUES (gen_random_uuid(),$1,$2,'ACTIVE',now())`,
      [studentId, courseId],
    );
    list = (await req('GET', '/lms-data/courses', adminToken)).body;
    mine = list.find((c) => c.id === courseId);
    check('one enrolment reports 1', mine?.studentsCount === 1, String(mine?.studentsCount));

    // ── 5. Delete refuses what it would silently destroy ─────────────────────
    console.log('\n5. Course delete guards');

    const delEnrolled = await req('DELETE', `/lms-data/courses/${courseId}`, adminToken);
    check('refused while a student is enrolled', delEnrolled.status === 400, `got ${delEnrolled.status}`);
    check('  and says why', String(delEnrolled.body?.message || '').includes('enrolled'), delEnrolled.body?.message);
    check('  the course is still there', !!(await courseRow(courseId)));

    // The bulk path reports per row rather than failing the request, so the
    // outcome is in the body.
    const bulk = await req('POST', '/lms-data/courses/bulk-delete', adminToken, { ids: [courseId] });
    const bulkFailed = JSON.stringify(bulk.body).includes('enrolled');
    check('bulk delete applies the same guard', bulkFailed, JSON.stringify(bulk.body).slice(0, 120));
    check('  the course survived the bulk path too', !!(await courseRow(courseId)));

    await db.query(`DELETE FROM "Enrollment" WHERE "courseId" = $1`, [courseId]);

    await db.query(
      `INSERT INTO "Batch" (id,code,name,"courseId",status,"updatedAt")
       VALUES (gen_random_uuid(),$1,$2,$3,'ACTIVE',now())`,
      [`${MARKER}-B1`.slice(0, 20), `${MARKER} batch`, courseId],
    );
    const delBatched = await req('DELETE', `/lms-data/courses/${courseId}`, adminToken);
    check('refused while a batch runs on it', delBatched.status === 400, `got ${delBatched.status}`);
    check('  and names the batches', String(delBatched.body?.message || '').includes('batch'), delBatched.body?.message);
    await db.query(`DELETE FROM "Batch" WHERE "courseId" = $1`, [courseId]);

    // ── 5b. A batch is a weekly timetable ───────────────────────────────────
    /*
     * Class generation returns 0 for a batch with no days or times — quietly,
     * since that is normal mid-setup. So an approved schedule change could
     * roll over onto a batch like this and produce no classes at all, with
     * nobody told. The form offered the fields; nothing made them stick.
     */
    console.log('\n5b. A batch cannot be created without a schedule');

    const noSchedule = await req('POST', '/attendance/batches', adminToken, {
      name: `${MARKER} scheduleless`, courseId, teacherId,
    });
    check('a batch with no weekly days is refused', noSchedule.status === 400, `got ${noSchedule.status}`);
    check('  and says what it needs', /weekly days/i.test(String(noSchedule.body?.message)), noSchedule.body?.message);

    const noTimes = await req('POST', '/attendance/batches', adminToken, {
      name: `${MARKER} timeless`, courseId, teacherId, daysOfWeek: ['Monday'],
    });
    check('days without times is refused too', noTimes.status === 400, `got ${noTimes.status}`);

    const goodBatch = await req('POST', '/attendance/batches', adminToken, {
      name: `${MARKER} proper`, courseId, teacherId,
      daysOfWeek: ['Monday', 'Wednesday'], startTime: '18:00', endTime: '19:00',
    });
    check('a batch with a full weekly pattern is created', goodBatch.status === 201, `got ${goodBatch.status}`);
    const { rows: madeBatch } = await db.query(
      `SELECT "daysOfWeek","startTime","endTime" FROM "Batch" WHERE name = $1`,
      [`${MARKER} proper`],
    );
    check('  and it stored the pattern', madeBatch[0]?.daysOfWeek?.length === 2 && madeBatch[0]?.startTime === '18:00', JSON.stringify(madeBatch[0]));
    await db.query(`DELETE FROM "Batch" WHERE name LIKE $1`, [`${MARKER}%`]);

    // ── 6. Packages: the fee plan link, and the transaction ──────────────────
    console.log('\n6. Package create carries billing');

    const pkgCreated = await req('POST', '/lms-data/packages', adminToken, {
      title: `${MARKER} 8 Hours`,
      priceUSD: 75,
      priceAED: 275,
      priceGBP: 60,
      billing: 'Monthly',
      // The feature copy says 4; the typed field says 16. The typed field wins
      // — the old code read a number out of this sentence by regex.
      classesPerMonth: 16,
      features: ['4 classes per week included'],
      level: 'All',
      courses: [],
      status: 'Active',
      description: 'Smoke package',
      feePlanId,
    });
    check('POST /lms-data/packages returns 201', pkgCreated.status === 201, `got ${pkgCreated.status}`);
    const packageId = pkgCreated.body?.id;
    const prel = packageId ? await pkgRow(packageId) : null;
    check('a relational Package exists with the same id', !!prel);
    check('  the fee plan is linked', prel?.feePlanId === feePlanId, prel?.feePlanId);
    check('  classesPerMonth is the typed 16, not the copy\'s 4', prel?.classesPerMonth === 16, String(prel?.classesPerMonth));
    check('  active mirrors the Active status', prel?.active === true);

    const badPlan = await req('POST', '/lms-data/packages', adminToken, {
      title: `${MARKER} Bogus`,
      priceUSD: 10, billing: 'Monthly', level: 'All', courses: [], features: [],
      status: 'Active', description: 'x', classesPerMonth: 4,
      feePlanId: '00000000-0000-0000-0000-000000000000',
    });
    check('a fee plan that does not exist is refused', badPlan.status === 400, `got ${badPlan.status}`);
    const { rows: pkgLeft } = await db.query(`SELECT id FROM "LmsPackage" WHERE title = $1`, [`${MARKER} Bogus`]);
    check('  and no catalogue row was left behind', pkgLeft.length === 0, `${pkgLeft.length} found`);

    check('  the AED amount is stored as typed', Number(prel?.priceAED) === 275, String(prel?.priceAED));
    check('  and the GBP amount too', Number(prel?.priceGBP) === 60, String(prel?.priceGBP));

    // ── 6b. A currency nobody priced stays empty ────────────────────────────
    /*
     * The three amounts are typed in, never converted — a rate that moved
     * overnight would bill a family a different figure each cycle. So a
     * currency left blank must stay null: "free" and "not sold here" are
     * different answers and only one of them should reach a family.
     */
    console.log('\n6b. An unpriced currency stays unpriced');

    const partial = await req('POST', '/lms-data/packages', adminToken, {
      title: `${MARKER} USD only`,
      priceUSD: 30, priceAED: '', priceGBP: null,
      billing: 'Monthly', level: 'All', courses: [], features: [],
      status: 'Active', description: 'only priced in dollars', classesPerMonth: 4,
    });
    check('a package priced in one currency is accepted', partial.status === 201, `got ${partial.status}`);
    const partialRel = await pkgRow(partial.body?.id);
    check('  USD is stored', Number(partialRel?.priceUSD) === 30, String(partialRel?.priceUSD));
    check('  an empty AED is null, not 0', partialRel?.priceAED === null, String(partialRel?.priceAED));
    check('  an empty GBP is null, not 0', partialRel?.priceGBP === null, String(partialRel?.priceGBP));

    console.log('\n7. Package update, including clearing the link');
    const pkgUpdated = await req('PUT', `/lms-data/packages/${packageId}`, adminToken, {
      title: `${MARKER} 8 Hours`, priceUSD: 80, priceAED: 294, priceGBP: 64, billing: 'Monthly', classesPerMonth: 16,
      level: 'All', courses: [], features: [], status: 'Inactive', description: 'y',
      feePlanId: '',
    });
    check('PUT returns 200', pkgUpdated.status === 200, `got ${pkgUpdated.status}`);
    const prel2 = await pkgRow(packageId);
    check('  USD price propagated', Number(prel2?.priceUSD) === 80, String(prel2?.priceUSD));
    check('  and so did the AED and GBP amounts', Number(prel2?.priceAED) === 294 && Number(prel2?.priceGBP) === 64, `${prel2?.priceAED} / ${prel2?.priceGBP}`);
    check('  Inactive turned the Package off', prel2?.active === false);
    check('  an empty fee plan clears the link rather than storing ""', prel2?.feePlanId === null, String(prel2?.feePlanId));

    // ── 8. Assigning a package to a student ─────────────────────────────────
    console.log('\n8. Student assignment carries the package');

    // Re-link the plan and turn the package back on so it is assignable.
    await req('PUT', `/lms-data/packages/${packageId}`, adminToken, {
      status: 'Active', feePlanId,
    });

    const assigned = await req('POST', `/student-management/${studentId}/course`, adminToken, {
      courseId, teacherId, packageId, status: 'ACTIVE',
    });
    check('POST course assignment returns 201', assigned.status === 201, `got ${assigned.status}`);
    let { rows: enr } = await db.query(
      `SELECT "packageId","teacherId" FROM "Enrollment" WHERE "studentId" = $1 AND "courseId" = $2`,
      [studentId, courseId],
    );
    check('  the enrolment stores the package', enr[0]?.packageId === packageId, String(enr[0]?.packageId));
    check('  and the teacher', enr[0]?.teacherId === teacherId);

    const bogusPkg = await req('POST', `/student-management/${studentId}/course`, adminToken, {
      courseId, packageId: '00000000-0000-0000-0000-000000000000',
    });
    check('a package that does not exist is refused', bogusPkg.status === 400, `got ${bogusPkg.status}`);
    ({ rows: enr } = await db.query(
      `SELECT "packageId" FROM "Enrollment" WHERE "studentId" = $1 AND "courseId" = $2`,
      [studentId, courseId],
    ));
    check('  the real package is untouched', enr[0]?.packageId === packageId);

    const cleared = await req('POST', `/student-management/${studentId}/course`, adminToken, {
      courseId, packageId: '',
    });
    check('an empty package clears it', cleared.status === 201, `got ${cleared.status}`);
    ({ rows: enr } = await db.query(
      `SELECT "packageId" FROM "Enrollment" WHERE "studentId" = $1 AND "courseId" = $2`,
      [studentId, courseId],
    ));
    check('  the enrolment now has no package', enr[0]?.packageId === null, String(enr[0]?.packageId));

    // Omitting the field entirely must NOT clear it — that is the difference
    // the '' convention exists to preserve.
    await req('POST', `/student-management/${studentId}/course`, adminToken, { courseId, packageId });
    await req('POST', `/student-management/${studentId}/course`, adminToken, { courseId, status: 'PAUSED' });
    ({ rows: enr } = await db.query(
      `SELECT "packageId",status FROM "Enrollment" WHERE "studentId" = $1 AND "courseId" = $2`,
      [studentId, courseId],
    ));
    check('omitting the package leaves it in place', enr[0]?.packageId === packageId, String(enr[0]?.packageId));
    check('  while the status did change', enr[0]?.status === 'PAUSED', enr[0]?.status);

    // ── 8b. Creating a student enrols them in the SAME Course ───────────────
    /*
     * Five call sites used to find-or-create the Course by slug, inventing a
     * fresh id and a price of 0. That is how a student ended up enrolled in a
     * course the admin panel does not list. These check the id matches the
     * catalogue's, and that a catalogue row with no relational half yet gets
     * one carrying its real price rather than 0.
     */
    console.log('\n8b. Enrolling on create resolves the catalogue Course');

    const enrolEmail = `${MARKER}-enrolled@example.test`;
    await db.query(`DELETE FROM "User" WHERE email = $1`, [enrolEmail]);

    // A catalogue row inserted straight into the table, with no Course behind
    // it — the state every row was in before the two lists were joined.
    const { rows: orphanCat } = await db.query(
      `INSERT INTO "LmsCourse" (id,code,title,category,level,status,"createdAt",description,price,"durationWeeks")
       VALUES (gen_random_uuid(),$1,$2,'General','Beginner','Active',$3,'no relational half',33,16)
       RETURNING id`,
      [`${MARKER}-C9`, `${MARKER} Orphan`, today()],
    );
    const orphanId = orphanCat[0].id;
    check('the fixture really has no Course yet', !(await courseRow(orphanId)));

    const madeStudent = await req('POST', '/students', adminToken, {
      email: enrolEmail,
      password: 'smoke-password-1',
      firstName: 'Smoke',
      lastName: 'Enrolled',
      courseCode: `${MARKER}-C9`,
      packageId,
    });
    check('POST /students returns 201', madeStudent.status === 201, `got ${madeStudent.status}`);

    const orphanRel = await courseRow(orphanId);
    check('the missing Course was created under the catalogue id', !!orphanRel);
    check('  and carries the catalogue price, not 0', Number(orphanRel?.price) === 33, String(orphanRel?.price));
    check('  and the catalogue duration, not the default 12', orphanRel?.durationWeeks === 16, String(orphanRel?.durationWeeks));

    const { rows: dupes } = await db.query(
      `SELECT id FROM "Course" WHERE title = $1`,
      [`${MARKER} Orphan`],
    );
    check('  exactly one Course exists for it, not a second by slug', dupes.length === 1, `${dupes.length}`);

    const { rows: newEnr } = await db.query(
      `SELECT e."courseId", e."packageId" FROM "Enrollment" e
         JOIN "StudentProfile" sp ON sp.id = e."studentId"
         JOIN "User" u ON u.id = sp."userId" WHERE u.email = $1`,
      [enrolEmail],
    );
    check('the new student is enrolled', newEnr.length === 1, `${newEnr.length}`);
    check('  in the catalogue course, by id', newEnr[0]?.courseId === orphanId, newEnr[0]?.courseId);
    check('  and the enrolment carries the package', newEnr[0]?.packageId === packageId, String(newEnr[0]?.packageId));

    await db.query(`DELETE FROM "User" WHERE email = $1`, [enrolEmail]);
    await db.query(`DELETE FROM "Course" WHERE id = $1`, [orphanId]);
    await db.query(`DELETE FROM "LmsCourse" WHERE id = $1`, [orphanId]);

    // ── 8c. A student is quoted in their own currency ───────────────────────
    /*
     * The point of three prices: a family in Dubai sees dirhams, one in London
     * pounds, everyone else dollars — and a package the academy has not priced
     * in that currency is not offered at all rather than shown at the dollar
     * figure wearing the wrong symbol.
     */
    console.log('\n8c. The student panel quotes the family\'s currency');

    const asStudent = token(studentUserId, 'STUDENT', emails.student);

    // Put them back on the fully-priced package first.
    await req('POST', `/student-management/${studentId}/course`, adminToken, {
      courseId, packageId, status: 'ACTIVE',
    });

    for (const [currency, expected] of [['USD', 80], ['AED', 294], ['GBP', 64]]) {
      await db.query(`UPDATE "StudentProfile" SET "billingCurrency" = $1 WHERE id = $2`, [currency, studentId]);
      const mine = await req('GET', '/subscriptions/me', asStudent);
      check(`on ${currency} the panel says ${currency}`, mine.body?.currency === currency, mine.body?.currency);
      check(`  and quotes ${expected}`, Number(mine.body?.package?.price) === expected, String(mine.body?.package?.price));
    }

    // The USD-only package must not be offered to a family billed in dirhams.
    await db.query(`UPDATE "StudentProfile" SET "billingCurrency" = 'AED' WHERE id = $1`, [studentId]);
    let options = await req('GET', '/subscriptions/me/packages', asStudent);
    check(
      'a package with no AED price is not offered to an AED family',
      Array.isArray(options.body) && !options.body.some((p) => p.id === partial.body?.id),
      JSON.stringify(options.body).slice(0, 120),
    );

    await db.query(`UPDATE "StudentProfile" SET "billingCurrency" = 'USD' WHERE id = $1`, [studentId]);
    options = await req('GET', '/subscriptions/me/packages', asStudent);
    check(
      'and it is offered to a USD family',
      Array.isArray(options.body) && options.body.some((p) => p.id === partial.body?.id),
      JSON.stringify(options.body).slice(0, 120),
    );

    await req('DELETE', `/lms-data/packages/${partial.body?.id}`, adminToken);

    // ── 9. Who is allowed to do any of this ─────────────────────────────────
    console.log('\n9. Roles');

    const coachCourse = await req('POST', '/lms-data/courses', coachToken, {
      code: `${MARKER}-C2`, title: `${MARKER} Coach Course`, category: 'General',
      level: 'Beginner', status: 'Active', description: 'by the coach',
      createdAt: today(), price: 0, durationWeeks: 8,
    });
    check('a coach can create a course', coachCourse.status === 201, `got ${coachCourse.status}`);
    check('  and it too got a relational Course', !!(await courseRow(coachCourse.body?.id)));

    const coachEdit = await req('PUT', `/lms-data/courses/${coachCourse.body?.id}`, coachToken, {
      title: `${MARKER} Coach Course II`,
    });
    check('a coach can edit a course', coachEdit.status === 200, `got ${coachEdit.status}`);

    const coachPkg = await req('POST', '/lms-data/packages', coachToken, {
      title: `${MARKER} Coach Package`, priceUSD: 20, billing: 'Monthly', classesPerMonth: 4,
      level: 'All', courses: [], features: [], status: 'Active', description: 'by the coach',
    });
    check('a coach can create a package', coachPkg.status === 201, `got ${coachPkg.status}`);

    const teacherCourse = await req('POST', '/lms-data/courses', teacherToken, {
      code: `${MARKER}-C3`, title: `${MARKER} Teacher Course`, category: 'General',
      level: 'Beginner', status: 'Active', description: 'x', createdAt: today(),
    });
    check('a teacher cannot create a course', teacherCourse.status === 403, `got ${teacherCourse.status}`);
    const anonCourse = await req('POST', '/lms-data/courses', null, {
      code: `${MARKER}-C4`, title: `${MARKER} Anon Course`, category: 'General',
      level: 'Beginner', status: 'Active', description: 'x', createdAt: today(),
    });
    check('an unauthenticated caller cannot create a course', anonCourse.status === 401, `got ${anonCourse.status}`);
    const teacherPkg = await req('POST', '/lms-data/packages', teacherToken, {
      title: `${MARKER} Teacher Package`, priceUSD: 1, billing: 'Monthly', level: 'All',
      courses: [], features: [], status: 'Active', description: 'x',
    });
    check('a teacher cannot create a package', teacherPkg.status === 403, `got ${teacherPkg.status}`);

    const coachDelete = await req('DELETE', `/lms-data/courses/${coachCourse.body?.id}`, coachToken);
    check('a coach can delete an unused course', coachDelete.status === 204, `got ${coachDelete.status}`);
    check('  and the relational Course went with it', !(await courseRow(coachCourse.body?.id)));

    // ── 10. Deleting a package the subscription module is relying on ────────
    console.log('\n10. Package delete guards');

    await db.query(
      `INSERT INTO "SubscriptionNextCycle" (id,"studentId","nextPackageId","updatedAt")
       VALUES (gen_random_uuid(),$1,$2,now())
       ON CONFLICT ("studentId") DO UPDATE SET "nextPackageId" = $2`,
      [studentId, packageId],
    );
    const delQueued = await req('DELETE', `/lms-data/packages/${packageId}`, adminToken);
    check('refused while it is queued for someone next cycle', delQueued.status === 400, `got ${delQueued.status}`);
    check('  and says so', String(delQueued.body?.message || '').includes('next cycle'), delQueued.body?.message);
    await db.query(`DELETE FROM "SubscriptionNextCycle" WHERE "studentId" = $1`, [studentId]);

    // Nothing is relying on it once the enrolment is gone.
    await db.query(`DELETE FROM "Enrollment" WHERE "studentId" = $1`, [studentId]);
    const delOk = await req('DELETE', `/lms-data/packages/${packageId}`, adminToken);
    check('an unused package deletes', delOk.status === 204, `got ${delOk.status}`);
    check('  and the relational Package went with it', !(await pkgRow(packageId)));

    // ── 11. Nothing was left in the database ────────────────────────────────
    console.log('\n11. Cleanup');
    await cleanup();
    const { rows: strayC } = await db.query(`SELECT id FROM "Course" WHERE title LIKE $1`, [`${MARKER}%`]);
    const { rows: strayL } = await db.query(`SELECT id FROM "LmsCourse" WHERE title LIKE $1`, [`${MARKER}%`]);
    const { rows: strayP } = await db.query(`SELECT id FROM "Package" WHERE name LIKE $1`, [`${MARKER}%`]);
    const { rows: strayU } = await db.query(`SELECT id FROM "User" WHERE email LIKE $1`, [`${MARKER}%`]);
    check('no stray Course rows', strayC.length === 0, `${strayC.length}`);
    check('no stray LmsCourse rows', strayL.length === 0, `${strayL.length}`);
    check('no stray Package rows', strayP.length === 0, `${strayP.length}`);
    check('no stray users', strayU.length === 0, `${strayU.length}`);
  } finally {
    await cleanup().catch(() => undefined);
    await db.end();
  }

  console.log(`\n${pass}/${pass + fail} passed`);
  if (failures.length) {
    console.log('\nFailures:');
    for (const f of failures) console.log(`  - ${f}`);
    process.exitCode = 1;
  }
})();
