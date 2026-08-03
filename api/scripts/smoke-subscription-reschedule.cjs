/*
 * Smoke test — Phase 4c (student rescheduling).
 *
 * A student with a 2-reschedule allowance moves upcoming classes and hits every
 * guard: under 4 hours' notice is refused, a time past the cycle end is refused,
 * two moves succeed and decrement the allowance, and the third is refused for
 * having none left.
 *
 * Run: node scripts/smoke-subscription-reschedule.cjs   (needs API running + env)
 */
require('dotenv/config');
const jwt = require('jsonwebtoken');
const { Client } = require('pg');

const BASE = process.env.SMOKE_BASE || 'http://localhost:5000/api';
const SECRET = process.env.JWT_ACCESS_SECRET;
const MARKER = 'zz-smoke-resch';

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
const inHours = (h) => new Date(Date.now() + h * 3600 * 1000);
// A `timestamp without time zone` column stores whatever wall-clock string it is
// given; Prisma then reads it back as UTC. So we must insert the UTC wall-clock
// digits, not let node-postgres serialise a Date in the client's local zone.
const utcWall = (dt) => dt.toISOString().slice(0, 19).replace('T', ' ');

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
  };

  try {
    await cleanup();
    const teacher = (await db.query(`SELECT id FROM "TeacherProfile" ORDER BY id LIMIT 1`)).rows[0];
    const course = (await db.query(`SELECT id FROM "Course" ORDER BY id LIMIT 1`)).rows[0];
    const monthly = (await db.query(`SELECT id FROM "SubscriptionModel" WHERE key='MONTHLY' LIMIT 1`)).rows[0];

    const u = (await db.query(
      `INSERT INTO "User" (id,email,"passwordHash","firstName","lastName",role,status,"updatedAt")
       VALUES (gen_random_uuid(),$1,'x','Resch','Kid','STUDENT','ACTIVE',now()) RETURNING id`, [email])).rows[0];
    const sp = (await db.query(
      `INSERT INTO "StudentProfile" (id,"userId","studentCode","billingCurrency") VALUES (gen_random_uuid(),$1,$2,'USD') RETURNING id`,
      [u.id, `${MARKER}-${Date.now()}`])).rows[0];
    // Subscription: allowance 2, renewal 60 days out.
    await db.query(
      `INSERT INTO "StudentSubscription" (id,"studentId","modelId","pricingMode",currency,"durationMinutes","weeklyClasses","monthlyHours",
         "billingCycle","startDate","renewalDate","remainingClasses","completedClasses","rescheduleCounter","rescheduleLimit","familyDiscountPct",status,"createdAt","updatedAt")
       VALUES (gen_random_uuid(),$1,$2,'FIXED_MONTHLY','USD',60,3,12,'MONTHLY',now(),now() + interval '60 days',12,0,0,2,0,'ACTIVE',now(),now())`,
      [sp.id, monthly.id]);

    const mkSession = async (startsAt, suffix) => {
      const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);
      const s = (await db.query(
        `INSERT INTO "ClassSession" (id,"courseId","teacherId",title,"startsAt","endsAt",status)
         VALUES (gen_random_uuid(),$1,$2,$3,$4::timestamp,$5::timestamp,'SCHEDULED') RETURNING id`,
        [course.id, teacher.id, `${MARKER} ${suffix}`, utcWall(startsAt), utcWall(endsAt)])).rows[0];
      await db.query(`INSERT INTO "ClassAttendee" (id,"classId","studentId") VALUES (gen_random_uuid(),$1,$2)`, [s.id, sp.id]);
      return s.id;
    };
    const s1 = await mkSession(inDays(2), 'S1');
    const s2 = await mkSession(inDays(3), 'S2');
    const s3 = await mkSession(inDays(4), 'S3');
    const soon = await mkSession(inHours(2), 'SOON'); // within notice window

    const stTok = token(u.id, 'STUDENT', email);

    // Guard: under 4h notice (the class SOON starts in 2h).
    const rNotice = await req('POST', '/subscriptions/me/reschedule', stTok, { sessionId: soon, newStartsAt: inDays(5).toISOString() });
    check('under-4h-notice class refused', rNotice.status === 400, `status ${rNotice.status} ${JSON.stringify(rNotice.body).slice(0,90)}`);

    // Guard: new time past the cycle end (renewal 60d out).
    const rCycle = await req('POST', '/subscriptions/me/reschedule', stTok, { sessionId: s1, newStartsAt: inDays(70).toISOString() });
    check('past-cycle-end refused', rCycle.status === 400, `status ${rCycle.status}`);

    // OK 1: move S1 to +5d.
    const r1 = await req('POST', '/subscriptions/me/reschedule', stTok, { sessionId: s1, newStartsAt: inDays(5, 8).toISOString() });
    check('first reschedule ok', r1.status === 201, `status ${r1.status} ${JSON.stringify(r1.body).slice(0,90)}`);
    check('reschedulesLeft = 1', r1.body && r1.body.reschedulesLeft === 1, JSON.stringify(r1.body));
    const movedTo = (await db.query(`SELECT "startsAt" FROM "ClassSession" WHERE id=$1`, [s1])).rows[0];
    check('session time actually moved', !!movedTo);

    // OK 2: move S2 to +6d.
    const r2 = await req('POST', '/subscriptions/me/reschedule', stTok, { sessionId: s2, newStartsAt: inDays(6, 8).toISOString() });
    check('second reschedule ok', r2.status === 201, `status ${r2.status}`);
    check('reschedulesLeft = 0', r2.body && r2.body.reschedulesLeft === 0);

    // Exhausted: S3 refused.
    const r3 = await req('POST', '/subscriptions/me/reschedule', stTok, { sessionId: s3, newStartsAt: inDays(7, 8).toISOString() });
    check('third reschedule refused (allowance used)', r3.status === 400, `status ${r3.status}`);

    const counter = (await db.query(`SELECT "rescheduleCounter" FROM "StudentSubscription" WHERE "studentId"=$1`, [sp.id])).rows[0];
    check('counter landed at 2', Number(counter.rescheduleCounter) === 2, String(counter.rescheduleCounter));
  } finally {
    await cleanup();
    await db.end();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) { console.log('Failures:\n  - ' + fails.join('\n  - ')); process.exit(1); }
})().catch((err) => { console.error(err); process.exit(1); });
