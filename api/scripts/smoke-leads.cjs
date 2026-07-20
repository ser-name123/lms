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

    // ── A lead belongs to one coach ──────────────────────────────────────────
    console.log('\n── Coach isolation ──');

    const ownerId = stored.assignedCoachId;
    const strangerId = coaches.find((c) => c !== ownerId);
    check('there is a second coach to test isolation against', Boolean(strangerId));

    const ownerRow = (
      await db.query(`SELECT id, email FROM "User" WHERE id=$1`, [ownerId])
    ).rows[0];
    const strangerRow = (
      await db.query(`SELECT id, email FROM "User" WHERE id=$1`, [strangerId])
    ).rows[0];
    const ownerToken = token(ownerRow.id, 'ACADEMIC_COACH', ownerRow.email);
    const strangerToken = token(strangerRow.id, 'ACADEMIC_COACH', strangerRow.email);

    const ownerSees = await req('GET', `/leads/${first.body.id}`, ownerToken);
    check('the assigned coach can open their lead', ownerSees.ok, `status ${ownerSees.status}`);

    const strangerSees = await req(
      'GET',
      `/leads/${first.body.id}`,
      strangerToken,
      undefined,
      403,
    );
    check('another coach cannot open it', strangerSees.ok, `status ${strangerSees.status}`);

    const strangerList = await req('GET', '/leads?page=1&limit=100', strangerToken);
    check(
      'it does not appear in another coach’s list',
      strangerList.ok && !strangerList.body.items.some((l) => l.id === first.body.id),
    );
    check(
      'a coach’s list contains only their own leads',
      strangerList.ok &&
        strangerList.body.items.every((l) => l.assignedCoachId === strangerRow.id),
      `${strangerList.body.items?.filter((l) => l.assignedCoachId !== strangerRow.id).length} foreign rows`,
    );

    // Passing someone else's coachId must not widen the scope.
    const strangerFilters = await req(
      'GET',
      `/leads?page=1&limit=100&coachId=${ownerId}`,
      strangerToken,
    );
    check(
      'filtering by another coach’s id returns nothing, not their pipeline',
      strangerFilters.ok && strangerFilters.body.items.length === 0,
      `${strangerFilters.body.items?.length} rows leaked`,
    );

    const strangerStats = await req('GET', '/leads/stats', strangerToken);
    const ownerStats = await req('GET', '/leads/stats', ownerToken);
    const adminStats = await req('GET', '/leads/stats', adminToken);
    check(
      'the counts are scoped too, not just the rows',
      strangerStats.body.total < adminStats.body.total &&
        ownerStats.body.total < adminStats.body.total,
      `stranger=${strangerStats.body?.total} owner=${ownerStats.body?.total} admin=${adminStats.body?.total}`,
    );

    const strangerWrites = await req(
      'PATCH',
      `/leads/${first.body.id}`,
      strangerToken,
      { priority: 'URGENT' },
      403,
    );
    check('another coach cannot edit it either', strangerWrites.ok, `status ${strangerWrites.status}`);

    const strangerTimeline = await req(
      'GET',
      `/leads/${first.body.id}/activities`,
      strangerToken,
      undefined,
      403,
    );
    check('the timeline is closed to them as well', strangerTimeline.ok, `status ${strangerTimeline.status}`);

    const adminSees = await req('GET', `/leads/${first.body.id}`, adminToken);
    check('an admin still sees every lead', adminSees.ok, `status ${adminSees.status}`);

    // ── Coach tools: availability, teacher, reschedule, extra trials ─────────
    console.log('\n── Coach tools ──');

    const teacherAvail = await req(
      'GET',
      `/leads/teacher-availability?date=${slotDate}`,
      ownerToken,
    );
    check('the coach can see who is free on a date', teacherAvail.ok, `status ${teacherAvail.status}`);
    check(
      'availability is per teacher, with free and busy slots split',
      teacherAvail.ok &&
        Array.isArray(teacherAvail.body.teachers) &&
        teacherAvail.body.teachers.every(
          (t) => t.teacherId && Array.isArray(t.freeSlots) && Array.isArray(t.busySlots),
        ),
    );

    // TeacherProfile has no createdAt — order by id so the pick is stable.
    const someTeacher = (
      await db.query(`SELECT id FROM "TeacherProfile" ORDER BY id LIMIT 2`)
    ).rows;
    if (someTeacher.length >= 2) {
      const assign = await req(
        'POST',
        `/leads/${first.body.id}/assign-teacher`,
        ownerToken,
        { teacherId: someTeacher[0].id },
        201,
      );
      check('the coach can assign a teacher', assign.ok, `status ${assign.status}`);

      const reassign = await req(
        'POST',
        `/leads/${first.body.id}/assign-teacher`,
        ownerToken,
        { teacherId: someTeacher[1].id },
        201,
      );
      check('and can change the teacher afterwards', reassign.ok, `status ${reassign.status}`);
      const afterReassign = (
        await db.query(`SELECT "assignedTeacherId" FROM "Lead" WHERE id=$1`, [first.body.id])
      ).rows[0];
      check(
        'the change actually sticks',
        afterReassign.assignedTeacherId === someTeacher[1].id,
        afterReassign.assignedTeacherId,
      );
    }

    const trialsBefore = await req('GET', `/leads/${first.body.id}/trials`, ownerToken);
    const originalTrial = trialsBefore.body[0];

    const moved = await req('PATCH', `/leads/trials/${originalTrial.id}`, ownerToken, {
      scheduledAt: new Date(Date.parse(`${slotDate}T14:00:00.000Z`)).toISOString(),
    });
    check('the coach can change the date and time', moved.ok, `status ${moved.status}`);
    check(
      'a reschedule is recorded as such and re-arms the reminders',
      moved.ok && moved.body.status === 'RESCHEDULED' && moved.body.reminder24hSentAt === null,
      `${moved.body?.status}`,
    );

    const second = await req(
      'POST',
      `/leads/${first.body.id}/trials`,
      ownerToken,
      {
        scheduledAt: new Date(Date.parse(`${slotDate}T16:00:00.000Z`)).toISOString(),
        durationMins: 30,
        notes: 'Second trial for the same student',
      },
      201,
    );
    check('the coach can book a second trial for the same student', second.ok, `status ${second.status}`);

    const trialsAfter = await req('GET', `/leads/${first.body.id}/trials`, ownerToken);
    check(
      'both trials are kept, not overwritten',
      trialsAfter.ok && trialsAfter.body.length === 2,
      `${trialsAfter.body?.length} trials`,
    );

    const strangerTrials = await req(
      'GET',
      `/leads/${first.body.id}/trials`,
      strangerToken,
      undefined,
      403,
    );
    check('another coach cannot list those trials', strangerTrials.ok, `status ${strangerTrials.status}`);

    const strangerMoves = await req(
      'PATCH',
      `/leads/trials/${originalTrial.id}`,
      strangerToken,
      { notes: 'should not be possible' },
      403,
    );
    check('nor reschedule them', strangerMoves.ok, `status ${strangerMoves.status}`);

    // ── The teacher's trial report ───────────────────────────────────────────
    console.log('\n── Teacher trial report ──');

    const teacherRows = (
      await db.query(
        `SELECT tp.id, tp."userId", u.email
           FROM "TeacherProfile" tp JOIN "User" u ON u.id = tp."userId"
          WHERE u.status = 'ACTIVE'
          ORDER BY tp.id LIMIT 2`,
      )
    ).rows;

    if (teacherRows.length < 2) {
      console.log('  skip  fewer than two active teachers to test isolation with');
    } else {
      const [mine, stranger] = teacherRows;
      const teacherToken = token(mine.userId, 'TEACHER', mine.email);
      const otherTeacherToken = token(stranger.userId, 'TEACHER', stranger.email);

      // Put the trial in this teacher's hands.
      await req('PATCH', `/leads/trials/${originalTrial.id}`, ownerToken, { teacherId: mine.id });

      const options = await req('GET', '/leads/trial-options', teacherToken);
      check(
        'a teacher can load the levels and catalogue the report offers',
        options.ok && Array.isArray(options.body.levels) && options.body.levels.length > 0,
        `status ${options.status}`,
      );

      const queue = await req('GET', '/leads/trials/mine?scope=all', teacherToken);
      check(
        'the trial shows up in the assigned teacher’s queue',
        queue.ok && queue.body.some((t) => t.id === originalTrial.id),
        `status ${queue.status}`,
      );

      const report = await req('GET', `/leads/trials/${originalTrial.id}/report`, teacherToken);
      check('the assigned teacher can open the report', report.ok, `status ${report.status}`);
      check(
        'and it carries the booking they have to verify against',
        report.ok && report.body.lead && report.body.lead.email && 'medicalDisability' in report.body.lead,
        'lead details missing from the report',
      );

      const strangerReads = await req(
        'GET',
        `/leads/trials/${originalTrial.id}/report`,
        otherTeacherToken,
        undefined,
        403,
      );
      check('another teacher cannot open it', strangerReads.ok, `status ${strangerReads.status}`);

      const strangerWrites = await req(
        'PATCH',
        `/leads/trials/${originalTrial.id}/report`,
        otherTeacherToken,
        { coveredIntro: true },
        403,
      );
      check('nor write to it', strangerWrites.ok, `status ${strangerWrites.status}`);

      /*
       * A deliberately wrong age alongside a date of birth: the service should
       * ignore the number and derive the age, otherwise the two disagree on
       * the record and go stale on the student's next birthday.
       */
      const dob = '2014-03-05';
      const draft = await req('PATCH', `/leads/trials/${originalTrial.id}/report`, teacherToken, {
        coveredIntro: true,
        coveredPresentation: true,
        coveredDemoLesson: true,
        coveredPackages: true,
        verifiedDetails: true,
        studentDob: dob,
        studentAge: 99,
        guardianName: 'Smoke Guardian',
        guardianRelation: 'Father',
        guardianPhone: '+911234567890',
        guardianEmail: 'zz-smoke-guardian@example.test',
        preferredDays: ['Monday', 'Wednesday'],
        preferredTime: '17:30',
        preferredStartDate: isoDay(14),
        teacherRating: 4,
        teacherFeedback: 'Reads confidently, needs tajweed practice.',
        teacherRecommendsEnroll: true,
      });
      check('the teacher can save the report as a draft', draft.ok, `status ${draft.status}`);
      check(
        'the draft is kept on the server, not just in the browser',
        draft.ok && draft.body.guardianName === 'Smoke Guardian' && draft.body.coveredPackages === true,
      );
      check(
        'a draft does not complete the trial',
        draft.ok && draft.body.reportSubmittedAt === null && draft.body.status !== 'COMPLETED',
        `status ${draft.body?.status}, submittedAt ${draft.body?.reportSubmittedAt}`,
      );
      const born = new Date(dob);
      const today = new Date();
      let expectedAge = today.getFullYear() - born.getFullYear();
      const monthsIn = today.getMonth() - born.getMonth();
      if (monthsIn < 0 || (monthsIn === 0 && today.getDate() < born.getDate())) expectedAge -= 1;
      check(
        'age is derived from the date of birth, not from the number sent',
        draft.ok && draft.body.studentAge !== 99 && draft.body.studentAge === expectedAge,
        `got ${draft.body?.studentAge}, expected ${expectedAge}`,
      );

      const noLevel = await req(
        'POST',
        `/leads/trials/${originalTrial.id}/report/submit`,
        teacherToken,
        {},
        400,
      );
      check(
        'a report cannot be submitted without an assessed level',
        noLevel.ok,
        `status ${noLevel.status}`,
      );

      const submitted = await req(
        'POST',
        `/leads/trials/${originalTrial.id}/report/submit`,
        teacherToken,
        { assessedLevel: 'Intermediate' },
        201,
      );
      check('the teacher can submit the report', submitted.ok, `status ${submitted.status}`);
      check(
        'submitting completes the trial and stamps it',
        submitted.ok && submitted.body.status === 'COMPLETED' && submitted.body.reportSubmittedAt,
        `status ${submitted.body?.status}`,
      );
      check(
        'the draft survives into the submitted report',
        submitted.ok && submitted.body.guardianName === 'Smoke Guardian' && submitted.body.teacherRating === 4,
      );

      const leadAfter = (
        await db.query(
          `SELECT status, "recommendedLevel", "parentName", "dateOfBirth", "preferredDays"
             FROM "Lead" WHERE id=$1`,
          [first.body.id],
        )
      ).rows[0];
      check(
        'the lead moves to waiting-on-the-parent with the level the teacher assessed',
        leadAfter.status === 'WAITING_PARENT_DECISION' && leadAfter.recommendedLevel === 'Intermediate',
        `${leadAfter.status} / ${leadAfter.recommendedLevel}`,
      );
      check(
        'what the teacher verified in the room overwrites what the form was told',
        leadAfter.parentName === 'Smoke Guardian' &&
          leadAfter.dateOfBirth &&
          leadAfter.preferredDays.includes('Wednesday'),
        `${leadAfter.parentName} / ${leadAfter.dateOfBirth} / ${leadAfter.preferredDays}`,
      );

      /*
       * The point of submitting is that the coach finds out. Fire-and-forget,
       * so poll briefly rather than assuming it has landed by now.
       */
      let coachNotice = 0;
      for (let i = 0; i < 10 && !coachNotice; i++) {
        coachNotice = Number(
          (
            await db.query(
              `SELECT count(*) FROM "Notification"
                WHERE "userId" = $1 AND type = 'TRIAL_REPORT_SUBMITTED' AND link = $2`,
              [ownerId, `/leads/${first.body.id}`],
            )
          ).rows[0].count,
        );
        if (!coachNotice) await new Promise((r) => setTimeout(r, 300));
      }
      check(
        'the assigned coach is told the report is in',
        coachNotice === 1,
        `${coachNotice} notifications`,
      );

      const twice = await req(
        'POST',
        `/leads/trials/${originalTrial.id}/report/submit`,
        teacherToken,
        { assessedLevel: 'Advanced' },
        400,
      );
      check('the same report cannot be submitted twice', twice.ok, `status ${twice.status}`);

      const editAfter = await req(
        'PATCH',
        `/leads/trials/${originalTrial.id}/report`,
        teacherToken,
        { teacherFeedback: 'changed my mind' },
        400,
      );
      check(
        'nor edited afterwards — the coach decides on a report that stays put',
        editAfter.ok,
        `status ${editAfter.status}`,
      );

      const coachReads = await req('GET', `/leads/trials/${originalTrial.id}/report`, ownerToken);
      check(
        'the owning coach can read the submitted report',
        coachReads.ok && coachReads.body.assessedLevel === 'Intermediate',
        `status ${coachReads.status}`,
      );
      const strangerCoachReads = await req(
        'GET',
        `/leads/trials/${originalTrial.id}/report`,
        strangerToken,
        undefined,
        403,
      );
      check(
        'another coach still cannot',
        strangerCoachReads.ok,
        `status ${strangerCoachReads.status}`,
      );

      // A no-show has nothing to report on.
      const secondTrialId = second.body.id;
      await req('PATCH', `/leads/trials/${secondTrialId}`, ownerToken, { teacherId: mine.id });
      await req('POST', `/leads/trials/${secondTrialId}/attendance`, teacherToken, {
        attendance: 'ABSENT',
      }, 201);
      const absentReport = await req(
        'POST',
        `/leads/trials/${secondTrialId}/report/submit`,
        teacherToken,
        { assessedLevel: 'Beginner' },
        400,
      );
      check(
        'a student marked absent cannot be reported on',
        absentReport.ok,
        `status ${absentReport.status}`,
      );
    }

    // ── Missing information, collected from the family afterwards ────────────
    console.log('\n── Missing-info form ──');
    {
      /*
       * Deliberately the trial whose report is already submitted and locked.
       * The four preference fields are exactly the ones that arrive late, so
       * the family's link has to write through that lock — while the teacher
       * still cannot touch anything.
       */
      const infoTrialId = originalTrial.id;

      const issued = await req(
        'POST',
        `/leads/trials/${infoTrialId}/info-request`,
        ownerToken,
        undefined,
        201,
      );
      check('the coach can send the family a link', issued.ok, `status ${issued.status}`);
      check(
        'the link is returned once so it can also go over WhatsApp',
        issued.ok && typeof issued.body.url === 'string' && issued.body.url.includes('/trial-details/'),
        issued.body?.url,
      );

      const infoToken = String(issued.body.url).split('/trial-details/')[1];
      const stored = (
        await db.query(
          `SELECT "infoTokenHash", "infoRequestedAt", "infoSubmittedAt" FROM "LeadTrial" WHERE id=$1`,
          [infoTrialId],
        )
      ).rows[0];
      const expectedHash = require('crypto').createHash('sha256').update(infoToken).digest('hex');
      check(
        'only the hash is stored — a leaked database hands out no working links',
        stored.infoTokenHash === expectedHash && stored.infoTokenHash !== infoToken,
      );
      check('and the request is stamped', Boolean(stored.infoRequestedAt));

      const strangerIssues = await req(
        'POST',
        `/leads/trials/${infoTrialId}/info-request`,
        strangerToken,
        undefined,
        403,
      );
      check('another coach cannot issue one', strangerIssues.ok, `status ${strangerIssues.status}`);

      // ── The public half ──
      const open = await req('GET', `/leads/info-form/${infoToken}`, null);
      check('the family can open the link without logging in', open.ok, `status ${open.status}`);
      check(
        'it shows what to fill in and nothing more',
        open.ok &&
          open.body.studentName &&
          Array.isArray(open.body.packages) &&
          !('email' in open.body) &&
          !('mobile' in open.body) &&
          !('assessedLevel' in open.body),
        'the public form leaks more than it should',
      );

      const badToken = await req(
        'GET',
        `/leads/info-form/${'z'.repeat(43)}`,
        null,
        undefined,
        404,
      );
      check('a guessed token opens nothing', badToken.ok, `status ${badToken.status}`);

      const empty = await req('POST', `/leads/info-form/${infoToken}`, null, {}, 400);
      check('an empty submission is refused', empty.ok, `status ${empty.status}`);

      const startDate = isoDay(21);
      const sent = await req(
        'POST',
        `/leads/info-form/${infoToken}`,
        null,
        {
          preferredPackage: 'Smoke package choice',
          preferredDays: ['Tuesday', 'Thursday'],
          preferredTime: '18:00',
          preferredStartDate: startDate,
        },
        201,
      );
      check('the family can submit their preferences', sent.ok, `status ${sent.status}`);

      const afterSubmit = (
        await db.query(
          `SELECT "preferredPackage", "preferredDays", "preferredTime", "preferredStartDate",
                  "infoSubmittedAt", "infoTokenHash"
             FROM "LeadTrial" WHERE id=$1`,
          [infoTrialId],
        )
      ).rows[0];
      check(
        'the answers land on the trial record itself',
        afterSubmit.preferredPackage === 'Smoke package choice' &&
          afterSubmit.preferredDays.includes('Thursday') &&
          afterSubmit.preferredTime === '18:00' &&
          afterSubmit.preferredStartDate !== null,
        JSON.stringify(afterSubmit),
      );
      check('and the submission is stamped', Boolean(afterSubmit.infoSubmittedAt));
      check(
        'the link is spent once used, not reusable forever',
        afterSubmit.infoTokenHash === null,
      );

      const reuse = await req(
        'GET',
        `/leads/info-form/${infoToken}`,
        null,
        undefined,
        404,
      );
      check('the same link cannot be opened again', reuse.ok, `status ${reuse.status}`);

      let infoNotice = 0;
      for (let i = 0; i < 10 && !infoNotice; i++) {
        infoNotice = Number(
          (
            await db.query(
              `SELECT count(*) FROM "Notification"
                WHERE "userId" = $1 AND type = 'TRIAL_INFO_RECEIVED' AND link = $2`,
              [ownerId, `/leads/${first.body.id}`],
            )
          ).rows[0].count,
        );
        if (!infoNotice) await new Promise((r) => setTimeout(r, 300));
      }
      check('the coach is told the details came in', infoNotice === 1, `${infoNotice} notifications`);

      // An expired link is a different answer from an invalid one.
      const reissued = await req(
        'POST',
        `/leads/trials/${infoTrialId}/info-request`,
        ownerToken,
        undefined,
        201,
      );
      const freshToken = String(reissued.body.url).split('/trial-details/')[1];
      await db.query(
        `UPDATE "LeadTrial" SET "infoTokenExpiresAt" = now() - interval '1 day' WHERE id=$1`,
        [infoTrialId],
      );
      const expired = await req('GET', `/leads/info-form/${freshToken}`, null, undefined, 400);
      check(
        'an expired link says so rather than pretending it never existed',
        expired.ok && /expired/i.test(JSON.stringify(expired.body)),
        `status ${expired.status}`,
      );

      if (teacherRows.length >= 2) {
        const teacherToken = token(teacherRows[0].userId, 'TEACHER', teacherRows[0].email);
        const stillLocked = await req(
          'PATCH',
          `/leads/trials/${infoTrialId}/report`,
          teacherToken,
          { teacherFeedback: 'after the fact' },
          400,
        );
        check(
          'the family’s answers get through, but the report stays shut to the teacher',
          stillLocked.ok,
          `status ${stillLocked.status}`,
        );
      }

      const trialsOut = await req('GET', `/leads/${first.body.id}/trials`, ownerToken);
      check(
        'no trial response ever carries the token hash',
        trialsOut.ok && trialsOut.body.every((t) => !('infoTokenHash' in t)),
      );
    }

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
