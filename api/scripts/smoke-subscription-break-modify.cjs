/*
 * Smoke test — Student break management + AC "Modify Schedule" with scope.
 *
 * Sets up two paid, ACTIVE subscriptions (batch + 28-day schedule) the same way
 * the payment-gate flow does, then exercises the new module over HTTP:
 *
 *  Student A — break:
 *    · student raises a break request (PENDING, BREAK_REQUEST)
 *    · a second break request while one is pending is refused
 *    · admin approves a break starting today → sub flips to ON_BREAK immediately,
 *      in-window classes are CANCELLED (no hours consumed), the cycle is extended
 *      by the break, and the request is APPLIED
 *    · a change request while ON_BREAK is refused
 *
 *  Student B — modify schedule:
 *    · preview NEXT_ONLY returns 0 affected + no rows touched
 *    · apply CURRENT_AND_NEXT (new time) cancels the cycle's classes, regenerates
 *      them at the new time, and rewrites the batch template
 *    · apply NEXT_ONLY (new days) queues a SubscriptionNextCycle row, current
 *      classes untouched
 *
 * Run: node scripts/smoke-subscription-break-modify.cjs   (needs API running + env)
 */
require('dotenv/config');
const jwt = require('jsonwebtoken');
const { Client } = require('pg');

const BASE = process.env.SMOKE_BASE || 'http://localhost:5000/api';
const SECRET = process.env.JWT_ACCESS_SECRET;
const MARKER = 'zz-smoke-brkmod';

let pass = 0, fail = 0;
const fails = [];
const check = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; fails.push(`${name}${detail ? ` — ${detail}` : ''}`); console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
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
const isoDate = (offsetDays) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
};

(async () => {
  if (!SECRET) throw new Error('JWT_ACCESS_SECRET is not set');
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  let savedAvailability;
  let savedCourseId;
  let savedTeacherId;
  const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const WIDE_AVAIL = JSON.stringify(Object.fromEntries(WEEKDAYS.map((d) => [d, [{ from: '00:00', to: '23:59' }]])));

  const cleanup = async () => {
    if (savedTeacherId !== undefined) {
      const restore = savedAvailability == null ? null : JSON.stringify(savedAvailability);
      await db.query(`UPDATE "TeacherProfile" SET availability = $2::jsonb, "courseId" = $3 WHERE id = $1`, [savedTeacherId, restore, savedCourseId ?? null]);
    }
    const users = await db.query(`SELECT id FROM "User" WHERE email LIKE $1`, [`%${MARKER}%`]);
    for (const u of users.rows) await db.query(`DELETE FROM "User" WHERE id = $1`, [u.id]);
    await db.query(`DELETE FROM "ClassSession" WHERE "batchId" IN (SELECT id FROM "Batch" WHERE name LIKE $1)`, [`${MARKER}%`]);
    await db.query(`DELETE FROM "Batch" WHERE name LIKE $1`, [`${MARKER}%`]);
    await db.query(`DELETE FROM "StudentFeeAssignment" WHERE "planId" IN (SELECT id FROM "FeePlan" WHERE name LIKE $1)`, [`${MARKER}%`]);
    await db.query(`DELETE FROM "FeePlan" WHERE name LIKE $1`, [`${MARKER}%`]);
    await db.query(`DELETE FROM "Package" WHERE name LIKE $1`, [`${MARKER}%`]);
    await db.query(`DELETE FROM "LeadTrial" WHERE "leadId" IN (SELECT id FROM "Lead" WHERE "leadNumber" LIKE $1)`, [`${MARKER}%`]);
    await db.query(`DELETE FROM "Lead" WHERE "leadNumber" LIKE $1`, [`${MARKER}%`]);
  };

  // Convert a lead and pay its first invoice → returns an ACTIVE student id.
  const activeStudent = async (adminToken, teacherId, courseId, pkgName, tag) => {
    const email = `${MARKER}-${tag}@example.test`;
    const lead = (await db.query(
      `INSERT INTO "Lead" (id,"leadNumber","studentFirstName","studentLastName",email,mobile,country,status,"preferredTeacherGender","createdAt","updatedAt")
       VALUES (gen_random_uuid(),$1,'Brk',$2,$3,'+971500000000','AE','TRIAL_COMPLETED','Either',now(),now()) RETURNING id`,
      [`${MARKER}-${tag}-${Date.now()}`, tag, email],
    )).rows[0];
    await db.query(
      `INSERT INTO "LeadTrial" (id,"leadId","teacherId","scheduledAt","durationMins",status,
         "preferredPackage","preferredDays","preferredTime","preferredStartDate","recommendedCourseId","reportSubmittedAt","assessedLevel","createdAt","updatedAt")
       VALUES (gen_random_uuid(),$1,$2,now() - interval '1 day',60,'COMPLETED',
         $3,ARRAY['Monday','Wednesday','Friday'],'18:00',now() + interval '2 days',$4,now(),'Advanced',now(),now())`,
      [lead.id, teacherId, pkgName, courseId],
    );
    await req('POST', `/leads/${lead.id}/decision`, adminToken, { decision: 'ENROLL', notes: MARKER });
    const sp = (await db.query(`SELECT id, "userId" FROM "StudentProfile" WHERE "parentEmail" = $1 ORDER BY id DESC LIMIT 1`, [email])).rows[0];
    const inv = (await db.query(`SELECT id FROM "Invoice" WHERE "studentId"=$1 ORDER BY "issuedAt" DESC LIMIT 1`, [sp.id])).rows[0];
    await req('POST', `/finance/invoices/${inv.id}/payments`, adminToken, { amount: 440, method: 'CASH' });
    return sp;
  };

  try {
    await cleanup();
    const admin = (await db.query(`SELECT id, email FROM "User" WHERE role='ADMIN' LIMIT 1`)).rows[0];
    const adminToken = token(admin.id, 'ADMIN', admin.email);
    const teacher = (await db.query(`SELECT id, availability, "courseId" FROM "TeacherProfile" ORDER BY id LIMIT 1`)).rows[0];
    const course = (await db.query(`SELECT id FROM "Course" WHERE status='PUBLISHED' ORDER BY id LIMIT 1`)).rows[0];
    // Give this teacher wide-open hours (so the modify tests' arbitrary times pass
    // the availability guard) and point them at the test course (so the enrollment
    // search can match them). Both restored in finally.
    savedAvailability = teacher.availability;
    savedCourseId = teacher.courseId;
    savedTeacherId = teacher.id;
    await db.query(`UPDATE "TeacherProfile" SET availability = $2::jsonb, "courseId" = $3 WHERE id = $1`, [teacher.id, WIDE_AVAIL, course.id]);
    const monthly = (await db.query(`SELECT id FROM "SubscriptionModel" WHERE key='MONTHLY' LIMIT 1`)).rows[0];
    check('fixtures present', !!teacher && !!course && !!monthly);
    if (!teacher || !course || !monthly) throw new Error('missing fixtures');

    const plan = (await db.query(
      `INSERT INTO "FeePlan" (id,name,cycle,active,"createdAt","updatedAt") VALUES (gen_random_uuid(),$1,'MONTHLY',true,now(),now()) RETURNING id`,
      [`${MARKER} plan`],
    )).rows[0];
    await db.query(
      `INSERT INTO "FeePlanComponent" (id,"planId",type,label,"amountUSD","amountAED","amountGBP")
       VALUES (gen_random_uuid(),$1,'COURSE','Tuition',120,440,96)`, [plan.id]);
    const pkgName = `${MARKER} Elite Monthly`;
    await db.query(
      `INSERT INTO "Package" (id,name,"priceUSD","priceAED","priceGBP","classesPerMonth",active,"createdAt",
         "modelId",tier,"durationMinutes","weeklyClasses","monthlyHours","rescheduleLimit","familyDiscountPct","feePlanId","eSyllabus")
       VALUES (gen_random_uuid(),$1,120,440,96,12,true,now(),$2,'Elite',60,3,12,6,10,$3,true)`,
      [pkgName, monthly.id, plan.id],
    );

    // ─── Student A — BREAK ────────────────────────────────────────────────
    const a = await activeStudent(adminToken, teacher.id, course.id, pkgName, 'brk');
    check('A: student active', !!a?.id && !!a?.userId);
    let subA = (await db.query(`SELECT * FROM "StudentSubscription" WHERE "studentId"=$1`, [a.id])).rows[0];
    check('A: sub ACTIVE with batch', subA && subA.status === 'ACTIVE' && !!subA.batchId, subA?.status);
    const studentAToken = token(a.userId, 'STUDENT', `${MARKER}-brk@example.test`);
    const renewalBefore = new Date((await db.query(`SELECT "renewalDate" d FROM "StudentSubscription" WHERE id=$1`, [subA.id])).rows[0].d);

    // Student raises a break request.
    const brk = await req('POST', '/subscriptions/me/requests/break', studentAToken, {
      startDate: isoDate(0), endDate: isoDate(7), reason: 'family travel',
    });
    check('A: break request accepted', brk.status === 201 || brk.status === 200, `status ${brk.status} ${JSON.stringify(brk.body)}`);
    const reqRow = (await db.query(`SELECT * FROM "SubscriptionRequest" WHERE "studentId"=$1 AND type='BREAK_REQUEST' ORDER BY "createdAt" DESC LIMIT 1`, [a.id])).rows[0];
    check('A: break request stored PENDING', reqRow && reqRow.status === 'PENDING', reqRow?.status);
    check('A: break window persisted', reqRow && !!reqRow.breakStartDate && !!reqRow.breakEndDate);

    // A second pending break is refused.
    const brk2 = await req('POST', '/subscriptions/me/requests/break', studentAToken, { startDate: isoDate(1), endDate: isoDate(5) });
    check('A: second pending break refused', brk2.status === 400, `status ${brk2.status}`);

    // How many future classes fall in the break window (they should be cancelled).
    const inWindow = (await db.query(
      `SELECT COUNT(*)::int n FROM "ClassSession" WHERE "batchId"=$1 AND status='SCHEDULED' AND "startsAt" < $2`,
      [subA.batchId, isoDate(7) + ' 00:00:00'],
    )).rows[0].n;

    // Admin approves — start is today, so the break begins immediately.
    const appr = await req('PATCH', `/subscriptions/requests/${reqRow.id}/review`, adminToken, { approve: true, notes: 'ok' });
    check('A: break approved', appr.status === 200, `status ${appr.status} ${JSON.stringify(appr.body)}`);

    subA = (await db.query(`SELECT * FROM "StudentSubscription" WHERE id=$1`, [subA.id])).rows[0];
    check('A: sub is ON_BREAK after approval (start today)', subA.status === 'ON_BREAK', subA.status);
    const cancelled = (await db.query(`SELECT COUNT(*)::int n FROM "ClassSession" WHERE "batchId"=$1 AND status='CANCELLED'`, [subA.batchId])).rows[0].n;
    check('A: in-window classes cancelled', cancelled >= inWindow && cancelled > 0, `cancelled ${cancelled}, window ${inWindow}`);
    check('A: remaining classes NOT consumed by break', Number(subA.remainingClasses) === 12, String(subA.remainingClasses));
    const renewalAfter = new Date(subA.renewalDate);
    check('A: renewal extended by the break (~7 days)', renewalAfter > renewalBefore, `${renewalBefore.toISOString()} → ${renewalAfter.toISOString()}`);
    const reqApplied = (await db.query(`SELECT status FROM "SubscriptionRequest" WHERE id=$1`, [reqRow.id])).rows[0];
    check('A: break request marked APPLIED', reqApplied.status === 'APPLIED', reqApplied.status);

    // A change request while ON_BREAK is refused (needs an ACTIVE subscription).
    const pkgWhileBreak = await req('POST', '/subscriptions/me/requests/schedule', studentAToken, { days: ['Tuesday'], time: '17:00' });
    check('A: schedule change refused while ON_BREAK', pkgWhileBreak.status === 400, `status ${pkgWhileBreak.status}`);

    // §8.5: A's Mon 18:00 slot must stay reserved for the teacher DURING the break —
    // the enrollment search must not offer that teacher on that slot to a new student.
    const reserved = await req('GET', `/leads/enrollment-teachers?days=Monday&time=18:00&durationMinutes=60&courseId=${course.id}`, adminToken);
    const rIds = (reserved.body?.matching ?? []).map((m) => m.teacherId);
    check('A: ON_BREAK keeps the Mon 18:00 slot reserved (teacher not offered free)', !rIds.includes(teacher.id), `matching:${JSON.stringify(rIds)}`);
    // Control: on a genuinely free slot the same teacher IS offered — proving the
    // exclusion above is the break reservation, not a blanket miss.
    const ctrl = await req('GET', `/leads/enrollment-teachers?days=Sunday&time=05:00&durationMinutes=60&courseId=${course.id}`, adminToken);
    const cIds = (ctrl.body?.matching ?? []).map((m) => m.teacherId);
    check('A: control — teacher IS offered on a genuinely free slot (Sun 05:00)', cIds.includes(teacher.id), `matching:${JSON.stringify(cIds)}`);

    // ─── Student B — MODIFY SCHEDULE ──────────────────────────────────────
    const b = await activeStudent(adminToken, teacher.id, course.id, pkgName, 'mod');
    check('B: student active', !!b?.id);
    const subB = (await db.query(`SELECT * FROM "StudentSubscription" WHERE "studentId"=$1`, [b.id])).rows[0];
    check('B: sub ACTIVE with batch', subB && subB.status === 'ACTIVE' && !!subB.batchId, subB?.status);

    // Preview NEXT_ONLY — nothing in the current cycle is affected, nothing written.
    const prev = await req('POST', `/subscriptions/student/${b.id}/modify-schedule/preview`, adminToken, {
      scope: 'NEXT_ONLY', days: ['Tuesday', 'Thursday'], time: '19:00',
    });
    check('B: preview ok', prev.status === 201 || prev.status === 200, `status ${prev.status}`);
    check('B: preview NEXT_ONLY affects 0 current classes', prev.body && prev.body.affectedCount === 0, JSON.stringify(prev.body?.affectedCount));
    const queued0 = (await db.query(`SELECT COUNT(*)::int n FROM "SubscriptionNextCycle" WHERE "studentId"=$1`, [b.id])).rows[0].n;
    check('B: preview writes nothing', queued0 === 0);

    const futureBefore = (await db.query(`SELECT COUNT(*)::int n FROM "ClassSession" WHERE "batchId"=$1 AND status='SCHEDULED' AND "startsAt" >= now()`, [subB.batchId])).rows[0].n;

    // Apply CURRENT_AND_NEXT — change the time; classes are rebuilt and batch rewritten.
    const applyNow = await req('POST', `/subscriptions/student/${b.id}/modify-schedule`, adminToken, {
      scope: 'CURRENT_AND_NEXT', time: '20:00',
    });
    check('B: modify CURRENT_AND_NEXT ok', applyNow.status === 201 || applyNow.status === 200, `status ${applyNow.status} ${JSON.stringify(applyNow.body)}`);
    const batchRow = (await db.query(`SELECT "startTime" FROM "Batch" WHERE id=$1`, [subB.batchId])).rows[0];
    check('B: batch template retimed to 20:00', batchRow.startTime === '20:00', batchRow.startTime);
    const at20 = (await db.query(`SELECT COUNT(*)::int n FROM "ClassSession" WHERE "batchId"=$1 AND status='SCHEDULED' AND to_char("startsAt",'HH24:MI')='20:00'`, [subB.batchId])).rows[0].n;
    check('B: future classes regenerated at 20:00', at20 > 0, `got ${at20}`);
    const at18 = (await db.query(`SELECT COUNT(*)::int n FROM "ClassSession" WHERE "batchId"=$1 AND status='SCHEDULED' AND to_char("startsAt",'HH24:MI')='18:00' AND "startsAt">=now()`, [subB.batchId])).rows[0].n;
    check('B: old-time future classes gone', at18 === 0, `still ${at18}`);
    check('B: applied summary reports rescheduled', applyNow.body && Array.isArray(applyNow.body.applied) && applyNow.body.created > 0, JSON.stringify(applyNow.body));
    void futureBefore;

    // Apply NEXT_ONLY — change days; queued for next cycle, current classes untouched.
    const applyNext = await req('POST', `/subscriptions/student/${b.id}/modify-schedule`, adminToken, {
      scope: 'NEXT_ONLY', days: ['Tuesday', 'Thursday'], time: '20:00',
    });
    check('B: modify NEXT_ONLY ok', applyNext.status === 201 || applyNext.status === 200, `status ${applyNext.status}`);
    const queued = (await db.query(`SELECT * FROM "SubscriptionNextCycle" WHERE "studentId"=$1`, [b.id])).rows[0];
    check('B: NEXT_ONLY queued a next-cycle row', !!queued && queued.nextDays.join(',') === 'Tuesday,Thursday', JSON.stringify(queued?.nextDays));
    const stillAt20 = (await db.query(`SELECT COUNT(*)::int n FROM "ClassSession" WHERE "batchId"=$1 AND status='SCHEDULED' AND to_char("startsAt",'HH24:MI')='20:00'`, [subB.batchId])).rows[0].n;
    check('B: NEXT_ONLY did not touch current classes', stillAt20 === at20, `${stillAt20} vs ${at20}`);

    // ─── Item 1: student-clash detection ──────────────────────────────────
    const clashBatch = (await db.query(
      `INSERT INTO "Batch" (id,code,name,"courseId","teacherId","daysOfWeek","startTime","endTime","startDate",status,"createdAt","updatedAt")
       VALUES (gen_random_uuid(),$1,$2,$3,$4,ARRAY['Tuesday'],'16:00','17:00',now(),'ACTIVE',now(),now()) RETURNING id`,
      [`${MARKER}-CLASH-${Date.now()}`, `${MARKER} clash batch`, course.id, teacher.id],
    )).rows[0];
    await db.query(`INSERT INTO "BatchStudent" (id,"batchId","studentId") VALUES (gen_random_uuid(),$1,$2)`, [clashBatch.id, b.id]);
    const prevClash = await req('POST', `/subscriptions/student/${b.id}/modify-schedule/preview`, adminToken, {
      scope: 'CURRENT_AND_NEXT', days: ['Tuesday'], time: '16:00',
    });
    check('B: preview flags the student clash', prevClash.body && Array.isArray(prevClash.body.studentClashes) && prevClash.body.studentClashes.length > 0, JSON.stringify(prevClash.body?.studentClashes));

    // ─── Item 2: class count capped to the plan allowance ─────────────────
    // Ask for all five weekdays — uncapped that is ~20 classes over 28 days; the
    // plan owes 12, so the generator must stop at the remaining allowance.
    const cap = await req('POST', `/subscriptions/student/${b.id}/modify-schedule`, adminToken, {
      scope: 'CURRENT_AND_NEXT', days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], time: '20:00',
    });
    check('B: 5-day modify ok', cap.status === 200 || cap.status === 201, `status ${cap.status} ${JSON.stringify(cap.body)}`);
    const futAt20 = (await db.query(`SELECT COUNT(*)::int n FROM "ClassSession" WHERE "batchId"=$1 AND status='SCHEDULED' AND to_char("startsAt",'HH24:MI')='20:00' AND "startsAt">=now()`, [subB.batchId])).rows[0].n;
    check('B: generated classes capped to the plan allowance (>0 and <=12)', futAt20 > 0 && futAt20 <= 12, `got ${futAt20}`);
  } finally {
    await cleanup();
    await db.end();
    console.log(`\n${pass} passed, ${fail} failed`);
    if (fails.length) { console.log('FAILURES:\n - ' + fails.join('\n - ')); process.exit(1); }
  }
})().catch((e) => { console.error(e); process.exit(1); });
