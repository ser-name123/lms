/*
 * Panel-by-panel check of the direct-publish rule.
 *
 * The lifecycle smoke proves the transition; this proves every panel that reads
 * an assessment agrees about it — teacher, student, admin, supervisor and coach,
 * each hitting the endpoint their own screen calls, with their own role's token.
 *
 * Run: node scripts/verify-panels-direct-publish.cjs   (needs API running + env)
 */
require('dotenv/config');
const jwt = require('jsonwebtoken');
const { Client } = require('pg');

const BASE = process.env.SMOKE_BASE || 'http://localhost:5000/api';
const SECRET = process.env.JWT_ACCESS_SECRET;
const MARKER = 'zz-verify-panels';

let pass = 0, fail = 0;
const fails = [];
const check = (n, c, d) => {
  if (c) { pass++; console.log(`  ok   ${n}`); }
  else { fail++; fails.push(`${n}${d ? ` — ${d}` : ''}`); console.log(`  FAIL ${n}${d ? ` — ${d}` : ''}`); }
};
const token = (userId, role, email) => jwt.sign({ sub: userId, email, role }, SECRET, { expiresIn: '30m' });
async function req(method, path, auth, payload) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth}` } : {}) },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  });
  const text = await res.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body };
}
const daysAgo = (d) => { const t = new Date(); t.setUTCDate(t.getUTCDate() - d); t.setUTCHours(0, 0, 0, 0); return t; };
const utc = (d) => d.toISOString();

(async () => {
  if (!SECRET) throw new Error('JWT_ACCESS_SECRET is not set');
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();

  const cleanup = async () => {
    const sps = await db.query(
      `SELECT sp.id FROM "StudentProfile" sp JOIN "User" u ON u.id=sp."userId" WHERE u.email LIKE $1`,
      [`%${MARKER}%`],
    );
    for (const sp of sps.rows) {
      const as = await db.query(`SELECT id FROM "MonthlyAssessment" WHERE "studentId"=$1`, [sp.id]);
      for (const a of as.rows) {
        await db.query(`DELETE FROM "AssessmentFeedback" WHERE "assessmentId"=$1`, [a.id]);
        await db.query(`DELETE FROM "MonthlyAssessmentScore" WHERE "assessmentId"=$1`, [a.id]);
      }
      await db.query(`DELETE FROM "MonthlyAssessment" WHERE "studentId"=$1`, [sp.id]);
      await db.query(`DELETE FROM "RankingBadge" WHERE "studentId"=$1`, [sp.id]);
      await db.query(`DELETE FROM "StudentRanking" WHERE "studentId"=$1`, [sp.id]);
      await db.query(`DELETE FROM "StudentActivity" WHERE "studentId"=$1`, [sp.id]);
      await db.query(`DELETE FROM "StudentSubscription" WHERE "studentId"=$1`, [sp.id]);
      await db.query(`DELETE FROM "Enrollment" WHERE "studentId"=$1`, [sp.id]);
      await db.query(`DELETE FROM "StudentProfile" WHERE id=$1`, [sp.id]);
    }
    const tpl = await db.query(`SELECT id FROM "AssessmentTemplate" WHERE name LIKE $1`, [`${MARKER}%`]);
    for (const t of tpl.rows) {
      await db.query(`DELETE FROM "AssessmentCriterion" WHERE "templateId"=$1`, [t.id]);
      await db.query(`DELETE FROM "AssessmentTemplate" WHERE id=$1`, [t.id]);
    }
    await db.query(`DELETE FROM "Course" WHERE title LIKE $1`, [`${MARKER}%`]);
    const tps = await db.query(
      `SELECT tp.id FROM "TeacherProfile" tp JOIN "User" u ON u.id=tp."userId" WHERE u.email LIKE $1`,
      [`%${MARKER}%`],
    );
    for (const tp of tps.rows) await db.query(`DELETE FROM "TeacherProfile" WHERE id=$1`, [tp.id]);
    await db.query(`DELETE FROM "User" WHERE email LIKE $1`, [`%${MARKER}%`]);
  };

  try {
    await cleanup();

    // ── Fixtures ────────────────────────────────────────────────────────────
    const admin = (await db.query(`SELECT id, email FROM "User" WHERE role='ADMIN' LIMIT 1`)).rows[0];
    if (!admin) throw new Error('no admin');
    const adminToken = token(admin.id, 'ADMIN', admin.email);

    // Supervisor and coach tokens: the roles the spec says may VIEW. Minted
    // against real users if any exist, otherwise created — a role that has no
    // user in this database would otherwise silently skip its own checks.
    const mkStaff = async (role, tag) => {
      const existing = (await db.query(`SELECT id, email FROM "User" WHERE role=$1 LIMIT 1`, [role])).rows[0];
      if (existing) return token(existing.id, role, existing.email);
      const u = (await db.query(
        `INSERT INTO "User" (id,email,"passwordHash","firstName","lastName",role,status,"updatedAt")
         VALUES (gen_random_uuid(),$1,'x','Verify',$2,$3,'ACTIVE',now()) RETURNING id, email`,
        [`${MARKER}-${tag}@example.test`, tag, role],
      )).rows[0];
      return token(u.id, role, u.email);
    };
    const supervisorToken = await mkStaff('SUPERVISOR', 'sup');
    const coachToken = await mkStaff('ACADEMIC_COACH', 'coach');

    const course = (await db.query(
      `INSERT INTO "Course" (id,title,slug,price,"durationWeeks",status,"updatedAt")
       VALUES (gen_random_uuid(),$1,$2,10,12,'PUBLISHED',now()) RETURNING id`,
      [`${MARKER} Course`, `${MARKER}-course-${Date.now()}`],
    )).rows[0];

    const tu = (await db.query(
      `INSERT INTO "User" (id,email,"passwordHash","firstName","lastName",role,status,"updatedAt")
       VALUES (gen_random_uuid(),$1,'x','Panel','Teacher','TEACHER','ACTIVE',now()) RETURNING id, email`,
      [`${MARKER}-teacher@example.test`],
    )).rows[0];
    const teacher = (await db.query(
      `INSERT INTO "TeacherProfile" (id,"userId","teacherCode",rating) VALUES (gen_random_uuid(),$1,$2,4.0) RETURNING id`,
      [tu.id, `${MARKER}-T-${Date.now()}`],
    )).rows[0];
    const teacherToken = token(tu.id, 'TEACHER', tu.email);

    const su = (await db.query(
      `INSERT INTO "User" (id,email,"passwordHash","firstName","lastName",role,status,"updatedAt")
       VALUES (gen_random_uuid(),$1,'x','Panel','Stu','STUDENT','ACTIVE',now()) RETURNING id, email`,
      [`${MARKER}-student@example.test`],
    )).rows[0];
    const student = (await db.query(
      `INSERT INTO "StudentProfile" (id,"userId","studentCode","billingCurrency","parentEmail","parentName")
       VALUES (gen_random_uuid(),$1,$2,'USD',$3,'Panel Parent') RETURNING id`,
      [su.id, `${MARKER}-${Date.now()}`, `${MARKER}-parent@example.test`],
    )).rows[0];
    const studentToken = token(su.id, 'STUDENT', su.email);

    await db.query(
      `INSERT INTO "Enrollment" (id,"studentId","courseId","teacherId",status,"startedAt","updatedAt")
       VALUES (gen_random_uuid(),$1,$2,$3,'ACTIVE',$4,now())`,
      [student.id, course.id, teacher.id, utc(daysAgo(40))],
    );
    const modelRow = (await db.query(`SELECT id, "pricingMode" FROM "SubscriptionModel" LIMIT 1`)).rows[0];
    await db.query(
      `INSERT INTO "StudentSubscription"
         (id,"studentId","courseId","modelId","pricingMode",currency,"durationMinutes","weeklyClasses","monthlyHours",
          "startDate","actualCycleStartDate","renewalDate",status,"updatedAt")
       VALUES (gen_random_uuid(),$1,$2,$3,$4,'USD',30,2,4,$5,$5,$6,'ACTIVE',now())`,
      [student.id, course.id, modelRow.id, modelRow.pricingMode, utc(daysAgo(35)), utc(daysAgo(7))],
    );

    await req('POST', '/assessment-config/templates', adminToken, {
      name: `${MARKER} Rubric`,
      courseId: course.id,
      maxMarks: 100,
      passingMarks: 40,
      criteria: [
        { name: 'Attendance', maxMarks: 40 },
        { name: 'Recitation', maxMarks: 60 },
      ],
    });

    console.log('\n── Config ──');
    const cfg = await req('GET', '/assessment-config/settings', adminToken);
    check('approval step is OFF', cfg.body?.requireSupervisorApproval === false, String(cfg.body?.requireSupervisorApproval));
    const cfgTeacher = await req('GET', '/assessment-config/settings', teacherToken);
    check('the teacher panel can read the flag (it labels their button)',
      cfgTeacher.status === 200 && cfgTeacher.body?.requireSupervisorApproval === false, `status ${cfgTeacher.status}`);

    console.log('\n── TEACHER panel ──');
    const form = await req('GET', `/monthly-assessments/form?studentId=${student.id}&courseId=${course.id}`, teacherToken);
    check('assessment form loads for the closed cycle', form.status === 200, `status ${form.status}`);
    const cycleStart = form.body?.cycle?.start;
    check('form reports the student as eligible', form.body?.eligibility?.eligible === true, JSON.stringify(form.body?.eligibility));

    const dueBefore = await req('GET', '/monthly-assessments/due', teacherToken);
    check('student appears on the teacher due list',
      (dueBefore.body || []).some((d) => d.studentId === student.id), String((dueBefore.body || []).length));

    const scores = (form.body?.template?.criteria ?? []).map((c) => ({
      criterionId: c.id, criterionName: c.name, maxMarks: c.maxMarks, marks: Math.round(c.maxMarks * 0.8),
    }));
    const submitted = await req('POST', '/monthly-assessments/submit', teacherToken, {
      studentId: student.id, courseId: course.id, cycleStart,
      scores, teacherRemarks: 'Solid month.', recommendations: 'Keep revising.',
    });
    check('submit publishes outright', submitted.body?.status === 'PUBLISHED', submitted.body?.status);
    const aId = submitted.body?.id;

    const dueAfter = await req('GET', '/monthly-assessments/due', teacherToken);
    check('the student drops off the due list once published',
      !(dueAfter.body || []).some((d) => d.studentId === student.id), String((dueAfter.body || []).length));

    const tDash = await req('GET', '/monthly-assessments/dashboard/teacher', teacherToken);
    check('teacher dashboard counts it as published', (tDash.body?.published ?? 0) > 0, JSON.stringify(tDash.body));
    check('teacher dashboard shows nothing awaiting review', tDash.body?.submitted === 0, String(tDash.body?.submitted));

    const reEdit = await req('POST', '/monthly-assessments/draft', teacherToken, {
      studentId: student.id, courseId: course.id, cycleStart,
      scores, teacherRemarks: 'Trying to rewrite.',
    });
    check('the teacher cannot edit it afterwards', reEdit.status === 400, `status ${reEdit.status}`);

    console.log('\n── STUDENT panel ──');
    const mine = await req('GET', '/monthly-assessments/mine', studentToken);
    check('report is listed for the student', (mine.body || []).some((r) => r.id === aId), JSON.stringify(mine.body).slice(0, 120));
    const one = await req('GET', `/monthly-assessments/${aId}`, studentToken);
    check('student can open it', one.status === 200, `status ${one.status}`);
    check('it carries the marks breakdown', (one.body?.scores || []).length === 2, String((one.body?.scores || []).length));
    check('it carries grade and percentage', !!one.body?.grade && one.body?.percentage > 0,
      `${one.body?.grade} / ${one.body?.percentage}`);
    const fb = await req('POST', `/monthly-assessments/${aId}/feedback`, studentToken, { rating: 5, comment: 'Thank you.' });
    check('parent/guardian feedback still works from here', fb.body?.submitted === true, JSON.stringify(fb.body).slice(0, 100));
    const board = await req('GET', `/rankings?courseId=${course.id}`, studentToken);
    check('student still cannot read the full leaderboard', board.status === 403, `status ${board.status}`);

    console.log('\n── ADMIN panel ──');
    const aList = await req('GET', `/monthly-assessments?studentId=${student.id}`, adminToken);
    check('admin list shows it', (aList.body || []).some((r) => r.id === aId), String((aList.body || []).length));
    const aDash = await req('GET', '/monthly-assessments/dashboard/admin', adminToken);
    check('admin dashboard counts it as published', (aDash.body?.published ?? 0) > 0, JSON.stringify(aDash.body).slice(0, 140));
    const hub = await req('GET', `/monthly-assessments/student/${student.id}`, adminToken);
    check('student-hub tab shows it', (hub.body || []).some((r) => r.id === aId), String((hub.body || []).length));
    const reopened = await req('POST', `/monthly-assessments/${aId}/reopen`, adminToken, { reason: 'Correction needed.' });
    check('admin can still reopen a published report', reopened.body?.status === 'RETURNED', reopened.body?.status);
    const goneWhileReopened = await req('GET', `/monthly-assessments/${aId}`, studentToken);
    check('a reopened report is hidden from the student again', goneWhileReopened.status === 404, `status ${goneWhileReopened.status}`);
    const resub = await req('POST', '/monthly-assessments/submit', teacherToken, {
      studentId: student.id, courseId: course.id, cycleStart,
      scores, teacherRemarks: 'Corrected.',
    });
    check('resubmitting after a reopen publishes again', resub.body?.status === 'PUBLISHED', resub.body?.status);

    console.log('\n── SUPERVISOR panel (view + reopen, not a gate) ──');
    const sList = await req('GET', `/monthly-assessments?studentId=${student.id}`, supervisorToken);
    check('supervisor can list it', sList.status === 200 && (sList.body || []).some((r) => r.id === aId), `status ${sList.status}`);
    const sOne = await req('GET', `/monthly-assessments/${aId}`, supervisorToken);
    check('supervisor can open it in full', sOne.status === 200 && !!sOne.body?.scores, `status ${sOne.status}`);
    const sDash = await req('GET', '/monthly-assessments/dashboard/admin', supervisorToken);
    check('supervisor sees the dashboard', sDash.status === 200, `status ${sDash.status}`);
    const sFeedback = await req('GET', '/monthly-assessments/feedback/pending', supervisorToken);
    check('supervisor sees family feedback awaiting review', sFeedback.status === 200, `status ${sFeedback.status}`);
    const notified = await db.query(
      `SELECT count(*)::int AS n FROM "Notification" n JOIN "User" u ON u.id=n."userId"
       WHERE n.type='MONTHLY_ASSESSMENT_PUBLISHED' AND u.role IN ('SUPERVISOR','ADMIN')`,
    );
    check('supervisors/admins are notified on publish', notified.rows[0].n > 0, String(notified.rows[0].n));

    console.log('\n── ACADEMIC COACH panel (read-only) ──');
    const cList = await req('GET', `/monthly-assessments?studentId=${student.id}`, coachToken);
    check('coach can list it', cList.status === 200 && (cList.body || []).some((r) => r.id === aId), `status ${cList.status}`);
    const cOne = await req('GET', `/monthly-assessments/${aId}`, coachToken);
    check('coach can open it', cOne.status === 200, `status ${cOne.status}`);
    const cDash = await req('GET', '/monthly-assessments/dashboard/admin', coachToken);
    check('coach sees the dashboard', cDash.status === 200, `status ${cDash.status}`);
    const cReopen = await req('POST', `/monthly-assessments/${aId}/reopen`, coachToken, { reason: 'nope' });
    check('coach cannot reopen — read-only, per the route roles', cReopen.status === 403, `status ${cReopen.status}`);
    const cConfig = await req('PATCH', '/assessment-config/settings', coachToken, { requireSupervisorApproval: true });
    check('coach cannot change the approval rule', cConfig.status === 403, `status ${cConfig.status}`);
  } catch (e) {
    fail++;
    fails.push(`threw: ${e.message}`);
    console.error('THREW:', e);
  } finally {
    await cleanup();
    await db.end();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fails.length) {
    console.log('\nFailures:');
    for (const f of fails) console.log(`  - ${f}`);
  }
  process.exitCode = fail ? 1 : 0;
})();
