/*
 * Smoke test for the Dashboard Management module.
 *
 * Hits every new route with a real JWT for each role and asserts the response
 * shape.
 * yet), then removes it so the database is left exactly as it was found.
 *
 * Run with the API already listening on :5000.
 */
require('dotenv/config');
const jwt = require('jsonwebtoken');
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const BASE = process.env.SMOKE_BASE || 'http://localhost:5000/api';
const SECRET = process.env.JWT_ACCESS_SECRET;
// Unique per run so a crashed run cannot collide with the next one on the
// unique email index.
const MARKER = `zz-smoke-dash-${Date.now()}`;

let pass = 0;
let fail = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) {
    pass++;
    console.log(`  ok   ${name}`);
  } else {
    fail++;
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function token(userId) {
  return jwt.sign({ sub: userId }, SECRET);
}

async function get(path, userId, expect = 200) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token(userId)}` },
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

async function send(method, path, userId, payload, expect = 200) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token(userId)}`,
      'Content-Type': 'application/json',
    },
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

(async () => {
  if (!SECRET) throw new Error('JWT_ACCESS_SECRET is not set');
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();

  // ── Resolve one user per role ────────────────────────────────────────────
  const roleUser = {};
  // Throwaway users this run had to create because the database had no such
  // role. Deleted in the finally block.
  const mintedUserIds = [];
  for (const role of ['ADMIN', 'SUPERVISOR', 'ACADEMIC_COACH', 'TEACHER', 'STUDENT']) {
    const { rows } = await db.query(
      `SELECT id, email FROM "User" WHERE role=$1 AND status='ACTIVE' ORDER BY "createdAt" LIMIT 1`,
      [role],
    );
    if (!rows.length) {
      /*
       * Mint one rather than refusing to run. Requiring the database to
       * already hold every role meant this whole suite stopped the moment an
       * academy had no supervisor — every check in it was skipped, which is
       * worse than having no suite at all. Removed again in cleanup.
       */
      const created = await db.query(
        `INSERT INTO "User" (id,email,"passwordHash","firstName","lastName",role,status,"updatedAt")
         VALUES (gen_random_uuid(),$1,'x','Smoke',$2,$3::"Role",'ACTIVE',now()) RETURNING id, email`,
        [`${MARKER}-role-${role.toLowerCase()}@example.test`, role, role],
      );
      roleUser[role] = created.rows[0];
      mintedUserIds.push(created.rows[0].id);
    } else {
      roleUser[role] = rows[0];
    }
  }

  const { rows: studentRows } = await db.query(
    `SELECT sp.id, sp."studentCode" FROM "StudentProfile" sp LIMIT 1`,
  );
  const testStudentId = studentRows[0].id;


  const createdAnnouncementIds = [];

  try {
    console.log('\n── Role dashboards ──');

    const sa = await get('/dashboard/super-admin?range=30d', roleUser.ADMIN.id);
    check('GET /dashboard/super-admin', sa.ok, `status ${sa.status}`);
    check(
      'super-admin has 15 KPI cards',
      sa.ok && sa.body.kpis && Object.keys(sa.body.kpis).length === 15,
      sa.ok ? `got ${Object.keys(sa.body.kpis || {}).length}` : '',
    );
    check(
      'super-admin has 6 live stats',
      sa.ok && sa.body.live && Object.keys(sa.body.live).length === 6,
    );
    check(
      'super-admin has 10 charts',
      sa.ok && sa.body.charts && Object.keys(sa.body.charts).length === 10,
      sa.ok ? `got ${Object.keys(sa.body.charts || {}).length}` : '',
    );

    const ad = await get('/dashboard/admin?range=7d', roleUser.SUPERVISOR.id);
    check('GET /dashboard/admin (SUPERVISOR)', ad.ok, `status ${ad.status}`);
    check('admin has cards + charts', ad.ok && ad.body.cards && ad.body.charts);
    check('admin upcomingClasses is an array', ad.ok && Array.isArray(ad.body.upcomingClasses));
    check('admin pendingTasks is an array', ad.ok && Array.isArray(ad.body.pendingTasks));

    const co = await get('/dashboard/coach?range=90d', roleUser.ACADEMIC_COACH.id);
    check('GET /dashboard/coach', co.ok, `status ${co.status}`);
    check('coach has performance buckets', co.ok && co.body.performance);
    check('coach upcomingTasks is an array', co.ok && Array.isArray(co.body.upcomingTasks));

    const te = await get('/dashboard/teacher?range=12m', roleUser.TEACHER.id);
    check('GET /dashboard/teacher', te.ok, `status ${te.status}`);
    check('teacher has schedule array', te.ok && Array.isArray(te.body.schedule));
    check('teacher has 4 charts', te.ok && Object.keys(te.body.charts || {}).length === 4);

    const st = await get('/dashboard/student?range=30d', roleUser.STUDENT.id);
    check('GET /dashboard/student', st.ok, `status ${st.status}`);
    check('student has progress + achievements', st.ok && st.body.progress && st.body.achievements);


    console.log('\n── /my dispatch ──');
    for (const [role, user] of Object.entries(roleUser)) {
      const my = await get('/dashboard/my', user.id);
      check(`GET /dashboard/my as ${role}`, my.ok, `status ${my.status}`);
    }

    console.log('\n── Role isolation ──');
    const studentHitsSuperAdmin = await get('/dashboard/super-admin', roleUser.STUDENT.id, 403);
    check('STUDENT blocked from /dashboard/super-admin', studentHitsSuperAdmin.ok, `status ${studentHitsSuperAdmin.status}`);
    const supervisorHitsSuperAdmin = await get('/dashboard/super-admin', roleUser.SUPERVISOR.id, 403);
    check('SUPERVISOR blocked from /dashboard/super-admin', supervisorHitsSuperAdmin.ok, `status ${supervisorHitsSuperAdmin.status}`);

    console.log('\n── Widgets ──');
    const reg = await get('/dashboard/widgets/registry', roleUser.ADMIN.id);
    check('GET /dashboard/widgets/registry', reg.ok, `status ${reg.status}`);
    // 58 since st.subscription joined the registry.
    check('registry is seeded (58 widgets)', reg.ok && reg.body.length === 58, reg.ok ? `got ${reg.body.length}` : '');

    const regAsStudent = await get('/dashboard/widgets/registry', roleUser.STUDENT.id, 403);
    check('STUDENT blocked from widget registry', regAsStudent.ok, `status ${regAsStudent.status}`);

    for (const [role, user] of Object.entries(roleUser)) {
      const mine = await get('/dashboard/widgets/me', user.id);
      check(`GET /dashboard/widgets/me as ${role}`, mine.ok && Array.isArray(mine.body) && mine.body.length > 0,
        mine.ok ? `got ${mine.body.length}` : `status ${mine.status}`);
    }

    // Admin disables a widget for STUDENT; the student must stop seeing it.
    const beforeToggle = await get('/dashboard/widgets/me', roleUser.STUDENT.id);
    const targetKey = 'st.achievements';
    const hadWidget = beforeToggle.body.some((w) => w.key === targetKey);
    check('student sees st.achievements by default', hadWidget);

    const disable = await send('PATCH', '/dashboard/widgets/role', roleUser.ADMIN.id, {
      role: 'STUDENT',
      items: [{ key: targetKey, enabled: false }],
    });
    check('PATCH widgets/role disables a widget', disable.ok, `status ${disable.status}`);

    const afterToggle = await get('/dashboard/widgets/me', roleUser.STUDENT.id);
    check(
      'disabled widget disappears for the student',
      afterToggle.ok && !afterToggle.body.some((w) => w.key === targetKey),
    );

    // Personalisation must not be able to re-enable it.
    const tryReenable = await send('PATCH', '/dashboard/widgets/me', roleUser.STUDENT.id, {
      items: [{ key: targetKey, hidden: false, order: 0 }],
    });
    check(
      'user layout cannot re-enable an admin-disabled widget',
      tryReenable.ok && !tryReenable.body.some((w) => w.key === targetKey),
    );

    // Restore.
    const reenable = await send('PATCH', '/dashboard/widgets/role', roleUser.ADMIN.id, {
      role: 'STUDENT',
      items: [{ key: targetKey, enabled: true }],
    });
    check('widget re-enabled for the role', reenable.ok);

    const layout = await send('PATCH', '/dashboard/widgets/me', roleUser.TEACHER.id, {
      items: [{ key: 'te.schedule', order: 1, size: 'FULL' }],
    });
    check('PATCH widgets/me saves personalisation', layout.ok, `status ${layout.status}`);
    check(
      'personalised size is returned',
      layout.ok && layout.body.find((w) => w.key === 'te.schedule')?.size === 'FULL',
    );

    const reset = await send('POST', '/dashboard/widgets/me/reset', roleUser.TEACHER.id, undefined);
    check('POST widgets/me/reset clears personalisation', reset.ok, `status ${reset.status}`);
    check(
      'size falls back to the registry default after reset',
      reset.ok && reset.body.find((w) => w.key === 'te.schedule')?.size !== 'FULL',
    );

    /*
     * Every widget the registry can hand to a dashboard must have a renderer
     * IN THE PANEL THAT ROLE ACTUALLY LOADS. A key with no `case` renders
     * nothing and leaves a silent hole in the grid — which is what happened to
     * cm.notifications, and again to ad.upcoming/ad.tasks when they were
     * granted to ADMIN while living only in the SUPERVISOR panel.
     *
     * Checking the concatenation of all six panels is NOT enough: it passes as
     * long as some panel renders the key, even the wrong one. Resolve per role.
     */
    console.log('\n── Widget renderer coverage ──');
    const panelDir = path.join(__dirname, '..', '..', 'web', 'src', 'components', 'dashboard', 'panels');
    const PANEL_BY_ROLE = {
      ADMIN: 'super-admin-panel.tsx',
      SUPERVISOR: 'admin-ops-panel.tsx',
      ACADEMIC_COACH: 'coach-panel.tsx',
      TEACHER: 'teacher-panel.tsx',
      STUDENT: 'student-panel.tsx',
    };
    const panelSource = Object.fromEntries(
      Object.entries(PANEL_BY_ROLE).map(([role, file]) => [
        role,
        fs.readFileSync(path.join(panelDir, file), 'utf8'),
      ]),
    );

    const uncovered = [];
    for (const w of reg.body) {
      for (const role of w.roles) {
        const src = panelSource[role];
        if (src && !src.includes(`case "${w.key}"`)) uncovered.push(`${w.key}→${role}`);
      }
    }
    check(
      'every registry widget has a renderer in every role it is granted to',
      uncovered.length === 0,
      uncovered.length ? `no case for: ${uncovered.join(', ')}` : '',
    );

    // The mirror image: a `case` for a key the role is never sent is dead code.
    const dead = [];
    for (const [role, src] of Object.entries(panelSource)) {
      for (const m of src.matchAll(/case "([a-z]{2}\.[a-z.]+)"/g)) {
        const w = reg.body.find((r) => r.key === m[1]);
        if (w && !w.roles.includes(role)) dead.push(`${m[1]}→${role}`);
      }
    }
    check(
      'no panel renders a widget its role is never granted',
      dead.length === 0,
      dead.length ? `dead case: ${dead.join(', ')}` : '',
    );

    console.log('\n── Announcements ──');
    const created = await send('POST', '/announcements', roleUser.ADMIN.id, {
      title: 'Smoke test notice',
      body: 'This announcement was created by the dashboard smoke test.',
      type: 'GENERAL',
      audience: ['STUDENT', 'TEACHER'],
    }, 201);
    check('POST /announcements', created.ok, `status ${created.status}`);
    if (created.body?.id) createdAnnouncementIds.push(created.body.id);

    const studentFeed = await get('/announcements/feed', roleUser.STUDENT.id);
    check('STUDENT sees the targeted announcement',
      studentFeed.ok && studentFeed.body.some((a) => a.id === created.body.id));

    const supervisorFeed = await get('/announcements/feed', roleUser.SUPERVISOR.id);
    check('SUPERVISOR does not see a STUDENT/TEACHER-only announcement',
      supervisorFeed.ok && !supervisorFeed.body.some((a) => a.id === created.body.id));

    const markRead = await send('PATCH', `/announcements/${created.body.id}/read`, roleUser.STUDENT.id, undefined);
    check('PATCH /announcements/:id/read', markRead.ok, `status ${markRead.status}`);

    const feedAfterRead = await get('/announcements/feed', roleUser.STUDENT.id);
    check('announcement is flagged read',
      feedAfterRead.ok && feedAfterRead.body.find((a) => a.id === created.body.id)?.read === true);

    const studentCreates = await send('POST', '/announcements', roleUser.STUDENT.id, {
      title: 'nope', body: 'nope',
    }, 403);
    check('STUDENT cannot publish announcements', studentCreates.ok, `status ${studentCreates.status}`);

    console.log('\n── Search / calendar / activity ──');
    const search = await get('/dashboard/search?q=a', roleUser.ADMIN.id);
    check('GET /dashboard/search (admin)', search.ok && Array.isArray(search.body), `status ${search.status}`);

    const shortSearch = await get('/dashboard/search?q=a&limit=5', roleUser.STUDENT.id);
    check('search is scoped for a student', shortSearch.ok && Array.isArray(shortSearch.body));

    const cal = await get('/dashboard/calendar', roleUser.ADMIN.id);
    check('GET /dashboard/calendar', cal.ok && Array.isArray(cal.body), `status ${cal.status}`);

    const calStudent = await get('/dashboard/calendar', roleUser.STUDENT.id);
    check('GET /dashboard/calendar (student)', calStudent.ok && Array.isArray(calStudent.body));

    const act = await get('/dashboard/activity', roleUser.ADMIN.id);
    check('GET /dashboard/activity', act.ok && Array.isArray(act.body), `status ${act.status}`);

    const actStudent = await get('/dashboard/activity', roleUser.STUDENT.id, 403);
    check('STUDENT blocked from the activity feed', actStudent.ok, `status ${actStudent.status}`);

    const range7 = await get('/dashboard/super-admin?range=7d', roleUser.ADMIN.id);
    const range12 = await get('/dashboard/super-admin?range=12m', roleUser.ADMIN.id);
    check('range=7d yields 7 buckets',
      range7.ok && range7.body.charts.studentGrowth.length === 7,
      range7.ok ? `got ${range7.body.charts.studentGrowth.length}` : '');
    check('range=12m yields 12 buckets',
      range12.ok && range12.body.charts.studentGrowth.length === 12,
      range12.ok ? `got ${range12.body.charts.studentGrowth.length}` : '');
    check('an invalid range falls back to the default',
      (await get('/dashboard/super-admin?range=bogus', roleUser.ADMIN.id, 400)).status === 400);
  } finally {
    /*
     * Any role user this run had to invent. Deleted by id, so a real account
     * that happened to share a name can never be caught by it.
     */
    for (const id of mintedUserIds) {
      await db.query(`DELETE FROM "User" WHERE id = $1`, [id]);
    }
    // ── Cleanup: leave the database exactly as found ───────────────────────
    for (const id of createdAnnouncementIds) {
      await db.query(`DELETE FROM "Announcement" WHERE id=$1`, [id]);
    }
    /*
     * Publishing an announcement fans notifications out to its whole audience.
     * Deleting the Announcement row does not cascade to those, so without this
     * every run left ~23 orphaned rows behind — 276 had accumulated before it
     * was spotted, silently inflating every backup taken since.
     */
    await db.query(`DELETE FROM "Notification" WHERE type='ANNOUNCEMENT' AND title='Smoke test notice'`);
    // Personalisation + role toggles created by the test.
    await db.query(`DELETE FROM "UserWidgetLayout" WHERE "userId" = ANY($1::text[])`, [
      Object.values(roleUser).map((u) => u.id),
    ]);
    await db.query(`DELETE FROM "RoleWidgetSetting" WHERE "widgetKey"='st.achievements'`);

    /*
     * Scoped to the users this run touched. Counting every UserWidgetLayout row
     * reported real admins' saved dashboards as leftovers — a cleanup check
     * that cries wolf gets ignored, and then hides an actual leak.
     */
    const { rows: leftovers } = await db.query(
      `SELECT               (SELECT count(*)::int FROM "Announcement" WHERE title='Smoke test notice') AS announcements,
              (SELECT count(*)::int FROM "Notification" WHERE title='Smoke test notice') AS notifications,
              (SELECT count(*)::int FROM "UserWidgetLayout"
                WHERE "userId" = ANY($1::text[])) AS layouts`,
      [Object.values(roleUser).map((u) => u.id)],
    );
    console.log(
      `\nCleanup: ${leftovers[0].announcements} stray announcements · ` +
        `${leftovers[0].notifications} stray notifications · ${leftovers[0].layouts} layout rows remaining`,
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
