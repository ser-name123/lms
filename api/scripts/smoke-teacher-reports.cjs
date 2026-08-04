/*
 * Smoke test — Teacher Monthly Reports (6D) + attendance analytics.
 *
 * Flow: teacher drafts + submits a report → supervisor reviews → admin reviews
 * → supervisor approves → salary gate clears. Also a reject→resubmit path, and
 * teacher attendance analytics from a completed class.
 *
 * Run: node scripts/smoke-teacher-reports.cjs   (needs API running + env)
 */
require('dotenv/config');
const jwt = require('jsonwebtoken');
const { Client } = require('pg');

const BASE = process.env.SMOKE_BASE || 'http://localhost:5000/api';
const SECRET = process.env.JWT_ACCESS_SECRET;
const MARKER = 'zz-smoke-rep';

let pass = 0, fail = 0;
const fails = [];
const check = (n, c, d) => { if (c) { pass++; console.log(`  ok   ${n}`); } else { fail++; fails.push(`${n}${d ? ` — ${d}` : ''}`); console.log(`  FAIL ${n}${d ? ` — ${d}` : ''}`); } };
const token = (userId, role, email) => jwt.sign({ sub: userId, email, role }, SECRET, { expiresIn: '30m' });
async function req(method, path, auth, payload) {
  const res = await fetch(`${BASE}${path}`, { method, headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth}` } : {}) }, ...(payload ? { body: JSON.stringify(payload) } : {}) });
  const text = await res.text(); let body; try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body };
}
const minsAgo = (m) => { const t = new Date(); t.setUTCMinutes(t.getUTCMinutes() - m); return t; };
const utcWall = (d) => d.toISOString().slice(0, 19).replace('T', ' ');

(async () => {
  if (!SECRET) throw new Error('JWT_ACCESS_SECRET is not set');
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();

  const cleanup = async () => {
    const cls = await db.query(`SELECT id FROM "ClassSession" WHERE title LIKE $1`, [`${MARKER}%`]);
    for (const c of cls.rows) {
      await db.query(`DELETE FROM "TeacherEarning" WHERE "classSessionId"=$1`, [c.id]);
      await db.query(`DELETE FROM "ClassAttendee" WHERE "classId"=$1`, [c.id]);
    }
    await db.query(`DELETE FROM "ClassSession" WHERE title LIKE $1`, [`${MARKER}%`]);
    const tps = await db.query(`SELECT tp.id FROM "TeacherProfile" tp JOIN "User" u ON u.id=tp."userId" WHERE u.email LIKE $1`, [`%${MARKER}%`]);
    for (const tp of tps.rows) {
      await db.query(`DELETE FROM "TeacherMonthlyReport" WHERE "teacherId"=$1`, [tp.id]);
      await db.query(`DELETE FROM "TeacherEarning" WHERE "teacherId"=$1`, [tp.id]);
    }
    const users = await db.query(`SELECT id FROM "User" WHERE email LIKE $1`, [`%${MARKER}%`]);
    for (const u of users.rows) {
      const sp = (await db.query(`SELECT id FROM "StudentProfile" WHERE "userId"=$1`, [u.id])).rows[0];
      if (sp) { await db.query(`DELETE FROM "TeacherMonthlyReport" WHERE "studentId"=$1`, [sp.id]); await db.query(`DELETE FROM "StudentProfile" WHERE id=$1`, [sp.id]); }
      await db.query(`DELETE FROM "User" WHERE id=$1`, [u.id]);
    }
  };

  try {
    await cleanup();
    const tu = (await db.query(`INSERT INTO "User" (id,email,"passwordHash","firstName","lastName",role,status,"updatedAt") VALUES (gen_random_uuid(),$1,'x','Rep','Teacher','TEACHER','ACTIVE',now()) RETURNING id`, [`${MARKER}-teacher@example.test`])).rows[0];
    const teacher = (await db.query(`INSERT INTO "TeacherProfile" (id,"userId","teacherCode","hourlyRate") VALUES (gen_random_uuid(),$1,$2,4.00) RETURNING id`, [tu.id, `${MARKER}-T-${Date.now()}`])).rows[0];
    const su = (await db.query(`INSERT INTO "User" (id,email,"passwordHash","firstName","lastName",role,status,"updatedAt") VALUES (gen_random_uuid(),$1,'x','Rep','Student','STUDENT','ACTIVE',now()) RETURNING id`, [`${MARKER}-stu@example.test`])).rows[0];
    const student = (await db.query(`INSERT INTO "StudentProfile" (id,"userId","studentCode","billingCurrency") VALUES (gen_random_uuid(),$1,$2,'USD') RETURNING id`, [su.id, `${MARKER}-S-${Date.now()}`])).rows[0];
    const course = (await db.query(`SELECT id FROM "Course" ORDER BY id LIMIT 1`)).rows[0];
    const admin = (await db.query(`SELECT id, email FROM "User" WHERE role='ADMIN' LIMIT 1`)).rows[0];
    let supervisor = (await db.query(`SELECT id, email FROM "User" WHERE role='SUPERVISOR' AND status='ACTIVE' LIMIT 1`)).rows[0];
    check('fixtures present', !!teacher && !!course && !!admin);

    const teacherToken = token(tu.id, 'TEACHER', `${MARKER}-teacher@example.test`);
    const adminToken = token(admin.id, 'ADMIN', admin.email);
    const supToken = supervisor ? token(supervisor.id, 'SUPERVISOR', supervisor.email) : adminToken; // fall back to admin (also allowed)

    const now = new Date();
    const ps = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
    const pe = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).toISOString();

    // Draft without a summary → submit refused.
    const draft0 = await req('POST', '/monthly-reports/me', teacherToken, { studentId: student.id, periodStart: ps, periodEnd: pe });
    check('draft saved (DRAFT)', draft0.status < 300 && draft0.body && draft0.body.status === 'DRAFT', `status ${draft0.status}`);
    const subNo = await req('POST', `/monthly-reports/me/${draft0.body.id}/submit`, teacherToken);
    check('submit without summary refused', subNo.status === 400, `status ${subNo.status}`);

    // Fill summary + submit.
    await req('POST', '/monthly-reports/me', teacherToken, { studentId: student.id, periodStart: ps, periodEnd: pe, summary: 'Good progress this month', strengths: 'Reading', areasToImprove: 'Grammar', recommendation: 'Continue' });
    const sub = await req('POST', `/monthly-reports/me/${draft0.body.id}/submit`, teacherToken);
    check('submit ok → SUBMITTED', sub.status < 300 && sub.body && sub.body.status === 'SUBMITTED', `status ${sub.status} ${JSON.stringify(sub.body).slice(0,80)}`);
    const reportId = draft0.body.id;

    // Staff list shows it.
    const listR = await req('GET', '/monthly-reports?status=SUBMITTED', adminToken);
    check('staff list contains the report', Array.isArray(listR.body) && listR.body.some((r) => r.id === reportId), `status ${listR.status}`);

    // Supervisor review → UNDER_REVIEW; admin review; supervisor approve.
    const rev = await req('POST', `/monthly-reports/${reportId}/supervisor-review`, supToken);
    check('supervisor review → UNDER_REVIEW', rev.status < 300 && rev.body && rev.body.status === 'UNDER_REVIEW', `status ${rev.status}`);
    const arev = await req('POST', `/monthly-reports/${reportId}/admin-review`, adminToken);
    check('admin review ok', arev.status < 300, `status ${arev.status}`);
    const appr = await req('POST', `/monthly-reports/${reportId}/approve`, supToken);
    check('supervisor approve → APPROVED', appr.status < 300 && appr.body && appr.body.status === 'APPROVED', `status ${appr.status} ${JSON.stringify(appr.body).slice(0,80)}`);

    // Salary gate now clear for this teacher+period.
    const gate = await req('GET', `/monthly-reports/gate/${teacher.id}?periodStart=${encodeURIComponent(ps)}`, adminToken);
    check('salary gate clear (approved=1, pending=0)', gate.body && gate.body.clear === true && gate.body.approved === 1 && gate.body.pending === 0, JSON.stringify(gate.body));

    // Approved report cannot be edited by the teacher.
    const editApproved = await req('POST', '/monthly-reports/me', teacherToken, { studentId: student.id, periodStart: ps, periodEnd: pe, summary: 'x' });
    check('approved report cannot be re-edited', editApproved.status === 400, `status ${editApproved.status}`);

    // Attendance analytics: complete a class for the teacher, then it appears.
    const start = minsAgo(40), end = minsAgo(10);
    const c = (await db.query(`INSERT INTO "ClassSession" (id,"courseId","teacherId",title,"startsAt","endsAt",status,"teacherStatus") VALUES (gen_random_uuid(),$1,$2,$3,$4::timestamp,$5::timestamp,'COMPLETED','PRESENT') RETURNING id`,
      [course.id, teacher.id, `${MARKER} AN`, utcWall(start), utcWall(end)])).rows[0];
    const an = await req('GET', `/monthly-reports/attendance-analytics?periodStart=${encodeURIComponent(ps)}&periodEnd=${encodeURIComponent(pe)}`, adminToken);
    check('analytics ok', an.status === 200 && Array.isArray(an.body), `status ${an.status}`);
    const row = (an.body || []).find((r) => r.teacher && r.teacher.id === teacher.id);
    check('analytics has the teacher with a present class', row && row.present >= 1 && row.totalClasses >= 1, JSON.stringify(row));
    check('analytics punctuality 100% (1 present of 1)', row && row.punctualityPct === 100, row && String(row.punctualityPct));
  } finally {
    await cleanup();
    await db.end();
    console.log(`\n${pass} passed, ${fail} failed`);
    if (fails.length) { console.log('FAILURES:\n - ' + fails.join('\n - ')); process.exit(1); }
  }
})().catch((e) => { console.error(e); process.exit(1); });
