/*
 * An activated application must stop calling itself Activated once its teacher
 * account is deleted.
 *
 * This is the bug the Activated tab actually had: TeacherRegistration.
 * teacherProfileId had no foreign key, so deleting a teacher left the row
 * pointing at nothing while still reporting ACTIVATED. The tab counted 2, All
 * Teachers found 1, and neither list was obviously wrong on its own.
 *
 *   node scripts/smoke-teacher-reg-archive.cjs
 *
 * Needs the API on localhost:5000 and JWT_ACCESS_SECRET in .env.
 *
 * Builds its own registration and activates it through the real endpoint, so
 * it cannot quietly pass on an empty database — a check that stands down when
 * there is no data is worse than no check.
 */

require('dotenv/config');
const jwt = require('jsonwebtoken');
const { Client } = require('pg');

const BASE = process.env.SMOKE_BASE || 'http://localhost:5000/api';
const SECRET = process.env.JWT_ACCESS_SECRET;
const MARKER = 'zz-smoke-archive';
const EMAIL = `${MARKER}@example.test`;
// Two more for the concurrent-activation check.
const RACE_EMAILS = [`${MARKER}-race1@example.test`, `${MARKER}-race2@example.test`];
// Admin-created teachers write the same unique index from a different service.
const DIRECT_EMAILS = [`${MARKER}-direct1@example.test`, `${MARKER}-direct2@example.test`];
const ALL_EMAILS = [EMAIL, ...RACE_EMAILS, ...DIRECT_EMAILS];

let pass = 0;
let fail = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) {
    pass += 1;
    console.log(`  ok   ${name}`);
  } else {
    fail += 1;
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const token = (userId, role, email) =>
  jwt.sign({ sub: userId, email, role }, SECRET, { expiresIn: '15m' });

async function req(method, path, auth, payload, expect = 200) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
    },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  if (expect && res.status !== expect) {
    return { ok: false, status: res.status, body };
  }
  return { ok: true, status: res.status, body };
}

(async () => {
  if (!SECRET) throw new Error('JWT_ACCESS_SECRET is not set');

  const db = new Client({
    connectionString: process.env.DATABASE_URL || process.env.DIRECT_URL,
  });
  await db.connect();

  const cleanup = async () => {
    // Remove every account this run minted, by the marker emails only.
    const { rows } = await db.query(
      `SELECT id FROM "User" WHERE email = ANY($1)`,
      [ALL_EMAILS],
    );
    for (const r of rows) {
      await db.query(`DELETE FROM "User" WHERE id = $1`, [r.id]);
    }
    await db.query(`DELETE FROM "TeacherRegistration" WHERE email = ANY($1)`, [
      ALL_EMAILS,
    ]);
  };

  try {
    await cleanup();

    const { rows: admins } = await db.query(
      `SELECT id, email FROM "User" WHERE role = 'ADMIN' LIMIT 1`,
    );
    if (!admins.length) throw new Error('no ADMIN user to authenticate as');
    const admin = token(admins[0].id, 'ADMIN', admins[0].email);

    // ── The database must enforce this, not a service method ────────────────
    console.log('\nForeign key');
    const { rows: fks } = await db.query(`
      SELECT pg_get_constraintdef(con.oid) AS def
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      WHERE rel.relname = 'TeacherRegistration' AND con.contype = 'f'
        AND pg_get_constraintdef(con.oid) LIKE '%teacherProfileId%'
    `);
    check('teacherProfileId has a foreign key', fks.length === 1);
    check(
      'the foreign key is ON DELETE SET NULL',
      fks.length === 1 && /ON DELETE SET NULL/.test(fks[0].def),
      fks[0]?.def,
    );

    // ── Fixture: an application sitting one step short of activation ────────
    console.log('\nFixture');
    const { rows: created } = await db.query(
      `INSERT INTO "TeacherRegistration"
         (id, "firstName", "lastName", email, "passwordHash", subjects,
          status, "createdAt", "updatedAt")
       VALUES (gen_random_uuid(), 'Zz', 'SmokeArchive', $1, 'x', 'Quran',
               'APPROVAL', now(), now())
       RETURNING id`,
      [EMAIL],
    );
    const regId = created[0].id;
    check('registration created', !!regId);

    const before = await req('GET', '/teacher-registrations/stats', admin);
    check('stats readable', before.ok, JSON.stringify(before.body));
    const baseActivated = before.body?.activated ?? 0;
    const baseArchived = before.body?.archived ?? 0;

    // ── Activate through the real endpoint ──────────────────────────────────
    console.log('\nActivate');
    const act = await req(
      'PATCH',
      `/teacher-registrations/${regId}/review`,
      admin,
      { status: 'ACTIVATED' },
    );
    check('activation succeeds', act.ok, JSON.stringify(act.body));
    const profileId = act.body?.teacherProfileId;
    check('a teacher profile was linked', !!profileId);

    const listA = await req(
      'GET',
      '/teacher-registrations?status=ACTIVATED&limit=100',
      admin,
    );
    const inActivated = (listA.body?.items || []).find((r) => r.id === regId);
    check('shows under Activated while the account is live', !!inActivated);
    check('accountRemoved is false while live', inActivated?.accountRemoved === false);

    const midStats = await req('GET', '/teacher-registrations/stats', admin);
    check(
      'stats.activated went up by one',
      midStats.body?.activated === baseActivated + 1,
      `${baseActivated} -> ${midStats.body?.activated}`,
    );

    // ── Delete the teacher: the row must archive itself ─────────────────────
    console.log('\nDelete the teacher account');
    const del = await req('DELETE', `/teachers/${profileId}`, admin, null, 204);
    check('teacher deleted', del.ok, JSON.stringify(del.body));

    const { rows: after } = await db.query(
      `SELECT status, "teacherProfileId", "approvedTeacherCode"
       FROM "TeacherRegistration" WHERE id = $1`,
      [regId],
    );
    check('the link nulled itself', after[0]?.teacherProfileId === null);
    check(
      'the hire is still on record',
      after[0]?.status === 'ACTIVATED' && !!after[0]?.approvedTeacherCode,
    );

    const listB = await req(
      'GET',
      '/teacher-registrations?status=ACTIVATED&limit=100',
      admin,
    );
    check(
      'gone from Activated',
      !(listB.body?.items || []).some((r) => r.id === regId),
    );

    const listC = await req(
      'GET',
      '/teacher-registrations?status=ARCHIVED&limit=100',
      admin,
    );
    const archivedRow = (listC.body?.items || []).find((r) => r.id === regId);
    check(
      'appears under Archived',
      !!archivedRow,
      `HTTP ${listC.status}, ${listC.body?.items?.length ?? '?'} item(s): ${JSON.stringify(listC.body).slice(0, 200)}`,
    );
    check('accountRemoved is true', archivedRow?.accountRemoved === true);

    const endStats = await req('GET', '/teacher-registrations/stats', admin);
    check(
      'stats.activated back to where it started',
      endStats.body?.activated === baseActivated,
      `${baseActivated} -> ${endStats.body?.activated}`,
    );
    check(
      'stats.archived went up by one',
      endStats.body?.archived === baseArchived + 1,
      `${baseArchived} -> ${endStats.body?.archived}`,
    );

    // Activated + archived must still account for every ACTIVATED row, or the
    // split has lost one instead of reclassifying it.
    const { rows: totalAct } = await db.query(
      `SELECT count(*)::int AS n FROM "TeacherRegistration" WHERE status = 'ACTIVATED'`,
    );
    check(
      'no row lost in the split',
      endStats.body?.activated + endStats.body?.archived === totalAct[0].n,
      `${endStats.body?.activated}+${endStats.body?.archived} vs ${totalAct[0].n}`,
    );

    // ── Archived is not a dead end: re-hire mints a fresh account ───────────
    console.log('\nRe-hire');
    const again = await req(
      'PATCH',
      `/teacher-registrations/${regId}/review`,
      admin,
      { status: 'ACTIVATED' },
    );
    check('an archived hire can be re-activated', again.ok, JSON.stringify(again.body));
    check(
      'a new profile was minted',
      !!again.body?.teacherProfileId && again.body.teacherProfileId !== profileId,
    );

    // And a live one still cannot be activated twice.
    const twice = await req(
      'PATCH',
      `/teacher-registrations/${regId}/review`,
      admin,
      { status: 'ACTIVATED' },
      400,
    );
    check('a live activation is still refused', twice.ok, JSON.stringify(twice.body));

    // ── Two activations at once must not collide on the teacher code ────────
    // nextTeacherCode() is read-max-then-insert, so simultaneous activations
    // both compute the same code. Without the retry one of them 500s.
    console.log('\nConcurrent activation');
    const raceIds = [];
    for (const email of RACE_EMAILS) {
      const { rows } = await db.query(
        `INSERT INTO "TeacherRegistration"
           (id, "firstName", "lastName", email, "passwordHash", subjects,
            status, "createdAt", "updatedAt")
         VALUES (gen_random_uuid(), 'Zz', 'SmokeRace', $1, 'x', 'Quran',
                 'APPROVAL', now(), now())
         RETURNING id`,
        [email],
      );
      raceIds.push(rows[0].id);
    }

    const both = await Promise.all(
      raceIds.map((rid) =>
        req('PATCH', `/teacher-registrations/${rid}/review`, admin, {
          status: 'ACTIVATED',
        }),
      ),
    );
    check(
      'both simultaneous activations succeed',
      both.every((r) => r.ok),
      both.map((r) => `${r.status}:${JSON.stringify(r.body).slice(0, 90)}`).join(' | '),
    );
    const codes = both.map((r) => r.body?.approvedTeacherCode);
    check(
      'each got its own teacher code',
      codes[0] && codes[1] && codes[0] !== codes[1],
      codes.join(' vs '),
    );

    // The admin-create path mints from the same index in a different service,
    // so it races against itself and against activation.
    const direct = await Promise.all(
      DIRECT_EMAILS.map((email, i) =>
        req('POST', '/teachers', admin, {
          email,
          firstName: 'Zz',
          lastName: `SmokeDirect${i}`,
        }, 201),
      ),
    );
    check(
      'both simultaneous admin-created teachers succeed',
      direct.every((r) => r.ok),
      direct.map((r) => `${r.status}:${JSON.stringify(r.body).slice(0, 90)}`).join(' | '),
    );
    const directCodes = direct.map((r) => r.body?.teacherCode);
    check(
      'admin-created teachers got their own codes',
      directCodes[0] && directCodes[1] && directCodes[0] !== directCodes[1],
      directCodes.join(' vs '),
    );
  } finally {
    await cleanup();
    await db.end();
  }

  console.log(`\n${pass}/${pass + fail} passed`);
  if (fail) {
    console.log('\nFailures:');
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exit(1);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
