/*
 * Panel verification — Module 9 across every portal.
 *
 * `smoke-leaves.cjs` proves the RULES: dates compute, deductions attach, the
 * return sweep restores. This proves the REACH — that the same leave request
 * turns up, with the right powers and no more, on all five panels §9.1/§9.8
 * name: Admin, Supervisor, Academic Coach, Teacher and Student.
 *
 * Two halves:
 *   live  — one leave, then every role asked what it may see and do. Both
 *           directions: a role that SHOULD reach something and a role that
 *           should NOT. A permission matrix is only proved by its refusals.
 *   files — the web routes, nav entries and form fields that make it
 *           reachable, because an endpoint nothing links to is not "on the
 *           panel". This half caught the real bug: the Academic Coach is
 *           applicable staff under §9.1, the API let them post, the route was
 *           allowlisted — and the sidebar had no link, so they could not
 *           apply for leave at all.
 *
 * Run: node scripts/verify-panels-leaves.cjs   (needs API running + env)
 */
require('dotenv/config');
const fs = require('node:fs');
const path = require('node:path');
const jwt = require('jsonwebtoken');
const { Client } = require('pg');

const BASE = process.env.SMOKE_BASE || 'http://localhost:5000/api';
const SECRET = process.env.JWT_ACCESS_SECRET;
const MARKER = 'zz-verify-leave';
const WEB = path.join(__dirname, '..', '..', 'web', 'src');

let pass = 0, fail = 0;
const fails = [];
const check = (n, c, d) => {
  if (c) { pass++; console.log(`  ok   ${n}`); }
  else { fail++; fails.push(`${n}${d ? ` — ${d}` : ''}`); console.log(`  FAIL ${n}${d ? ` — ${d}` : ''}`); }
};
const token = (id, role, email) => jwt.sign({ sub: id, email, role }, SECRET, { expiresIn: '30m' });
/*
 * 100 requests a minute per IP is the global throttle. This script asks every
 * role about everything, so a run chained after the smoke can cross it — and a
 * 429 body is an object, which turns a permission check into a type error that
 * looks like a product bug. Wait and retry rather than mis-report.
 */
async function req(method, p, auth, payload, attempt = 0) {
  const res = await fetch(`${BASE}${p}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth}` } : {}) },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  });
  if (res.status === 429 && attempt < 3) {
    const waitMs = Number(res.headers.get('retry-after')) * 1000 || 61_000;
    console.log(`  ..   rate limited, waiting ${Math.round(waitMs / 1000)}s`);
    await new Promise((r) => setTimeout(r, waitMs));
    return req(method, p, auth, payload, attempt + 1);
  }
  const text = await res.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body };
}
const read = (rel) => {
  const f = path.join(WEB, rel);
  return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null;
};
const dayUtc = (offset) => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + offset);
  return d;
};
const iso = (d) => d.toISOString();
const ok2xx = (r) => r.status >= 200 && r.status < 300;
const denied = (r) => r.status === 403 || r.status === 404;

(async () => {
  if (!SECRET) throw new Error('JWT_ACCESS_SECRET is not set');
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();

  const cleanup = async () => {
    /*
     * The admin fixture is a REAL pre-existing account, not one this script
     * makes, so deleting by email would never reach the leave it files. Match
     * on the marker in the reason as well, or the second run trips the overlap
     * guard against the first run's row and reports a code fault that is not
     * one.
     */
    const byReason = await db.query(`SELECT id FROM "LeaveRequest" WHERE reason LIKE $1`, [`%${MARKER}%`]);
    for (const l of byReason.rows) {
      await db.query(`DELETE FROM "LeaveAuditLog" WHERE "leaveId"=$1`, [l.id]);
      await db.query(`DELETE FROM "LeaveImpact" WHERE "leaveId"=$1`, [l.id]);
      await db.query(`DELETE FROM "LeaveRequest" WHERE id=$1`, [l.id]);
    }

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
      const cs = await db.query(`SELECT id FROM "ClassSession" WHERE "teacherId"=$1`, [tp.id]);
      for (const c of cs.rows) await db.query(`DELETE FROM "ClassAttendee" WHERE "classId"=$1`, [c.id]);
      await db.query(`DELETE FROM "ClassSession" WHERE "teacherId"=$1`, [tp.id]);
      await db.query(`DELETE FROM "TeacherProfile" WHERE id=$1`, [tp.id]);
    }
    const sps = await db.query(`SELECT id FROM "StudentProfile" WHERE "studentCode" LIKE $1`, [`${MARKER}%`]);
    for (const sp of sps.rows) {
      await db.query(`DELETE FROM "LeaveImpact" WHERE "studentId"=$1`, [sp.id]);
      await db.query(`DELETE FROM "ClassAttendee" WHERE "studentId"=$1`, [sp.id]);
      await db.query(`DELETE FROM "StudentActivity" WHERE "studentId"=$1`, [sp.id]);
      await db.query(`DELETE FROM "StudentProfile" WHERE id=$1`, [sp.id]);
    }
    for (const id of ids) {
      await db.query(`DELETE FROM "Notification" WHERE "userId"=$1`, [id]);
      await db.query(`DELETE FROM "User" WHERE id=$1`, [id]);
    }
  };

  try {
    await cleanup();

    // ══ Fixtures ═════════════════════════════════════════════════════════════
    const admin = (await db.query(`SELECT id, email FROM "User" WHERE role='ADMIN' LIMIT 1`)).rows[0];
    if (!admin) throw new Error('no admin');
    const adminToken = token(admin.id, 'ADMIN', admin.email);

    const mk = async (tag, role) => {
      const u = (await db.query(
        `INSERT INTO "User" (id,email,"passwordHash","firstName","lastName",role,status,"updatedAt")
         VALUES (gen_random_uuid(),$1,'x','Panel',$2,$3,'ACTIVE',now()) RETURNING id, email`,
        [`${MARKER}-${tag}@example.test`, tag, role],
      )).rows[0];
      return { id: u.id, email: u.email, role, token: token(u.id, role, u.email) };
    };

    const coach = await mk('coach', 'ACADEMIC_COACH');
    const sup = await mk('sup', 'SUPERVISOR');
    const teacher = await mk('teacher', 'TEACHER');
    const other = await mk('other', 'TEACHER');
    const stuUser = await mk('student', 'STUDENT');

    const tp = (await db.query(
      `INSERT INTO "TeacherProfile" (id,"userId","teacherCode","hourlyRate")
       VALUES (gen_random_uuid(),$1,$2,20) RETURNING id`,
      [teacher.id, `${MARKER}-T-${Date.now()}`],
    )).rows[0];
    // Published + approved hours, otherwise the §9.6 pickers below never list
    // this teacher at all and the guard would "pass" by finding nobody.
    const WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    await db.query(
      `UPDATE "TeacherProfile" SET availability=$1, "availabilityApproved"=true, "timeZone"='UTC' WHERE id=$2`,
      [JSON.stringify(Object.fromEntries(WEEK.map((d) => [d, [{ from: '09:00', to: '18:00' }]]))), tp.id],
    );

    const student = (await db.query(
      `INSERT INTO "StudentProfile" (id,"userId","studentCode","billingCurrency")
       VALUES (gen_random_uuid(),$1,$2,'USD') RETURNING id`,
      [stuUser.id, `${MARKER}-S-${Date.now()}`],
    )).rows[0];
    const course = (await db.query(`SELECT id FROM "Course" LIMIT 1`)).rows[0];

    const AWAY_FROM = 4, AWAY_TO = 7;
    const starts = dayUtc(AWAY_FROM); starts.setUTCHours(10, 0, 0, 0);
    const cls = (await db.query(
      `INSERT INTO "ClassSession" (id,"courseId","teacherId",title,"startsAt","endsAt",status)
       VALUES (gen_random_uuid(),$1,$2,$3,$4,$5,'SCHEDULED') RETURNING id`,
      [course.id, tp.id, `${MARKER} class`, starts, new Date(starts.getTime() + 3600_000)],
    )).rows[0];
    await db.query(`INSERT INTO "ClassAttendee" (id,"classId","studentId") VALUES (gen_random_uuid(),$1,$2)`,
      [cls.id, student.id]);

    console.log('\n═══ LIVE — §9.1 every staff portal can request ═══');

    const mkLeave = async (who, type) => req('POST', '/leaves', who.token, {
      leaveType: type,
      startDate: iso(dayUtc(AWAY_FROM)),
      endDate: iso(dayUtc(AWAY_TO)),
      reason: `${MARKER} reason`,
      remarks: 'optional remark',
    });

    const byTeacher = await mkLeave(teacher, 'MEDICAL');
    check('TEACHER panel — can submit', ok2xx(byTeacher), `status ${byTeacher.status}`);
    check('  …filed as teacher unavailability, not staff leave',
      byTeacher.body?.category === 'TEACHER_UNAVAILABILITY', byTeacher.body?.category);
    check('  …§9.1 total days auto-calculated', byTeacher.body?.totalDays === AWAY_TO - AWAY_FROM + 1,
      String(byTeacher.body?.totalDays));
    const leaveId = byTeacher.body?.id;

    for (const [who, name] of [[coach, 'ACADEMIC COACH'], [sup, 'SUPERVISOR']]) {
      const r = await req('POST', '/leaves', who.token, {
        leaveType: 'ANNUAL',
        startDate: iso(dayUtc(20)), endDate: iso(dayUtc(21)),
        reason: `${MARKER} reason`,
      });
      check(`${name} panel — can submit (§9.1 applicable staff)`, ok2xx(r), `status ${r.status}`);
      check(`  …filed as staff leave`, r.body?.category === 'STAFF_LEAVE', r.body?.category);
    }
    // §9.1 marks the admin optional, but they are still staff — an academy
    // where the person who approves leave cannot take any is not the spec.
    const adminOwn = await req('POST', '/leaves', adminToken, {
      leaveType: 'PERSONAL', startDate: iso(dayUtc(25)), endDate: iso(dayUtc(25)),
      reason: `${MARKER} reason`,
    });
    check('ADMIN panel — can submit for themselves (§9.1 optional)', ok2xx(adminOwn), `status ${adminOwn.status}`);
    check('  …filed as staff leave', adminOwn.body?.category === 'STAFF_LEAVE', adminOwn.body?.category);

    const byStudent = await req('POST', '/leaves', stuUser.token, {
      leaveType: 'ANNUAL', startDate: iso(dayUtc(20)), endDate: iso(dayUtc(21)), reason: 'x',
    });
    check('STUDENT panel — staff leave refused (not applicable staff)', denied(byStudent), `status ${byStudent.status}`);

    console.log('\n═══ LIVE — §9.2 deciding is the admin\'s alone ═══');
    for (const [who, name] of [[coach, 'coach'], [sup, 'supervisor'], [teacher, 'teacher']]) {
      const r = await req('POST', `/leaves/${leaveId}/approve`, who.token, { isPaid: true });
      check(`a ${name} cannot approve`, denied(r), `status ${r.status}`);
      const rj = await req('POST', `/leaves/${leaveId}/reject`, who.token, { reason: 'no' });
      check(`a ${name} cannot reject`, denied(rj), `status ${rj.status}`);
    }
    const info = await req('POST', `/leaves/${leaveId}/request-info`, adminToken, { question: 'Which hospital?' });
    check('admin can request more information (§9.2)', info.body?.status === 'INFO_REQUESTED', info.body?.status);
    const answered = await req('POST', `/leaves/${leaveId}/respond-info`, teacher.token, { response: 'City' });
    check('and the teacher answers from their own panel', answered.body?.status === 'PENDING', answered.body?.status);

    const approved = await req('POST', `/leaves/${leaveId}/approve`, adminToken, {
      isPaid: false,
      endDate: iso(dayUtc(AWAY_TO - 1)),
      adminNotes: 'approved short',
    });
    check('admin approves, over modified dates, unpaid (§9.2/§9.3)',
      approved.body?.status === 'APPROVED' && approved.body?.isPaid === false,
      JSON.stringify({ s: approved.body?.status, paid: approved.body?.isPaid }));

    console.log('\n═══ LIVE — §9.9 history: who sees whose ═══');
    const teacherList = await req('GET', '/leaves', teacher.token);
    const teacherSeesOwnOnly = (teacherList.body?.items ?? []).every((l) => l.userId === teacher.id);
    check('TEACHER panel — history lists only their own', ok2xx(teacherList) && teacherSeesOwnOnly,
      `status ${teacherList.status}`);
    const colleague = await req('GET', `/leaves?userId=${teacher.id}`, other.token);
    check('  …and a colleague\'s cannot be pulled by filter',
      !(colleague.body?.items ?? []).some((l) => l.userId === teacher.id), `status ${colleague.status}`);

    for (const [who, name] of [[coach, 'ACADEMIC COACH'], [sup, 'SUPERVISOR']]) {
      const r = await req('GET', '/leaves', who.token);
      check(`${name} panel — sees the whole queue (§9.8 rows 1–2)`, ok2xx(r), `status ${r.status}`);
      const one = await req('GET', `/leaves/${leaveId}`, who.token);
      check(`  …and can open one`, ok2xx(one), `status ${one.status}`);
    }
    const adminList = await req('GET', '/leaves', adminToken);
    check('ADMIN panel — sees the whole queue', ok2xx(adminList), `status ${adminList.status}`);
    const stats = await req('GET', '/leaves/stats', adminToken);
    check('  …with queue counters', ok2xx(stats), `status ${stats.status}`);

    const mine = await req('GET', '/leaves/mine', teacher.token);
    check('TEACHER panel — "my leave" summary answers', ok2xx(mine), `status ${mine.status}`);
    const coachMine = await req('GET', '/leaves/mine', coach.token);
    check('ACADEMIC COACH panel — "my leave" summary answers too', ok2xx(coachMine), `status ${coachMine.status}`);
    const supMine = await req('GET', '/leaves/mine', sup.token);
    check('SUPERVISOR panel — "my leave" summary answers too', ok2xx(supMine), `status ${supMine.status}`);

    const stuLeaves = await req('GET', '/leaves', stuUser.token);
    check('STUDENT panel — cannot reach the staff leave list at all', denied(stuLeaves), `status ${stuLeaves.status}`);

    console.log('\n═══ LIVE — §9.5 the coach owns the affected classes ═══');
    const impacts = await req('GET', `/leaves/impacts?leaveId=${leaveId}`, coach.token);
    check('ACADEMIC COACH panel — the affected-student queue', ok2xx(impacts), `status ${impacts.status}`);
    check('  …and the student is in it', (impacts.body ?? []).length === 1,
      JSON.stringify(impacts.body).slice(0, 140));
    const impactId = (impacts.body ?? [])[0]?.id;
    const reps = await req('GET', `/leaves/impacts/${impactId}/replacements`, coach.token);
    check('  …§9.5 option 2 shows available teachers', Array.isArray(reps.body), `status ${reps.status}`);

    const supImpacts = await req('GET', '/leaves/impacts', sup.token);
    check('SUPERVISOR panel — can watch the queue (§9.8 row 4 links here)', ok2xx(supImpacts), `status ${supImpacts.status}`);
    const adminImpacts = await req('GET', '/leaves/impacts', adminToken);
    check('ADMIN panel — can watch the queue', ok2xx(adminImpacts), `status ${adminImpacts.status}`);
    const teacherImpacts = await req('GET', '/leaves/impacts', teacher.token);
    check('TEACHER panel — cannot see other families\' arrangements', denied(teacherImpacts), `status ${teacherImpacts.status}`);

    const stuImpacts = await req('GET', '/leaves/my-impacts', stuUser.token);
    check('STUDENT panel — sees their OWN arrangement (§9.8 rows 4–6)', ok2xx(stuImpacts), `status ${stuImpacts.status}`);
    const stuBody = JSON.stringify(stuImpacts.body ?? '');
    check('  …and it never carries the reason or the leave type',
      !stuBody.includes(`${MARKER} reason`) && !stuBody.includes('MEDICAL'), stuBody.slice(0, 140));

    console.log('\n═══ LIVE — §9.6 pickers on every scheduling screen ═══');
    const insideDate = dayUtc(AWAY_FROM).toISOString().slice(0, 10);
    const avail = await req('GET', `/leads/teacher-availability?date=${insideDate}`, coach.token);
    const row = (avail.body?.teachers ?? []).find((t) => t.teacherId === tp.id);
    check('ACADEMIC COACH panel — the trial assignment screen flags them away',
      row?.onLeave === true, JSON.stringify(row ?? {}).slice(0, 120));
    check('  …and offers none of their slots', (row?.freeSlots ?? ['x']).length === 0, String(row?.freeSlots?.length));
    const enrol = await req('GET', `/leads/enrollment-teachers?days=Monday,Tuesday,Wednesday,Thursday,Friday,Saturday,Sunday&time=10:00&durationMinutes=60`, coach.token);
    check('  …and the enrolment search keeps them out of "matching"',
      !(enrol.body?.matching ?? []).some((t) => t.teacherId === tp.id), `status ${enrol.status}`);

    console.log('\n═══ LIVE — §9.10 reports and §9.11 configuration ═══');
    const REPORTS = ['summary', 'paid-unpaid', 'unavailability', 'impact', 'register'];
    for (const r of REPORTS) {
      const res = await req('GET', `/leaves/reports/${r}`, adminToken);
      check(`ADMIN panel — report "${r}"`, ok2xx(res), `status ${res.status}`);
    }
    for (const [who, name] of [[coach, 'ACADEMIC COACH'], [sup, 'SUPERVISOR']]) {
      const res = await req('GET', '/leaves/reports/summary', who.token);
      check(`${name} panel — can read the reports`, ok2xx(res), `status ${res.status}`);
    }
    const teacherReport = await req('GET', '/leaves/reports/summary', teacher.token);
    check('TEACHER panel — cannot read academy-wide reports', denied(teacherReport), `status ${teacherReport.status}`);

    const cfgRead = await req('GET', '/leaves/settings', teacher.token);
    check('TEACHER panel — can read which types are offered (the form needs them)', ok2xx(cfgRead),
      `status ${cfgRead.status}`);
    const cfgCoach = await req('PATCH', '/leaves/settings', coach.token, { maxConsecutiveDays: 10 });
    check('ACADEMIC COACH panel — cannot change academy payroll rules', denied(cfgCoach), `status ${cfgCoach.status}`);
    const cfgSup = await req('PATCH', '/leaves/settings', sup.token, { maxConsecutiveDays: 10 });
    check('SUPERVISOR panel — cannot either', denied(cfgSup), `status ${cfgSup.status}`);
    const cfgAdmin = await req('PATCH', '/leaves/settings', adminToken, { maxConsecutiveDays: 30 });
    check('ADMIN panel — can (§9.11 types configurable)', ok2xx(cfgAdmin), `status ${cfgAdmin.status}`);

    const auditCoach = await req('GET', `/leaves/${leaveId}/audit`, coach.token);
    check('§9.11 audit trail reaches the coach panel', ok2xx(auditCoach), `status ${auditCoach.status}`);
    const auditTeacher = await req('GET', `/leaves/${leaveId}/audit`, teacher.token);
    check('  …but not the teacher panel', denied(auditTeacher), `status ${auditTeacher.status}`);

    // ══ FILES — the reach the API cannot prove ═══════════════════════════════
    console.log('\n═══ FILES — pages exist on every panel ═══');
    const PAGES = [
      ['ADMIN  approval console', 'app/(admin)/leaves/page.tsx'],
      ['ADMIN  §9.11 settings', 'app/(admin)/leaves/settings/page.tsx'],
      ['ADMIN  §9.10 reports', 'app/(admin)/leaves/reports/page.tsx'],
      ['COACH  §9.5 affected classes', 'app/(admin)/leave-impacts/page.tsx'],
      ['STAFF  §9.1 my own leave', 'app/(admin)/my-leave/page.tsx'],
      ['TEACHER §9.1 my unavailability', 'app/(teacher)/teacher/leave/page.tsx'],
      ['STUDENT §9.8 teacher absence', 'app/(student)/student/teacher-absence/page.tsx'],
    ];
    for (const [name, rel] of PAGES) check(`${name} page`, read(rel) !== null, rel);

    console.log('\n═══ FILES — every panel LINKS to it ═══');
    const sidebar = read('components/layout/sidebar.tsx') ?? '';
    const navConfig = read('components/layout/nav-config.ts') ?? '';
    const teacherShell = read('components/layout/teacher-shell.tsx') ?? '';
    const studentShell = read('components/layout/student-shell.tsx') ?? '';
    const adminLayout = read('app/(admin)/layout.tsx') ?? '';

    check('ADMIN nav — Leave Requests', navConfig.includes('"/leaves"'));
    check('ADMIN nav — Affected Classes', navConfig.includes('"/leave-impacts"'));
    check('ADMIN nav — My Leave', navConfig.includes('"/my-leave"'));

    /*
     * The coach and supervisor menus are hand-written duplicates of navGroups,
     * not filters over it, so anything added for admins is invisible to them
     * until it is added twice. Each is checked inside its OWN array — a plain
     * file-wide grep would pass on the admin copy alone, which is exactly the
     * bug that shipped.
     */
    const sliceOf = (start) => {
      const i = sidebar.indexOf(start);
      if (i < 0) return '';
      const j = sidebar.indexOf('const supervisorNavItems', i + 1);
      const k = sidebar.indexOf('const coachNavItems', i + 1);
      const ends = [j, k].filter((x) => x > 0);
      return sidebar.slice(i, ends.length ? Math.min(...ends) : i + 6000);
    };
    const coachNav = sliceOf('const coachNavItems');
    const supNav = sliceOf('const supervisorNavItems');
    check('COACH nav block found', coachNav.length > 0);
    check('COACH nav — Affected Classes (§9.5 is their job)', coachNav.includes('"/leave-impacts"'));
    check('COACH nav — Leave Requests (§9.8 rows 1–2 notify them)', coachNav.includes('"/leaves"'));
    check('COACH nav — My Leave (§9.1 applicable staff)', coachNav.includes('"/my-leave"'));
    check('SUPERVISOR nav block found', supNav.length > 0);
    check('SUPERVISOR nav — Leave Requests', supNav.includes('"/leaves"'));
    check('SUPERVISOR nav — Affected Classes (§9.8 row 4 links here)', supNav.includes('"/leave-impacts"'));
    check('SUPERVISOR nav — My Leave (§9.1 applicable staff)', supNav.includes('"/my-leave"'));
    check('TEACHER nav — My Unavailability', teacherShell.includes('/teacher/leave'));
    check('STUDENT nav — Teacher Absence', studentShell.includes('/student/teacher-absence'));

    console.log('\n═══ FILES — the route guards let those roles through ═══');
    for (const p of ['"/leaves"', '"/leave-impacts"', '"/my-leave"']) {
      check(`admin layout allowlists ${p} (coach + supervisor)`,
        (adminLayout.match(new RegExp(p.replace(/[/"]/g, '\\$&'), 'g')) ?? []).length >= 2, p);
    }
    check('§9.11 settings carved out of the coach\'s reach',
      adminLayout.includes('/leaves/settings') && adminLayout.includes('COACH_BLOCKED_PREFIXES'));

    console.log('\n═══ FILES — §9.1 request form carries every field ═══');
    const myLeave = read('components/leaves/my-leave.tsx') ?? '';
    for (const [label, needle] of [
      ['Type', '>Type<'], ['From date', '>From<'], ['To date', '>To<'],
      ['Reason', '>Reason<'], ['Remarks (optional)', 'Remarks (optional)'],
      ['Supporting document (optional)', 'Supporting document (optional)'],
    ]) check(`request form — ${label}`, myLeave.includes(needle), needle);
    check('request form — total days auto-calculated', myLeave.includes('totalDaysBetween'));

    console.log('\n═══ FILES — §9.9 history shows every listed column ═══');
    const shared = read('components/leaves/shared.tsx') ?? '';
    const adminLeaves = read('app/(admin)/leaves/page.tsx') ?? '';
    check('history — leave type labels', shared.includes('LEAVE_TYPE_LABELS'));
    check('history — from/to window', shared.includes('fmtWindow'));
    check('history — paid/unpaid status', shared.includes('PaidBadge'));
    check('history — approval status', shared.includes('LeaveStatusBadge'));
    check('history — approved by', /approvedBy/i.test(adminLeaves + myLeave));
    check('history — approval date', /approvedAt/i.test(adminLeaves + myLeave));
    check('history — supporting document link', /document/i.test(adminLeaves + myLeave));

    console.log('\n═══ FILES — §9.6 the schedulers surface it ═══');
    const availSvc = fs.readFileSync(path.join(__dirname, '..', 'src', 'leads', 'availability.service.ts'), 'utf8');
    check('trial + enrolment pickers consult the leaves module', availSvc.includes('LeavesService'));
    const leadPage = read('app/(admin)/leads/[id]/page.tsx') ?? '';
    check('coach trial screen labels an absent teacher', leadPage.includes('on approved leave'));
    const teacherAvail = read('app/(teacher)/teacher/availability/page.tsx') ?? '';
    check('TEACHER panel — their own availability page shows approved windows',
      teacherAvail.includes('Approved unavailability'));
    const batches = read('components/attendance/batches-panel.tsx') ?? '';
    check('ADMIN bulk generator explains days it skipped', batches.includes('skippedForLeave'));

    console.log(`\n${pass} passed, ${fail} failed`);
    if (fails.length) { console.log('\nFailures:'); for (const f of fails) console.log(`  - ${f}`); }
  } finally {
    await cleanup();
    await db.end();
  }
  process.exit(fail ? 1 : 0);
})();
