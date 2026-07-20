/*
 * Trial-class funnel smoke test.
 *
 * The single most business-critical path in the product — a visitor books a
 * free trial, a coach works it, the family becomes students — and it had no
 * test at all. This walks the whole thing against a running API and cleans up
 * after itself.
 *
 *   node scripts/smoke-leads.cjs
 *
 * Needs the API on localhost:5000 and JWT_ACCESS_SECRET in .env.
 */

require('dotenv/config');
const jwt = require('jsonwebtoken');
const { Client } = require('pg');

const BASE = process.env.SMOKE_BASE || 'http://localhost:5000/api';
const SECRET = process.env.JWT_ACCESS_SECRET;
/*
 * Lowercase on purpose: the API lowercases every lead email before storing it,
 * so an uppercase marker matches nothing on cleanup — and because the count
 * query used the same pattern as the delete, the run would cheerfully report
 * "0 stray leads" while leaving all of them behind. Cleanup checks have to be
 * able to disagree with the cleanup.
 */
const MARKER = 'zz-smoke-lead';

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
  const headers = { 'Content-Type': 'application/json' };
  if (auth) headers.Authorization = `Bearer ${auth}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  const text = await res.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body, ok: res.status === expect };
}

const isoDay = (offsetDays) =>
  new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);

(async () => {
  if (!SECRET) throw new Error('JWT_ACCESS_SECRET is not set');
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();

  const admin = (
    await db.query(
      `SELECT id, email FROM "User" WHERE role='ADMIN' AND status='ACTIVE' ORDER BY "createdAt" LIMIT 1`,
    )
  ).rows[0];
  if (!admin) throw new Error('No ACTIVE ADMIN to test with');
  const adminToken = token(admin.id, 'ADMIN', admin.email);

  /*
   * Round-robin needs several coaches to be observable, and the seed data has
   * one. Two throwaway coaches are created and removed in the finally block.
   */
  const coachEmails = [`${MARKER}-coach1@example.test`, `${MARKER}-coach2@example.test`];
  const createdCoachIds = [];
  for (const email of coachEmails) {
    const { rows } = await db.query(
      `INSERT INTO "User" (id,email,"passwordHash","firstName","lastName",role,status,"updatedAt")
       VALUES (gen_random_uuid(),$1,'x','Smoke','Coach','ACADEMIC_COACH','ACTIVE',now()) RETURNING id`,
      [email],
    );
    createdCoachIds.push(rows[0].id);
  }

  // Remember the rotation pointer so the real rotation is left as it was.
  const pointerBefore = (
    await db.query(`SELECT value FROM "SystemSetting" WHERE key='LEAD_COACH_ROTATION_LAST'`)
  ).rows[0]?.value;

  const createdLeadIds = [];
  const createdUserEmails = [];

  try {
    // ── Availability ─────────────────────────────────────────────────────────
    console.log('\n── Availability & date rules ──');

    const today = await req('GET', `/leads/availability?date=${isoDay(0)}`, null, undefined, 400);
    check('today cannot be booked', today.ok, `status ${today.status}`);

    const tooFar = await req('GET', `/leads/availability?date=${isoDay(40)}`, null, undefined, 400);
    check('beyond 30 days is rejected', tooFar.ok, `status ${tooFar.status}`);

    const junk = await req('GET', '/leads/availability?date=tomorrow', null, undefined, 400);
    check('a malformed date is rejected', junk.ok, `status ${junk.status}`);

    // Search forward for a date that actually has slots — a weekday with no
    // published availability legitimately returns none.
    let slotDate = null;
    let slotList = [];
    for (let d = 1; d <= 8 && !slotDate; d++) {
      const res = await req('GET', `/leads/availability?date=${isoDay(d)}`, null);
      if (res.ok && res.body.slots?.length) {
        slotDate = isoDay(d);
        slotList = res.body.slots;
      }
    }
    check('a bookable date offers slots', Boolean(slotDate), 'no date in the next 8 days had any');
    if (!slotDate) throw new Error('Cannot continue without a bookable slot');

    check(
      'every slot is a 30-minute boundary',
      slotList.every((s) => /^\d{2}:(00|30)$/.test(s)),
      slotList.slice(0, 5).join(', '),
    );
    check(
      'slots are unique and ordered',
      JSON.stringify(slotList) === JSON.stringify([...new Set(slotList)].sort()),
    );

    // ── Booking ──────────────────────────────────────────────────────────────
    console.log('\n── Booking ──');

    const bookingFor = (email, slot, extra = {}) => ({
      studentFirstName: 'Smoke',
      studentLastName: 'Lead',
      email,
      mobile: '9990001111',
      countryCode: '+91',
      country: 'India',
      timeZone: 'Asia/Kolkata',
      interestedSubject: 'Quran',
      sessionFor: 'MYSELF',
      preferredTeacherGender: 'Either',
      howFound: 'GOOGLE',
      preferredDate: slotDate,
      preferredSlot: slot,
      ...extra,
    });

    /* Slots are consumed as the test books them; track which are still free. */
    const usedSlots = [];

    const first = await req(
      'POST',
      '/leads',
      null,
      bookingFor(`${MARKER}-1@example.test`, slotList[0]),
      201,
    );
    usedSlots.push(slotList[0]);
    check('a visitor can book without signing in', first.ok, `status ${first.status}`);
    if (first.body?.id) createdLeadIds.push(first.body.id);

    check(
      'the response carries a real appointment, not just an acknowledgement',
      first.ok && Boolean(first.body.leadNumber) && Boolean(first.body.scheduledAt),
    );
    check(
      'no OTP is issued and no code leaks into the response',
      first.ok && !('otp' in first.body) && !('otpRequired' in first.body),
      JSON.stringify(Object.keys(first.body ?? {})),
    );

    const scheduled = new Date(first.body.scheduledAt);
    check(
      'the booking lands on the requested slot',
      `${String(scheduled.getUTCHours()).padStart(2, '0')}:${String(scheduled.getUTCMinutes()).padStart(2, '0')}` ===
        slotList[0] && first.body.scheduledAt.slice(0, 10) === slotDate,
      first.body.scheduledAt,
    );

    // A booked slot must disappear, or two families get the same teacher.
    const after = await req('GET', `/leads/availability?date=${slotDate}`, null);
    check('the booked slot is no longer offered', !after.body.slots.includes(slotList[0]));

    const clash = await req(
      'POST',
      '/leads',
      null,
      bookingFor(`${MARKER}-clash@example.test`, slotList[0]),
      400,
    );
    check('the same slot cannot be booked twice', clash.ok, `status ${clash.status}`);

    const pastBooking = await req(
      'POST',
      '/leads',
      null,
      { ...bookingFor(`${MARKER}-past@example.test`, slotList[1]), preferredDate: isoDay(0) },
      400,
    );
    check('booking today is refused at submit too', pastBooking.ok, `status ${pastBooking.status}`);

    const madeUpSlot = await req(
      'POST',
      '/leads',
      null,
      bookingFor(`${MARKER}-fake@example.test`, '03:17'),
      400,
    );
    check(
      'a slot that was never offered is refused',
      madeUpSlot.ok,
      `status ${madeUpSlot.status}`,
    );

    // ── What the lead actually holds ─────────────────────────────────────────
    console.log('\n── Stored lead ──');
    const stored = (
      await db.query(`SELECT * FROM "Lead" WHERE id = $1`, [first.body.id])
    ).rows[0];
    check('the new form fields are persisted',
      stored.sessionFor === 'MYSELF' &&
      stored.howFound === 'GOOGLE' &&
      stored.countryCode === '+91' &&
      stored.interestedSubject === 'Quran' &&
      stored.preferredSlot === slotList[0],
      `sessionFor=${stored.sessionFor} howFound=${stored.howFound} slot=${stored.preferredSlot}`);
    check(
      'the lead opens as TRIAL_SCHEDULED, not NEW',
      stored.status === 'TRIAL_SCHEDULED',
      stored.status,
    );

    const trialRow = (
      await db.query(`SELECT * FROM "LeadTrial" WHERE "leadId" = $1`, [first.body.id])
    ).rows[0];
    check('a trial row is created alongside the lead', Boolean(trialRow));
    check('the trial is 30 minutes and marked for Zoom',
      trialRow?.durationMins === 30 && trialRow?.meetingProvider === 'Zoom');

    // Zoom is optional; either it produced a link or it left a note to add one.
    const activities = (
      await db.query(`SELECT type, message FROM "LeadActivity" WHERE "leadId" = $1`, [
        first.body.id,
      ])
    ).rows;
    const zoomNoted = activities.some((a) => /zoom link could not be created/i.test(a.message));
    check(
      'a missing Zoom link is flagged for the coach rather than silently dropped',
      Boolean(trialRow?.meetingLink) || zoomNoted,
      trialRow?.meetingLink ? 'link present' : 'no link and no note',
    );

    // ── Round-robin coach assignment ─────────────────────────────────────────
    console.log('\n── Coach rotation ──');
    const coaches = (
      await db.query(
        `SELECT id FROM "User" WHERE role='ACADEMIC_COACH' AND status='ACTIVE' ORDER BY "createdAt" ASC`,
      )
    ).rows.map((r) => r.id);
    check('there are several coaches to rotate across', coaches.length >= 3, `${coaches.length}`);

    const assigned = [stored.assignedCoachId];
    for (let i = 1; i < coaches.length + 1; i++) {
      const slot = slotList[i];
      if (!slot) break;
      const res = await req(
        'POST',
        '/leads',
        null,
        bookingFor(`${MARKER}-rr${i}@example.test`, slot),
        201,
      );
      if (res.body?.id) {
        createdLeadIds.push(res.body.id);
        usedSlots.push(slot);
        const row = (
          await db.query(`SELECT "assignedCoachId" FROM "Lead" WHERE id=$1`, [res.body.id])
        ).rows[0];
        assigned.push(row.assignedCoachId);
      }
    }

    check('every booking gets a coach', assigned.every(Boolean), JSON.stringify(assigned));

    const firstPass = assigned.slice(0, coaches.length);
    check(
      'consecutive requests go to different coaches',
      new Set(firstPass).size === firstPass.length,
      `${new Set(firstPass).size} distinct of ${firstPass.length}`,
    );
    if (assigned.length > coaches.length) {
      check(
        'after the last coach it wraps back to the first',
        assigned[coaches.length] === assigned[0],
        `${assigned[coaches.length]} vs ${assigned[0]}`,
      );
    }

    // ── The lead is visible to staff ─────────────────────────────────────────
    console.log('\n── Coach pipeline ──');
    const list = await req('GET', '/leads?page=1&limit=50', adminToken);
    check('admin can list leads', list.ok, `status ${list.status}`);
    check(
      'the booked lead appears in the pipeline',
      list.ok && list.body.items?.some((l) => l.id === first.body.id),
    );

    const detail = await req('GET', `/leads/${first.body.id}`, adminToken);
    check('admin can open the lead', detail.ok, `status ${detail.status}`);
    check(
      'the detail carries the slot the visitor picked',
      detail.ok && detail.body.preferredSlot === slotList[0],
      detail.body?.preferredSlot,
    );

    const anon = await req('GET', `/leads/${first.body.id}`, null, undefined, 401);
    check('lead details are not public', anon.ok, `status ${anon.status}`);

    // ── Siblings become separate students ────────────────────────────────────
    console.log('\n── Siblings & conversion ──');
    const familySlot = slotList.find((s) => !usedSlots.includes(s));
    if (!familySlot) throw new Error('Ran out of free slots before the sibling case');

    const withSiblings = await req(
      'POST',
      '/leads',
      null,
      bookingFor(`${MARKER}-family@example.test`, familySlot, {
        sessionFor: 'FAMILY_MEMBER',
        siblings: [{ firstName: 'Yusuf', lastName: 'Lead' }, { firstName: 'Maryam' }],
      }),
      201,
    );
    check(
      'a booking can carry siblings',
      withSiblings.ok,
      `status ${withSiblings.status} ${JSON.stringify(withSiblings.body).slice(0, 140)}`,
    );
    if (withSiblings.body?.id) createdLeadIds.push(withSiblings.body.id);

    const familyRow = (
      await db.query(`SELECT siblings FROM "Lead" WHERE id=$1`, [withSiblings.body.id])
    ).rows[0];
    check(
      'both siblings are stored',
      Array.isArray(familyRow.siblings) && familyRow.siblings.length === 2,
      JSON.stringify(familyRow.siblings),
    );

    const decided = await req(
      'POST',
      `/leads/${withSiblings.body.id}/decision`,
      adminToken,
      { decision: 'ENROLL', notes: `${MARKER} enrol` },
      201,
    );
    check('the coach can enrol the family', decided.ok, `status ${decided.status} ${JSON.stringify(decided.body).slice(0, 160)}`);

    const converted = (
      await db.query(
        `SELECT status, "convertedStudents", "convertedStudentCode" FROM "Lead" WHERE id=$1`,
        [withSiblings.body.id],
      )
    ).rows[0];
    check('the lead is marked CONVERTED', converted.status === 'CONVERTED', converted.status);
    check(
      'one student account exists per child, not one per lead',
      Array.isArray(converted.convertedStudents) && converted.convertedStudents.length === 3,
      `${converted.convertedStudents?.length ?? 0} accounts for 3 children`,
    );

    for (const s of converted.convertedStudents ?? []) createdUserEmails.push(s.email);

    const codes = (converted.convertedStudents ?? []).map((s) => s.code);
    check('every student code is distinct', new Set(codes).size === codes.length, codes.join(', '));

    const emails = (converted.convertedStudents ?? []).map((s) => s.email);
    check('every sibling login is distinct', new Set(emails).size === emails.length, emails.join(', '));

    const realUsers = await db.query(
      `SELECT email FROM "User" WHERE email = ANY($1::text[])`,
      [emails],
    );
    check(
      'the accounts really exist and can be signed in to',
      realUsers.rows.length === emails.length,
      `${realUsers.rows.length} of ${emails.length} found`,
    );
  } finally {
    // ── Cleanup ──────────────────────────────────────────────────────────────
    console.log('\n── Cleanup ──');

    // Students created by the conversion, and their profiles.
    if (createdUserEmails.length) {
      await db.query(
        `DELETE FROM "StudentProfile" WHERE "userId" IN (SELECT id FROM "User" WHERE email = ANY($1::text[]))`,
        [createdUserEmails],
      );
      await db.query(`DELETE FROM "User" WHERE email = ANY($1::text[])`, [createdUserEmails]);
    }

    /*
     * Notifications first, and matched by the lead id in their link — the
     * marker lives in the lead's email address, which never appears in the
     * notification body, so a body match here silently cleans nothing. Every
     * booking fans LEAD_NEW out to all admins and coaches, so a full run leaves
     * dozens of these behind; they then crowd real notifications out of the
     * paginated feed and break the notifications suite.
     */
    for (const id of createdLeadIds) {
      await db.query(`DELETE FROM "Notification" WHERE link = $1`, [`/leads/${id}`]);
    }

    // Leads cascade to their trials and activities.
    await db.query(`DELETE FROM "Lead" WHERE email ILIKE $1`, [`${MARKER}%`]);

    if (createdCoachIds.length) {
      await db.query(`DELETE FROM "Notification" WHERE "userId" = ANY($1::text[])`, [
        createdCoachIds,
      ]);
      await db.query(`DELETE FROM "User" WHERE id = ANY($1::text[])`, [createdCoachIds]);
    }

    // Put the real rotation pointer back so production leads keep their order.
    if (pointerBefore) {
      await db.query(
        `INSERT INTO "SystemSetting" (key, value) VALUES ('LEAD_COACH_ROTATION_LAST', $1)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [pointerBefore],
      );
    } else {
      await db.query(`DELETE FROM "SystemSetting" WHERE key='LEAD_COACH_ROTATION_LAST'`);
    }

    /*
     * Last, and only after a pause: the API fires notifications with
     * `.catch(() => undefined)` and does not await them, so a LEAD_CONVERTED
     * written by the conversion above can land *after* the deletes ran. Sweeping
     * notifications that point at leads which no longer exist catches those
     * stragglers, whatever their type.
     */
    await new Promise((resolve) => setTimeout(resolve, 2000));
    await db.query(
      `DELETE FROM "Notification" n
        WHERE n.link LIKE '/leads/%'
          AND NOT EXISTS (SELECT 1 FROM "Lead" l WHERE n.link = '/leads/' || l.id)`,
    );

    const { rows } = await db.query(
      `SELECT (SELECT count(*)::int FROM "Lead" WHERE email ILIKE $1) AS leads,
              (SELECT count(*)::int FROM "User" WHERE email ILIKE $1) AS users,
              (SELECT count(*)::int FROM "LeadTrial" t
                 WHERE NOT EXISTS (SELECT 1 FROM "Lead" l WHERE l.id = t."leadId")) AS orphan_trials,
              (SELECT count(*)::int FROM "Notification" n
                 WHERE n.link LIKE '/leads/%'
                   AND NOT EXISTS (
                     SELECT 1 FROM "Lead" l WHERE n.link = '/leads/' || l.id
                   )) AS orphan_notifications`,
      [`${MARKER}%`],
    );
    console.log(
      `Cleanup: ${rows[0].leads} stray leads · ${rows[0].users} stray users · ` +
        `${rows[0].orphan_trials} orphaned trials · ` +
        `${rows[0].orphan_notifications} orphaned notifications remaining`,
    );
    await db.end();
  }

  console.log(`\n${pass}/${pass + fail} checks passed`);
  if (failures.length) {
    console.log('\nFailures:');
    for (const f of failures) console.log(`  · ${f}`);
    process.exit(1);
  }
})().catch((e) => {
  console.error('Smoke run failed:', e);
  process.exit(1);
});
