/*
 * Smoke test — Class Rescheduling Management (the new module).
 *
 * Covers: student available-slots listing; student-clash guard; the Simple
 * (0-allowance) upgrade block; and the full teacher workflow — request (PENDING,
 * class NOT moved) → coach reject (no change) → coach approve (class moved,
 * teacher counter incremented) → the 2-per-student-per-cycle limit.
 *
 * Run: node scripts/smoke-class-reschedule.cjs   (needs API running + env)
 */
require('dotenv/config');
const jwt = require('jsonwebtoken');
const { Client } = require('pg');

const BASE = process.env.SMOKE_BASE || 'http://localhost:5000/api';
const SECRET = process.env.JWT_ACCESS_SECRET;
const MARKER = 'zz-smoke-crm-resch';

let pass = 0, fail = 0;
const fails = [];
const check = (n, c, d) => { if (c) { pass++; console.log(`  ok   ${n}`); } else { fail++; fails.push(`${n}${d ? ` — ${d}` : ''}`); console.log(`  FAIL ${n}${d ? ` — ${d}` : ''}`); } };
const token = (userId, role, email) => jwt.sign({ sub: userId, email, role }, SECRET, { expiresIn: '30m' });
async function req(method, path, auth, payload) {
  const res = await fetch(`${BASE}${path}`, { method, headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth}` } : {}) }, ...(payload ? { body: JSON.stringify(payload) } : {}) });
  const text = await res.text(); let body; try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body };
}
const inDays = (d, h = 10) => { const t = new Date(); t.setUTCDate(t.getUTCDate() + d); t.setUTCHours(h, 0, 0, 0); return t; };
// A `timestamp without time zone` column stores the wall clock we hand it.
const utcWall = (d) => d.toISOString().slice(0, 19).replace('T', ' ');

(async () => {
  if (!SECRET) throw new Error('JWT_ACCESS_SECRET is not set');
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const WIDE = JSON.stringify(Object.fromEntries(WEEK.map((d) => [d, [{ from: '00:00', to: '23:59' }]])));

  const cleanup = async () => {
    // Sessions and requests first — they reference the teacher this smoke owns.
    await db.query(`DELETE FROM "ClassSession" WHERE title LIKE $1`, [`${MARKER}%`]);
    await db.query(`DELETE FROM "LeaveRequest" WHERE reason LIKE $1`, [`${MARKER}%`]);
    const users = await db.query(`SELECT id FROM "User" WHERE email LIKE $1`, [`%${MARKER}%`]);
    for (const u of users.rows) {
      const sp = (await db.query(`SELECT id FROM "StudentProfile" WHERE "userId"=$1`, [u.id])).rows[0];
      if (sp) {
        await db.query(`DELETE FROM "ClassRescheduleRequest" WHERE "studentId"=$1`, [sp.id]);
        await db.query(`DELETE FROM "StudentSubscription" WHERE "studentId"=$1`, [sp.id]);
      }
      const tp = (await db.query(`SELECT id FROM "TeacherProfile" WHERE "userId"=$1`, [u.id])).rows[0];
      if (tp) {
        await db.query(`DELETE FROM "ClassRescheduleRequest" WHERE "teacherId"=$1`, [tp.id]);
        await db.query(`DELETE FROM "TeacherProfile" WHERE id=$1`, [tp.id]);
      }
      await db.query(`DELETE FROM "User" WHERE id=$1`, [u.id]);
    }
  };

  const mkStudent = async (tag, limit) => {
    const email = `${MARKER}-${tag}@example.test`;
    const u = (await db.query(
      `INSERT INTO "User" (id,email,"passwordHash","firstName","lastName",role,status,"updatedAt")
       VALUES (gen_random_uuid(),$1,'x','Resch',$2,'STUDENT','ACTIVE',now()) RETURNING id`, [email, tag])).rows[0];
    const sp = (await db.query(
      `INSERT INTO "StudentProfile" (id,"userId","studentCode","billingCurrency") VALUES (gen_random_uuid(),$1,$2,'USD') RETURNING id`,
      [u.id, `${MARKER}-${tag}-${Date.now()}`])).rows[0];
    const monthly = (await db.query(`SELECT id FROM "SubscriptionModel" WHERE key='MONTHLY' LIMIT 1`)).rows[0];
    await db.query(
      `INSERT INTO "StudentSubscription" (id,"studentId","modelId","pricingMode",currency,"durationMinutes","weeklyClasses","monthlyHours",
         "billingCycle","startDate","renewalDate","remainingClasses","completedClasses","rescheduleCounter","teacherRescheduleCounter","rescheduleLimit","familyDiscountPct",status,"createdAt","updatedAt")
       VALUES (gen_random_uuid(),$1,$2,'FIXED_MONTHLY','USD',60,3,12,'MONTHLY',now(),now() + interval '60 days',12,0,0,0,$3,0,'ACTIVE',now(),now())`,
      [sp.id, monthly.id, limit]);
    return { userId: u.id, studentId: sp.id, email };
  };

  try {
    await cleanup();
    /*
     * A teacher of this smoke's own, NOT the first one in the table.
     *
     * Borrowing a shared teacher made this test depend on how much data the
     * rest of the suite had left behind: `/teacher/reschedulable` returns the
     * nearest 100 upcoming classes, and once that teacher had accumulated more
     * than 100 sessions ahead of this fixture's, the class under test simply
     * fell off the end and two assertions failed for reasons that had nothing
     * to do with rescheduling.
     */
    const tUser = (await db.query(
      `INSERT INTO "User" (id,email,"passwordHash","firstName","lastName",role,status,"updatedAt")
       VALUES (gen_random_uuid(),$1,'x','Resch','Teacher','TEACHER','ACTIVE',now()) RETURNING id`,
      [`${MARKER}-teacher@example.test`],
    )).rows[0];
    const teacher = (await db.query(
      `INSERT INTO "TeacherProfile" (id,"userId","teacherCode",availability) VALUES (gen_random_uuid(),$1,$2,$3::jsonb)
       RETURNING id, "userId", availability`,
      [tUser.id, `${MARKER}-T-${Date.now()}`, WIDE],
    )).rows[0];
    const course = (await db.query(`SELECT id FROM "Course" ORDER BY id LIMIT 1`)).rows[0];
    check('fixtures present', !!teacher && !!teacher.userId && !!course);
    if (!course) throw new Error('no course');

    const mkSession = async (studentId, startsAt, suffix) => {
      const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);
      const s = (await db.query(
        `INSERT INTO "ClassSession" (id,"courseId","teacherId",title,"startsAt","endsAt",status)
         VALUES (gen_random_uuid(),$1,$2,$3,$4::timestamp,$5::timestamp,'SCHEDULED') RETURNING id`,
        [course.id, teacher.id, `${MARKER} ${suffix}`, utcWall(startsAt), utcWall(endsAt)])).rows[0];
      await db.query(`INSERT INTO "ClassAttendee" (id,"classId","studentId") VALUES (gen_random_uuid(),$1,$2)`, [s.id, studentId]);
      return s.id;
    };

    const admin = (await db.query(`SELECT id, email FROM "User" WHERE role='ADMIN' LIMIT 1`)).rows[0];
    const adminToken = token(admin.id, 'ADMIN', admin.email);
    const teacherToken = token(teacher.userId, 'TEACHER', `${MARKER}-teacher@x`);

    // ─── Student side ──────────────────────────────────────────────────────
    const stu = await mkStudent('stu', 2);
    const stuToken = token(stu.userId, 'STUDENT', stu.email);
    const cA = await mkSession(stu.studentId, inDays(3, 10), 'A');
    const cB = await mkSession(stu.studentId, inDays(3, 12), 'B');

    const slots = await req('GET', `/subscriptions/me/reschedule-slots?sessionId=${cA}`, stuToken);
    check('student: slot listing ok', slots.status === 200, `status ${slots.status}`);
    check('student: slots returned within cycle', slots.body && Array.isArray(slots.body.days) && slots.body.days.length > 0, JSON.stringify(slots.body).slice(0, 120));

    // Student-clash: move A onto B's exact time (both this student's).
    const clash = await req('POST', '/subscriptions/me/reschedule', stuToken, { sessionId: cA, newStartsAt: inDays(3, 12).toISOString() });
    check('student: clash with own class refused', clash.status === 400, `status ${clash.status} ${JSON.stringify(clash.body).slice(0,90)}`);

    // Package with 0 allowance → upgrade block.
    const simple = await mkStudent('simple', 0);
    const simpleTok = token(simple.userId, 'STUDENT', simple.email);
    const cS = await mkSession(simple.studentId, inDays(3, 14), 'S');
    const zero = await req('POST', '/subscriptions/me/reschedule', simpleTok, { sessionId: cS, newStartsAt: inDays(4, 14).toISOString() });
    check('student: 0-allowance package refused', zero.status === 400, `status ${zero.status}`);
    check('student: refusal is the upgrade message', typeof zero.body?.message === 'string' && /upgrade your package/i.test(zero.body.message), zero.body?.message);

    // ─── Teacher side ──────────────────────────────────────────────────────
    const list0 = await req('GET', '/subscriptions/teacher/reschedulable', teacherToken);
    check('teacher: reschedulable list ok', list0.status === 200 && Array.isArray(list0.body), `status ${list0.status}`);
    const rowA = (list0.body || []).find((r) => r.id === cA);
    check('teacher: student class listed with 2 left', rowA && rowA.left === 2 && rowA.pending === false, JSON.stringify(rowA));

    const tSlots = await req('GET', `/subscriptions/teacher/reschedule-slots?sessionId=${cA}`, teacherToken);
    check('teacher: slot listing ok', tSlots.status === 200 && tSlots.body?.days?.length > 0, `status ${tSlots.status}`);
    const slotFor = (sess, prefIdx = 0) => sess.body.days[0].slots[Math.min(prefIdx, sess.body.days[0].slots.length - 1)].startsAt;

    // Request #1 → then REJECT (class must NOT move, counter stays 0).
    const rq1 = await req('POST', '/subscriptions/teacher/reschedule', teacherToken, { sessionId: cA, newStartsAt: slotFor(tSlots, 2), reason: 'clinic' });
    check('teacher: request created (pending)', rq1.status === 201 && rq1.body?.status === 'PENDING', `status ${rq1.status} ${JSON.stringify(rq1.body).slice(0,90)}`);
    const cAtime0 = (await db.query(`SELECT "startsAt" FROM "ClassSession" WHERE id=$1`, [cA])).rows[0].startsAt;
    const listPend = await req('GET', '/subscriptions/teacher/reschedulable', teacherToken);
    check('teacher: class now shows pending', (listPend.body || []).find((r) => r.id === cA)?.pending === true);

    const pend = await req('GET', '/subscriptions/reschedule-requests?status=PENDING', adminToken);
    check('coach: pending request visible', pend.status === 200 && (pend.body || []).some((r) => r.id === rq1.body.id), `status ${pend.status}`);
    const rej = await req('PATCH', `/subscriptions/reschedule-requests/${rq1.body.id}/review`, adminToken, { approve: false, notes: 'not now' });
    check('coach: reject ok', rej.status === 200 && rej.body?.status === 'REJECTED', `status ${rej.status}`);
    const cAtime1 = (await db.query(`SELECT "startsAt" FROM "ClassSession" WHERE id=$1`, [cA])).rows[0].startsAt;
    check('reject: class NOT moved', String(cAtime0) === String(cAtime1), `${cAtime0} vs ${cAtime1}`);
    const ctr0 = (await db.query(`SELECT "teacherRescheduleCounter" FROM "StudentSubscription" WHERE "studentId"=$1`, [stu.studentId])).rows[0];
    check('reject: teacher counter still 0', Number(ctr0.teacherRescheduleCounter) === 0, String(ctr0.teacherRescheduleCounter));

    // Request #2 → APPROVE (class moves, counter → 1).
    const t2 = await req('GET', `/subscriptions/teacher/reschedule-slots?sessionId=${cA}`, teacherToken);
    const newAt2 = slotFor(t2, 3);
    const rq2 = await req('POST', '/subscriptions/teacher/reschedule', teacherToken, { sessionId: cA, newStartsAt: newAt2 });
    check('teacher: 2nd request created', rq2.status === 201, `status ${rq2.status}`);
    const app2 = await req('PATCH', `/subscriptions/reschedule-requests/${rq2.body.id}/review`, adminToken, { approve: true });
    check('coach: approve ok', app2.status === 200, `status ${app2.status} ${JSON.stringify(app2.body).slice(0,90)}`);
    const cAtime2 = (await db.query(`SELECT to_char("startsAt",'YYYY-MM-DD"T"HH24:MI:SS"Z"') t FROM "ClassSession" WHERE id=$1`, [cA])).rows[0].t;
    check('approve: class actually moved', new Date(cAtime2).toISOString() === new Date(newAt2).toISOString(), `${cAtime2} vs ${newAt2}`);
    const ctr1 = (await db.query(`SELECT "teacherRescheduleCounter" FROM "StudentSubscription" WHERE "studentId"=$1`, [stu.studentId])).rows[0];
    check('approve: teacher counter → 1', Number(ctr1.teacherRescheduleCounter) === 1, String(ctr1.teacherRescheduleCounter));

    // Request #3 on cB → APPROVE (counter → 2), then the limit blocks a 3rd.
    const t3 = await req('GET', `/subscriptions/teacher/reschedule-slots?sessionId=${cB}`, teacherToken);
    const rq3 = await req('POST', '/subscriptions/teacher/reschedule', teacherToken, { sessionId: cB, newStartsAt: slotFor(t3, 5) });
    check('teacher: 3rd request created', rq3.status === 201, `status ${rq3.status}`);
    await req('PATCH', `/subscriptions/reschedule-requests/${rq3.body.id}/review`, adminToken, { approve: true });
    const ctr2 = (await db.query(`SELECT "teacherRescheduleCounter" FROM "StudentSubscription" WHERE "studentId"=$1`, [stu.studentId])).rows[0];
    check('approve: teacher counter → 2 (limit)', Number(ctr2.teacherRescheduleCounter) === 2, String(ctr2.teacherRescheduleCounter));

    const cC = await mkSession(stu.studentId, inDays(4, 10), 'C');
    const t4 = await req('GET', `/subscriptions/teacher/reschedule-slots?sessionId=${cC}`, teacherToken);
    const over = await req('POST', '/subscriptions/teacher/reschedule', teacherToken, { sessionId: cC, newStartsAt: slotFor(t4, 1) });
    check('teacher: 3rd student reschedule refused (limit 2/cycle)', over.status === 400, `status ${over.status} ${JSON.stringify(over.body).slice(0,90)}`);

    // ─── Teacher leave (Phase 2) excludes slots & blocks reschedule ─────────
    const leaveDay = inDays(7, 0);
    const leaveDateStr = `${leaveDay.getUTCFullYear()}-${String(leaveDay.getUTCMonth() + 1).padStart(2, '0')}-${String(leaveDay.getUTCDate()).padStart(2, '0')}`;
    await db.query(
      `INSERT INTO "LeaveRequest" (id,"userId","leaveType","startDate","endDate",reason,status,"createdAt","updatedAt")
       VALUES (gen_random_uuid(),$1,'CASUAL',$2::timestamp,$3::timestamp,$4,'APPROVED',now(),now())`,
      [teacher.userId, utcWall(inDays(7, 0)), utcWall(inDays(7, 23)), `${MARKER} leave`]);

    const lv = await mkStudent('leave', 2);
    const lvTok = token(lv.userId, 'STUDENT', lv.email);
    const cLv = await mkSession(lv.studentId, inDays(5, 10), 'LV');
    // Slot listing must not offer the leave day.
    const lvSlots = await req('GET', `/subscriptions/me/reschedule-slots?sessionId=${cLv}`, lvTok);
    check('leave: slots returned but exclude the leave day',
      lvSlots.status === 200 && Array.isArray(lvSlots.body?.days) && !lvSlots.body.days.some((d) => d.date === leaveDateStr),
      `days=${JSON.stringify((lvSlots.body?.days || []).map((d) => d.date))}`);
    // A student reschedule onto the leave day is refused with the leave message.
    const ontoLeave = await req('POST', '/subscriptions/me/reschedule', lvTok, { sessionId: cLv, newStartsAt: inDays(7, 10).toISOString() });
    check('leave: student reschedule onto leave day refused', ontoLeave.status === 400, `status ${ontoLeave.status}`);
    check('leave: refusal names teacher leave', typeof ontoLeave.body?.message === 'string' && /leave/i.test(ontoLeave.body.message), ontoLeave.body?.message);
    // A control slot the engine actually offers (guaranteed non-leave & free).
    const freeSlot = (lvSlots.body?.days || []).flatMap((d) => d.slots)[0]?.startsAt;
    check('leave: at least one free slot offered on a non-leave day', !!freeSlot);
    if (freeSlot) {
      const okDay = await req('POST', '/subscriptions/me/reschedule', lvTok, { sessionId: cLv, newStartsAt: freeSlot });
      check('leave: reschedule onto a free (non-leave) day still allowed', okDay.status === 201, `status ${okDay.status} ${JSON.stringify(okDay.body).slice(0,90)}`);

      // ─── Staff student-reschedule log (read-only audit feed) ──────────────
      const log = await req('GET', '/subscriptions/reschedule-log', adminToken);
      check('log: student-reschedule feed ok', log.status === 200 && Array.isArray(log.body), `status ${log.status}`);
      check('log: the student self-reschedule appears', (log.body || []).some((e) => e.student?.id === lv.studentId), 'not found in reschedule-log');
    }
  } finally {
    await cleanup();
    await db.end();
    console.log(`\n${pass} passed, ${fail} failed`);
    if (fails.length) { console.log('FAILURES:\n - ' + fails.join('\n - ')); process.exit(1); }
  }
})().catch((e) => { console.error(e); process.exit(1); });
