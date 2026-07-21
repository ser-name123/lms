/*
 * Every trial must have somebody to teach it.
 *
 * A website booking used to create the trial with teacherId null — the slot
 * comes from *merged* availability, so it belongs to no one teacher, and
 * choosing was left to the coach. Nothing chased it. The class showed on no
 * teacher's schedule, the Zoom room existed, and the family was still sent
 * their 24h reminder for a lesson nobody was going to run.
 *
 *   node scripts/smoke-trial-teacher.cjs
 *
 * Needs the API on localhost:5000 and JWT_ACCESS_SECRET in .env.
 *
 * The fixtures are built here rather than assumed: this needs teachers whose
 * availability is published AND approved, and on a database that has none the
 * interesting assertions would all be vacuously true.
 */

require('dotenv/config');
const jwt = require('jsonwebtoken');
const { Client } = require('pg');

const BASE = process.env.SMOKE_BASE || 'http://localhost:5000/api';
const SECRET = process.env.JWT_ACCESS_SECRET;
const MARKER = 'zz-smoke-tt';

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
  jwt.sign({ sub: userId, email, role }, SECRET, { expiresIn: '20m' });

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
  try { body = JSON.parse(text); } catch { body = text; }
  return { ok: !expect || res.status === expect, status: res.status, body };
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// A date a few days out, as YYYY-MM-DD in UTC. Same bookable window the
// public form uses (not today, not beyond a month).
function isoDay(offset) {
  const d = new Date(Date.now() + offset * 86_400_000);
  return d.toISOString().slice(0, 10);
}

(async () => {
  if (!SECRET) throw new Error('JWT_ACCESS_SECRET is not set');

  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();

  const emails = {
    male: `${MARKER}-male@example.test`,
    female: `${MARKER}-female@example.test`,
    coach: `${MARKER}-coach@example.test`,
    lead1: `${MARKER}-lead1@example.test`,
    lead2: `${MARKER}-lead2@example.test`,
    lead3: `${MARKER}-lead3@example.test`,
  };
  const allEmails = Object.values(emails);

  const cleanup = async () => {
    // Leads first: their trials cascade, and a trial holds a teacher.
    await db.query(`DELETE FROM "Lead" WHERE email = ANY($1)`, [allEmails]);
    const { rows } = await db.query(`SELECT id FROM "User" WHERE email = ANY($1)`, [allEmails]);
    for (const r of rows) await db.query(`DELETE FROM "User" WHERE id = $1`, [r.id]);
  };

  try {
    await cleanup();

    const { rows: admins } = await db.query(
      `SELECT id, email FROM "User" WHERE role = 'ADMIN' LIMIT 1`,
    );
    if (!admins.length) throw new Error('no ADMIN user to authenticate as');
    const adminToken = token(admins[0].id, 'ADMIN', admins[0].email);

    // ── Fixtures ─────────────────────────────────────────────────────────────
    console.log('\nFixtures');

    const { rows: coachRows } = await db.query(
      `INSERT INTO "User" (id,email,"passwordHash","firstName","lastName",role,status,"updatedAt")
       VALUES (gen_random_uuid(),$1,'x','Smoke','Coach','ACADEMIC_COACH','ACTIVE',now())
       RETURNING id`,
      [emails.coach],
    );
    const coachId = coachRows[0].id;
    const coachToken = token(coachId, 'ACADEMIC_COACH', emails.coach);

    // Two teachers, both free on the booking day, differing only in gender —
    // so a gender preference is the only thing that can decide between them.
    const bookDate = isoDay(3);
    const weekday = WEEKDAYS[new Date(`${bookDate}T00:00:00.000Z`).getUTCDay()];
    const window = JSON.stringify({ [weekday]: [{ from: '09:00', to: '21:00' }] });

    const teacherIds = {};
    for (const [key, gender] of [['male', 'Male'], ['female', 'Female']]) {
      const { rows: u } = await db.query(
        `INSERT INTO "User" (id,email,"passwordHash","firstName","lastName",role,status,"updatedAt")
         VALUES (gen_random_uuid(),$1,'x','Smoke',$2,'TEACHER','ACTIVE',now()) RETURNING id`,
        [emails[key], `Teacher${gender}`],
      );
      const { rows: p } = await db.query(
        `INSERT INTO "TeacherProfile"
           (id,"userId","teacherCode",availability,"availabilityApproved",gender,subjects)
         VALUES (gen_random_uuid(),$1,$2,$3::jsonb,true,$4,$5) RETURNING id`,
        [u[0].id, `${MARKER}-${key}`, window, gender, ['Quran']],
      );
      teacherIds[key] = p[0].id;
    }
    check('two approved-availability teachers exist', !!teacherIds.male && !!teacherIds.female);

    const slots = await req('GET', `/leads/availability?date=${bookDate}`, null);
    check('the day has bookable slots', (slots.body?.slots || []).length > 0, JSON.stringify(slots.body).slice(0, 160));
    check('and they come from real availability, not the fallback window', slots.body?.fallback === false);

    // ── A website booking picks a teacher ────────────────────────────────────
    console.log('\nWebsite booking assigns a teacher');

    const book = async (email, slot, gender) =>
      req('POST', '/leads', null, {
        studentFirstName: 'Zz',
        studentLastName: 'Smoke',
        email,
        mobile: '9000000000',
        interestedSubject: 'Quran',
        preferredTeacherGender: gender,
        preferredDate: bookDate,
        preferredSlot: slot,
      }, 201);

    const openSlots = slots.body.slots;
    const b1 = await book(emails.lead1, openSlots[0], 'Female');
    check('booking succeeds', b1.ok, `status ${b1.status}: ${JSON.stringify(b1.body).slice(0, 140)}`);

    const { rows: t1 } = await db.query(
      `SELECT t."teacherId", l."assignedTeacherId"
       FROM "LeadTrial" t JOIN "Lead" l ON l.id = t."leadId" WHERE l.email = $1`,
      [emails.lead1],
    );
    check('the trial has a teacher', !!t1[0]?.teacherId, String(t1[0]?.teacherId));
    check(
      'and it is the gender the family asked for',
      t1[0]?.teacherId === teacherIds.female,
      `${t1[0]?.teacherId} vs female ${teacherIds.female}`,
    );
    check(
      'the lead carries the same teacher',
      t1[0]?.assignedTeacherId === t1[0]?.teacherId,
      `${t1[0]?.assignedTeacherId}`,
    );

    // The opposite preference must pick the other one, or the first result was
    // luck rather than the preference being honoured.
    const b2 = await book(emails.lead2, openSlots[1], 'Male');
    check('a second booking succeeds', b2.ok, `status ${b2.status}`);
    const { rows: t2 } = await db.query(
      `SELECT t."teacherId" FROM "LeadTrial" t JOIN "Lead" l ON l.id = t."leadId" WHERE l.email = $1`,
      [emails.lead2],
    );
    check(
      'the opposite preference picks the other teacher',
      t2[0]?.teacherId === teacherIds.male,
      `${t2[0]?.teacherId} vs male ${teacherIds.male}`,
    );

    // ── Nobody free: unassigned, but flagged ─────────────────────────────────
    console.log('\nWhen nobody is free');

    // Withdraw both teachers' approval; the day now has no published
    // availability at all, so the public form falls back to default hours and
    // there is genuinely nobody to pick.
    await db.query(
      `UPDATE "TeacherProfile" SET "availabilityApproved" = false WHERE id = ANY($1)`,
      [[teacherIds.male, teacherIds.female]],
    );

    const fbDate = isoDay(4);
    const fbSlots = await req('GET', `/leads/availability?date=${fbDate}`, null);
    check('the day falls back to default hours', fbSlots.body?.fallback === true);

    // book() hard-codes the first date, so this one is posted directly.
    const b3b = await req('POST', '/leads', null, {
      studentFirstName: 'Zz',
      studentLastName: 'SmokeNobody',
      email: emails.lead3,
      mobile: '9000000001',
      interestedSubject: 'Quran',
      preferredDate: fbDate,
      preferredSlot: fbSlots.body.slots[0],
    }, 201);
    check('booking still succeeds with nobody available', b3b.ok, `status ${b3b.status}: ${JSON.stringify(b3b.body).slice(0, 140)}`);

    const { rows: t3 } = await db.query(
      `SELECT t.id, t."teacherId", l.id AS lead_id FROM "LeadTrial" t
       JOIN "Lead" l ON l.id = t."leadId" WHERE l.email = $1`,
      [emails.lead3],
    );
    check('the trial is left without a teacher rather than mis-assigned', t3[0]?.teacherId === null);

    // ── The unassigned trial reaches the coach ───────────────────────────────
    console.log('\nThe coach is told');

    // Hand the lead to our throwaway coach so the task is addressed to them.
    await db.query(`UPDATE "Lead" SET "assignedCoachId" = $1 WHERE id = $2`, [coachId, t3[0].lead_id]);

    const dash = await req('GET', '/dashboard/coach', coachToken);
    const tasks = dash.body?.upcomingTasks || [];
    const task = tasks.find((t) => t.kind === 'TRIAL_NEEDS_TEACHER' && t.id === t3[0].id);
    check('the coach dashboard raises it as a task', !!task, `HTTP ${dash.status}, kinds: ${tasks.map((t) => t.kind).join(',') || 'none'}`);
    check('and the task links to the lead', task?.link === `/leads/${t3[0].lead_id}`, task?.link);

    // ── Assigning clears it ──────────────────────────────────────────────────
    console.log('\nAssigning a teacher');

    const assigned = await req('PATCH', `/leads/trials/${t3[0].id}`, adminToken, {
      teacherId: teacherIds.male,
    });
    check('a teacher can be assigned to an existing trial', assigned.ok, `status ${assigned.status}`);

    const { rows: t3after } = await db.query(
      `SELECT t."teacherId", l."assignedTeacherId" FROM "LeadTrial" t
       JOIN "Lead" l ON l.id = t."leadId" WHERE t.id = $1`,
      [t3[0].id],
    );
    check('the trial now has that teacher', t3after[0]?.teacherId === teacherIds.male);
    // Scheduling syncs the lead; editing has to as well, or every screen that
    // reads the lead rather than the trial disagrees with this one.
    check(
      'and the lead is brought into step',
      t3after[0]?.assignedTeacherId === teacherIds.male,
      String(t3after[0]?.assignedTeacherId),
    );

    // Changing to somebody else must move both again.
    await req('PATCH', `/leads/trials/${t3[0].id}`, adminToken, { teacherId: teacherIds.female });
    const { rows: swapped } = await db.query(
      `SELECT t."teacherId", l."assignedTeacherId" FROM "LeadTrial" t
       JOIN "Lead" l ON l.id = t."leadId" WHERE t.id = $1`,
      [t3[0].id],
    );
    check(
      'changing the teacher moves the trial and the lead together',
      swapped[0]?.teacherId === teacherIds.female &&
        swapped[0]?.assignedTeacherId === teacherIds.female,
      `${swapped[0]?.teacherId} / ${swapped[0]?.assignedTeacherId}`,
    );

    // Editing may change who teaches, never empty it.
    const blanked = await req(
      'PATCH', `/leads/trials/${t3[0].id}`, adminToken, { teacherId: '' }, 400,
    );
    check('the teacher cannot be blanked back out', blanked.ok, `status ${blanked.status}`);
    const { rows: stillThere } = await db.query(
      `SELECT "teacherId" FROM "LeadTrial" WHERE id = $1`,
      [t3[0].id],
    );
    check('and the refused edit changed nothing', stillThere[0]?.teacherId === teacherIds.female);

    const dash2 = await req('GET', '/dashboard/coach', coachToken);
    check(
      'and the task is gone',
      !(dash2.body?.upcomingTasks || []).some((t) => t.kind === 'TRIAL_NEEDS_TEACHER' && t.id === t3[0].id),
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
