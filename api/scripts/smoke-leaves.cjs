/*
 * Smoke test — Module 9: Employee Leave & Teacher Unavailability.
 *
 * Walks the spec end to end:
 *   staff request from their own portal → overlap guard → admin asks a question
 *   → approve over MODIFIED dates, unpaid → salary deduction → teacher blocked
 *   from scheduling → coach's affected-student queue → all three §9.5 options
 *   → §9.7 return restores everything → the five reports → the role rules.
 *
 * Run: node scripts/smoke-leaves.cjs   (needs API running + env)
 */
require('dotenv/config');
const jwt = require('jsonwebtoken');
const { Client } = require('pg');

const BASE = process.env.SMOKE_BASE || 'http://localhost:5000/api';
const SECRET = process.env.JWT_ACCESS_SECRET;
const MARKER = 'zz-smoke-leave';

let pass = 0, fail = 0;
const fails = [];
const check = (n, c, d) => {
  if (c) { pass++; console.log(`  ok   ${n}`); }
  else { fail++; fails.push(`${n}${d ? ` — ${d}` : ''}`); console.log(`  FAIL ${n}${d ? ` — ${d}` : ''}`); }
};
const token = (id, role, email) => jwt.sign({ sub: id, email, role }, SECRET, { expiresIn: '30m' });
/*
 * The API throttles at 100 requests a minute per IP. This smoke now makes more
 * than that, so a back-to-back run used to collect 429s — which arrive as a
 * JSON error object and surfaced as "(...).find is not a function", a message
 * that reads like a Module 9 defect and is not one. Wait the window out and
 * retry instead: a rate limit is the server asking to be asked more slowly.
 */
async function req(method, path, auth, payload, attempt = 0) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth}` } : {}) },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  });
  if (res.status === 429 && attempt < 3) {
    const waitMs = Number(res.headers.get('retry-after')) * 1000 || 61_000;
    console.log(`  ..   rate limited, waiting ${Math.round(waitMs / 1000)}s`);
    await new Promise((r) => setTimeout(r, waitMs));
    return req(method, path, auth, payload, attempt + 1);
  }
  const text = await res.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body };
}
const dayUtc = (offset) => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + offset);
  return d;
};
const iso = (d) => d.toISOString();

(async () => {
  if (!SECRET) throw new Error('JWT_ACCESS_SECRET is not set');
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();

  const cleanup = async () => {
    const users = await db.query(`SELECT id FROM "User" WHERE email LIKE $1`, [`%${MARKER}%`]);
    const ids = users.rows.map((r) => r.id);
    if (ids.length) {
      const leaves = await db.query(`SELECT id FROM "LeaveRequest" WHERE "userId" = ANY($1)`, [ids]);
      for (const l of leaves.rows) {
        await db.query(`DELETE FROM "LeaveAuditLog" WHERE "leaveId"=$1`, [l.id]);
        await db.query(`DELETE FROM "LeaveImpact" WHERE "leaveId"=$1`, [l.id]);
        await db.query(`DELETE FROM "LeaveRequest" WHERE id=$1`, [l.id]);
      }
    }
    const tps = await db.query(`SELECT id FROM "TeacherProfile" WHERE "teacherCode" LIKE $1`, [`${MARKER}%`]);
    for (const tp of tps.rows) {
      const b = await db.query(`SELECT id FROM "Batch" WHERE "teacherId"=$1`, [tp.id]);
      for (const batch of b.rows) {
        const cs = await db.query(`SELECT id FROM "ClassSession" WHERE "batchId"=$1`, [batch.id]);
        for (const c of cs.rows) await db.query(`DELETE FROM "ClassAttendee" WHERE "classId"=$1`, [c.id]);
        await db.query(`DELETE FROM "ClassSession" WHERE "batchId"=$1`, [batch.id]);
        await db.query(`DELETE FROM "BatchStudent" WHERE "batchId"=$1`, [batch.id]);
        await db.query(`DELETE FROM "Batch" WHERE id=$1`, [batch.id]);
      }
      const cs2 = await db.query(`SELECT id FROM "ClassSession" WHERE "teacherId"=$1`, [tp.id]);
      for (const c of cs2.rows) await db.query(`DELETE FROM "ClassAttendee" WHERE "classId"=$1`, [c.id]);
      await db.query(`DELETE FROM "ClassSession" WHERE "teacherId"=$1`, [tp.id]);
      await db.query(`DELETE FROM "SalaryAdjustment" WHERE "salaryId" IN (SELECT id FROM "TeacherSalary" WHERE "teacherId"=$1)`, [tp.id]);
      await db.query(`DELETE FROM "TeacherSalary" WHERE "teacherId"=$1`, [tp.id]);
      await db.query(`DELETE FROM "TeacherProfile" WHERE id=$1`, [tp.id]);
    }
    const sps = await db.query(`SELECT id FROM "StudentProfile" WHERE "studentCode" LIKE $1`, [`${MARKER}%`]);
    for (const sp of sps.rows) {
      await db.query(`DELETE FROM "LeaveImpact" WHERE "studentId"=$1`, [sp.id]);
      await db.query(`DELETE FROM "ClassAttendee" WHERE "studentId"=$1`, [sp.id]);
      await db.query(`DELETE FROM "StudentSubscription" WHERE "studentId"=$1`, [sp.id]);
      await db.query(`DELETE FROM "StudentActivity" WHERE "studentId"=$1`, [sp.id]);
      await db.query(`DELETE FROM "Enrollment" WHERE "studentId"=$1`, [sp.id]);
      await db.query(`DELETE FROM "StudentProfile" WHERE id=$1`, [sp.id]);
    }
    for (const id of ids) {
      await db.query(`DELETE FROM "Notification" WHERE "userId"=$1`, [id]);
      await db.query(`DELETE FROM "User" WHERE id=$1`, [id]);
    }
  };

  try {
    await cleanup();

    // ── Fixtures ────────────────────────────────────────────────────────────
    const admin = (await db.query(`SELECT id, email FROM "User" WHERE role='ADMIN' LIMIT 1`)).rows[0];
    if (!admin) throw new Error('no admin');
    const adminToken = token(admin.id, 'ADMIN', admin.email);

    const mk = async (tag, role) => {
      const u = (await db.query(
        `INSERT INTO "User" (id,email,"passwordHash","firstName","lastName",role,status,"updatedAt")
         VALUES (gen_random_uuid(),$1,'x','Leave',$2,$3,'ACTIVE',now()) RETURNING id, email`,
        [`${MARKER}-${tag}@example.test`, tag, role],
      )).rows[0];
      return { id: u.id, email: u.email, role, token: token(u.id, role, u.email) };
    };

    const coach = await mk('coach', 'ACADEMIC_COACH');
    const sup = await mk('sup', 'SUPERVISOR');
    const teacher = await mk('teacher', 'TEACHER');
    const cover = await mk('cover', 'TEACHER');
    const stuUser = await mk('student', 'STUDENT');

    const mkTeacher = async (user, tag) =>
      (await db.query(
        `INSERT INTO "TeacherProfile" (id,"userId","teacherCode","hourlyRate")
         VALUES (gen_random_uuid(),$1,$2,20) RETURNING id`,
        [user.id, `${MARKER}-${tag}-${Date.now()}`],
      )).rows[0];
    const tp = await mkTeacher(teacher, 'T');
    const coverTp = await mkTeacher(cover, 'C');

    /*
     * Published, approved availability on every weekday, so both teachers show
     * up in the §9.6 pickers below. Without this they are invisible to those
     * endpoints and the guard would "pass" by finding nobody at all.
     */
    const WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const allWeek = Object.fromEntries(WEEK.map((d) => [d, [{ from: '09:00', to: '18:00' }]]));
    for (const t of [tp, coverTp]) {
      await db.query(
        `UPDATE "TeacherProfile" SET availability=$1, "availabilityApproved"=true, "timeZone"='UTC' WHERE id=$2`,
        [JSON.stringify(allWeek), t.id],
      );
    }

    const student = (await db.query(
      `INSERT INTO "StudentProfile" (id,"userId","studentCode","billingCurrency")
       VALUES (gen_random_uuid(),$1,$2,'USD') RETURNING id`,
      [stuUser.id, `${MARKER}-S-${Date.now()}`],
    )).rows[0];
    const course = (await db.query(`SELECT id, title FROM "Course" LIMIT 1`)).rows[0];
    check('fixtures created', !!tp && !!student && !!course);

    // Classes for the student with the teacher, inside the leave window.
    const AWAY_FROM = 5, AWAY_TO = 9;
    const classIds = [];
    for (const off of [AWAY_FROM, AWAY_FROM + 2, AWAY_TO]) {
      const starts = dayUtc(off);
      starts.setUTCHours(10, 0, 0, 0);
      const ends = new Date(starts.getTime() + 60 * 60_000);
      const c = (await db.query(
        `INSERT INTO "ClassSession" (id,"courseId","teacherId",title,"startsAt","endsAt",status)
         VALUES (gen_random_uuid(),$1,$2,$3,$4,$5,'SCHEDULED') RETURNING id`,
        [course.id, tp.id, `${MARKER} class ${off}`, starts, ends],
      )).rows[0];
      await db.query(
        `INSERT INTO "ClassAttendee" (id,"classId","studentId") VALUES (gen_random_uuid(),$1,$2)`,
        [c.id, student.id],
      );
      classIds.push(c.id);
    }
    check('three classes booked inside the window', classIds.length === 3);

    // ── §9.1 requests from every portal ─────────────────────────────────────
    console.log('\nRequesting (9.1)');
    const byTeacher = await req('POST', '/leaves', teacher.token, {
      leaveType: 'MEDICAL',
      startDate: iso(dayUtc(AWAY_FROM)),
      endDate: iso(dayUtc(AWAY_TO)),
      reason: 'Planned surgery',
      remarks: 'Back the following Monday',
    });
    check('a TEACHER can request from their own portal',
      byTeacher.status === 201 || byTeacher.status === 200,
      `status ${byTeacher.status} ${JSON.stringify(byTeacher.body).slice(0, 140)}`);
    const leaveId = byTeacher.body?.id;
    check("a teacher's request is filed as unavailability, not staff leave",
      byTeacher.body?.category === 'TEACHER_UNAVAILABILITY', byTeacher.body?.category);
    check('total days are auto-calculated inclusively',
      byTeacher.body?.totalDays === AWAY_TO - AWAY_FROM + 1, String(byTeacher.body?.totalDays));

    const byCoach = await req('POST', '/leaves', coach.token, {
      leaveType: 'ANNUAL', startDate: iso(dayUtc(40)), endDate: iso(dayUtc(42)), reason: 'Holiday',
    });
    check('a COACH can request too', byCoach.status === 201 || byCoach.status === 200, `status ${byCoach.status}`);
    check("a coach's request is staff leave", byCoach.body?.category === 'STAFF_LEAVE', byCoach.body?.category);

    const overlap = await req('POST', '/leaves', teacher.token, {
      leaveType: 'PERSONAL', startDate: iso(dayUtc(AWAY_TO)), endDate: iso(dayUtc(AWAY_TO + 2)), reason: 'Clash',
    });
    check('a window overlapping a live request is refused', overlap.status === 400, `status ${overlap.status}`);

    const backwards = await req('POST', '/leaves', teacher.token, {
      leaveType: 'PERSONAL', startDate: iso(dayUtc(60)), endDate: iso(dayUtc(58)), reason: 'Backwards',
    });
    check('an end before the start is refused', backwards.status === 400, `status ${backwards.status}`);

    const forOther = await req('POST', '/leaves', teacher.token, {
      userId: coach.id, leaveType: 'PERSONAL', startDate: iso(dayUtc(70)), endDate: iso(dayUtc(70)), reason: 'Not mine',
    });
    check('a teacher cannot file leave in a colleague\'s name', forOther.status === 403, `status ${forOther.status}`);

    const byStudent = await req('POST', '/leaves', stuUser.token, {
      leaveType: 'PERSONAL', startDate: iso(dayUtc(70)), endDate: iso(dayUtc(70)), reason: 'Nope',
    });
    check('a student cannot request staff leave', byStudent.status === 403, `status ${byStudent.status}`);

    // ── §9.8 row 1 — submitted reaches coach, supervisor, admin ─────────────
    for (const [who, u] of [['the coach', coach], ['the supervisor', sup]]) {
      const n = await db.query(
        `SELECT count(*)::int AS n FROM "Notification" WHERE "userId"=$1 AND type='LEAVE_REQUESTED'`, [u.id]);
      check(`submission notified ${who}`, n.rows[0].n > 0, String(n.rows[0].n));
    }

    // ── §9.2 approval workflow ──────────────────────────────────────────────
    console.log('\nApproval workflow (9.2)');
    const byNonAdmin = await req('POST', `/leaves/${leaveId}/approve`, coach.token, { isPaid: true });
    check('a coach cannot approve', byNonAdmin.status === 403, `status ${byNonAdmin.status}`);

    const ask = await req('POST', `/leaves/${leaveId}/request-info`, adminToken, {
      question: 'Can you confirm the discharge date?',
    });
    check('the admin can ask for more information', ask.body?.status === 'INFO_REQUESTED', ask.body?.status);

    const answerByOther = await req('POST', `/leaves/${leaveId}/respond-info`, coach.token, { response: 'nope' });
    check('only the requester may answer', answerByOther.status === 403, `status ${answerByOther.status}`);

    const answer = await req('POST', `/leaves/${leaveId}/respond-info`, teacher.token, {
      response: 'Discharged on the 8th.',
    });
    check('answering puts it back in the queue', answer.body?.status === 'PENDING', answer.body?.status);

    // Approve over a MODIFIED window, unpaid.
    const approve = await req('POST', `/leaves/${leaveId}/approve`, adminToken, {
      isPaid: false,
      endDate: iso(dayUtc(AWAY_TO - 1)),
      adminNotes: 'Approved a day shorter.',
    });
    check('approved', approve.body?.status === 'APPROVED', `status ${approve.status} ${JSON.stringify(approve.body).slice(0, 140)}`);
    check('§9.2 modified dates are applied', new Date(approve.body?.endDate).getUTCDate() === dayUtc(AWAY_TO - 1).getUTCDate(),
      approve.body?.endDate);
    check('and the window originally asked for is preserved',
      !!approve.body?.originalEndDate, String(approve.body?.originalEndDate));
    check('total days were recomputed for the shorter window',
      approve.body?.totalDays === AWAY_TO - AWAY_FROM, String(approve.body?.totalDays));
    check('§9.3 unpaid is recorded with a deduction',
      approve.body?.isPaid === false && Number(approve.body?.deductionAmount) >= 0,
      JSON.stringify({ paid: approve.body?.isPaid, amount: approve.body?.deductionAmount }));

    const twice = await req('POST', `/leaves/${leaveId}/approve`, adminToken, { isPaid: true });
    check('approving twice is refused', twice.status === 400, `status ${twice.status}`);

    // ── §9.6 availability ───────────────────────────────────────────────────
    console.log('\nAvailability (9.6)');
    const blocked = await db.query(`SELECT "availabilityBlockedAt" FROM "LeaveRequest" WHERE id=$1`, [leaveId]);
    check('the teacher is marked unavailable', !!blocked.rows[0].availabilityBlockedAt, '');

    const stillScheduled = await db.query(
      `SELECT count(*)::int AS n FROM "ClassSession" WHERE id = ANY($1) AND status='SCHEDULED'`, [classIds]);
    check('approval does NOT cancel the classes — that is the coach\'s call (§9.5)',
      stillScheduled.rows[0].n === 3, String(stillScheduled.rows[0].n));

    /*
     * §9.6's other half: "consider the unavailability while displaying available
     * teachers during SCHEDULING", not only rescheduling. Every picker that
     * offers a teacher for NEW work has to know. The approved window was
     * trimmed by the admin to AWAY_FROM…AWAY_TO-1, so AWAY_FROM is inside it
     * and AWAY_TO is the day just outside — which makes the second half of each
     * pair a control: if a picker simply hid the teacher outright, the "still
     * offered the day after" checks would fail.
     */
    const insideDate = dayUtc(AWAY_FROM).toISOString().slice(0, 10);
    const outsideDate = dayUtc(AWAY_TO).toISOString().slice(0, 10);

    const availInside = await req('GET', `/leads/teacher-availability?date=${insideDate}`, coach.token);
    const rowInside = (availInside.body?.teachers ?? []).find((t) => t.teacherId === tp.id);
    check('the coach assignment screen flags the absent teacher',
      rowInside?.onLeave === true, JSON.stringify(rowInside ?? availInside.body).slice(0, 160));
    check('and offers none of their slots',
      (rowInside?.freeSlots ?? ['x']).length === 0, String(rowInside?.freeSlots?.length));
    check('but still lists them, so the coach can see WHY they cannot be picked',
      !!rowInside && (rowInside.busySlots ?? []).length > 0, String(rowInside?.busySlots?.length));

    const availOutside = await req('GET', `/leads/teacher-availability?date=${outsideDate}`, coach.token);
    const rowOutside = (availOutside.body?.teachers ?? []).find((t) => t.teacherId === tp.id);
    check('the day after the approved window they are free again',
      rowOutside?.onLeave === false && (rowOutside?.freeSlots ?? []).length > 0,
      JSON.stringify({ onLeave: rowOutside?.onLeave, free: rowOutside?.freeSlots?.length }));

    check('the stand-in is unaffected and still bookable',
      (availInside.body?.teachers ?? []).find((t) => t.teacherId === coverTp.id)?.onLeave === false, '');

    // The public trial slot list is merged across teachers, so it cannot be
    // asserted teacher-by-teacher — what it must never do is fail outright.
    const publicSlots = await req('GET', `/leads/availability?date=${insideDate}`, null);
    check('the public trial slot list still answers with the teacher away',
      publicSlots.status === 200 && Array.isArray(publicSlots.body?.slots), `status ${publicSlots.status}`);

    // The recurring enrolment search: the absent teacher must not sit in the
    // "available for this schedule" list a coach picks from.
    const weekdayInside = WEEK[dayUtc(AWAY_FROM).getUTCDay()];
    const enrol = await req(
      'GET',
      `/leads/enrollment-teachers?days=${weekdayInside}&time=10:00&durationMinutes=60`,
      coach.token,
    );
    const inMatching = (enrol.body?.matching ?? []).some((t) => t.teacherId === tp.id);
    const inOthers = (enrol.body?.others ?? []).find((t) => t.teacherId === tp.id);
    check('the enrolment search keeps the absent teacher out of "matching"',
      !inMatching, `status ${enrol.status}`);
    check('and moves them to "others" carrying the reason',
      inOthers?.onLeave === true, JSON.stringify(inOthers ?? {}).slice(0, 140));
    check('while the stand-in is still offered as matching',
      (enrol.body?.matching ?? []).some((t) => t.teacherId === coverTp.id),
      JSON.stringify((enrol.body?.matching ?? []).map((t) => t.name)).slice(0, 140));

    /*
     * "New classes shall not be scheduled during approved unavailability" —
     * the rule, not just the picker that displays it. The bulk generator is the
     * cheapest way to book a whole span onto one teacher, so it is the one
     * asserted here: a range that straddles the window must produce classes on
     * either side of the leave and none inside it.
     *
     * Every weekday, so the generated set is one class per day and the counts
     * below are exact rather than "whatever the weekday pattern happened to
     * land on".
     */
    const genBatch = (await db.query(
      `INSERT INTO "Batch" (id,code,name,"courseId","teacherId","daysOfWeek","startTime","endTime","startDate",status,"updatedAt")
       VALUES (gen_random_uuid(),$1,$2,$3,$4,$5,'11:00','12:00',$6,'ACTIVE',now()) RETURNING id`,
      [`${MARKER}-B-${Date.now()}`, `${MARKER} batch`, course.id, tp.id, WEEK, dayUtc(1)],
    )).rows[0];

    const genFrom = dayUtc(AWAY_FROM - 2);
    const genTo = dayUtc(AWAY_TO + 1);
    const gen = await req('POST', '/attendance/classes/generate', adminToken, {
      batchId: genBatch.id,
      from: genFrom.toISOString().slice(0, 10),
      to: genTo.toISOString().slice(0, 10),
    });
    check('bulk class generation runs', gen.status === 201 || gen.status === 200, `status ${gen.status}`);
    check('and reports the days it refused to book',
      Number(gen.body?.skippedForLeave) > 0, JSON.stringify(gen.body));

    const inWindow = await db.query(
      `SELECT count(*)::int AS n FROM "ClassSession"
        WHERE "batchId"=$1 AND "startsAt" >= $2 AND "startsAt" < $3`,
      [genBatch.id, dayUtc(AWAY_FROM), dayUtc(AWAY_TO)],
    );
    check('§9.6 — NOT ONE class was created inside the approved window',
      inWindow.rows[0].n === 0, String(inWindow.rows[0].n));

    const outsideWindow = await db.query(
      `SELECT count(*)::int AS n FROM "ClassSession"
        WHERE "batchId"=$1 AND ("startsAt" < $2 OR "startsAt" >= $3)`,
      [genBatch.id, dayUtc(AWAY_FROM), dayUtc(AWAY_TO)],
    );
    check('while the days either side of it were booked normally',
      outsideWindow.rows[0].n > 0, String(outsideWindow.rows[0].n));

    // ── §9.4 the coach's queue ──────────────────────────────────────────────
    console.log('\nAffected students (9.4/9.5)');
    const impacts = await req('GET', `/leaves/impacts?leaveId=${leaveId}`, coach.token);
    check('the affected student is queued for the coach',
      (impacts.body ?? []).length === 1, JSON.stringify(impacts.body).slice(0, 160));
    const impactId = (impacts.body ?? [])[0]?.id;
    check('with the classes counted', (impacts.body ?? [])[0]?.affectedClassCount > 0,
      String((impacts.body ?? [])[0]?.affectedClassCount));

    const affectedNotice = await db.query(
      `SELECT count(*)::int AS n FROM "Notification" WHERE "userId"=$1 AND type='LEAVE_CLASSES_AFFECTED'`, [stuUser.id]);
    check('the student was told their teacher is away', affectedNotice.rows[0].n > 0, String(affectedNotice.rows[0].n));

    const noticeBody = await db.query(
      `SELECT body FROM "Notification" WHERE "userId"=$1 AND type='LEAVE_CLASSES_AFFECTED' LIMIT 1`, [stuUser.id]);
    check('and never told WHY — the reason is the teacher\'s business',
      !/surgery|medical/i.test(noticeBody.rows[0]?.body ?? ''), noticeBody.rows[0]?.body);

    const byStudentImpacts = await req('GET', '/leaves/my-impacts', stuUser.token);
    check('the student can see the arrangement in their own portal',
      (byStudentImpacts.body ?? []).length === 1, JSON.stringify(byStudentImpacts.body).slice(0, 120));

    // Replacement search must exclude the teacher who is away.
    const replacements = await req('GET', `/leaves/impacts/${impactId}/replacements`, coach.token);
    check('replacement teachers are offered', Array.isArray(replacements.body), `status ${replacements.status}`);
    check('and never include the teacher who is away',
      !(replacements.body ?? []).some((t) => t.id === tp.id), '');

    // Option 2 — assign the stand-in.
    const assign = await req('POST', `/leaves/impacts/${impactId}/decide`, coach.token, {
      option: 'TEMPORARY_TEACHER', temporaryTeacherId: coverTp.id, restoreOriginal: true, notes: 'Family agreed',
    });
    check('§9.5 option 2 — a temporary teacher can be assigned',
      assign.status === 200 || assign.status === 201, `status ${assign.status} ${JSON.stringify(assign.body).slice(0, 140)}`);

    /*
     * TWO of the three, not three. The admin approved a window one day SHORTER
     * than the one asked for, so the class on the original last day is no
     * longer inside the unavailability and must not be touched — which is the
     * real check here: the modified dates have to reach the impact scope, not
     * just the leave record.
     */
    const moved = await db.query(
      `SELECT count(*)::int AS n FROM "ClassSession" WHERE id = ANY($1) AND "teacherId"=$2`, [classIds, coverTp.id]);
    check('the classes inside the APPROVED window moved to the stand-in', moved.rows[0].n === 2, String(moved.rows[0].n));

    const outside = await db.query(`SELECT "teacherId" FROM "ClassSession" WHERE id=$1`, [classIds[2]]);
    check('the class on the day the admin trimmed off was left with the original teacher',
      outside.rows[0].teacherId === tp.id, outside.rows[0].teacherId);

    const enrolmentIntact = await db.query(
      `SELECT count(*)::int AS n FROM "ClassSession" WHERE id = ANY($1) AND status='CANCELLED'`, [classIds]);
    check('and none were cancelled', enrolmentIntact.rows[0].n === 0, String(enrolmentIntact.rows[0].n));

    const tempNotice = await db.query(
      `SELECT count(*)::int AS n FROM "Notification" WHERE "userId"=$1 AND type='LEAVE_TEMP_TEACHER'`, [cover.id]);
    check('the stand-in was told they are covering', tempNotice.rows[0].n > 0, String(tempNotice.rows[0].n));

    const selfCover = await req('POST', `/leaves/impacts/${impactId}/decide`, coach.token, {
      option: 'TEMPORARY_TEACHER', temporaryTeacherId: tp.id,
    });
    check('re-deciding a resolved student is refused', selfCover.status === 400, `status ${selfCover.status}`);

    // ── §9.7 return ─────────────────────────────────────────────────────────
    console.log('\nReturn to availability (9.7)');
    // Move the window into the past so the sweep picks it up.
    await db.query(
      `UPDATE "LeaveRequest" SET "startDate"=$1, "endDate"=$2 WHERE id=$3`,
      [dayUtc(-10), dayUtc(-3), leaveId],
    );
    // One class ahead (restoration should move it back) and one behind (the
    // stand-in has already taught it, so it must be left exactly as it is).
    await db.query(`UPDATE "ClassSession" SET "startsAt"=$1, "endsAt"=$2 WHERE id=$3`,
      [dayUtc(20), new Date(dayUtc(20).getTime() + 3600_000), classIds[0]]);
    await db.query(`UPDATE "ClassSession" SET "startsAt"=$1, "endsAt"=$2, status='COMPLETED' WHERE id=$3`,
      [dayUtc(-6), new Date(dayUtc(-6).getTime() + 3600_000), classIds[1]]);

    const returned = await req('POST', `/leaves/${leaveId}/return`, adminToken);
    check('the return can be run', returned.status === 200 || returned.status === 201, `status ${returned.status}`);

    const afterReturn = await db.query(
      `SELECT "returnedAt", "availabilityBlockedAt" FROM "LeaveRequest" WHERE id=$1`, [leaveId]);
    check('the teacher is available again',
      !!afterReturn.rows[0].returnedAt && !afterReturn.rows[0].availabilityBlockedAt,
      JSON.stringify(afterReturn.rows[0]));

    const restored = await db.query(
      `SELECT "teacherId" FROM "ClassSession" WHERE id=$1`, [classIds[0]]);
    check('a FUTURE class went back to the original teacher',
      restored.rows[0].teacherId === tp.id, restored.rows[0].teacherId);

    const past = await db.query(`SELECT "teacherId" FROM "ClassSession" WHERE id=$1`, [classIds[1]]);
    check('a class the stand-in already taught is left alone — the record must not be rewritten',
      past.rows[0].teacherId === coverTp.id, past.rows[0].teacherId);

    const backNotice = await db.query(
      `SELECT count(*)::int AS n FROM "Notification" WHERE "userId"=$1 AND type='LEAVE_TEACHER_RETURNED'`, [teacher.id]);
    check('the teacher was welcomed back', backNotice.rows[0].n > 0, String(backNotice.rows[0].n));

    // ── §9.9 history + audit ────────────────────────────────────────────────
    console.log('\nHistory and audit (9.9/9.11)');
    const audit = await req('GET', `/leaves/${leaveId}/audit`, adminToken);
    const actions = (audit.body ?? []).map((a) => a.action);
    check('every step is in the audit log',
      ['SUBMITTED', 'INFO_REQUESTED', 'INFO_PROVIDED', 'DATES_MODIFIED', 'APPROVED', 'AVAILABILITY_BLOCKED',
        'IMPACT_BUILT', 'IMPACT_DECIDED', 'TEMP_TEACHER_ASSIGNED', 'AVAILABILITY_RESTORED', 'RETURNED']
        .every((a) => actions.includes(a)),
      [...new Set(actions)].join(','));

    const auditByTeacher = await req('GET', `/leaves/${leaveId}/audit`, teacher.token);
    check('a teacher cannot read the audit trail', auditByTeacher.status === 403, `status ${auditByTeacher.status}`);

    const mine = await req('GET', '/leaves/mine', teacher.token);
    check('the teacher sees their own history', (mine.body?.items ?? []).some((i) => i.id === leaveId), '');
    check('with unpaid days counted', (mine.body?.unpaidDays ?? 0) > 0, String(mine.body?.unpaidDays));

    const otherHistory = await req('GET', `/leaves?userId=${coach.id}`, teacher.token);
    check("a teacher cannot read a colleague's history",
      (otherHistory.body?.items ?? []).every((i) => i.userId === teacher.id),
      String((otherHistory.body?.items ?? []).length));

    // ── §9.10 reports ───────────────────────────────────────────────────────
    console.log('\nReports (9.10)');
    for (const [name, path] of [
      ['staff leave summary', '/leaves/reports/summary'],
      ['paid vs unpaid', '/leaves/reports/paid-unpaid'],
      ['teacher unavailability', '/leaves/reports/unavailability'],
      ['unavailability impact', '/leaves/reports/impact'],
      ['monthly register', '/leaves/reports/register'],
    ]) {
      const r = await req('GET', path, adminToken);
      check(`${name} report responds`, r.status === 200, `status ${r.status}`);
    }
    const teacherReport = await req('GET', '/leaves/reports/summary', teacher.token);
    check('a teacher cannot read the reports', teacherReport.status === 403, `status ${teacherReport.status}`);

    // ── §9.11 configuration ─────────────────────────────────────────────────
    console.log('\nConfiguration (9.11)');
    const cfg = await req('GET', '/leaves/settings', teacher.token);
    check('a teacher can read which types are offered', cfg.status === 200, `status ${cfg.status}`);
    const cfgWrite = await req('PATCH', '/leaves/settings', coach.token, { noticeDaysExpected: 3 });
    check('a coach cannot change the rules', cfgWrite.status === 403, `status ${cfgWrite.status}`);
    const cfgAdmin = await req('PATCH', '/leaves/settings', adminToken, { noticeDaysExpected: 7 });
    check('an admin can', cfgAdmin.status === 200, `status ${cfgAdmin.status}`);

    /*
     * ── §9.5 options 1 and 3 ────────────────────────────────────────────────
     *
     * The run above proves option 2 end to end. Options 1 and 3 need their own
     * leave and their own students: an impact is RESOLVED once decided, and
     * option 1 needs a live subscription that option 2's student does not have.
     *
     * Option 1 is the one that touches MONEY — it pauses the classes and pushes
     * the billing cycle out by the same span — so it is asserted against the
     * subscription row, not just the impact record.
     */
    console.log('\nThe other two options (9.5)');

    const teacher2 = await mk('teacher2', 'TEACHER');
    const tp2 = await mkTeacher(teacher2, 'T2');
    const stuA = await mk('stuA', 'STUDENT');
    const stuB = await mk('stuB', 'STUDENT');
    const mkStudent = async (u, tag) => (await db.query(
      `INSERT INTO "StudentProfile" (id,"userId","studentCode","billingCurrency")
       VALUES (gen_random_uuid(),$1,$2,'USD') RETURNING id`,
      [u.id, `${MARKER}-${tag}-${Date.now()}`],
    )).rows[0];
    const spA = await mkStudent(stuA, 'SA');
    const spB = await mkStudent(stuB, 'SB');

    const W_FROM = 12, W_TO = 15;
    const mkClass = async (sp, off) => {
      const s = dayUtc(off); s.setUTCHours(14, 0, 0, 0);
      const c = (await db.query(
        `INSERT INTO "ClassSession" (id,"courseId","teacherId",title,"startsAt","endsAt",status)
         VALUES (gen_random_uuid(),$1,$2,$3,$4,$5,'SCHEDULED') RETURNING id`,
        [course.id, tp2.id, `${MARKER} c2 ${off}`, s, new Date(s.getTime() + 3600_000)],
      )).rows[0];
      await db.query(`INSERT INTO "ClassAttendee" (id,"classId","studentId") VALUES (gen_random_uuid(),$1,$2)`,
        [c.id, sp.id]);
      return c.id;
    };
    const clsA = await mkClass(spA, W_FROM + 1);
    const clsB = await mkClass(spB, W_FROM + 1);

    // Student A carries a live subscription; option 1 refuses without one, on
    // purpose — recording a pause that never happened is worse than saying no.
    const model = (await db.query(`SELECT id, "pricingMode" FROM "SubscriptionModel" LIMIT 1`)).rows[0];
    const renewalBefore = dayUtc(20);
    const subA = (await db.query(
      `INSERT INTO "StudentSubscription"
         (id,"studentId","modelId","pricingMode",currency,"durationMinutes","weeklyClasses","monthlyHours",
          status,"startDate","renewalDate","remainingClasses","updatedAt")
       VALUES (gen_random_uuid(),$1,$2,$3,'USD',60,2,8,'ACTIVE',now(),$4,8,now()) RETURNING id`,
      [spA.id, model.id, model.pricingMode, renewalBefore],
    )).rows[0];

    const leave2 = await req('POST', '/leaves', teacher2.token, {
      leaveType: 'VACATION',
      startDate: iso(dayUtc(W_FROM)),
      endDate: iso(dayUtc(W_TO)),
      reason: 'Family trip',
    });
    const leave2Id = leave2.body?.id;
    const app2 = await req('POST', `/leaves/${leave2Id}/approve`, adminToken, { isPaid: true });
    check('a second unavailability is approved', app2.body?.status === 'APPROVED', `status ${app2.status}`);

    const impacts2 = await req('GET', `/leaves/impacts?leaveId=${leave2Id}`, coach.token);
    check('both affected students are queued', (impacts2.body ?? []).length === 2,
      String((impacts2.body ?? []).length));
    const impA = (impacts2.body ?? []).find((i) => i.studentId === spA.id)?.id;
    const impB = (impacts2.body ?? []).find((i) => i.studentId === spB.id)?.id;

    // ── Option 1 — wait for the same teacher ────────────────────────────────
    const wait = await req('POST', `/leaves/impacts/${impA}/decide`, coach.token, {
      option: 'WAIT_FOR_TEACHER', notes: 'Family happy to wait',
    });
    check('§9.5 option 1 — the family can wait for their own teacher',
      wait.status === 200 || wait.status === 201,
      `status ${wait.status} ${JSON.stringify(wait.body).slice(0, 140)}`);
    check('and the cycle extension is reported back to the coach',
      Number(wait.body?.cycleExtendedDays) > 0, String(wait.body?.cycleExtendedDays));

    const subAfter = (await db.query(
      `SELECT status, "renewalDate" FROM "StudentSubscription" WHERE id=$1`, [subA.id])).rows[0];
    check('their subscription is paused, not cancelled', subAfter.status === 'ON_BREAK', subAfter.status);
    check('and the billing cycle moved OUT, so the pause costs them nothing',
      new Date(subAfter.renewalDate) > renewalBefore,
      `${subAfter.renewalDate} vs ${renewalBefore.toISOString()}`);

    const batchIntact = await db.query(
      `SELECT "teacherId" FROM "ClassSession" WHERE id=$1`, [clsA]);
    check('the reserved slot stays with the original teacher (§9.5 opt 1)',
      batchIntact.rows[0].teacherId === tp2.id, batchIntact.rows[0].teacherId);

    // ── Option 3 — reschedule out of the window ─────────────────────────────
    const stillInside = dayUtc(W_FROM + 2); stillInside.setUTCHours(14, 0, 0, 0);
    const refused = await req('POST', `/leaves/impacts/${impB}/decide`, coach.token, {
      option: 'RESCHEDULE', reschedules: [{ classId: clsB, startsAt: iso(stillInside) }],
    });
    check('§9.5 option 3 — a move that is STILL inside the window is refused',
      refused.status === 400, `status ${refused.status}`);

    const outsideAt = dayUtc(W_TO + 3); outsideAt.setUTCHours(14, 0, 0, 0);
    const moved3 = await req('POST', `/leaves/impacts/${impB}/decide`, coach.token, {
      option: 'RESCHEDULE', reschedules: [{ classId: clsB, startsAt: iso(outsideAt) }],
    });
    check('and a move outside it is accepted',
      moved3.status === 200 || moved3.status === 201,
      `status ${moved3.status} ${JSON.stringify(moved3.body).slice(0, 140)}`);

    const movedRow = (await db.query(
      `SELECT "startsAt","teacherId",status FROM "ClassSession" WHERE id=$1`, [clsB])).rows[0];
    check('the class really moved out of the unavailability',
      new Date(movedRow.startsAt) > dayUtc(W_TO), String(movedRow.startsAt));
    check('kept its own teacher — rescheduling is not a reassignment',
      movedRow.teacherId === tp2.id, movedRow.teacherId);
    check('and was not cancelled', movedRow.status === 'SCHEDULED', movedRow.status);

    const movedNotice = await db.query(
      `SELECT count(*)::int AS n FROM "Notification"
        WHERE "userId"=$1 AND type='LEAVE_CLASSES_AFFECTED' AND title LIKE '%moved%'`, [stuB.id]);
    check('and the student was told their classes moved', movedNotice.rows[0].n > 0,
      String(movedNotice.rows[0].n));

    const auditOpts = await db.query(
      `SELECT action FROM "LeaveAuditLog" WHERE "leaveId"=$1`, [leave2Id]);
    const actions2 = auditOpts.rows.map((r) => r.action);
    check('§9.11 both decisions are in the audit log',
      actions2.includes('CLASSES_PAUSED') && actions2.includes('CLASSES_RESCHEDULED'),
      actions2.join(','));

    /*
     * §9.7's fourth bullet — "resume the student's regular schedule (if
     * paused)". The return above proved option 2 stands the stand-in down;
     * this proves option 1's PAUSE is lifted, which is the half that holds a
     * family's billing open until it happens.
     */
    await db.query(`UPDATE "LeaveRequest" SET "startDate"=$1, "endDate"=$2 WHERE id=$3`,
      [dayUtc(-9), dayUtc(-2), leave2Id]);
    const return2 = await req('POST', `/leaves/${leave2Id}/return`, coach.token);
    check('the second unavailability can be returned', return2.status === 200 || return2.status === 201,
      `status ${return2.status}`);

    const subResumed = (await db.query(
      `SELECT status FROM "StudentSubscription" WHERE id=$1`, [subA.id])).rows[0];
    check('§9.7 — the paused subscription is ACTIVE again', subResumed.status === 'ACTIVE', subResumed.status);
    const resumeNotice = await db.query(
      `SELECT count(*)::int AS n FROM "Notification" WHERE "userId"=$1 AND type='LEAVE_TEACHER_RETURNED'`,
      [stuA.id]);
    check('and the family was told their teacher is back', resumeNotice.rows[0].n > 0,
      String(resumeNotice.rows[0].n));
    const teacher2Back = (await db.query(
      `SELECT "availabilityBlockedAt" FROM "LeaveRequest" WHERE id=$1`, [leave2Id])).rows[0];
    check('and the teacher is bookable again', !teacher2Back.availabilityBlockedAt, '');

    // ── Cancelling an approved leave puts the world back ────────────────────
    console.log('\nCancelling an approved leave');
    const second = await req('POST', '/leaves', coach.token, {
      leaveType: 'PERSONAL', startDate: iso(dayUtc(80)), endDate: iso(dayUtc(81)), reason: 'To be cancelled',
    });
    const secondId = second.body?.id;
    await req('POST', `/leaves/${secondId}/approve`, adminToken, { isPaid: true });
    const selfCancelApproved = await req('POST', `/leaves/${secondId}/cancel`, coach.token, {});
    check('the requester cannot cancel an already-approved leave',
      selfCancelApproved.status === 400, `status ${selfCancelApproved.status}`);
    const adminCancel = await req('POST', `/leaves/${secondId}/cancel`, adminToken, { reason: 'Plans changed' });
    check('an admin can', adminCancel.body?.status === 'CANCELLED', adminCancel.body?.status);

    const reused = await req('POST', '/leaves', coach.token, {
      leaveType: 'PERSONAL', startDate: iso(dayUtc(80)), endDate: iso(dayUtc(81)), reason: 'Same dates again',
    });
    check('the same dates can be requested again once cancelled',
      reused.status === 201 || reused.status === 200, `status ${reused.status}`);
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
