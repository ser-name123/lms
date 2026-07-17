/* Smoke test for Student Progress Tracking (all panels; read-only — leaves DB clean). */
require('dotenv/config');
const { Client } = require('pg');
const jwt = require('jsonwebtoken');

const BASE = `http://localhost:${process.env.PORT || 5000}/api`;

async function main() {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const users = {};
  for (const role of ['ADMIN', 'TEACHER', 'STUDENT', 'ACADEMIC_COACH']) {
    const { rows } = await db.query(`SELECT id FROM "User" WHERE role=$1 LIMIT 1`, [role]);
    if (rows.length) users[role] = rows[0].id;
  }
  await db.end();

  const tok = (uid) => jwt.sign({ sub: uid }, process.env.JWT_ACCESS_SECRET);
  const get = async (uid, p) => {
    const r = await fetch(`${BASE}${p}`, { headers: { Authorization: `Bearer ${tok(uid)}` } });
    if (!r.ok) throw new Error(`${p} → ${r.status} ${(await r.text()).slice(0, 200)}`);
    return r.json();
  };

  let pass = 0;
  const ok = (cond, label) => {
    if (cond) { pass++; console.log(`  ✓ ${label}`); }
    else throw new Error(`FAIL: ${label}`);
  };

  console.log('ADMIN:');
  const cfg = await get(users.ADMIN, '/progress/config');
  ok(cfg.weights.assessments === 35, 'config defaults');
  const dash = await get(users.ADMIN, '/progress/dashboard');
  ok(dash.cards && dash.charts, 'admin dashboard');
  const list = await get(users.ADMIN, '/progress/students?limit=5');
  ok(Array.isArray(list.items), 'admin student list');
  ok(Array.isArray(await get(users.ADMIN, '/progress/badges')), 'badge catalogue');
  ok(Array.isArray(await get(users.ADMIN, '/progress/skills')), 'skills list');
  const rep = await get(users.ADMIN, '/progress/reports?type=course');
  ok(rep.columns && Array.isArray(rep.rows), 'course report');
  if (list.items.length) {
    const d = await get(users.ADMIN, `/progress/students/${list.items[0].studentId}`);
    ok(d.scores && Array.isArray(d.goals) && Array.isArray(d.badges), 'student detail (scores+goals+badges)');
  }

  if (users.TEACHER) {
    console.log('TEACHER:');
    const td = await get(users.TEACHER, '/progress/teacher/dashboard');
    ok(td.cards && Array.isArray(td.students), 'teacher dashboard');
  }
  if (users.STUDENT) {
    console.log('STUDENT:');
    const sd = await get(users.STUDENT, '/progress/student/dashboard');
    ok(sd.cards && sd.scores && Array.isArray(sd.timeline), 'student dashboard');
  }
  if (users.ACADEMIC_COACH) {
    console.log('COACH:');
    const cd = await get(users.ACADEMIC_COACH, '/progress/coach/dashboard');
    ok(cd.cards && Array.isArray(cd.students) && Array.isArray(cd.weakAreas), 'coach dashboard');
    ok(Array.isArray(await get(users.ACADEMIC_COACH, '/progress/coach/risks')), 'coach risks list');
  } else {
    console.log('  (no ACADEMIC_COACH user — coach endpoints route-mapped, not hit)');
  }

  // RBAC: a STUDENT must NOT reach the admin dashboard.
  if (users.STUDENT) {
    const r = await fetch(`${BASE}/progress/dashboard`, { headers: { Authorization: `Bearer ${tok(users.STUDENT)}` } });
    ok(r.status === 403, 'RBAC: student blocked from admin dashboard (403)');
  }

  console.log(`\nSMOKE OK: ${pass} checks passed.`);
}

main().catch((e) => { console.error('SMOKE FAILED:', e.message); process.exit(1); });
