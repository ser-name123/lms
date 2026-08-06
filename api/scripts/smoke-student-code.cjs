/*
 * Smoke test — sequential student-code minting.
 *
 * Reproduces the exact failure the old `count() + 1` implementation had:
 * students are hard-deleted, so after any deletion the count falls below the
 * highest code and the next created student is handed one that already exists.
 * That is a unique-index violation which REPEATS on every retry, because the
 * count never changes — admin "Add Student" was broken permanently.
 *
 * Also covers the concurrent case: several creates landing together must all
 * succeed with distinct codes, via retryOnUniqueClash.
 *
 * Run: node scripts/smoke-student-code.cjs   (needs API running + env)
 */
require('dotenv/config');
const jwt = require('jsonwebtoken');
const { Client } = require('pg');

const BASE = process.env.SMOKE_BASE || 'http://localhost:5000/api';
const SECRET = process.env.JWT_ACCESS_SECRET;
const MARKER = 'zz-smoke-code';

let pass = 0, fail = 0;
const fails = [];
const check = (n, c, d) => {
  if (c) { pass++; console.log(`  ok   ${n}`); }
  else { fail++; fails.push(`${n}${d ? ` — ${d}` : ''}`); console.log(`  FAIL ${n}${d ? ` — ${d}` : ''}`); }
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
const codeNum = (c) => Number(String(c).slice(3));

(async () => {
  if (!SECRET) throw new Error('JWT_ACCESS_SECRET is not set');
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();

  const cleanup = async () => {
    const users = await db.query(`SELECT id FROM "User" WHERE email LIKE $1`, [`%${MARKER}%`]);
    for (const u of users.rows) {
      const sp = (await db.query(`SELECT id FROM "StudentProfile" WHERE "userId"=$1`, [u.id])).rows[0];
      if (sp) {
        await db.query(`DELETE FROM "StudentActivity" WHERE "studentId"=$1`, [sp.id]);
        await db.query(`DELETE FROM "Enrollment" WHERE "studentId"=$1`, [sp.id]);
        await db.query(`DELETE FROM "StudentProfile" WHERE id=$1`, [sp.id]);
      }
      await db.query(`DELETE FROM "User" WHERE id=$1`, [u.id]);
    }
  };

  const mk = (tag) => ({
    email: `${MARKER}-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.test`,
    password: 'Passw0rd!23',
    firstName: 'Code',
    lastName: tag,
    country: 'AE',
  });

  try {
    await cleanup();
    const admin = (await db.query(`SELECT id, email FROM "User" WHERE role='ADMIN' LIMIT 1`)).rows[0];
    check('an admin exists', !!admin);
    if (!admin) throw new Error('no admin');
    const adminToken = token(admin.id, 'ADMIN', admin.email);

    // ── Codes are sequential and derived from the maximum ───────────────────
    const a = await req('POST', '/students', adminToken, mk('a'));
    check('first create succeeds', a.status === 201 || a.status === 200, `status ${a.status} ${JSON.stringify(a.body).slice(0, 140)}`);
    const b = await req('POST', '/students', adminToken, mk('b'));
    check('second create succeeds', b.status === 201 || b.status === 200, `status ${b.status}`);
    check('codes increment', codeNum(b.body?.studentCode) === codeNum(a.body?.studentCode) + 1,
      `${a.body?.studentCode} → ${b.body?.studentCode}`);

    // ── The regression: delete, then create again ───────────────────────────
    const before = (await db.query(`SELECT max("studentCode") AS m FROM "StudentProfile"`)).rows[0].m;
    const del = await req('DELETE', `/students/${a.body.id}`, adminToken);
    check('a student can be deleted', del.status === 200 || del.status === 204, `status ${del.status}`);

    const c = await req('POST', '/students', adminToken, mk('c'));
    check('create still works after a deletion (the old count()+1 bug)',
      c.status === 201 || c.status === 200,
      `status ${c.status} ${JSON.stringify(c.body).slice(0, 160)}`);
    check('the new code continues from the maximum, not the count',
      codeNum(c.body?.studentCode) > codeNum(before),
      `max was ${before}, got ${c.body?.studentCode}`);

    // ── Concurrency ─────────────────────────────────────────────────────────
    const burst = await Promise.all([
      req('POST', '/students', adminToken, mk('p')),
      req('POST', '/students', adminToken, mk('q')),
      req('POST', '/students', adminToken, mk('r')),
    ]);
    check('concurrent creates all succeed', burst.every((r) => r.status === 201 || r.status === 200),
      burst.map((r) => r.status).join('/'));
    const codes = burst.map((r) => r.body?.studentCode).filter(Boolean);
    check('concurrent creates get distinct codes', new Set(codes).size === codes.length, codes.join(','));

    // ── Global invariant ────────────────────────────────────────────────────
    const dupes = await db.query(
      `SELECT "studentCode", count(*)::int AS n FROM "StudentProfile" GROUP BY "studentCode" HAVING count(*) > 1`,
    );
    check('no duplicate student codes anywhere', dupes.rows.length === 0, JSON.stringify(dupes.rows).slice(0, 160));
  } catch (e) {
    fail++;
    fails.push(`threw: ${e.message}`);
    console.error('THREW:', e);
  } finally {
    await cleanup();
    await db.end();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fails.length) {
    console.log('\nFailures:');
    for (const f of fails) console.log(`  - ${f}`);
  }
  process.exitCode = fail ? 1 : 0;
})();
