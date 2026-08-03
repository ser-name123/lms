/*
 * Smoke test — Phase 5 (migrate a student Monthly → Hourly, preserving history).
 *
 * Sets up a student on a Monthly subscription with an existing invoice and class
 * session (their history), migrates them to an Hourly plan, and asserts: the old
 * subscription is ENDED, a new ACTIVE Hourly one exists priced by the tuition
 * formula, the enrolment now points at the new package, and the old invoice and
 * class session are untouched.
 *
 * Run: node scripts/smoke-subscription-migrate.cjs   (needs API running + env)
 */
require('dotenv/config');
const jwt = require('jsonwebtoken');
const { Client } = require('pg');

const BASE = process.env.SMOKE_BASE || 'http://localhost:5000/api';
const SECRET = process.env.JWT_ACCESS_SECRET;
const MARKER = 'zz-smoke-migrate';

let pass = 0, fail = 0;
const fails = [];
const check = (n, c, d) => { if (c) { pass++; console.log(`  ok   ${n}`); } else { fail++; fails.push(`${n}${d ? ` — ${d}` : ''}`); console.log(`  FAIL ${n}${d ? ` — ${d}` : ''}`); } };
const token = (userId, role, email) => jwt.sign({ sub: userId, email, role }, SECRET, { expiresIn: '30m' });
async function req(method, path, auth, payload) {
  const res = await fetch(`${BASE}${path}`, { method, headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth}` } : {}) }, ...(payload ? { body: JSON.stringify(payload) } : {}) });
  const text = await res.text(); let body; try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body };
}

(async () => {
  if (!SECRET) throw new Error('JWT_ACCESS_SECRET is not set');
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();

  const email = `${MARKER}-student@example.test`;
  const cleanup = async () => {
    const users = await db.query(`SELECT id FROM "User" WHERE email LIKE $1`, [`%${MARKER}%`]);
    for (const u of users.rows) {
      const sp = (await db.query(`SELECT id FROM "StudentProfile" WHERE "userId"=$1`, [u.id])).rows[0];
      if (sp) {
        await db.query(`DELETE FROM "ClassSession" WHERE title LIKE $1`, [`${MARKER}%`]);
        await db.query(`DELETE FROM "StudentSubscription" WHERE "studentId"=$1`, [sp.id]);
      }
      await db.query(`DELETE FROM "User" WHERE id=$1`, [u.id]);
    }
    await db.query(`DELETE FROM "ClassSession" WHERE title LIKE $1`, [`${MARKER}%`]);
    await db.query(`DELETE FROM "Package" WHERE name LIKE $1`, [`${MARKER}%`]);
  };

  try {
    await cleanup();
    const admin = (await db.query(`SELECT id, email FROM "User" WHERE role='ADMIN' LIMIT 1`)).rows[0];
    const adminToken = token(admin.id, 'ADMIN', admin.email);
    const monthly = (await db.query(`SELECT id FROM "SubscriptionModel" WHERE key='MONTHLY' LIMIT 1`)).rows[0];
    const hourly = (await db.query(`SELECT id FROM "SubscriptionModel" WHERE key='HOURLY' LIMIT 1`)).rows[0];
    const teacher = (await db.query(`SELECT id FROM "TeacherProfile" ORDER BY id LIMIT 1`)).rows[0];
    const course = (await db.query(`SELECT id FROM "Course" ORDER BY id LIMIT 1`)).rows[0];

    // Monthly package (current) + hourly package (target).
    const mPkg = (await db.query(
      `INSERT INTO "Package" (id,name,"priceUSD","priceAED","priceGBP","classesPerMonth",active,"createdAt","modelId",tier,"durationMinutes","weeklyClasses","monthlyHours","rescheduleLimit","familyDiscountPct")
       VALUES (gen_random_uuid(),$1,120,440,96,20,true,now(),$2,'Elite',60,5,20,6,10) RETURNING id`,
      [`${MARKER} Monthly`, monthly.id])).rows[0];
    const hPkg = (await db.query(
      `INSERT INTO "Package" (id,name,"priceUSD","priceAED","priceGBP","classesPerMonth",active,"createdAt","modelId",tier,"hourlyRateUSD","hourlyRateAED","hourlyRateGBP","rescheduleLimit","familyDiscountPct")
       VALUES (gen_random_uuid(),$1,0,NULL,NULL,0,true,now(),$2,'Premium',11,40,11,4,5) RETURNING id`,
      [`${MARKER} Hourly`, hourly.id])).rows[0];

    // Student billed in AED, enrolled on the monthly package.
    const u = (await db.query(
      `INSERT INTO "User" (id,email,"passwordHash","firstName","lastName",role,status,"updatedAt")
       VALUES (gen_random_uuid(),$1,'x','Mig','Kid','STUDENT','ACTIVE',now()) RETURNING id`, [email])).rows[0];
    const sp = (await db.query(
      `INSERT INTO "StudentProfile" (id,"userId","studentCode","billingCurrency") VALUES (gen_random_uuid(),$1,$2,'AED') RETURNING id`,
      [u.id, `${MARKER}-${Date.now()}`])).rows[0];
    const enr = (await db.query(
      `INSERT INTO "Enrollment" (id,"studentId","courseId","packageId",status,"startedAt","createdAt","updatedAt")
       VALUES (gen_random_uuid(),$1,$2,$3,'ACTIVE',now(),now(),now()) RETURNING id`,
      [sp.id, course.id, mPkg.id])).rows[0];
    const oldSub = (await db.query(
      `INSERT INTO "StudentSubscription" (id,"studentId","enrollmentId","courseId","modelId","pricingMode",currency,"monthlyPrice","durationMinutes","weeklyClasses","monthlyHours",
         "billingCycle","startDate","renewalDate","remainingClasses","completedClasses","rescheduleCounter","rescheduleLimit","familyDiscountPct",status,"createdAt","updatedAt")
       VALUES (gen_random_uuid(),$1,$2,$3,$4,'FIXED_MONTHLY','AED',440,60,5,20,'MONTHLY',now(),now() + interval '30 days',20,3,1,6,10,'ACTIVE',now(),now()) RETURNING id`,
      [sp.id, enr.id, course.id, monthly.id])).rows[0];

    // History: an existing invoice + a past class session.
    const oldInv = (await db.query(
      `INSERT INTO "Invoice" (id,number,"studentId",amount,subtotal,"discountAmount","taxAmount",currency,status,"issuedAt")
       VALUES (gen_random_uuid(),$1,$2,440,440,0,0,'AED','PAID',now()) RETURNING id`,
      [`${MARKER}-INV-${Date.now()}`, sp.id])).rows[0];
    const oldSession = (await db.query(
      `INSERT INTO "ClassSession" (id,"courseId","teacherId",title,"startsAt","endsAt",status)
       VALUES (gen_random_uuid(),$1,$2,$3,now() - interval '2 days',now() - interval '2 days' + interval '1 hour','COMPLETED') RETURNING id`,
      [course.id, teacher.id, `${MARKER} past class`])).rows[0];

    // Migrate → Hourly (60-min, 3×/week → AED 480).
    const res = await req('POST', `/subscriptions/student/${sp.id}/migrate`, adminToken, { newPackageId: hPkg.id, durationMinutes: 60, weeklyClasses: 3 });
    check('migrate accepted', res.status === 201, `status ${res.status} ${JSON.stringify(res.body).slice(0,120)}`);
    check('response reports HOURLY + tuition 480', res.body && res.body.pricingMode === 'HOURLY' && Number(res.body.monthlyPrice) === 480, JSON.stringify(res.body));

    const oldNow = (await db.query(`SELECT status FROM "StudentSubscription" WHERE id=$1`, [oldSub.id])).rows[0];
    check('old subscription is ENDED', oldNow.status === 'ENDED', oldNow.status);
    const newSub = (await db.query(`SELECT * FROM "StudentSubscription" WHERE "studentId"=$1 AND status='ACTIVE'`, [sp.id])).rows[0];
    check('new ACTIVE subscription exists', !!newSub);
    check('new is HOURLY', newSub && newSub.pricingMode === 'HOURLY');
    check('new monthlyPrice = 480', newSub && Number(newSub.monthlyPrice) === 480, String(newSub?.monthlyPrice));
    check('new hourlyRate = 40', newSub && Number(newSub.hourlyRate) === 40);

    const enrNow = (await db.query(`SELECT "packageId" FROM "Enrollment" WHERE id=$1`, [enr.id])).rows[0];
    check('enrolment repointed to hourly package', enrNow.packageId === hPkg.id);

    // History preserved.
    const invStill = (await db.query(`SELECT amount FROM "Invoice" WHERE id=$1`, [oldInv.id])).rows[0];
    check('old invoice untouched (AED 440 PAID)', invStill && Number(invStill.amount) === 440);
    const sessStill = (await db.query(`SELECT status FROM "ClassSession" WHERE id=$1`, [oldSession.id])).rows[0];
    check('old class session untouched', sessStill && sessStill.status === 'COMPLETED');
    const audit = (await db.query(`SELECT COUNT(*)::int AS n FROM "StudentActivity" WHERE "studentId"=$1 AND type='SUBSCRIPTION_MIGRATED'`, [sp.id])).rows[0];
    check('migration is audited', audit.n >= 1);
  } finally {
    await cleanup();
    await db.end();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) { console.log('Failures:\n  - ' + fails.join('\n  - ')); process.exit(1); }
})().catch((err) => { console.error(err); process.exit(1); });
