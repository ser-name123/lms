/*
 * Panel verification — Module 8 across every portal.
 *
 * The smoke proves the RULES. This proves the REACH: that the same meeting
 * shows up, with the right powers, on all five panels the spec names —
 * Admin, Supervisor, Academic Coach, Teacher and (per the addendum) Student.
 *
 * Two halves:
 *   live  — one meeting, then every role asked what it can see and do
 *   files — the web routes, nav entries and shared components that make it
 *           reachable, since an API nobody links to is not "on the panel"
 *
 * Run: node scripts/verify-panels-meetings.cjs   (needs API running + env)
 */
require('dotenv/config');
const fs = require('node:fs');
const path = require('node:path');
const jwt = require('jsonwebtoken');
const { Client } = require('pg');

const BASE = process.env.SMOKE_BASE || 'http://localhost:5000/api';
const SECRET = process.env.JWT_ACCESS_SECRET;
const MARKER = 'zz-verify-meet';
const WEB = path.join(__dirname, '..', '..', 'web', 'src');

let pass = 0, fail = 0;
const fails = [];
const check = (n, c, d) => {
  if (c) { pass++; console.log(`  ok   ${n}`); }
  else { fail++; fails.push(`${n}${d ? ` — ${d}` : ''}`); console.log(`  FAIL ${n}${d ? ` — ${d}` : ''}`); }
};
const token = (id, role, email) => jwt.sign({ sub: id, email, role }, SECRET, { expiresIn: '30m' });
async function req(method, p, auth, payload) {
  const res = await fetch(`${BASE}${p}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth}` } : {}) },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  });
  const text = await res.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body };
}
const read = (rel) => {
  const f = path.join(WEB, rel);
  return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null;
};

(async () => {
  if (!SECRET) throw new Error('JWT_ACCESS_SECRET is not set');
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();

  const cleanup = async () => {
    const ms = await db.query(`SELECT id FROM "StaffMeeting" WHERE title LIKE $1`, [`${MARKER}%`]);
    for (const m of ms.rows) {
      for (const t of ['MeetingAuditLog', 'MeetingActionItem', 'MeetingAttachment', 'StaffMeetingParticipant']) {
        await db.query(`DELETE FROM "${t}" WHERE "meetingId"=$1`, [m.id]);
      }
      await db.query(`DELETE FROM "StaffMeeting" WHERE id=$1`, [m.id]);
    }
    const users = await db.query(`SELECT id FROM "User" WHERE email LIKE $1`, [`%${MARKER}%`]);
    for (const u of users.rows) {
      const sp = (await db.query(`SELECT id FROM "StudentProfile" WHERE "userId"=$1`, [u.id])).rows[0];
      if (sp) {
        await db.query(`DELETE FROM "StudentActivity" WHERE "studentId"=$1`, [sp.id]);
        await db.query(`DELETE FROM "StudentProfile" WHERE id=$1`, [sp.id]);
      }
      const tp = (await db.query(`SELECT id FROM "TeacherProfile" WHERE "userId"=$1`, [u.id])).rows[0];
      if (tp) await db.query(`DELETE FROM "TeacherProfile" WHERE id=$1`, [tp.id]);
      await db.query(`DELETE FROM "Notification" WHERE "userId"=$1`, [u.id]);
      await db.query(`DELETE FROM "StaffMeetingParticipant" WHERE "userId"=$1`, [u.id]);
      await db.query(`DELETE FROM "User" WHERE id=$1`, [u.id]);
    }
  };

  try {
    await cleanup();

    const mk = async (tag, role) => {
      const u = (await db.query(
        `INSERT INTO "User" (id,email,"passwordHash","firstName","lastName",role,status,"updatedAt")
         VALUES (gen_random_uuid(),$1,'x','Panel',$2,$3,'ACTIVE',now()) RETURNING id, email`,
        [`${MARKER}-${tag}@example.test`, tag, role],
      )).rows[0];
      return { id: u.id, email: u.email, role, token: token(u.id, role, u.email) };
    };

    const admin = await mk('admin', 'ADMIN');
    const sup = await mk('sup', 'SUPERVISOR');
    const coach = await mk('coach', 'ACADEMIC_COACH');
    const teacher = await mk('teacher', 'TEACHER');
    await db.query(`INSERT INTO "TeacherProfile" (id,"userId","teacherCode") VALUES (gen_random_uuid(),$1,$2)`,
      [teacher.id, `${MARKER}-T-${Date.now()}`]);
    const stuUser = await mk('student', 'STUDENT');
    const student = (await db.query(
      `INSERT INTO "StudentProfile" (id,"userId","studentCode","billingCurrency")
       VALUES (gen_random_uuid(),$1,$2,'USD') RETURNING id`,
      [stuUser.id, `${MARKER}-S-${Date.now()}`],
    )).rows[0];

    const PANELS = [
      { name: 'Admin', u: admin }, { name: 'Supervisor', u: sup },
      { name: 'Academic Coach', u: coach }, { name: 'Teacher', u: teacher },
    ];

    // ── One meeting, everyone in it ────────────────────────────────────────
    console.log('\n8.4 — one meeting, every panel');
    const soon = new Date(Date.now() + 20 * 60_000).toISOString();
    const created = await req('POST', '/meetings', sup.token, {
      title: `${MARKER} All panels`,
      type: 'ADMIN_STAFF',
      startsAt: soon,
      durationMins: 60,
      participants: {
        userIds: [admin.id, coach.id, teacher.id],
        studentIds: [student.id],
      },
    });
    const mId = created.body?.id;
    check('a meeting can be scheduled', !!mId, `status ${created.status} ${JSON.stringify(created.body).slice(0, 140)}`);

    for (const p of [...PANELS, { name: 'Student', u: stuUser }]) {
      const one = await req('GET', `/meetings/${mId}`, p.u.token);
      check(`${p.name} can open the meeting`, one.status === 200, `status ${one.status}`);
      check(`${p.name} is told their own attendance state`,
        one.body?.myStatus === 'INVITED', String(one.body?.myStatus));
      check(`${p.name} is told their own user id`, one.body?.myUserId === p.u.id, String(one.body?.myUserId));
    }

    // ── 8.9 calendar in every portal ───────────────────────────────────────
    console.log('\n8.9 — the meeting appears on every portal calendar');
    for (const p of [...PANELS, { name: 'Student', u: stuUser }]) {
      const cal = await req('GET', '/dashboard/calendar', p.u.token);
      const events = Array.isArray(cal.body) ? cal.body : (cal.body?.events ?? []);
      const found = events.find((e) => e.id === mId);
      check(`${p.name} calendar carries the meeting`, !!found,
        `status ${cal.status}, ${events.length} event(s)`);
      if (found) {
        check(`${p.name} calendar links somewhere role-appropriate`,
          typeof found.link === 'string' && found.link.includes('meetings'), found.link);
      }
    }

    // ── 8.10 notification matrix ───────────────────────────────────────────
    console.log('\n8.10 — scheduled notification reached each role');
    for (const p of [...PANELS, { name: 'Student', u: stuUser }]) {
      const n = await db.query(
        `SELECT count(*)::int AS n FROM "Notification" WHERE "userId"=$1 AND type='MEETING_SCHEDULED'`,
        [p.u.id],
      );
      // The supervisor organised it, so they are a participant too.
      check(`${p.name} was notified it was scheduled`, n.rows[0].n > 0, String(n.rows[0].n));
    }

    await req('POST', `/meetings/${mId}/reschedule`, sup.token, {
      startsAt: new Date(Date.now() + 90 * 60_000).toISOString(), note: 'moved',
    });
    for (const p of [...PANELS, { name: 'Student', u: stuUser }]) {
      const n = await db.query(
        `SELECT count(*)::int AS n FROM "Notification" WHERE "userId"=$1 AND type='MEETING_RESCHEDULED'`,
        [p.u.id],
      );
      check(`${p.name} was notified it moved`, n.rows[0].n > 0, String(n.rows[0].n));
    }

    // Absence goes to teacher/supervisor/admin, NOT the coach (the spec's ✗).
    const absenceRoles = await db.query(
      `SELECT DISTINCT u.role FROM "Notification" n JOIN "User" u ON u.id = n."userId"
       WHERE n.type='MEETING_ABSENCE'`,
    );
    check('the absence notice is never routed to a coach by role',
      !absenceRoles.rows.some((r) => r.role === 'ACADEMIC_COACH'),
      absenceRoles.rows.map((r) => r.role).join(','));

    // ── Powers per panel ───────────────────────────────────────────────────
    console.log('\nWho may do what');
    const canCreate = { Admin: true, Supervisor: true, 'Academic Coach': true, Teacher: true };
    for (const p of PANELS) {
      // Invite somebody OTHER than the organiser — a meeting whose only
      // participant is the person who called it is correctly refused, and
      // testing against that would prove nothing about the panel.
      const guest = p.u.id === sup.id ? admin.id : sup.id;
      const r = await req('POST', '/meetings', p.u.token, {
        title: `${MARKER} by ${p.name}`,
        type: p.name === 'Teacher' ? 'TEACHER_TEACHER' : 'ADMIN_STAFF',
        startsAt: new Date(Date.now() + 3 * 3600_000).toISOString(),
        durationMins: 30,
        participants: { userIds: [guest] },
      });
      check(`${p.name} can schedule from their portal`,
        (r.status === 200 || r.status === 201) === canCreate[p.name], `status ${r.status}`);
    }
    const byStudent = await req('POST', '/meetings', stuUser.token, {
      title: `${MARKER} nope`, type: 'STUDENT_MEETING',
      startsAt: new Date(Date.now() + 3600_000).toISOString(), participants: { userIds: [sup.id] },
    });
    check('Student cannot schedule', byStudent.status === 403, `status ${byStudent.status}`);

    // Students may be invited by coach/supervisor only (the addendum).
    for (const [who, u, allowed] of [['Coach', coach, true], ['Supervisor', sup, true], ['Teacher', teacher, false]]) {
      const r = await req('POST', '/meetings', u.token, {
        title: `${MARKER} ${who} with student`, type: 'STUDENT_MEETING',
        startsAt: new Date(Date.now() + 4 * 3600_000).toISOString(),
        participants: { studentIds: [student.id] },
      });
      check(`${who} ${allowed ? 'can' : 'cannot'} put a student in a meeting`,
        (r.status === 200 || r.status === 201) === allowed, `status ${r.status}`);
    }

    // Reports: staff only.
    for (const p of PANELS) {
      const r = await req('GET', '/meetings/reports/attendance', p.u.token);
      const expected = p.name !== 'Teacher';
      check(`${p.name} ${expected ? 'can' : 'cannot'} read the reports`,
        (r.status === 200) === expected, `status ${r.status}`);
    }

    // Recurring schedule + academy rules: admin and supervisor only.
    for (const [name, u, allowed] of [
      ['Admin', admin, true], ['Supervisor', sup, true],
      ['Academic Coach', coach, false], ['Teacher', teacher, false],
    ]) {
      const r = await req('PATCH', '/meetings/settings', u.token, { lateAfterMins: 10 });
      check(`${name} ${allowed ? 'may' : 'may not'} change the academy meeting rules`,
        (r.status === 200) === allowed, `status ${r.status}`);
    }

    // ── Web wiring ─────────────────────────────────────────────────────────
    console.log('\nWeb routes and navigation');
    const ROUTES = [
      ['admin/supervisor/coach list', 'app/(admin)/meetings/page.tsx'],
      ['admin detail', 'app/(admin)/meetings/[id]/page.tsx'],
      ['admin reports', 'app/(admin)/meetings/reports/page.tsx'],
      ['admin recurring setup', 'app/(admin)/meetings/settings/page.tsx'],
      ['teacher list', 'app/(teacher)/teacher/meetings/page.tsx'],
      ['teacher detail', 'app/(teacher)/teacher/meetings/[id]/page.tsx'],
      ['student list', 'app/(student)/student/meetings/page.tsx'],
      ['student detail', 'app/(student)/student/meetings/[id]/page.tsx'],
    ];
    for (const [name, rel] of ROUTES) check(`${name} route exists`, read(rel) !== null, rel);

    const navConfig = read('components/layout/nav-config.ts') ?? '';
    const sidebar = read('components/layout/sidebar.tsx') ?? '';
    const teacherShell = read('components/layout/teacher-shell.tsx') ?? '';
    const studentShell = read('components/layout/student-shell.tsx') ?? '';
    check('Admin nav links to /meetings', /href:\s*"\/meetings"/.test(navConfig), '');
    check('Coach and Supervisor navs link to /meetings',
      (sidebar.match(/href:\s*"\/meetings"/g) ?? []).length >= 2,
      String((sidebar.match(/href:\s*"\/meetings"/g) ?? []).length));
    check('Teacher nav links to /teacher/meetings', /href:\s*"\/teacher\/meetings"/.test(teacherShell), '');
    check('Student nav links to /student/meetings', /href:\s*"\/student\/meetings"/.test(studentShell), '');

    const adminLayout = read('app/(admin)/layout.tsx') ?? '';
    check('the coach is kept out of the recurring-schedule page, matching the API',
      adminLayout.includes('/meetings/settings'), '');

    // ── Shared detail component carries every spec section ─────────────────
    console.log('\nMeeting detail — the sections the spec names');
    const detail = read('components/meetings/meeting-detail.tsx') ?? '';
    for (const [name, needle] of [
      ['agenda (8.4)', 'Agenda'],
      ['attendance table (8.5)', 'Attendance'],
      ['minutes editor (8.6)', 'Discussion points'],
      ['decisions taken (8.6)', 'Decisions taken'],
      ['general remarks (8.6)', 'General remarks'],
      ['action items (8.7)', 'Action items'],
      ['recordings and documents (8.8)', 'Recordings & documents'],
      ['file upload (8.8)', 'uploadMeetingAttachment'],
      ['audit history (business rule)', 'AuditTrail'],
      ['join records attendance (8.5)', 'joinMeeting'],
      ['reschedule (8.3)', 'rescheduleMeeting'],
      ['cancel (8.3)', 'cancelMeeting'],
      ['edit (8.4)', 'MeetingForm'],
    ]) check(`detail view has ${name}`, detail.includes(needle), '');

    const list = read('components/meetings/meeting-list.tsx') ?? '';
    const shared = read('components/meetings/shared.tsx') ?? '';
    check('all ten meeting types are labelled for the UI',
      ['BIWEEKLY_TEACHER', 'MONTHLY_STAFF', 'TRAINING', 'PERFORMANCE_REVIEW', 'SUPERVISOR_TEACHER',
        'COACH_TEACHER', 'ADMIN_STAFF', 'TEACHER_TEACHER', 'DEPARTMENT', 'STUDENT_MEETING']
        .every((t) => shared.includes(t)), '');
    check('cancelled meetings are shown, not hidden (8.9)',
      shared.includes('CANCELLED') && (list.includes('status') || shared.includes('Cancelled')), '');

    const teacherPage = read('app/(teacher)/teacher/meetings/page.tsx') ?? '';
    const studentPage = read('app/(student)/student/meetings/page.tsx') ?? '';
    check('teacher page has upcoming, past AND cancelled',
      /"upcoming"/.test(teacherPage) && /"past"/.test(teacherPage) && /"cancelled"/.test(teacherPage), '');
    check('student page has upcoming, past AND cancelled',
      /"upcoming"/.test(studentPage) && /"past"/.test(studentPage) && /"cancelled"/.test(studentPage), '');

    const form = read('components/meetings/meeting-form.tsx') ?? '';
    for (const [name, needle] of [
      ['title', 'Title'], ['type', 'Meeting type'], ['start', 'Starts'], ['end time', 'Ends'],
      ['duration', 'Duration (minutes)'], ['agenda', 'Agenda'], ['platform', 'Platform'],
      ['individual staff', 'Individual staff'], ['all-teachers group', 'All teachers'],
      ['departments by course', 'By course (department)'], ['students', 'Students'],
      ['optional attendees', 'Optional'],
    ]) check(`the scheduling form asks for ${name}`, form.includes(needle), '');

    const settings = read('app/(admin)/meetings/settings/page.tsx') ?? '';
    check('the recurring setup exposes optional invite roles (8.2)',
      settings.includes('optionalInviteRoles'), '');

    const reports = read('app/(admin)/meetings/reports/page.tsx') ?? '';
    check('all six reports are on the reports page (8.11)',
      ['attendance', 'staff', 'missed', 'minutes', 'actions', 'training']
        .every((k) => reports.includes(`"${k}"`)), '');
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
