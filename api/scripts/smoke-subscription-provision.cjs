/*
 * Smoke test — Phase 3 (trial → enrolment provisions the full subscription).
 *
 * Sets up a lead + a reported trial carrying a teacher and a chosen schedule
 * (days + time + package), converts it through the real coach-decision endpoint,
 * and asserts the enrolment produced a Batch on those days, recurring class
 * sessions, a recurring fee assignment, the stored StudentSubscription and a
 * first invoice — all in the family's currency.
 *
 * Run: node scripts/smoke-subscription-provision.cjs   (needs API running + env)
 */
require('dotenv/config');
const jwt = require('jsonwebtoken');
const { Client } = require('pg');

const BASE = process.env.SMOKE_BASE || 'http://localhost:5000/api';
const SECRET = process.env.JWT_ACCESS_SECRET;
const MARKER = 'zz-smoke-prov';

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

(async () => {
  if (!SECRET) throw new Error('JWT_ACCESS_SECRET is not set');
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();

  const leadEmail = `${MARKER}-parent@example.test`;
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

  try {
    await cleanup();
    const admin = (await db.query(`SELECT id, email FROM "User" WHERE role='ADMIN' LIMIT 1`)).rows[0];
    const adminToken = token(admin.id, 'ADMIN', admin.email);
    const teacher = (await db.query(`SELECT id FROM "TeacherProfile" ORDER BY id LIMIT 1`)).rows[0];
    const course = (await db.query(`SELECT id FROM "Course" WHERE status='PUBLISHED' ORDER BY id LIMIT 1`)).rows[0];
    const monthly = (await db.query(`SELECT id FROM "SubscriptionModel" WHERE key='MONTHLY' LIMIT 1`)).rows[0];
    check('fixtures present (teacher/course/model)', !!teacher && !!course && !!monthly);
    if (!teacher || !course || !monthly) throw new Error('missing fixtures');

    // Fee plan priced in all three currencies, and a Monthly package that uses it.
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

    // Lead in the UAE (billed AED), with a reported trial that carries the teacher
    // and the chosen schedule.
    const lead = (await db.query(
      `INSERT INTO "Lead" (id,"leadNumber","studentFirstName","studentLastName",email,mobile,country,status,"createdAt","updatedAt")
       VALUES (gen_random_uuid(),$1,'Prov','Kid',$2,'+971500000000','AE','TRIAL_COMPLETED',now(),now()) RETURNING id`,
      [`${MARKER}-${Date.now()}`, leadEmail],
    )).rows[0];
    await db.query(
      `INSERT INTO "LeadTrial" (id,"leadId","teacherId","scheduledAt","durationMins",status,
         "preferredPackage","preferredDays","preferredTime","preferredStartDate","recommendedCourseId","reportSubmittedAt","assessedLevel","createdAt","updatedAt")
       VALUES (gen_random_uuid(),$1,$2,now() - interval '1 day',60,'COMPLETED',
         $3,ARRAY['Monday','Wednesday','Friday'],'18:00',now() + interval '3 days',$4,now(),'Advanced',now(),now())`,
      [lead.id, teacher.id, pkgName, course.id],
    );

    // Convert.
    const decided = await req('POST', `/leads/${lead.id}/decision`, adminToken, { decision: 'ENROLL', notes: `${MARKER}` });
    check('coach can enrol the family', decided.status === 201, `status ${decided.status} ${JSON.stringify(decided.body).slice(0, 160)}`);

    // The converted student.
    const sp = (await db.query(`SELECT id FROM "StudentProfile" WHERE "parentEmail" = $1 ORDER BY id DESC LIMIT 1`, [leadEmail])).rows[0];
    check('a student profile was created', !!sp);
    if (!sp) throw new Error('no student created');

    let sub = (await db.query(`SELECT * FROM "StudentSubscription" WHERE "studentId" = $1`, [sp.id])).rows[0];
    check('subscription record created', !!sub);
    // Payment-gated: at enrolment the subscription is PENDING_PAYMENT with the
    // agreed snapshot, but no batch/sessions until the first invoice is paid.
    check('subscription is PENDING_PAYMENT before payment', sub && sub.status === 'PENDING_PAYMENT', sub?.status);
    check('subscription model = MONTHLY', sub && sub.modelId === monthly.id);
    check('subscription duration=60', sub && Number(sub.durationMinutes) === 60);
    check('subscription weekly=3', sub && Number(sub.weeklyClasses) === 3);
    check('subscription monthlyHours=12', sub && Number(sub.monthlyHours) === 12, String(sub?.monthlyHours));
    check('subscription price AED 440', sub && Number(sub.monthlyPrice) === 440, String(sub?.monthlyPrice));
    check('subscription currency AED', sub && sub.currency === 'AED');
    check('subscription rescheduleLimit=6', sub && Number(sub.rescheduleLimit) === 6);
    check('subscription familyDiscountPct=10', sub && Number(sub.familyDiscountPct) === 10);
    check('no batch before payment', sub && !sub.batchId);

    // Enrolment invoice raised at conversion — pay it to activate.
    const inv = (await db.query(`SELECT id, amount, currency FROM "Invoice" WHERE "studentId" = $1 ORDER BY "issuedAt" DESC LIMIT 1`, [sp.id])).rows[0];
    check('first invoice raised in AED 440', inv && Number(inv.amount) === 440 && inv.currency === 'AED', JSON.stringify(inv));
    const payMonthly = await req('POST', `/finance/invoices/${inv.id}/payments`, adminToken, { amount: 440, method: 'CASH' });
    check('payment recorded', payMonthly.status === 201 || payMonthly.status === 200, `status ${payMonthly.status}`);

    sub = (await db.query(`SELECT * FROM "StudentSubscription" WHERE id = $1`, [sub.id])).rows[0];
    check('subscription ACTIVE after payment', sub && sub.status === 'ACTIVE', sub?.status);
    check('subscription remaining=12 after activation', sub && Number(sub.remainingClasses) === 12, String(sub?.remainingClasses));

    const batch = sub?.batchId ? (await db.query(`SELECT * FROM "Batch" WHERE id = $1`, [sub.batchId])).rows[0] : null;
    check('a batch was created and linked on payment', !!batch);
    check('batch has the chosen days', batch && batch.daysOfWeek.join(',') === 'Monday,Wednesday,Friday', batch?.daysOfWeek?.join(','));
    check('batch end = start + 60min (19:00)', batch && batch.endTime === '19:00', batch?.endTime);

    const sessions = batch ? (await db.query(`SELECT COUNT(*)::int AS n FROM "ClassSession" WHERE "batchId" = $1`, [batch.id])).rows[0].n : 0;
    check('recurring class sessions generated on payment', sessions > 0, `got ${sessions}`);

    const fa = sub?.feeAssignmentId ? (await db.query(`SELECT active FROM "StudentFeeAssignment" WHERE id = $1`, [sub.feeAssignmentId])).rows[0] : null;
    check('recurring fee assignment created & linked', fa && fa.active === true);

    // ── Hourly scenario: rate AED 40/hr, 60-min, 3×/week → tuition AED 480 ──
    const hourly = (await db.query(`SELECT id FROM "SubscriptionModel" WHERE key='HOURLY' LIMIT 1`)).rows[0];
    const hPkgName = `${MARKER} Premium Hourly`;
    await db.query(
      `INSERT INTO "Package" (id,name,"priceUSD","priceAED","priceGBP","classesPerMonth",active,"createdAt",
         "modelId",tier,"hourlyRateUSD","hourlyRateAED","hourlyRateGBP","rescheduleLimit","familyDiscountPct","eSyllabus")
       VALUES (gen_random_uuid(),$1,0,NULL,NULL,0,true,now(),$2,'Premium',11,40,11,4,5,true)`,
      [hPkgName, hourly.id],
    );
    const hLeadEmail = `${MARKER}-hparent@example.test`;
    const hLead = (await db.query(
      `INSERT INTO "Lead" (id,"leadNumber","studentFirstName","studentLastName",email,mobile,country,status,"createdAt","updatedAt")
       VALUES (gen_random_uuid(),$1,'Hourly','Kid',$2,'+971500000001','AE','TRIAL_COMPLETED',now(),now()) RETURNING id`,
      [`${MARKER}-H-${Date.now()}`, hLeadEmail],
    )).rows[0];
    await db.query(
      `INSERT INTO "LeadTrial" (id,"leadId","teacherId","scheduledAt","durationMins",status,
         "preferredPackage","preferredDays","preferredTime","preferredStartDate","recommendedCourseId","reportSubmittedAt","assessedLevel","createdAt","updatedAt")
       VALUES (gen_random_uuid(),$1,$2,now() - interval '1 day',60,'COMPLETED',
         $3,ARRAY['Monday','Wednesday','Friday'],'18:00',now() + interval '3 days',$4,now(),'Advanced',now(),now())`,
      [hLead.id, teacher.id, hPkgName, course.id],
    );
    const hDecided = await req('POST', `/leads/${hLead.id}/decision`, adminToken, { decision: 'ENROLL', notes: `${MARKER}H` });
    check('hourly: coach can enrol', hDecided.status === 201, `status ${hDecided.status}`);
    const hsp = (await db.query(`SELECT id FROM "StudentProfile" WHERE "parentEmail" = $1 ORDER BY id DESC LIMIT 1`, [hLeadEmail])).rows[0];
    const hsub = hsp ? (await db.query(`SELECT * FROM "StudentSubscription" WHERE "studentId" = $1`, [hsp.id])).rows[0] : null;
    check('hourly: subscription pricingMode HOURLY', hsub && hsub.pricingMode === 'HOURLY');
    check('hourly: hourlyRate = 40', hsub && Number(hsub.hourlyRate) === 40, String(hsub?.hourlyRate));
    check('hourly: monthlyPrice = tuition 480', hsub && Number(hsub.monthlyPrice) === 480, String(hsub?.monthlyPrice));
    check('hourly: monthlyHours = 12', hsub && Number(hsub.monthlyHours) === 12);
    const hInv = hsp ? (await db.query(`SELECT amount, currency FROM "Invoice" WHERE "studentId" = $1 ORDER BY "issuedAt" DESC LIMIT 1`, [hsp.id])).rows[0] : null;
    check('hourly: first invoice = computed AED 480 (not fixed price)', hInv && Number(hInv.amount) === 480 && hInv.currency === 'AED', JSON.stringify(hInv));
  } finally {
    await cleanup();
    await db.end();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) { console.log('Failures:\n  - ' + fails.join('\n  - ')); process.exit(1); }
})().catch((err) => { console.error(err); process.exit(1); });
