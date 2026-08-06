/*
 * Smoke test — Module 8: Staff Meeting & Collaboration Management.
 *
 * Walks the whole spec end to end:
 *   recurring series seeded and generating → manual meeting scheduled with
 *   group + individual invitees → reminders → start → join/leave attendance →
 *   automatic Present/Late/Absent → excuse → minutes draft → publish gate →
 *   complete → action items assigned and moved by the assignee → attachments →
 *   reschedule and cancel notifications → all six reports → audit trail → and
 *   the role rules on every panel, including a student invited by a coach.
 *
 * Run: node scripts/smoke-meetings.cjs   (needs API running + env)
 */
require('dotenv/config');
const jwt = require('jsonwebtoken');
const { Client } = require('pg');

const BASE = process.env.SMOKE_BASE || 'http://localhost:5000/api';
const SECRET = process.env.JWT_ACCESS_SECRET;
const MARKER = 'zz-smoke-meet';

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
const minsFromNow = (m) => new Date(Date.now() + m * 60_000);
const iso = (d) => d.toISOString();

(async () => {
  if (!SECRET) throw new Error('JWT_ACCESS_SECRET is not set');
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();

  const cleanup = async () => {
    const ms = await db.query(`SELECT id FROM "StaffMeeting" WHERE title LIKE $1`, [`${MARKER}%`]);
    for (const m of ms.rows) {
      await db.query(`DELETE FROM "MeetingAuditLog" WHERE "meetingId"=$1`, [m.id]);
      await db.query(`DELETE FROM "MeetingActionItem" WHERE "meetingId"=$1`, [m.id]);
      await db.query(`DELETE FROM "MeetingAttachment" WHERE "meetingId"=$1`, [m.id]);
      await db.query(`DELETE FROM "StaffMeetingParticipant" WHERE "meetingId"=$1`, [m.id]);
      await db.query(`DELETE FROM "StaffMeeting" WHERE id=$1`, [m.id]);
    }
    await db.query(`DELETE FROM "StaffMeetingSeries" WHERE name LIKE $1`, [`${MARKER}%`]);
    const users = await db.query(`SELECT id FROM "User" WHERE email LIKE $1`, [`%${MARKER}%`]);
    for (const u of users.rows) {
      const sp = (await db.query(`SELECT id FROM "StudentProfile" WHERE "userId"=$1`, [u.id])).rows[0];
      if (sp) {
        await db.query(`DELETE FROM "StudentActivity" WHERE "studentId"=$1`, [sp.id]);
        await db.query(`DELETE FROM "Enrollment" WHERE "studentId"=$1`, [sp.id]);
        await db.query(`DELETE FROM "StudentProfile" WHERE id=$1`, [sp.id]);
      }
      const tp = (await db.query(`SELECT id FROM "TeacherProfile" WHERE "userId"=$1`, [u.id])).rows[0];
      if (tp) await db.query(`DELETE FROM "TeacherProfile" WHERE id=$1`, [tp.id]);
      await db.query(`DELETE FROM "StaffMeetingParticipant" WHERE "userId"=$1`, [u.id]);
      await db.query(`DELETE FROM "User" WHERE id=$1`, [u.id]);
    }
  };

  try {
    await cleanup();

    // ── Fixtures ────────────────────────────────────────────────────────────
    const admin = (await db.query(`SELECT id, email FROM "User" WHERE role='ADMIN' LIMIT 1`)).rows[0];
    if (!admin) throw new Error('no admin');
    const adminToken = token(admin.id, 'ADMIN', admin.email);

    const mkUser = async (tag, role) => {
      const u = (await db.query(
        `INSERT INTO "User" (id,email,"passwordHash","firstName","lastName",role,status,"updatedAt")
         VALUES (gen_random_uuid(),$1,'x','Meet',$2,$3,'ACTIVE',now()) RETURNING id, email`,
        [`${MARKER}-${tag}@example.test`, tag, role],
      )).rows[0];
      return { id: u.id, email: u.email, token: token(u.id, role, u.email) };
    };

    const sup = await mkUser('sup', 'SUPERVISOR');
    const coach = await mkUser('coach', 'ACADEMIC_COACH');
    const t1 = await mkUser('teacher1', 'TEACHER');
    const t2 = await mkUser('teacher2', 'TEACHER');
    await db.query(
      `INSERT INTO "TeacherProfile" (id,"userId","teacherCode") VALUES (gen_random_uuid(),$1,$2)`,
      [t1.id, `${MARKER}-T1-${Date.now()}`],
    );
    await db.query(
      `INSERT INTO "TeacherProfile" (id,"userId","teacherCode") VALUES (gen_random_uuid(),$1,$2)`,
      [t2.id, `${MARKER}-T2-${Date.now()}`],
    );
    const stuUser = await mkUser('student', 'STUDENT');
    const student = (await db.query(
      `INSERT INTO "StudentProfile" (id,"userId","studentCode","billingCurrency")
       VALUES (gen_random_uuid(),$1,$2,'USD') RETURNING id`,
      [stuUser.id, `${MARKER}-S-${Date.now()}`],
    )).rows[0];
    check('fixtures created', !!sup && !!coach && !!t1 && !!student);

    // ── Config ──────────────────────────────────────────────────────────────
    console.log('\nConfiguration');
    const cfg = await req('GET', '/meetings/settings', adminToken);
    check('meeting rules readable', cfg.status === 200 && cfg.body?.lateAfterMins >= 0, `status ${cfg.status}`);
    check('minutes are mandatory to complete by default', cfg.body?.requireSupervisorApproval === undefined && cfg.body?.requireMinutesToComplete === true,
      String(cfg.body?.requireMinutesToComplete));
    const cfgTeacher = await req('GET', '/meetings/settings', t1.token);
    check('a teacher can read the rules', cfgTeacher.status === 200, `status ${cfgTeacher.status}`);
    const cfgWrite = await req('PATCH', '/meetings/settings', coach.token, { lateAfterMins: 5 });
    check('a coach cannot change the rules', cfgWrite.status === 403, `status ${cfgWrite.status}`);

    // ── 8.2 recurring series ────────────────────────────────────────────────
    console.log('\nRecurring schedule (8.2)');
    const series = await req('POST', '/meetings/series', adminToken, {
      name: `${MARKER} Biweekly`,
      type: 'BIWEEKLY_TEACHER',
      intervalWeeks: 2,
      weekday: 6,
      startTime: '18:00',
      durationMins: 60,
      inviteRoles: ['TEACHER', 'SUPERVISOR'],
      // §8.2's "(Optional: Academic Coach and Admin may attend.)"
      optionalInviteRoles: ['ACADEMIC_COACH'],
      generateAheadWeeks: 8,
    });
    check('series created', series.status === 201 || series.status === 200, `status ${series.status} ${JSON.stringify(series.body).slice(0, 140)}`);
    const seriesId = series.body?.id;

    const gen = await req('POST', `/meetings/series/${seriesId}/generate`, adminToken);
    check('occurrences generated', (gen.body?.created ?? 0) > 0, JSON.stringify(gen.body));
    const gen2 = await req('POST', `/meetings/series/${seriesId}/generate`, adminToken);
    check('generating twice does not duplicate', gen2.body?.created === 0, JSON.stringify(gen2.body));

    /*
     * Read the occurrences back through the API, not raw SQL. The column is
     * `timestamp without time zone` like every DateTime in this schema: Prisma
     * round-trips it as UTC consistently, but a raw pg client reads the same
     * value as local time and shifts it by the runner's offset. Asserting on
     * the raw read tests the test runner's timezone, not the generator.
     */
    const seriesMeetings = await req('GET', '/meetings?type=BIWEEKLY_TEACHER&pageSize=200', adminToken);
    check('the list is paged, not silently capped',
      Array.isArray(seriesMeetings.body?.rows) && typeof seriesMeetings.body?.total === 'number',
      JSON.stringify(seriesMeetings.body).slice(0, 120));
    const ours = (seriesMeetings.body?.rows ?? [])
      .filter((m) => m.seriesId === seriesId)
      .sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));
    check('the series produced occurrences', ours.length > 0, String(ours.length));
    check('every occurrence is on a Saturday at 18:00',
      ours.every((m) => new Date(m.startsAt).getUTCDay() === 6 && new Date(m.startsAt).getUTCHours() === 18),
      ours.slice(0, 3).map((m) => m.startsAt).join(','));
    check('occurrences are 14 days apart',
      ours.length < 2 ||
        Math.round((new Date(ours[1].startsAt) - new Date(ours[0].startsAt)) / 86_400_000) === 14,
      String(ours.length));

    const generated = await db.query(
      `SELECT id FROM "StaffMeeting" WHERE "seriesId"=$1 ORDER BY "startsAt" ASC`,
      [seriesId],
    );

    const teacherInvited = await db.query(
      `SELECT count(*)::int AS n FROM "StaffMeetingParticipant" WHERE "meetingId"=$1 AND "userId"=$2`,
      [generated.rows[0].id, t1.id],
    );
    check('the series invited the teachers', teacherInvited.rows[0].n === 1, String(teacherInvited.rows[0].n));

    const coachRow = await db.query(
      `SELECT "isOptional" FROM "StaffMeetingParticipant" WHERE "meetingId"=$1 AND "userId"=$2`,
      [generated.rows[0].id, coach.id],
    );
    check('a recurring series can invite a role as OPTIONAL (8.2)',
      coachRow.rows[0]?.isOptional === true, JSON.stringify(coachRow.rows[0]));
    const teacherOptional = await db.query(
      `SELECT "isOptional" FROM "StaffMeetingParticipant" WHERE "meetingId"=$1 AND "userId"=$2`,
      [generated.rows[0].id, t1.id],
    );
    check('and the required roles stay required',
      teacherOptional.rows[0]?.isOptional === false, JSON.stringify(teacherOptional.rows[0]));

    // Changing WHO is invited must reach the occurrences already generated —
    // the horizon is weeks out, so "invite them too" cannot mean "in two months".
    await req('PUT', `/meetings/series/${seriesId}`, adminToken, { optionalInviteRoles: [] });
    const afterRoleChange = await db.query(
      `SELECT count(*)::int AS n FROM "StaffMeetingParticipant" p
       JOIN "StaffMeeting" m ON m.id = p."meetingId"
       WHERE m."seriesId"=$1 AND p."userId"=$2`,
      [seriesId, coach.id],
    );
    check('changing the invited roles regenerates untouched future occurrences',
      afterRoleChange.rows[0].n === 0, String(afterRoleChange.rows[0].n));

    const seriesForbidden = await req('POST', '/meetings/series', coach.token, { name: `${MARKER} nope` });
    check('a coach cannot create a recurring schedule', seriesForbidden.status === 403, `status ${seriesForbidden.status}`);

    // ── 8.4 manual scheduling ───────────────────────────────────────────────
    console.log('\nManual scheduling (8.4)');
    const startsAt = minsFromNow(-30); // already started, so join/leave is realistic
    const created = await req('POST', '/meetings', sup.token, {
      title: `${MARKER} Supervisor sync`,
      type: 'SUPERVISOR_TEACHER',
      description: '<b>Agenda</b><script>alert(1)</script>',
      startsAt: iso(startsAt),
      durationMins: 60,
      platform: 'JITSI',
      participants: { roles: ['TEACHER'], userIds: [coach.id] },
    });
    check('supervisor can schedule', created.status === 201 || created.status === 200, `status ${created.status} ${JSON.stringify(created.body).slice(0, 160)}`);
    const mId = created.body?.id;
    check('a Jitsi room was generated', /jit\.si|meet/.test(created.body?.meetingLink ?? ''), created.body?.meetingLink);
    check('the room name is not guessable from the title',
      !/supervisor|sync/i.test(created.body?.meetingLink ?? ''), created.body?.meetingLink);
    check('the agenda was sanitised on write', !/script/i.test(created.body?.description ?? ''), created.body?.description);
    check('the "all teachers" group was expanded server-side',
      (created.body?.participants ?? []).some((p) => p.userId === t1.id) &&
        (created.body?.participants ?? []).some((p) => p.userId === t2.id),
      String((created.body?.participants ?? []).length));
    check('the organiser is a participant',
      (created.body?.participants ?? []).some((p) => p.userId === sup.id && p.isOrganizer), '');
    check('everyone starts as INVITED, nobody as absent',
      (created.body?.participants ?? []).every((p) => p.status === 'INVITED'), '');

    const notified = await db.query(
      `SELECT count(*)::int AS n FROM "Notification" WHERE type='MEETING_SCHEDULED' AND "userId"=$1`,
      [t1.id],
    );
    check('participants were notified it was scheduled', notified.rows[0].n > 0, String(notified.rows[0].n));

    const noOne = await req('POST', '/meetings', sup.token, {
      title: `${MARKER} Empty`, type: 'ADMIN_STAFF', startsAt: iso(minsFromNow(60)), participants: {},
    });
    check('a meeting with nobody in it is refused', noOne.status === 400, `status ${noOne.status}`);

    const studentByTeacher = await req('POST', '/meetings', t1.token, {
      title: `${MARKER} Teacher-student`, type: 'STUDENT_MEETING', startsAt: iso(minsFromNow(60)),
      participants: { studentIds: [student.id] },
    });
    check('a teacher cannot invite a student', studentByTeacher.status === 403, `status ${studentByTeacher.status}`);

    const byStudent = await req('POST', '/meetings', stuUser.token, {
      title: `${MARKER} Student-made`, type: 'STUDENT_MEETING', startsAt: iso(minsFromNow(60)),
      participants: { userIds: [t1.id] },
    });
    check('a student cannot schedule at all', byStudent.status === 403, `status ${byStudent.status}`);

    // ── The spec's addendum: coach ↔ student ────────────────────────────────
    console.log('\nCoach ↔ student meeting (spec addendum)');
    const withStudent = await req('POST', '/meetings', coach.token, {
      title: `${MARKER} Coach and student`,
      type: 'STUDENT_MEETING',
      startsAt: iso(minsFromNow(120)),
      durationMins: 30,
      participants: { studentIds: [student.id] },
    });
    check('a coach can schedule with a student', withStudent.status === 201 || withStudent.status === 200,
      `status ${withStudent.status} ${JSON.stringify(withStudent.body).slice(0, 160)}`);
    const studentMeetingId = withStudent.body?.id;
    const studentMine = await req('GET', '/meetings/mine', stuUser.token);
    check('the student sees it in their portal',
      (studentMine.body?.upcoming ?? []).some((m) => m.id === studentMeetingId),
      JSON.stringify(studentMine.body?.upcoming ?? []).slice(0, 140));
    const studentReports = await req('GET', '/meetings/reports/staff', stuUser.token);
    check('a student cannot read the reports', studentReports.status === 403, `status ${studentReports.status}`);

    // ── 8.5 attendance ──────────────────────────────────────────────────────
    console.log('\nAttendance (8.5)');
    const started = await req('POST', `/meetings/${mId}/start`, sup.token);
    check('organiser started the meeting', started.body?.status === 'LIVE', started.body?.status);

    const joinT1 = await req('POST', `/meetings/${mId}/join`, t1.token);
    check('a participant can join', joinT1.status === 200 && !!joinT1.body?.joinedAt, `status ${joinT1.status}`);
    check('joining returns the room link', !!joinT1.body?.meetingLink, joinT1.body?.meetingLink);

    const outsider = await req('POST', `/meetings/${studentMeetingId}/join`, t2.token);
    check('a non-participant cannot join', outsider.status === 403 || outsider.status === 404, `status ${outsider.status}`);

    // t1 joined 30 minutes into a 60-minute meeting, so they are LATE.
    const leftT1 = await req('POST', `/meetings/${mId}/leave`, t1.token);
    check('leaving records a duration', (leftT1.body?.durationMins ?? -1) >= 0, JSON.stringify(leftT1.body));
    check('a late joiner is recorded as LATE', leftT1.body?.status === 'LATE', leftT1.body?.status);

    const excuse = await req('POST', `/meetings/${mId}/attendance`, sup.token, {
      userId: t2.id, status: 'EXCUSED', reason: 'On approved leave.',
    });
    check('a participant can be excused', excuse.status === 200, `status ${excuse.status}`);
    const excusedRow = (excuse.body?.participants ?? []).find((p) => p.userId === t2.id);
    check('the excuse reason is kept', excusedRow?.excuseReason === 'On approved leave.', excusedRow?.excuseReason);

    const teacherMarks = await req('POST', `/meetings/${mId}/attendance`, t2.token, {
      userId: t1.id, status: 'PRESENT',
    });
    check('a participant cannot mark someone else', teacherMarks.status === 403, `status ${teacherMarks.status}`);

    // ── 8.6 minutes ─────────────────────────────────────────────────────────
    console.log('\nMinutes (8.6)');
    const earlyComplete = await req('POST', `/meetings/${mId}/end`, sup.token);
    check('a meeting cannot complete without minutes', earlyComplete.status === 400, `status ${earlyComplete.status}`);

    const emptyPublish = await req('POST', `/meetings/${mId}/minutes/publish`, sup.token);
    check('minutes with no summary cannot be published', emptyPublish.status === 400, `status ${emptyPublish.status}`);

    const draft = await req('PUT', `/meetings/${mId}/minutes`, sup.token, {
      summary: 'Reviewed the term plan.',
      discussionPoints: 'Timetable, cover, exam week.',
      decisions: 'Exam week moves to the 12th.',
      remarks: 'Good turnout.',
    });
    check('minutes saved as a draft', draft.body?.minutesStatus === 'DRAFT', draft.body?.minutesStatus);

    const hiddenDraft = await req('GET', `/meetings/${mId}`, t1.token);
    check('a participant cannot read draft minutes', hiddenDraft.body?.minutes === null, JSON.stringify(hiddenDraft.body?.minutes));

    const published = await req('POST', `/meetings/${mId}/minutes/publish`, sup.token);
    check('minutes published', published.body?.minutesStatus === 'PUBLISHED', published.body?.minutesStatus);

    const visible = await req('GET', `/meetings/${mId}`, t1.token);
    check('a participant can now read them', visible.body?.minutes?.summary === 'Reviewed the term plan.',
      JSON.stringify(visible.body?.minutes).slice(0, 120));

    const editAfter = await req('PUT', `/meetings/${mId}/minutes`, sup.token, { summary: 'Rewriting.' });
    check('published minutes are read-only', editAfter.status === 400, `status ${editAfter.status}`);

    const minutesNote = await db.query(
      `SELECT count(*)::int AS n FROM "Notification" WHERE type='MEETING_MINUTES_PUBLISHED' AND "userId"=$1`,
      [t1.id],
    );
    check('participants were told the minutes are out', minutesNote.rows[0].n > 0, String(minutesNote.rows[0].n));

    // ── 8.7 action items ────────────────────────────────────────────────────
    console.log('\nAction items (8.7)');
    const item = await req('POST', `/meetings/${mId}/action-items`, sup.token, {
      description: 'Publish the revised timetable',
      assignedToId: t1.id,
      dueDate: iso(minsFromNow(60 * 48)),
      priority: 'HIGH',
    });
    check('action item assigned', item.status === 201 || item.status === 200, `status ${item.status}`);
    const itemId = item.body?.id;

    const assignNote = await db.query(
      `SELECT count(*)::int AS n FROM "Notification" WHERE type='MEETING_ACTION_ASSIGNED' AND "userId"=$1`,
      [t1.id],
    );
    check('the assignee was notified', assignNote.rows[0].n > 0, String(assignNote.rows[0].n));

    const myActions = await req('GET', '/meetings/my-actions', t1.token);
    check('it appears in the assignee’s own list',
      (myActions.body ?? []).some((a) => a.id === itemId), String((myActions.body ?? []).length));

    const moved = await req('PATCH', `/meetings/action-items/${itemId}`, t1.token, { status: 'IN_PROGRESS' });
    check('the assignee may move its status', moved.body?.status === 'IN_PROGRESS', moved.body?.status);

    const reassign = await req('PATCH', `/meetings/action-items/${itemId}`, t1.token, { assignedToId: t2.id });
    check('the assignee cannot hand it to someone else',
      reassign.status === 200 && reassign.body?.assignedToId === t1.id, JSON.stringify(reassign.body?.assignedToId));

    // t2 is in the meeting but is neither the organiser, the assignee, nor
    // staff. The coach would NOT be the right test here: a coach IS staff and
    // may manage any action item by design.
    const notMine = await req('PATCH', `/meetings/action-items/${itemId}`, t2.token, { status: 'COMPLETED' });
    check('another participant cannot touch someone else’s action item', notMine.status === 403, `status ${notMine.status}`);
    const byCoach = await req('PATCH', `/meetings/action-items/${itemId}`, coach.token, { priority: 'URGENT' });
    check('but a coach can, being staff', byCoach.status === 200 && byCoach.body?.priority === 'URGENT',
      `status ${byCoach.status} ${byCoach.body?.priority}`);

    // ── 8.8 attachments ─────────────────────────────────────────────────────
    console.log('\nAttachments (8.8)');
    const file = await req('POST', `/meetings/${mId}/attachments`, sup.token, {
      title: 'Recording', url: 'https://example.com/rec.mp4', kind: 'RECORDING',
    });
    check('a recording can be attached', file.status === 201 || file.status === 200, `status ${file.status}`);

    // ── Completion ──────────────────────────────────────────────────────────
    console.log('\nCompletion');
    const completed = await req('POST', `/meetings/${mId}/end`, sup.token);
    check('the meeting completes once minutes exist', completed.body?.status === 'COMPLETED', completed.body?.status);

    const settled = await db.query(
      `SELECT "userId", status FROM "StaffMeetingParticipant" WHERE "meetingId"=$1`, [mId],
    );
    const byUser = Object.fromEntries(settled.rows.map((r) => [r.userId, r.status]));
    check('non-joiners are settled as ABSENT', byUser[coach.id] === 'ABSENT', byUser[coach.id]);
    check('the excused participant stays EXCUSED', byUser[t2.id] === 'EXCUSED', byUser[t2.id]);
    check('the late joiner stays LATE', byUser[t1.id] === 'LATE', byUser[t1.id]);

    const absenceNote = await db.query(
      `SELECT count(*)::int AS n FROM "Notification" WHERE type='MEETING_ABSENCE' AND "userId"=$1`, [coach.id],
    );
    check('the absentee was notified', absenceNote.rows[0].n > 0, String(absenceNote.rows[0].n));

    // ── 8.3 reschedule + cancel ─────────────────────────────────────────────
    console.log('\nReschedule and cancel (8.3)');
    const future = await req('POST', '/meetings', sup.token, {
      title: `${MARKER} Movable`,
      type: 'ADMIN_STAFF',
      startsAt: iso(minsFromNow(60 * 72)),
      durationMins: 45,
      participants: { userIds: [t1.id, coach.id] },
    });
    const futureId = future.body?.id;
    const moved2 = await req('POST', `/meetings/${futureId}/reschedule`, sup.token, {
      startsAt: iso(minsFromNow(60 * 96)), durationMins: 60, note: 'Clashed with exams.',
    });
    check('rescheduled', moved2.status === 200 && !!moved2.body?.rescheduledFrom, `status ${moved2.status}`);
    check('the new duration took effect', moved2.body?.durationMins === 60, String(moved2.body?.durationMins));
    const reNote = await db.query(
      `SELECT count(*)::int AS n FROM "Notification" WHERE type='MEETING_RESCHEDULED' AND "userId"=$1`, [t1.id],
    );
    check('participants were told it moved', reNote.rows[0].n > 0, String(reNote.rows[0].n));

    const byTeacher = await req('POST', `/meetings/${futureId}/cancel`, t1.token, { reason: 'nope' });
    check('a plain participant cannot cancel', byTeacher.status === 403, `status ${byTeacher.status}`);

    const cancelled = await req('POST', `/meetings/${futureId}/cancel`, sup.token, { reason: 'No longer needed.' });
    check('cancelled', cancelled.body?.status === 'CANCELLED', cancelled.body?.status);
    const cxNote = await db.query(
      `SELECT count(*)::int AS n FROM "Notification" WHERE type='MEETING_CANCELLED' AND "userId"=$1`, [coach.id],
    );
    check('participants were told it was cancelled', cxNote.rows[0].n > 0, String(cxNote.rows[0].n));

    const editCancelled = await req('PATCH', `/meetings/${futureId}`, sup.token, { title: `${MARKER} nope` });
    check('a cancelled meeting cannot be edited', editCancelled.status === 400, `status ${editCancelled.status}`);

    // ── 8.9 calendar ────────────────────────────────────────────────────────
    console.log('\nCalendar (8.9)');
    const from = iso(minsFromNow(-60 * 24 * 7));
    const to = iso(minsFromNow(60 * 24 * 30));
    for (const [who, tok] of [['teacher', t1.token], ['supervisor', sup.token], ['student', stuUser.token]]) {
      const cal = await req('GET', `/dashboard/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, tok);
      const hasMeeting = (cal.body ?? []).some((e) => e.kind === 'MEETING' && e.meta?.module === 'STAFF_MEETING');
      check(`meetings appear on the ${who} calendar`, cal.status === 200 && hasMeeting, `status ${cal.status}`);
    }

    // ── 8.11 reports ────────────────────────────────────────────────────────
    console.log('\nReports (8.11)');
    const rFrom = iso(minsFromNow(-60 * 24 * 7));
    const rTo = iso(minsFromNow(60));
    const att = await req('GET', `/meetings/reports/attendance?from=${encodeURIComponent(rFrom)}&to=${encodeURIComponent(rTo)}`, adminToken);
    const ourRow = (att.body ?? []).find((r) => r.id === mId);
    check('attendance report includes the meeting', !!ourRow, String((att.body ?? []).length));
    /*
     * The rate is asserted as a FORMULA, not a fixed number: "all teachers"
     * expands against the live database, so the invitee count depends on how
     * many teachers exist. What must hold is that the excused participant is
     * removed from the denominator rather than counted as present or absent.
     */
    const expectedPct = ourRow
      ? Math.round(((ourRow.present + ourRow.late) / (ourRow.invited - ourRow.excused)) * 10000) / 100
      : -1;
    check('excused participants are out of the denominator',
      !!ourRow && ourRow.excused === 1 && ourRow.attendancePct === expectedPct,
      ourRow ? `${ourRow.present}P/${ourRow.late}L/${ourRow.absent}A/${ourRow.excused}E of ${ourRow.invited} = ${ourRow.attendancePct}% (expected ${expectedPct}%)` : '');
    check('an excused person is counted neither present nor absent',
      !!ourRow && ourRow.present + ourRow.late + ourRow.absent + ourRow.excused === ourRow.invited,
      ourRow ? `${ourRow.present}+${ourRow.late}+${ourRow.absent}+${ourRow.excused} vs ${ourRow.invited}` : '');

    const staffRep = await req('GET', `/meetings/reports/staff?from=${encodeURIComponent(rFrom)}&to=${encodeURIComponent(rTo)}`, adminToken);
    check('staff attendance report returns rows', Array.isArray(staffRep.body) && staffRep.body.length > 0, String((staffRep.body ?? []).length));

    const missed = await req('GET', `/meetings/reports/missed?from=${encodeURIComponent(rFrom)}&to=${encodeURIComponent(rTo)}`, adminToken);
    check('missed report names the absentee',
      (missed.body?.byUser ?? []).some((u) => u.userId === coach.id), JSON.stringify(missed.body?.byUser ?? []).slice(0, 140));

    const minRep = await req('GET', `/meetings/reports/minutes?from=${encodeURIComponent(rFrom)}&to=${encodeURIComponent(rTo)}`, adminToken);
    check('minutes report counts the published set', (minRep.body?.published ?? 0) > 0, JSON.stringify(minRep.body).slice(0, 120));

    const actRep = await req('GET', `/meetings/reports/actions?from=${encodeURIComponent(rFrom)}&to=${encodeURIComponent(rTo)}`, adminToken);
    check('action item report includes ours', (actRep.body?.items ?? []).some((a) => a.id === itemId), String(actRep.body?.total));

    const trainRep = await req('GET', `/meetings/reports/training?from=${encodeURIComponent(rFrom)}&to=${encodeURIComponent(rTo)}`, adminToken);
    check('training report responds', trainRep.status === 200 && Array.isArray(trainRep.body?.sessions), `status ${trainRep.status}`);

    const teacherReports = await req('GET', '/meetings/reports/staff', t1.token);
    check('a teacher cannot read the staff report', teacherReports.status === 403, `status ${teacherReports.status}`);

    // ── Audit ───────────────────────────────────────────────────────────────
    console.log('\nAudit');
    const audit = await req('GET', `/meetings/${mId}/audit`, adminToken);
    const actions = (audit.body ?? []).map((a) => a.action);
    check('every meeting action is logged',
      ['CREATED', 'STARTED', 'JOINED', 'LEFT', 'ATTENDANCE_MARKED', 'MINUTES_SAVED', 'MINUTES_PUBLISHED', 'ACTION_ASSIGNED', 'ENDED']
        .every((a) => actions.includes(a)),
      [...new Set(actions)].join(','));

    const auditByStudent = await req('GET', `/meetings/${mId}/audit`, stuUser.token);
    check('a student cannot read the audit trail', auditByStudent.status === 403, `status ${auditByStudent.status}`);

    // ── Visibility ──────────────────────────────────────────────────────────
    console.log('\nVisibility');
    const t2List = await req('GET', '/meetings', t2.token);
    check('a teacher only sees meetings they are in',
      (t2List.body?.rows ?? []).every((m) => m.myStatus !== null || m.isOrganizer),
      String((t2List.body?.rows ?? []).length));
    check('and not the coach-student meeting they were not invited to',
      !(t2List.body?.rows ?? []).some((m) => m.id === studentMeetingId), '');

    const foreign = await req('GET', `/meetings/${studentMeetingId}`, t2.token);
    check('opening a meeting they are not in is a 404, not a 403', foreign.status === 404, `status ${foreign.status}`);

    const coachSees = await req('GET', `/meetings/${mId}`, coach.token);
    check('a coach can open any meeting', coachSees.status === 200, `status ${coachSees.status}`);

    // ── Editing an existing meeting (8.3/8.4) ───────────────────────────────
    console.log('\nEditing');
    // Starts in the past so it can be made LIVE, which is what puts it in the
    // attendance report's countable window.
    const editable = await req('POST', '/meetings', sup.token, {
      title: `${MARKER} Editable`,
      type: 'ADMIN_STAFF',
      startsAt: iso(minsFromNow(-90)),
      durationMins: 45,
      participants: { userIds: [t1.id] },
    });
    const editId = editable.body?.id;
    check('a meeting to edit was created', !!editId, `status ${editable.status}`);

    const edited = await req('PATCH', `/meetings/${editId}`, sup.token, {
      title: `${MARKER} Editable renamed`,
      description: '<b>New agenda</b><img src=x onerror=alert(1)>',
    });
    check('the organiser can rename it and rewrite the agenda',
      edited.status === 200 && edited.body?.title === `${MARKER} Editable renamed`,
      `status ${edited.status}`);
    check('an edited agenda is sanitised too', !/onerror/i.test(edited.body?.description ?? ''),
      edited.body?.description);

    const addPerson = await req('PATCH', `/meetings/${editId}`, sup.token, {
      participants: { userIds: [t1.id], optionalUserIds: [t2.id] },
    });
    check('a forgotten participant can be added after the fact',
      (addPerson.body?.participants ?? []).some((p) => p.userId === t2.id),
      String((addPerson.body?.participants ?? []).length));
    check('and can be added as OPTIONAL (8.2)',
      (addPerson.body?.participants ?? []).find((p) => p.userId === t2.id)?.isOptional === true, '');
    check('the required attendee stays required',
      (addPerson.body?.participants ?? []).find((p) => p.userId === t1.id)?.isOptional === false, '');

    const demote = await req('PATCH', `/meetings/${editId}`, sup.token, {
      participants: { userIds: [t2.id], optionalUserIds: [t1.id] },
    });
    check('an existing participant can be moved between required and optional',
      (demote.body?.participants ?? []).find((p) => p.userId === t1.id)?.isOptional === true &&
        (demote.body?.participants ?? []).find((p) => p.userId === t2.id)?.isOptional === false, '');

    const editByOther = await req('PATCH', `/meetings/${editId}`, t2.token, { title: `${MARKER} hijack` });
    check('a plain participant cannot edit the meeting', editByOther.status === 403, `status ${editByOther.status}`);

    // Optional attendees must not drag the meeting's attendance figure down.
    // The report only counts meetings that ran, so start it first.
    await req('POST', `/meetings/${editId}/start`, sup.token);
    await req('POST', `/meetings/${editId}/attendance`, sup.token, { userId: t1.id, status: 'ABSENT' });
    await req('POST', `/meetings/${editId}/attendance`, sup.token, { userId: t2.id, status: 'PRESENT' });
    await req('POST', `/meetings/${editId}/attendance`, sup.token, { userId: sup.id, status: 'PRESENT' });
    const attRep = await req('GET', '/meetings/reports/attendance', adminToken);
    const editRow = (attRep.body ?? []).find((r) => r.id === editId);
    check('an optional absentee is out of the attendance denominator',
      editRow && editRow.optional === 1 && editRow.expected === 2 && editRow.attendancePct === 100,
      JSON.stringify(editRow));

    const missedRep = await req('GET', '/meetings/reports/missed', adminToken);
    check('and never appears on the missed-meetings report',
      !(missedRep.body?.recent ?? []).some((r) => r.userId === t1.id && r.meeting?.id === editId), '');

    // ── The caller's own id, so a panel knows which action items are theirs ──
    const selfView = await req('GET', `/meetings/${mId}`, t1.token);
    check('a meeting tells the caller their own user id',
      selfView.body?.myUserId === t1.id, String(selfView.body?.myUserId));

    // ── Meeting history is paged, not truncated ─────────────────────────────
    console.log('\nHistory paging');
    /*
     * Three meetings at the IDENTICAL start time. The series puts occurrences
     * on the hour, so ties are ordinary — and a sort on `startsAt` alone leaves
     * Postgres free to order tied rows differently per query, which makes
     * OFFSET hand back a row the previous page already showed. Paging has to
     * survive that, so the fixture creates the tie on purpose.
     */
    const tieAt = iso(minsFromNow(3000));
    const tieIds = [];
    for (const n of [1, 2, 3]) {
      const t = await req('POST', '/meetings', sup.token, {
        title: `${MARKER} tie ${n}`, type: 'ADMIN_STAFF', startsAt: tieAt, durationMins: 30,
        participants: { userIds: [t1.id] },
      });
      tieIds.push(t.body?.id);
    }
    check('three meetings share one start time', tieIds.filter(Boolean).length === 3, JSON.stringify(tieIds));

    const paged = [];
    for (const page of [1, 2, 3]) {
      const r = await req('GET', `/meetings?search=${MARKER}+tie&pageSize=1&page=${page}`, adminToken);
      paged.push(r.body);
    }
    check('page size is honoured', (paged[0]?.rows ?? []).length === 1, String((paged[0]?.rows ?? []).length));
    check('the total counts every match, not just this page',
      paged[0]?.total === 3 && paged[0]?.hasMore === true,
      JSON.stringify({ total: paged[0]?.total, hasMore: paged[0]?.hasMore }));
    const seenIds = paged.map((p) => (p?.rows ?? [])[0]?.id);
    check('paging over rows with identical start times never repeats one',
      new Set(seenIds).size === 3 && seenIds.every((id) => tieIds.includes(id)),
      JSON.stringify(seenIds));
    check('the last page reports no more', paged[2]?.hasMore === false, String(paged[2]?.hasMore));

    const ranged1 = await req('POST', '/meetings', sup.token, {
      title: `${MARKER} In range`, type: 'ADMIN_STAFF',
      startsAt: iso(minsFromNow(1500)), durationMins: 30, participants: { userIds: [t1.id] },
    });
    const ranged = await req(
      'GET', `/meetings?from=${iso(minsFromNow(1440))}&to=${iso(minsFromNow(1560))}`, adminToken,
    );
    check('a date range filters the history',
      (ranged.body?.rows ?? []).some((m) => m.id === ranged1.body?.id) &&
        !(ranged.body?.rows ?? []).some((m) => m.id === editId),
      String((ranged.body?.rows ?? []).length));

    // ── 8.8 upload ──────────────────────────────────────────────────────────
    console.log('\nRecordings and documents (8.8)');
    const form = new FormData();
    form.append('file', new Blob(['fake recording bytes'], { type: 'text/plain' }), 'session.txt');
    const up = await fetch(`${BASE}/meetings/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sup.token}` },
      body: form,
    });
    const upBody = await up.json().catch(() => ({}));
    check('staff can upload a recording or document',
      up.status === 201 || up.status === 200, `status ${up.status}`);
    check('the upload returns a served path under /uploads/meetings',
      /^\/uploads\/meetings\//.test(upBody.url ?? ''), upBody.url);

    const attached = await req('POST', `/meetings/${editId}/attachments`, sup.token, {
      title: 'Session recording', url: upBody.url, kind: 'RECORDING',
    });
    check('the uploaded file can be attached to the meeting',
      attached.status === 201 || attached.status === 200, `status ${attached.status}`);

    const studentUpload = await fetch(`${BASE}/meetings/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${stuUser.token}` },
      body: (() => { const f = new FormData(); f.append('file', new Blob(['x']), 'x.txt'); return f; })(),
    });
    check('a student cannot upload', studentUpload.status === 403, `status ${studentUpload.status}`);
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
