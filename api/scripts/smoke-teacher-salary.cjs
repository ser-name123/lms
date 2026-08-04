/*
 * Smoke test — Teacher Salary Management (6B) + Wise payment (6C, mock).
 *
 * Flow: complete classes → calculate salary → adjust (deduction + extra pay,
 * each with a reason) → approve → pay with INCOMPLETE Wise details (FAILED) →
 * fix details → retry (PAID) → payment history has both attempts.
 *
 * Run: node scripts/smoke-teacher-salary.cjs   (needs API running + env)
 */
require('dotenv/config');
const jwt = require('jsonwebtoken');
const { Client } = require('pg');

const BASE = process.env.SMOKE_BASE || 'http://localhost:5000/api';
const SECRET = process.env.JWT_ACCESS_SECRET;
const MARKER = 'zz-smoke-sal';

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
    // Everything hangs off MARKER-tagged users (a dedicated throwaway teacher +
    // student). Delete their earnings/salary chains first (soft FKs), then the
    // users (cascades their profiles + classes-by-title).
    const cls = await db.query(`SELECT id FROM "ClassSession" WHERE title LIKE $1`, [`${MARKER}%`]);
    for (const c of cls.rows) {
      await db.query(`DELETE FROM "TeacherEarning" WHERE "classSessionId"=$1`, [c.id]);
      await db.query(`DELETE FROM "ClassAttendee" WHERE "classId"=$1`, [c.id]);
    }
    await db.query(`DELETE FROM "ClassSession" WHERE title LIKE $1`, [`${MARKER}%`]);
    const tps = await db.query(`SELECT tp.id FROM "TeacherProfile" tp JOIN "User" u ON u.id=tp."userId" WHERE u.email LIKE $1`, [`%${MARKER}%`]);
    for (const tp of tps.rows) {
      const sals = await db.query(`SELECT id FROM "TeacherSalary" WHERE "teacherId"=$1`, [tp.id]);
      for (const s of sals.rows) {
        await db.query(`DELETE FROM "SalaryPayment" WHERE "salaryId"=$1`, [s.id]);
        await db.query(`DELETE FROM "SalaryAdjustment" WHERE "salaryId"=$1`, [s.id]);
      }
      await db.query(`DELETE FROM "TeacherSalary" WHERE "teacherId"=$1`, [tp.id]);
      await db.query(`DELETE FROM "TeacherEarning" WHERE "teacherId"=$1`, [tp.id]);
    }
    const users = await db.query(`SELECT id FROM "User" WHERE email LIKE $1`, [`%${MARKER}%`]);
    for (const u of users.rows) {
      const sp = (await db.query(`SELECT id FROM "StudentProfile" WHERE "userId"=$1`, [u.id])).rows[0];
      if (sp) await db.query(`DELETE FROM "StudentProfile" WHERE id=$1`, [sp.id]);
      await db.query(`DELETE FROM "User" WHERE id=$1`, [u.id]);
    }
  };

  try {
    await cleanup();
    // A DEDICATED throwaway teacher so the period holds only this smoke's classes.
    const tu = (await db.query(`INSERT INTO "User" (id,email,"passwordHash","firstName","lastName",role,status,"updatedAt") VALUES (gen_random_uuid(),$1,'x','Sal','Teacher','TEACHER','ACTIVE',now()) RETURNING id`, [`${MARKER}-teacher@example.test`])).rows[0];
    const teacher = (await db.query(
      `INSERT INTO "TeacherProfile" (id,"userId","teacherCode","hourlyRate","recipientName","payoutCountry","payoutBankName","iban","swift","wiseRecipientId","payoutCurrency")
       VALUES (gen_random_uuid(),$1,$2,4.00,'Test Teacher','AE','Test Bank',NULL,'TESTAE22','WR-12345','USD') RETURNING id, "userId"`,
      [tu.id, `${MARKER}-T-${Date.now()}`])).rows[0];
    const course = (await db.query(`SELECT id FROM "Course" ORDER BY id LIMIT 1`)).rows[0];
    const admin = (await db.query(`SELECT id, email FROM "User" WHERE role='ADMIN' LIMIT 1`)).rows[0];
    check('fixtures present', !!teacher && !!course && !!admin);
    if (!teacher) throw new Error('no teacher');
    const adminToken = token(admin.id, 'ADMIN', admin.email);

    // A student + two completed 30-min classes this month → 2 × 2.00 = 4.00.
    const email = `${MARKER}-stu@example.test`;
    const u = (await db.query(`INSERT INTO "User" (id,email,"passwordHash","firstName","lastName",role,status,"updatedAt") VALUES (gen_random_uuid(),$1,'x','Sal','Stu','STUDENT','ACTIVE',now()) RETURNING id`, [email])).rows[0];
    const sp = (await db.query(`INSERT INTO "StudentProfile" (id,"userId","studentCode","billingCurrency") VALUES (gen_random_uuid(),$1,$2,'USD') RETURNING id`, [u.id, `${MARKER}-${Date.now()}`])).rows[0];
    const mkDone = async (suffix, offset) => {
      const start = minsAgo(offset + 30), end = minsAgo(offset);
      const c = (await db.query(`INSERT INTO "ClassSession" (id,"courseId","teacherId",title,"startsAt","endsAt",status) VALUES (gen_random_uuid(),$1,$2,$3,$4::timestamp,$5::timestamp,'SCHEDULED') RETURNING id`,
        [course.id, teacher.id, `${MARKER} ${suffix}`, utcWall(start), utcWall(end)])).rows[0];
      await db.query(`INSERT INTO "ClassAttendee" (id,"classId","studentId","joinedAt","leftAt") VALUES (gen_random_uuid(),$1,$2,$3,$4)`, [c.id, sp.id, utcWall(start), utcWall(end)]);
      await req('POST', `/attendance/classes/${c.id}/end`, adminToken, { teacherStatus: 'PRESENT' });
      return c.id;
    };
    await mkDone('C1', 200);
    await mkDone('C2', 120);

    // Period = current UTC month.
    const now = new Date();
    const ps = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
    const pe = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).toISOString();

    const calc = await req('POST', '/salary/calculate', adminToken, { periodStart: ps, periodEnd: pe });
    check('calculate ok', calc.status === 200 || calc.status === 201, `status ${calc.status}`);
    const listR = await req('GET', `/salary?periodStart=${encodeURIComponent(ps)}`, adminToken);
    const sal = (listR.body || []).find((s) => s.teacher && s.teacher.id === teacher.id);
    check('salary row present', !!sal, JSON.stringify(listR.body).slice(0, 120));
    check('salary gross = 4.00 (2 regular classes)', sal && sal.grossAmount === 4, sal && String(sal.grossAmount));
    check('salary status CALCULATED', sal && sal.status === 'CALCULATED', sal && sal.status);
    check('salary counts 2 classes', sal && sal.totalClasses === 2, sal && String(sal.totalClasses));
    const salId = sal.id;

    // Pay before approve → refused.
    const early = await req('POST', `/salary/${salId}/pay`, adminToken);
    check('pay before approve refused', early.status === 400, `status ${early.status}`);

    // Adjustment requires a reason.
    const noReason = await req('POST', `/salary/${salId}/adjust`, adminToken, { type: 'DEDUCTION', amount: 1 });
    check('adjustment without reason refused', noReason.status === 400, `status ${noReason.status}`);

    // Deduction 1.00 + extra pay 0.50 → net 3.50.
    await req('POST', `/salary/${salId}/adjust`, adminToken, { type: 'DEDUCTION', amount: 1, reason: 'Late attendance penalty' });
    const adj2 = await req('POST', `/salary/${salId}/adjust`, adminToken, { type: 'EXTRA_PAY', amount: 0.5, reason: 'Cover class' });
    check('adjust ok + status ADJUSTMENT_APPLIED', adj2.status === 200 || adj2.status === 201, `status ${adj2.status}`);
    const det = await req('GET', `/salary/${salId}`, adminToken);
    check('net recalculated to 3.50', det.body && det.body.netAmount === 3.5, det.body && String(det.body.netAmount));
    check('two adjustments recorded with reasons', det.body && det.body.adjustments && det.body.adjustments.length === 2 && det.body.adjustments.every((a) => a.reason), JSON.stringify(det.body && det.body.adjustments));

    // Approve.
    const appr = await req('POST', `/salary/${salId}/approve`, adminToken);
    check('approve ok → APPROVED', appr.status === 201 || appr.status === 200, `status ${appr.status}`);
    const detAppr = await req('GET', `/salary/${salId}`, adminToken);
    check('status APPROVED', detAppr.body && detAppr.body.status === 'APPROVED', detAppr.body && detAppr.body.status);

    // Pay with INCOMPLETE details → FAILED.
    const pay1 = await req('POST', `/salary/${salId}/pay`, adminToken);
    check('pay attempt returns FAILED (missing IBAN)', pay1.body && pay1.body.status === 'FAILED', JSON.stringify(pay1.body).slice(0, 120));
    const detFail = await req('GET', `/salary/${salId}`, adminToken);
    check('salary status FAILED', detFail.body && detFail.body.status === 'FAILED', detFail.body && detFail.body.status);

    // Fix payout details, then retry → PAID.
    const fix = await req('PATCH', `/salary/teacher/${teacher.id}/payout-details`, adminToken, { iban: 'AE070331234567890123456' });
    check('payout details now complete', fix.body && fix.body.complete === true, JSON.stringify(fix.body).slice(0, 120));
    const pay2 = await req('POST', `/salary/${salId}/pay`, adminToken);
    check('retry pay returns PAID', pay2.body && pay2.body.status === 'PAID', JSON.stringify(pay2.body).slice(0, 120));
    check('PAID carries a Wise reference', pay2.body && pay2.body.reference && /^WISE-/.test(pay2.body.reference), pay2.body && pay2.body.reference);
    const detPaid = await req('GET', `/salary/${salId}`, adminToken);
    check('salary status PAID + wiseReference stored', detPaid.body && detPaid.body.status === 'PAID' && !!detPaid.body.wiseReference, detPaid.body && detPaid.body.status);

    // Payment history has both attempts (FAILED then SUCCESS).
    const hist = await req('GET', `/salary/${salId}/payments`, adminToken);
    check('payment history has 2 attempts', Array.isArray(hist.body) && hist.body.length === 2, JSON.stringify(hist.body).slice(0, 120));
    check('history has one SUCCESS and one FAILED', Array.isArray(hist.body) && hist.body.some((p) => p.status === 'SUCCESS') && hist.body.some((p) => p.status === 'FAILED'));

    // A PAID salary cannot be re-paid.
    const pay3 = await req('POST', `/salary/${salId}/pay`, adminToken);
    check('paid salary cannot be re-paid', pay3.status === 400, `status ${pay3.status}`);

    // Teacher-facing /salary/me — the teacher sees their own Module-6 salary,
    // with embedded adjustments + payment attempts, and only their own row.
    const teacherToken = token(tu.id, 'TEACHER', `${MARKER}-teacher@example.test`);
    const mine = await req('GET', '/salary/me', teacherToken);
    check('teacher can fetch /salary/me', mine.status === 200 && Array.isArray(mine.body), `status ${mine.status}`);
    const myRow = Array.isArray(mine.body) ? mine.body.find((r) => r.id === salId) : null;
    check('teacher sees this salary (PAID) with net + ref', !!myRow && myRow.status === 'PAID' && myRow.netAmount > 0 && !!myRow.wiseReference, myRow && myRow.status);
    check('teacher salary embeds its 2 adjustments', !!myRow && Array.isArray(myRow.adjustments) && myRow.adjustments.length === 2 && myRow.adjustments.every((a) => !!a.reason));
    check('teacher salary embeds its 2 payment attempts', !!myRow && Array.isArray(myRow.payments) && myRow.payments.length === 2);
    check('every /salary/me row belongs to this teacher', Array.isArray(mine.body) && mine.body.every((r) => r.id === salId), `rows ${Array.isArray(mine.body) ? mine.body.length : '?'}`);
  } finally {
    await cleanup();
    await db.end();
    console.log(`\n${pass} passed, ${fail} failed`);
    if (fails.length) { console.log('FAILURES:\n - ' + fails.join('\n - ')); process.exit(1); }
  }
})().catch((e) => { console.error(e); process.exit(1); });
