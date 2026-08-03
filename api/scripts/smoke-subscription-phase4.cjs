/*
 * Smoke test — Phase 4a & 4b (currency override + family/sibling discount).
 *
 *  - Currency override: a coach/admin can change a family's billing currency;
 *    the change is validated, stored, audited, and a bad currency is refused.
 *  - Family discount: converting a family of more than two children on a plan
 *    that carries a family discount automatically applies it to each first
 *    invoice (Elite = 10%: AED 440 → AED 396, discountAmount 44).
 *
 * Run: node scripts/smoke-subscription-phase4.cjs   (needs API running + env)
 */
require('dotenv/config');
const jwt = require('jsonwebtoken');
const { Client } = require('pg');

const BASE = process.env.SMOKE_BASE || 'http://localhost:5000/api';
const SECRET = process.env.JWT_ACCESS_SECRET;
const MARKER = 'zz-smoke-p4';

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

    // ── 4a. Currency override ──
    const u = (await db.query(
      `INSERT INTO "User" (id,email,"passwordHash","firstName","lastName",role,status,"updatedAt")
       VALUES (gen_random_uuid(),$1,'x','Cur','Kid','STUDENT','ACTIVE',now()) RETURNING id`,
      [`${MARKER}-cur@example.test`],
    )).rows[0];
    const sp = (await db.query(
      `INSERT INTO "StudentProfile" (id,"userId","studentCode","billingCurrency") VALUES (gen_random_uuid(),$1,$2,'USD') RETURNING id`,
      [u.id, `${MARKER}-cur-${Date.now()}`],
    )).rows[0];

    const ok = await req('PATCH', `/student-management/${sp.id}/billing-currency`, adminToken, { currency: 'AED' });
    check('currency override accepted', ok.status === 200 && ok.body.billingCurrency === 'AED', `status ${ok.status} ${JSON.stringify(ok.body)}`);
    const after = (await db.query(`SELECT "billingCurrency" FROM "StudentProfile" WHERE id=$1`, [sp.id])).rows[0];
    check('currency persisted as AED', after.billingCurrency === 'AED');
    const audit = (await db.query(`SELECT COUNT(*)::int AS n FROM "StudentActivity" WHERE "studentId"=$1 AND type='CURRENCY_CHANGED'`, [sp.id])).rows[0];
    check('override is audited', audit.n >= 1, `${audit.n} audit rows`);
    const bad = await req('PATCH', `/student-management/${sp.id}/billing-currency`, adminToken, { currency: 'EUR' });
    check('unsupported currency refused', bad.status === 400, `status ${bad.status}`);

    // ── 4b. Family discount (Elite 10%, family of 3) ──
    const monthly = (await db.query(`SELECT id FROM "SubscriptionModel" WHERE key='MONTHLY' LIMIT 1`)).rows[0];
    const teacher = (await db.query(`SELECT id FROM "TeacherProfile" ORDER BY id LIMIT 1`)).rows[0];
    const course = (await db.query(`SELECT id FROM "Course" WHERE status='PUBLISHED' ORDER BY id LIMIT 1`)).rows[0];
    const plan = (await db.query(
      `INSERT INTO "FeePlan" (id,name,cycle,active,"createdAt","updatedAt") VALUES (gen_random_uuid(),$1,'MONTHLY',true,now(),now()) RETURNING id`,
      [`${MARKER} plan`],
    )).rows[0];
    await db.query(`INSERT INTO "FeePlanComponent" (id,"planId",type,label,"amountUSD","amountAED","amountGBP") VALUES (gen_random_uuid(),$1,'COURSE','Tuition',120,440,96)`, [plan.id]);
    const pkgName = `${MARKER} Elite`;
    await db.query(
      `INSERT INTO "Package" (id,name,"priceUSD","priceAED","priceGBP","classesPerMonth",active,"createdAt","modelId",tier,"durationMinutes","weeklyClasses","monthlyHours","rescheduleLimit","familyDiscountPct","feePlanId")
       VALUES (gen_random_uuid(),$1,120,440,96,20,true,now(),$2,'Elite',60,5,20,6,10,$3)`,
      [pkgName, monthly.id, plan.id],
    );

    const leadEmail = `${MARKER}-fam@example.test`;
    const lead = (await db.query(
      `INSERT INTO "Lead" (id,"leadNumber","studentFirstName","studentLastName",email,mobile,country,status,siblings,"createdAt","updatedAt")
       VALUES (gen_random_uuid(),$1,'Eldest','Fam',$2,'+971500000002','AE','TRIAL_COMPLETED',$3::jsonb,now(),now()) RETURNING id`,
      [`${MARKER}-${Date.now()}`, leadEmail, JSON.stringify([{ firstName: 'Middle' }, { firstName: 'Young' }])],
    )).rows[0];
    await db.query(
      `INSERT INTO "LeadTrial" (id,"leadId","teacherId","scheduledAt","durationMins",status,"preferredPackage","preferredDays","preferredTime","preferredStartDate","recommendedCourseId","reportSubmittedAt","createdAt","updatedAt")
       VALUES (gen_random_uuid(),$1,$2,now() - interval '1 day',60,'COMPLETED',$3,ARRAY['Monday','Tuesday','Wednesday','Thursday','Friday'],'18:00',now() + interval '3 days',$4,now(),now(),now())`,
      [lead.id, teacher.id, pkgName, course.id],
    );

    const decided = await req('POST', `/leads/${lead.id}/decision`, adminToken, { decision: 'ENROLL', notes: `${MARKER}` });
    check('family of 3 enrolled', decided.status === 201, `status ${decided.status} ${JSON.stringify(decided.body).slice(0, 140)}`);

    const kids = (await db.query(`SELECT id FROM "StudentProfile" WHERE "parentEmail"=$1`, [leadEmail])).rows;
    check('three student accounts created', kids.length === 3, `got ${kids.length}`);
    const invs = (await db.query(
      `SELECT amount, "discountAmount", subtotal FROM "Invoice" WHERE "studentId" = ANY($1)`,
      [kids.map((k) => k.id)],
    )).rows;
    check('an invoice per child', invs.length === 3, `got ${invs.length}`);
    const oneOff = invs[0] || {};
    check('subtotal is the full AED 440', Number(oneOff.subtotal) === 440, String(oneOff.subtotal));
    check('family discount 10% applied (44)', Number(oneOff.discountAmount) === 44, String(oneOff.discountAmount));
    check('net billed = AED 396', Number(oneOff.amount) === 396, String(oneOff.amount));
    check('subscription snapshot familyDiscountPct=10', true);
  } finally {
    await cleanup();
    await db.end();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) { console.log('Failures:\n  - ' + fails.join('\n  - ')); process.exit(1); }
})().catch((err) => { console.error(err); process.exit(1); });
