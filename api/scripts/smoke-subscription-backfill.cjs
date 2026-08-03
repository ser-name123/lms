/*
 * Smoke test — Phase 2 (StudentSubscription record + backfill).
 *
 * Builds a synthetic active student out of the three loose rows a subscription
 * used to be (Enrollment + Batch + StudentFeeAssignment + a Monthly Package),
 * runs the backfill, and asserts a correct StudentSubscription materialised —
 * structure derived, price snapshotted, batch/fee links carried, idempotent on
 * re-run — then checks currentFor surfaces it as `record`.
 *
 * Run: node scripts/smoke-subscription-backfill.cjs   (needs API running + env)
 */
require('dotenv/config');
const { execFileSync } = require('child_process');
const path = require('path');
const jwt = require('jsonwebtoken');
const { Client } = require('pg');

const BASE = process.env.SMOKE_BASE || 'http://localhost:5000/api';
const SECRET = process.env.JWT_ACCESS_SECRET;
const MARKER = 'zz-smoke-bf';

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; failures.push(`${name}${detail ? ` — ${detail}` : ''}`); console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
}
const token = (userId, role, email) => jwt.sign({ sub: userId, email, role }, SECRET, { expiresIn: '30m' });

(async () => {
  if (!SECRET) throw new Error('JWT_ACCESS_SECRET is not set');
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();

  const email = `${MARKER}-student@example.test`;
  const cleanup = async () => {
    const { rows } = await db.query(`SELECT id FROM "User" WHERE email = $1`, [email]);
    for (const r of rows) {
      await db.query(`DELETE FROM "StudentSubscription" WHERE "studentId" IN (SELECT id FROM "StudentProfile" WHERE "userId" = $1)`, [r.id]);
      await db.query(`DELETE FROM "User" WHERE id = $1`, [r.id]); // cascades StudentProfile/Enrollment/BatchStudent/FeeAssignment
    }
    await db.query(`DELETE FROM "Batch" WHERE name LIKE $1`, [`${MARKER}%`]);
    await db.query(`DELETE FROM "StudentFeeAssignment" WHERE "planId" IN (SELECT id FROM "FeePlan" WHERE name LIKE $1)`, [`${MARKER}%`]);
    await db.query(`DELETE FROM "FeePlan" WHERE name LIKE $1`, [`${MARKER}%`]);
    await db.query(`DELETE FROM "Enrollment" WHERE "courseId" IN (SELECT id FROM "Course" WHERE title LIKE $1)`, [`${MARKER}%`]);
    await db.query(`DELETE FROM "Course" WHERE title LIKE $1`, [`${MARKER}%`]);
    await db.query(`DELETE FROM "Package" WHERE name LIKE $1`, [`${MARKER}%`]);
  };

  try {
    await cleanup();
    const monthly = (await db.query(`SELECT id FROM "SubscriptionModel" WHERE key='MONTHLY' LIMIT 1`)).rows[0];
    check('MONTHLY model present', !!monthly);

    // Monthly package: 60-min, 3×/week → 12 hrs, 12 classes; AED 480.
    const pkg = (await db.query(
      `INSERT INTO "Package" (id,name,"priceUSD","priceAED","priceGBP","classesPerMonth",active,"createdAt",
         "modelId",tier,"durationMinutes","weeklyClasses","monthlyHours","rescheduleLimit","familyDiscountPct","displayOrder","eSyllabus")
       VALUES (gen_random_uuid(),$1,120,480,96,12,true,now(),$2,'Premium',60,3,12,4,5,0,true) RETURNING id`,
      [`${MARKER} Monthly`, monthly.id],
    )).rows[0];

    const course = (await db.query(
      `INSERT INTO "Course" (id,title,slug,price,"durationWeeks",status,"createdAt","updatedAt")
       VALUES (gen_random_uuid(),$1,$2,120,12,'PUBLISHED',now(),now()) RETURNING id`,
      [`${MARKER} Course`, `${MARKER}-course-${Date.now()}`],
    )).rows[0];

    const user = (await db.query(
      `INSERT INTO "User" (id,email,"passwordHash","firstName","lastName",role,status,"updatedAt")
       VALUES (gen_random_uuid(),$1,'x','Bf','Student','STUDENT','ACTIVE',now()) RETURNING id`,
      [email],
    )).rows[0];

    const sp = (await db.query(
      `INSERT INTO "StudentProfile" (id,"userId","studentCode","billingCurrency","nextPaymentDate")
       VALUES (gen_random_uuid(),$1,$2,'AED',now() + interval '20 days') RETURNING id`,
      [user.id, `${MARKER}-${Date.now()}`],
    )).rows[0];

    const enr = (await db.query(
      `INSERT INTO "Enrollment" (id,"studentId","courseId","packageId",status,"startedAt","createdAt","updatedAt")
       VALUES (gen_random_uuid(),$1,$2,$3,'ACTIVE',now(),now(),now()) RETURNING id`,
      [sp.id, course.id, pkg.id],
    )).rows[0];

    const batch = (await db.query(
      `INSERT INTO "Batch" (id,code,name,"courseId","daysOfWeek","startTime","endTime",status,"createdAt","updatedAt")
       VALUES (gen_random_uuid(),$1,$2,$3,ARRAY['Monday','Wednesday','Friday'],'18:00','19:00','ACTIVE',now(),now()) RETURNING id`,
      [`${MARKER}-B-${Date.now()}`, `${MARKER} Batch`, course.id],
    )).rows[0];
    await db.query(`INSERT INTO "BatchStudent" (id,"batchId","studentId","addedAt") VALUES (gen_random_uuid(),$1,$2,now())`, [batch.id, sp.id]);

    const plan = (await db.query(
      `INSERT INTO "FeePlan" (id,name,cycle,active,"createdAt","updatedAt") VALUES (gen_random_uuid(),$1,'MONTHLY',true,now(),now()) RETURNING id`,
      [`${MARKER} Plan`],
    )).rows[0];
    const fa = (await db.query(
      `INSERT INTO "StudentFeeAssignment" (id,"studentId","planId","startDate","nextRunAt",active,"autoGenerate","createdAt","updatedAt")
       VALUES (gen_random_uuid(),$1,$2,now(),now() + interval '20 days',true,true,now(),now()) RETURNING id`,
      [sp.id, plan.id],
    )).rows[0];

    // Run the backfill.
    execFileSync('node', [path.join(__dirname, 'backfill-student-subscriptions.cjs')], { stdio: 'pipe' });

    const ss = (await db.query(`SELECT * FROM "StudentSubscription" WHERE "studentId" = $1`, [sp.id])).rows;
    check('exactly one subscription created', ss.length === 1, `got ${ss.length}`);
    const s = ss[0] || {};
    check('model = MONTHLY', s.modelId === monthly.id);
    check('pricingMode FIXED_MONTHLY', s.pricingMode === 'FIXED_MONTHLY');
    check('duration=60', Number(s.durationMinutes) === 60);
    check('weekly=3', Number(s.weeklyClasses) === 3);
    check('monthlyHours=12', Number(s.monthlyHours) === 12, `got ${s.monthlyHours}`);
    check('remaining=12', Number(s.remainingClasses) === 12, `got ${s.remainingClasses}`);
    check('price snapshot = AED 480', Number(s.monthlyPrice) === 480, `got ${s.monthlyPrice}`);
    check('currency AED', s.currency === 'AED');
    check('rescheduleLimit=4', Number(s.rescheduleLimit) === 4);
    check('familyDiscountPct=5', Number(s.familyDiscountPct) === 5);
    check('batch linked', s.batchId === batch.id);
    check('feeAssignment linked', s.feeAssignmentId === fa.id);
    check('enrollment linked', s.enrollmentId === enr.id);
    check('status ACTIVE', s.status === 'ACTIVE');

    // Idempotent re-run.
    execFileSync('node', [path.join(__dirname, 'backfill-student-subscriptions.cjs')], { stdio: 'pipe' });
    const again = (await db.query(`SELECT COUNT(*)::int AS n FROM "StudentSubscription" WHERE "studentId" = $1`, [sp.id])).rows[0];
    check('re-run stays idempotent (still 1)', again.n === 1, `got ${again.n}`);

    // currentFor surfaces it as `record`.
    const res = await fetch(`${BASE}/subscriptions/me`, { headers: { Authorization: `Bearer ${token(user.id, 'STUDENT', email)}` } });
    if (res.ok) {
      const body = await res.json();
      check('currentFor exposes record', body.record && body.record.pricingMode === 'FIXED_MONTHLY', JSON.stringify(body.record));
      check('currentFor status ACTIVE', body.status === 'ACTIVE', body.status);
      check('record reschedulesLeft = 4', body.record && body.record.reschedulesLeft === 4);
    } else {
      check('GET /subscriptions/me ok', false, `status ${res.status}`);
    }
  } finally {
    await cleanup();
    await db.end();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) { console.log('Failures:\n  - ' + failures.join('\n  - ')); process.exit(1); }
})().catch((err) => { console.error(err); process.exit(1); });
