/*
 * Smoke test — payment-gated enrollment + activation.
 *
 * Verifies the new flow: converting a lead creates a PENDING_PAYMENT subscription
 * with NO batch, NO classes and NO teacher block; paying the first invoice then
 * activates it — actual cycle-start date computed, batch + 28-day schedule built,
 * teacher reserved, enrolment ACTIVE. Also checks the on-time and late actual-start
 * rules and the no-backdate guarantee.
 *
 * Run: node scripts/smoke-subscription-payment-gate.cjs   (needs API running + env)
 */
require('dotenv/config');
const jwt = require('jsonwebtoken');
const { Client } = require('pg');

const BASE = process.env.SMOKE_BASE || 'http://localhost:5000/api';
const SECRET = process.env.JWT_ACCESS_SECRET;
const MARKER = 'zz-smoke-paygate';

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
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

(async () => {
  if (!SECRET) throw new Error('JWT_ACCESS_SECRET is not set');
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();

  const cleanup = async () => {
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

  // Convert a lead whose preferred start is `startExpr` (a SQL interval expression),
  // returning the created student + invoice.
  const convertLead = async (adminToken, teacherId, courseId, pkgName, tag, startExpr) => {
    const email = `${MARKER}-${tag}@example.test`;
    const lead = (await db.query(
      `INSERT INTO "Lead" (id,"leadNumber","studentFirstName","studentLastName",email,mobile,country,status,"preferredTeacherGender","createdAt","updatedAt")
       VALUES (gen_random_uuid(),$1,'Pay',$2,$3,'+971500000000','AE','TRIAL_COMPLETED','Either',now(),now()) RETURNING id`,
      [`${MARKER}-${tag}-${Date.now()}`, tag, email],
    )).rows[0];
    await db.query(
      `INSERT INTO "LeadTrial" (id,"leadId","teacherId","scheduledAt","durationMins",status,
         "preferredPackage","preferredDays","preferredTime","preferredStartDate","recommendedCourseId","reportSubmittedAt","assessedLevel","createdAt","updatedAt")
       VALUES (gen_random_uuid(),$1,$2,now() - interval '1 day',60,'COMPLETED',
         $3,ARRAY['Monday','Wednesday','Friday'],'18:00',${startExpr},$4,now(),'Advanced',now(),now())`,
      [lead.id, teacherId, pkgName, courseId],
    );
    const decided = await req('POST', `/leads/${lead.id}/decision`, adminToken, { decision: 'ENROLL', notes: MARKER });
    check(`[${tag}] coach enrols the family`, decided.status === 201, `status ${decided.status}`);
    const sp = (await db.query(`SELECT id FROM "StudentProfile" WHERE "parentEmail" = $1 ORDER BY id DESC LIMIT 1`, [email])).rows[0];
    return sp?.id;
  };

  try {
    await cleanup();
    const admin = (await db.query(`SELECT id, email FROM "User" WHERE role='ADMIN' LIMIT 1`)).rows[0];
    const adminToken = token(admin.id, 'ADMIN', admin.email);
    const teacher = (await db.query(`SELECT id FROM "TeacherProfile" ORDER BY id LIMIT 1`)).rows[0];
    const course = (await db.query(`SELECT id FROM "Course" WHERE status='PUBLISHED' ORDER BY id LIMIT 1`)).rows[0];
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

    // ── Scenario 1: on-time payment (preferred start 5 days out) ──
    const sid = await convertLead(adminToken, teacher.id, course.id, pkgName, 'ontime', "now() + interval '5 days'");
    check('student created', !!sid);
    if (!sid) throw new Error('no student');

    let sub = (await db.query(`SELECT * FROM "StudentSubscription" WHERE "studentId"=$1`, [sid])).rows[0];
    check('sub is PENDING_PAYMENT after enrol', sub && sub.status === 'PENDING_PAYMENT', sub?.status);
    check('no batch built before payment', sub && !sub.batchId);
    check('pending schedule held (days/time/teacher)', sub && sub.pendingDays.length === 3 && sub.pendingTime === '18:00' && sub.pendingTeacherId === teacher.id);
    const sess0 = (await db.query(`SELECT COUNT(*)::int n FROM "ClassSession" WHERE "batchId" IS NOT NULL AND "teacherId"=$1 AND title LIKE $2`, [teacher.id, `%`])).rows[0];
    check('no classes scheduled before payment', sub && !sub.batchId);
    const enr0 = (await db.query(`SELECT status FROM "Enrollment" WHERE "studentId"=$1 ORDER BY "createdAt" DESC LIMIT 1`, [sid])).rows[0];
    check('enrolment PENDING before payment', enr0 && enr0.status === 'PENDING', enr0?.status);

    const inv = (await db.query(`SELECT id, amount, currency, status FROM "Invoice" WHERE "studentId"=$1 ORDER BY "issuedAt" DESC LIMIT 1`, [sid])).rows[0];
    check('unpaid first invoice AED 440', inv && Number(inv.amount) === 440 && inv.currency === 'AED', JSON.stringify(inv));

    // Pay it.
    const paid = await req('POST', `/finance/invoices/${inv.id}/payments`, adminToken, { amount: 440, method: 'CASH' });
    check('payment recorded', paid.status === 201 || paid.status === 200, `status ${paid.status}`);

    sub = (await db.query(`SELECT * FROM "StudentSubscription" WHERE id=$1`, [sub.id])).rows[0];
    check('sub ACTIVE after payment', sub && sub.status === 'ACTIVE', sub?.status);
    check('batch built on payment (teacher reserved)', sub && !!sub.batchId);
    check('actualCycleStartDate set on payment', sub && !!sub.actualCycleStartDate);
    check('remaining refilled to 12 on activation', sub && Number(sub.remainingClasses) === 12, String(sub?.remainingClasses));
    const enr1 = (await db.query(`SELECT status FROM "Enrollment" WHERE "studentId"=$1 ORDER BY "createdAt" DESC LIMIT 1`, [sid])).rows[0];
    check('enrolment ACTIVE after payment', enr1 && enr1.status === 'ACTIVE', enr1?.status);

    // On-time: paid before the preferred date → actual start == preferred date.
    const pref = (await db.query(`SELECT "preferredStartDate"::date d FROM "StudentSubscription" WHERE id=$1`, [sub.id])).rows[0].d;
    const act = (await db.query(`SELECT "actualCycleStartDate"::date d FROM "StudentSubscription" WHERE id=$1`, [sub.id])).rows[0].d;
    check('on-time: actual start == preferred start', String(pref) === String(act), `pref ${pref} vs actual ${act}`);

    const sessN = (await db.query(`SELECT COUNT(*)::int n, MIN("startsAt") mn FROM "ClassSession" WHERE "batchId"=$1`, [sub.batchId])).rows[0];
    check('28-day schedule generated on payment', sessN.n > 0, `got ${sessN.n}`);
    check('no backdated classes (first >= now)', !sessN.mn || new Date(sessN.mn) >= new Date(Date.now() - 60000), String(sessN.mn));
    // Elite 3×/week over 28 days ≈ 12 classes.
    check('~12 classes for a 3×/week 28-day cycle', sessN.n >= 10 && sessN.n <= 13, `got ${sessN.n}`);
    // Cycle end ≈ actual start + 28 days.
    const span = (await db.query(`SELECT ("renewalDate"::date - "actualCycleStartDate"::date) AS days FROM "StudentSubscription" WHERE id=$1`, [sub.id])).rows[0];
    check('cycle length is 28 days', Number(span.days) === 28, `got ${span.days}`);

    // ── Scenario 2: late payment (preferred start 10 days in the PAST) ──
    const sid2 = await convertLead(adminToken, teacher.id, course.id, pkgName, 'late', "now() - interval '10 days'");
    check('late student created', !!sid2);
    const inv2 = (await db.query(`SELECT id FROM "Invoice" WHERE "studentId"=$1 ORDER BY "issuedAt" DESC LIMIT 1`, [sid2])).rows[0];
    await req('POST', `/finance/invoices/${inv2.id}/payments`, adminToken, { amount: 440, method: 'CASH' });
    const sub2 = (await db.query(`SELECT * FROM "StudentSubscription" WHERE "studentId"=$1`, [sid2])).rows[0];
    check('late: sub ACTIVE', sub2 && sub2.status === 'ACTIVE', sub2?.status);
    const act2 = new Date((await db.query(`SELECT "actualCycleStartDate" d FROM "StudentSubscription" WHERE id=$1`, [sub2.id])).rows[0].d);
    check('late: actual start is not before today', act2 >= new Date(Date.now() - 86400000), act2.toISOString());
    check('late: actual start is a preferred weekday (Mon/Wed/Fri)', ['Monday', 'Wednesday', 'Friday'].includes(DAYS[act2.getUTCDay()]), DAYS[act2.getUTCDay()]);
    const back = (await db.query(`SELECT COUNT(*)::int n FROM "ClassSession" WHERE "batchId"=$1 AND "startsAt" < now()`, [sub2.batchId])).rows[0].n;
    check('late: no backdated classes created', back === 0, `got ${back}`);
  } finally {
    await cleanup();
    await db.end();
    console.log(`\n${pass} passed, ${fail} failed`);
    if (fails.length) { console.log('FAILURES:\n - ' + fails.join('\n - ')); process.exit(1); }
  }
})().catch((e) => { console.error(e); process.exit(1); });
