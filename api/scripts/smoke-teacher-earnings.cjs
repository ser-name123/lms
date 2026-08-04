/*
 * Smoke test — Teacher Earnings (Module 6A).
 *
 * Books earnings on class completion. Verifies the four attendance scenarios via
 * the real endClass endpoint (admin acting), the scheduled-duration × rate math
 * (rate 4.00 × 30min = 2.00), idempotency, the teacher-absent reschedule task,
 * and the teacher earnings summary endpoint.
 *
 * Run: node scripts/smoke-teacher-earnings.cjs   (needs API running + env)
 */
require('dotenv/config');
const jwt = require('jsonwebtoken');
const { Client } = require('pg');

const BASE = process.env.SMOKE_BASE || 'http://localhost:5000/api';
const SECRET = process.env.JWT_ACCESS_SECRET;
const MARKER = 'zz-smoke-earn';

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
  let savedRate, savedTeacherId;

  const cleanup = async () => {
    if (savedTeacherId !== undefined) {
      await db.query(`UPDATE "TeacherProfile" SET "hourlyRate" = $2 WHERE id = $1`, [savedTeacherId, savedRate]);
    }
    const cls = await db.query(`SELECT id FROM "ClassSession" WHERE title LIKE $1`, [`${MARKER}%`]);
    for (const c of cls.rows) {
      await db.query(`DELETE FROM "TeacherEarning" WHERE "classSessionId" = $1`, [c.id]);
      await db.query(`DELETE FROM "TeacherAbsenceTask" WHERE "classSessionId" = $1`, [c.id]);
      await db.query(`DELETE FROM "ClassAttendee" WHERE "classId" = $1`, [c.id]);
    }
    await db.query(`DELETE FROM "ClassSession" WHERE title LIKE $1`, [`${MARKER}%`]);
    const users = await db.query(`SELECT id FROM "User" WHERE email LIKE $1`, [`%${MARKER}%`]);
    for (const u of users.rows) {
      const sp = (await db.query(`SELECT id FROM "StudentProfile" WHERE "userId"=$1`, [u.id])).rows[0];
      if (sp) await db.query(`DELETE FROM "StudentProfile" WHERE id=$1`, [sp.id]);
      await db.query(`DELETE FROM "User" WHERE id=$1`, [u.id]);
    }
  };

  const mkStudent = async (tag) => {
    const email = `${MARKER}-${tag}@example.test`;
    const u = (await db.query(
      `INSERT INTO "User" (id,email,"passwordHash","firstName","lastName",role,status,"updatedAt")
       VALUES (gen_random_uuid(),$1,'x','Earn',$2,'STUDENT','ACTIVE',now()) RETURNING id`, [email, tag])).rows[0];
    const sp = (await db.query(
      `INSERT INTO "StudentProfile" (id,"userId","studentCode","billingCurrency") VALUES (gen_random_uuid(),$1,$2,'USD') RETURNING id`,
      [u.id, `${MARKER}-${tag}-${Date.now()}`])).rows[0];
    return sp.id;
  };

  try {
    await cleanup();
    const teacher = (await db.query(`SELECT id, "userId", "hourlyRate" FROM "TeacherProfile" WHERE "userId" IS NOT NULL ORDER BY id LIMIT 1`)).rows[0];
    const course = (await db.query(`SELECT id FROM "Course" ORDER BY id LIMIT 1`)).rows[0];
    const admin = (await db.query(`SELECT id, email FROM "User" WHERE role='ADMIN' LIMIT 1`)).rows[0];
    check('fixtures present', !!teacher && !!course && !!admin);
    if (!teacher) throw new Error('no teacher');
    savedTeacherId = teacher.id; savedRate = teacher.hourlyRate;
    await db.query(`UPDATE "TeacherProfile" SET "hourlyRate" = 4.00 WHERE id = $1`, [teacher.id]);
    const adminToken = token(admin.id, 'ADMIN', admin.email);

    // A 30-minute class in the recent past.
    const mkClass = async (suffix) => {
      const start = minsAgo(40), end = minsAgo(10);
      const c = (await db.query(
        `INSERT INTO "ClassSession" (id,"courseId","teacherId",title,"startsAt","endsAt",status)
         VALUES (gen_random_uuid(),$1,$2,$3,$4::timestamp,$5::timestamp,'SCHEDULED') RETURNING id`,
        [course.id, teacher.id, `${MARKER} ${suffix}`, utcWall(start), utcWall(end)])).rows[0];
      return { id: c.id, start, end };
    };
    const addAttendee = async (classId, studentId, present) => {
      const cls = (await db.query(`SELECT "startsAt","endsAt" FROM "ClassSession" WHERE id=$1`, [classId])).rows[0];
      if (present) {
        await db.query(`INSERT INTO "ClassAttendee" (id,"classId","studentId","joinedAt","leftAt") VALUES (gen_random_uuid(),$1,$2,$3,$4)`,
          [classId, studentId, cls.startsAt, cls.endsAt]);
      } else {
        await db.query(`INSERT INTO "ClassAttendee" (id,"classId","studentId") VALUES (gen_random_uuid(),$1,$2)`, [classId, studentId]);
      }
    };
    const earningFor = async (classId) => (await db.query(`SELECT * FROM "TeacherEarning" WHERE "classSessionId"=$1`, [classId])).rows[0];

    const stu = await mkStudent('stu');

    // ── Scenario 1: teacher present + student present → paid 2.00, COMPLETED ──
    const c1 = await mkClass('S1');
    await addAttendee(c1.id, stu, true);
    const e1 = await req('POST', `/attendance/classes/${c1.id}/end`, adminToken, { teacherStatus: 'PRESENT' });
    check('S1: endClass ok', e1.status === 200 || e1.status === 201, `status ${e1.status}`);
    const er1 = await earningFor(c1.id);
    check('S1: earning booked', !!er1, 'no earning row');
    check('S1: outcome COMPLETED', er1 && er1.outcome === 'COMPLETED', er1 && er1.outcome);
    check('S1: paid true', er1 && er1.paid === true, er1 && String(er1.paid));
    check('S1: amount = 2.00 (4.00 × 30min)', er1 && Number(er1.amount) === 2, er1 && String(er1.amount));

    // ── Scenario 2: teacher present + student no-show → paid 2.00, STUDENT_NO_SHOW ──
    const c2 = await mkClass('S2');
    await addAttendee(c2.id, stu, false);
    const e2 = await req('POST', `/attendance/classes/${c2.id}/end`, adminToken, { teacherStatus: 'PRESENT' });
    const er2 = await earningFor(c2.id);
    check('S2: outcome STUDENT_NO_SHOW', er2 && er2.outcome === 'STUDENT_NO_SHOW', er2 && er2.outcome);
    check('S2: paid true (teacher still paid)', er2 && er2.paid === true, er2 && String(er2.paid));
    check('S2: amount = 2.00', er2 && Number(er2.amount) === 2, er2 && String(er2.amount));

    // ── Scenario 3: teacher absent + student present → 0, TEACHER_ABSENT + task ──
    const c3 = await mkClass('S3');
    await addAttendee(c3.id, stu, true);
    const e3 = await req('POST', `/attendance/classes/${c3.id}/end`, adminToken, { teacherStatus: 'ABSENT' });
    const er3 = await earningFor(c3.id);
    check('S3: outcome TEACHER_ABSENT', er3 && er3.outcome === 'TEACHER_ABSENT', er3 && er3.outcome);
    check('S3: paid false', er3 && er3.paid === false, er3 && String(er3.paid));
    check('S3: amount = 0', er3 && Number(er3.amount) === 0, er3 && String(er3.amount));
    const task = (await db.query(`SELECT * FROM "TeacherAbsenceTask" WHERE "classSessionId"=$1`, [c3.id])).rows[0];
    check('S3: reschedule task created (PENDING)', task && task.status === 'PENDING', task && task.status);

    // ── Scenario 4: both no-show → 0, BOTH_NO_SHOW, NO task ──
    const c4 = await mkClass('S4');
    await addAttendee(c4.id, stu, false);
    const e4 = await req('POST', `/attendance/classes/${c4.id}/end`, adminToken, { teacherStatus: 'ABSENT' });
    const er4 = await earningFor(c4.id);
    check('S4: outcome BOTH_NO_SHOW', er4 && er4.outcome === 'BOTH_NO_SHOW', er4 && er4.outcome);
    check('S4: paid false', er4 && er4.paid === false, er4 && String(er4.paid));
    const task4 = (await db.query(`SELECT * FROM "TeacherAbsenceTask" WHERE "classSessionId"=$1`, [c4.id])).rows[0];
    check('S4: NO reschedule task', !task4);

    // ── Teacher-absent reschedule task (spec 6A scenario 3) ──
    const listA = await req('GET', '/teacher-absences?status=PENDING', adminToken);
    check('absence: task list ok', listA.status === 200 && Array.isArray(listA.body), `status ${listA.status}`);
    check('absence: S3 task present in list', (listA.body || []).some((t) => t.classSessionId === c3.id));
    const future = new Date(); future.setUTCDate(future.getUTCDate() + 3); future.setUTCHours(9, 0, 0, 0);
    const resA = await req('POST', `/teacher-absences/${task.id}/reschedule`, adminToken, { newStartsAt: future.toISOString() });
    check('absence: reschedule ok', resA.status === 200 || resA.status === 201, `status ${resA.status} ${JSON.stringify(resA.body).slice(0,90)}`);
    const taskAfter = (await db.query(`SELECT status, "rescheduledSessionId" FROM "TeacherAbsenceTask" WHERE id=$1`, [task.id])).rows[0];
    check('absence: task now RESCHEDULED', taskAfter && taskAfter.status === 'RESCHEDULED', taskAfter && taskAfter.status);
    check('absence: a new session was created', taskAfter && !!taskAfter.rescheduledSessionId);
    // The new session belongs to the same student.
    if (taskAfter && taskAfter.rescheduledSessionId) {
      await db.query(`DELETE FROM "ClassAttendee" WHERE "classId"=$1`, [taskAfter.rescheduledSessionId]);
      await db.query(`DELETE FROM "ClassSession" WHERE id=$1`, [taskAfter.rescheduledSessionId]);
    }

    // ── Idempotency: end again → still exactly one earning row for S1 ──
    await req('POST', `/attendance/classes/${c1.id}/end`, adminToken, { teacherStatus: 'PRESENT' });
    const dup = (await db.query(`SELECT count(*)::int n FROM "TeacherEarning" WHERE "classSessionId"=$1`, [c1.id])).rows[0];
    check('idempotent: still one earning for S1', dup.n === 1, `count ${dup.n}`);

    // ── Teacher summary endpoint ──
    const teacherToken = token(teacher.userId, 'TEACHER', `${MARKER}-teacher@x`);
    const sum = await req('GET', '/earnings/me/summary', teacherToken);
    check('summary: ok', sum.status === 200, `status ${sum.status}`);
    check('summary: month ≥ 4.00 (two paid classes)', sum.body && Number(sum.body.month) >= 4, JSON.stringify(sum.body).slice(0, 120));
    const led = await req('GET', '/earnings/me', teacherToken);
    check('ledger: ok + rows present', led.status === 200 && Array.isArray(led.body) && led.body.length >= 4, `status ${led.status}`);
  } finally {
    await cleanup();
    await db.end();
    console.log(`\n${pass} passed, ${fail} failed`);
    if (fails.length) { console.log('FAILURES:\n - ' + fails.join('\n - ')); process.exit(1); }
  }
})().catch((e) => { console.error(e); process.exit(1); });
