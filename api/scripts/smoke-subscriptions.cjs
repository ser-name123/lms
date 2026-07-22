/*
 * Subscription change requests: student asks, coach decides, the cycle applies.
 *
 * The rule the whole feature rests on is that APPROVING CHANGES NOTHING. A
 * family keeps the package and the timetable they have already paid for until
 * their cycle ends. Most of the checks below exist to prove that separation
 * really holds rather than that the buttons work.
 *
 *   node scripts/smoke-subscriptions.cjs
 *
 * Needs the API on localhost:5000 and JWT_ACCESS_SECRET in .env.
 *
 * Builds its own student, teacher, batch, package, fee plan and assignment:
 * on a database with none of those every assertion here would be vacuous.
 */

require('dotenv/config');
const jwt = require('jsonwebtoken');
const { Client } = require('pg');

const BASE = process.env.SMOKE_BASE || 'http://localhost:5000/api';
const SECRET = process.env.JWT_ACCESS_SECRET;
const MARKER = 'zz-smoke-sub';

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
  jwt.sign({ sub: userId, email, role }, SECRET, { expiresIn: '30m' });

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

const ids = {};

(async () => {
  if (!SECRET) throw new Error('JWT_ACCESS_SECRET is not set');
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();

  const emails = {
    student: `${MARKER}-student@example.test`,
    other: `${MARKER}-other@example.test`,
    teacher: `${MARKER}-teacher@example.test`,
    coach: `${MARKER}-coach@example.test`,
  };

  const cleanup = async () => {
    await db.query(`DELETE FROM "Batch" WHERE name LIKE $1`, [`${MARKER}%`]);
    await db.query(`DELETE FROM "Course" WHERE title LIKE $1`, [`${MARKER}%`]);
    const { rows } = await db.query(
      `SELECT id FROM "User" WHERE email = ANY($1)`,
      [Object.values(emails)],
    );
    for (const r of rows) await db.query(`DELETE FROM "User" WHERE id = $1`, [r.id]);
    await db.query(`DELETE FROM "Package" WHERE name LIKE $1`, [`${MARKER}%`]);
    await db.query(`DELETE FROM "FeePlan" WHERE name LIKE $1`, [`${MARKER}%`]);
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

    // Two fee plans and two packages, each package pointing at its plan, so a
    // package change can be shown to move the billing as well.
    const plans = {};
    for (const [key, name, amount] of [
      ['small', `${MARKER}-plan-4h`, 40],
      ['big', `${MARKER}-plan-8h`, 75],
    ]) {
      const { rows } = await db.query(
        `INSERT INTO "FeePlan" (id,name,cycle,currency,active,"updatedAt")
         VALUES (gen_random_uuid(),$1,'MONTHLY','USD',true,now()) RETURNING id`,
        [name],
      );
      plans[key] = rows[0].id;
      await db.query(
        `INSERT INTO "FeePlanComponent" (id,"planId",type,label,amount)
         VALUES (gen_random_uuid(),$1,'COURSE','Tuition',$2)`,
        [plans[key], amount],
      );
    }

    const packages = {};
    for (const [key, name, price, classes, plan] of [
      ['small', `${MARKER}-4 Hours`, 40, 8, 'small'],
      ['big', `${MARKER}-8 Hours`, 75, 16, 'big'],
    ]) {
      const { rows } = await db.query(
        `INSERT INTO "Package" (id,name,price,"classesPerMonth",active,"feePlanId")
         VALUES (gen_random_uuid(),$1,$2,$3,true,$4) RETURNING id`,
        [name, price, classes, plans[plan]],
      );
      packages[key] = rows[0].id;
    }
    check('two packages exist, each wired to a fee plan', !!packages.small && !!packages.big);

    const { rows: coachRows } = await db.query(
      `INSERT INTO "User" (id,email,"passwordHash","firstName","lastName",role,status,"updatedAt")
       VALUES (gen_random_uuid(),$1,'x','Smoke','Coach','ACADEMIC_COACH','ACTIVE',now()) RETURNING id`,
      [emails.coach],
    );
    const coachId = coachRows[0].id;
    const coachToken = token(coachId, 'ACADEMIC_COACH', emails.coach);

    // Teacher with an approved weekly window, so availability can be judged.
    const { rows: tUser } = await db.query(
      `INSERT INTO "User" (id,email,"passwordHash","firstName","lastName",role,status,"updatedAt")
       VALUES (gen_random_uuid(),$1,'x','Smoke','Teacher','TEACHER','ACTIVE',now()) RETURNING id`,
      [emails.teacher],
    );
    const { rows: tProf } = await db.query(
      `INSERT INTO "TeacherProfile" (id,"userId","teacherCode",availability,"availabilityApproved")
       VALUES (gen_random_uuid(),$1,$2,$3::jsonb,true) RETURNING id`,
      [
        tUser[0].id,
        `${MARKER}-T`,
        JSON.stringify({
          Monday: [{ from: '09:00', to: '20:00' }],
          Wednesday: [{ from: '09:00', to: '20:00' }],
          Friday: [{ from: '09:00', to: '20:00' }],
        }),
      ],
    );
    ids.teacherProfile = tProf[0].id;

    const { rows: course } = await db.query(
      `INSERT INTO "Course" (id,title,slug,price,"updatedAt")
       VALUES (gen_random_uuid(),$1,$2,0,now()) RETURNING id`,
      [`${MARKER}-course`, `${MARKER}-course`],
    );
    ids.course = course[0].id;

    // The student, on the small package, in a batch of their own.
    const { rows: sUser } = await db.query(
      `INSERT INTO "User" (id,email,"passwordHash","firstName","lastName",role,status,"updatedAt")
       VALUES (gen_random_uuid(),$1,'x','Smoke','Student','STUDENT','ACTIVE',now()) RETURNING id`,
      [emails.student],
    );
    const studentUserId = sUser[0].id;
    const studentToken = token(studentUserId, 'STUDENT', emails.student);
    const { rows: sProf } = await db.query(
      `INSERT INTO "StudentProfile" (id,"userId","studentCode","coachId")
       VALUES (gen_random_uuid(),$1,$2,$3) RETURNING id`,
      [studentUserId, `${MARKER}-S`, coachId],
    );
    ids.student = sProf[0].id;

    await db.query(
      `INSERT INTO "Enrollment" (id,"studentId","courseId","packageId",status,"startedAt","updatedAt")
       VALUES (gen_random_uuid(),$1,$2,$3,'ACTIVE',now(),now())`,
      [ids.student, ids.course, packages.small],
    );

    const { rows: batch } = await db.query(
      `INSERT INTO "Batch" (id,code,name,"courseId","teacherId","daysOfWeek","startTime","endTime",status,"updatedAt")
       VALUES (gen_random_uuid(),$1,$1,$2,$3,$4,'19:00','20:00','ACTIVE',now()) RETURNING id`,
      [`${MARKER}-solo`, ids.course, ids.teacherProfile, ['Monday', 'Wednesday', 'Friday']],
    );
    ids.batch = batch[0].id;
    await db.query(
      `INSERT INTO "BatchStudent" (id,"batchId","studentId") VALUES (gen_random_uuid(),$1,$2)`,
      [ids.batch, ids.student],
    );

    // Cycle renews well beyond the 48h cutoff.
    const nextRun = new Date(Date.now() + 20 * 86_400_000);
    const { rows: assign } = await db.query(
      `INSERT INTO "StudentFeeAssignment" (id,"studentId","planId","startDate","nextRunAt",active,"autoGenerate","updatedAt")
       VALUES (gen_random_uuid(),$1,$2,now(),$3,true,true,now()) RETURNING id`,
      [ids.student, plans.small, nextRun],
    );
    ids.assignment = assign[0].id;

    // ── Module 1: the read-only view ─────────────────────────────────────────
    console.log('\nModule 1 — current subscription');
    const me = await req('GET', '/subscriptions/me', studentToken);
    check('a student can read their subscription', me.ok, `HTTP ${me.status}`);
    check('the package is the one they are on', me.body?.package?.name?.includes('4 Hours'), me.body?.package?.name);
    check('the schedule comes from their batch', me.body?.schedule?.[0]?.startTime === '19:00', JSON.stringify(me.body?.schedule));
    check('the cycle has both ends', !!me.body?.cycle?.start && !!me.body?.cycle?.end);
    check('status is active', me.body?.status === 'ACTIVE', me.body?.status);

    const opts = await req('GET', '/subscriptions/me/packages', studentToken);
    check(
      'the package list offers others but not the current one',
      opts.ok &&
        opts.body.some((p) => p.id === packages.big) &&
        !opts.body.some((p) => p.id === packages.small),
    );

    // ── Module 2: no direct edit ─────────────────────────────────────────────
    console.log('\nModule 2 — students cannot edit, only ask');
    const forbidden = await req(
      'PATCH', `/subscriptions/requests/does-not-matter/review`, studentToken, { approve: true }, 403,
    );
    check('a student cannot reach the approval endpoint', forbidden.ok, `status ${forbidden.status}`);

    // ── Module 3: the package request ────────────────────────────────────────
    console.log('\nModule 3 — package change request');
    const pkgReq = await req('POST', '/subscriptions/me/requests/package', studentToken, {
      packageId: packages.big,
      reason: 'Want more classes',
    }, 201);
    check('the request is accepted', pkgReq.ok, `HTTP ${pkgReq.status}: ${JSON.stringify(pkgReq.body).slice(0, 120)}`);
    ids.packageRequest = pkgReq.body?.id;
    check('it is pending, not applied', pkgReq.body?.status === 'PENDING', pkgReq.body?.status);

    const afterAsk = await req('GET', '/subscriptions/me', studentToken);
    check(
      'asking changed nothing — still on the old package',
      afterAsk.body?.package?.id === packages.small,
      afterAsk.body?.package?.name,
    );

    // Rule 3 — one open request of each kind.
    const dup = await req('POST', '/subscriptions/me/requests/package', studentToken, {
      packageId: packages.big,
    }, 400);
    check('a second pending package request is refused', dup.ok, `status ${dup.status}`);

    // ── Module 4: the coach's comparison, then approval ──────────────────────
    console.log('\nModule 4 — coach review');
    const detail = await req('GET', `/subscriptions/requests/${ids.packageRequest}`, coachToken);
    check('the owning coach can open it', detail.ok, `HTTP ${detail.status}`);
    check('the price difference is computed', detail.body?.comparison?.priceDifference === 35, String(detail.body?.comparison?.priceDifference));
    check('the classes difference is computed', detail.body?.comparison?.classesDifference === 8, String(detail.body?.comparison?.classesDifference));
    check('and it knows the billing can follow', detail.body?.comparison?.billingLinked === true);

    const approve = await req('PATCH', `/subscriptions/requests/${ids.packageRequest}/review`, coachToken, {
      approve: true,
      notes: 'Fine',
    });
    check('the coach can approve', approve.ok, `HTTP ${approve.status}: ${JSON.stringify(approve.body).slice(0, 120)}`);
    check('the request is APPROVED, not APPLIED', approve.body?.status === 'APPROVED', approve.body?.status);

    const afterApprove = await req('GET', '/subscriptions/me', studentToken);
    check(
      'APPROVAL STILL CHANGES NOTHING — the current package is untouched',
      afterApprove.body?.package?.id === packages.small,
      afterApprove.body?.package?.name,
    );
    check(
      'but the student can see what is queued for next cycle',
      afterApprove.body?.nextCycle?.package?.id === packages.big,
      JSON.stringify(afterApprove.body?.nextCycle),
    );
    const { rows: planStill } = await db.query(
      `SELECT "planId" FROM "StudentFeeAssignment" WHERE id = $1`, [ids.assignment],
    );
    check('and the billing plan has not moved yet', planStill[0].planId === plans.small);

    // ── Module 5 + 6: schedule request and approval ──────────────────────────
    console.log('\nModule 5 & 6 — schedule change');
    const schedReq = await req('POST', '/subscriptions/me/requests/schedule', studentToken, {
      days: ['Monday', 'Wednesday'],
      time: '18:00',
      reason: 'Earlier suits us',
    }, 201);
    check('the schedule request is accepted', schedReq.ok, `HTTP ${schedReq.status}: ${JSON.stringify(schedReq.body).slice(0, 120)}`);
    ids.scheduleRequest = schedReq.body?.id;

    const schedDetail = await req('GET', `/subscriptions/requests/${ids.scheduleRequest}`, coachToken);
    check('the coach sees nobody else is in the batch', schedDetail.body?.schedule?.otherStudentsInBatch === 0);
    check('so it can be retimed in place', schedDetail.body?.schedule?.canRetimeInPlace === true);
    check(
      'and the teacher is shown as free on the requested days',
      (schedDetail.body?.schedule?.teacher?.perDay || []).every((d) => d.free === true),
      JSON.stringify(schedDetail.body?.schedule?.teacher?.perDay),
    );

    const approveSched = await req('PATCH', `/subscriptions/requests/${ids.scheduleRequest}/review`, coachToken, { approve: true });
    check('the coach can approve the schedule change', approveSched.ok, `HTTP ${approveSched.status}`);

    const { rows: batchStill } = await db.query(
      `SELECT "daysOfWeek", "startTime" FROM "Batch" WHERE id = $1`, [ids.batch],
    );
    check(
      'the timetable has NOT moved yet either',
      batchStill[0].startTime === '19:00' && batchStill[0].daysOfWeek.length === 3,
      `${batchStill[0].startTime} / ${batchStill[0].daysOfWeek}`,
    );

    // ── Module 7: both land together when the cycle turns ────────────────────
    console.log('\nModule 7 — the cycle turns');
    const { rows: queued } = await db.query(
      `SELECT "nextPackageId", "nextDays", "nextTime" FROM "SubscriptionNextCycle" WHERE "studentId" = $1`,
      [ids.student],
    );
    check(
      'both changes are queued on one row',
      queued[0]?.nextPackageId === packages.big && queued[0]?.nextTime === '18:00',
      JSON.stringify(queued[0]),
    );

    // Bring the cycle boundary forward and run the sweep the way finance does.
    await db.query(`UPDATE "StudentFeeAssignment" SET "nextRunAt" = now() - interval '1 minute' WHERE id = $1`, [ids.assignment]);
    const rolled = await req('POST', `/subscriptions/student/${ids.student}/apply-now`, adminToken, undefined, 201);
    check('the rollover runs', rolled.ok, `HTTP ${rolled.status}: ${JSON.stringify(rolled.body).slice(0, 140)}`);

    const afterRoll = await req('GET', '/subscriptions/me', studentToken);
    check('the package has changed', afterRoll.body?.package?.id === packages.big, afterRoll.body?.package?.name);
    check('the schedule has changed', afterRoll.body?.schedule?.[0]?.startTime === '18:00', JSON.stringify(afterRoll.body?.schedule));
    check(
      'the days changed too',
      JSON.stringify(afterRoll.body?.schedule?.[0]?.days) === JSON.stringify(['Monday', 'Wednesday']),
      JSON.stringify(afterRoll.body?.schedule?.[0]?.days),
    );
    check('nothing is queued any more', !afterRoll.body?.nextCycle);

    const { rows: planNow } = await db.query(
      `SELECT "planId" FROM "StudentFeeAssignment" WHERE id = $1`, [ids.assignment],
    );
    check('THE BILLING MOVED WITH THE PACKAGE', planNow[0].planId === plans.big, planNow[0].planId);

    // ── Module 8: the student's own list ─────────────────────────────────────
    console.log('\nModule 8 — my requests');
    const mine = await req('GET', '/subscriptions/me/requests', studentToken);
    check('both requests are listed', mine.ok && mine.body.length === 2, `${mine.body?.length} row(s)`);
    check(
      'and both now read as applied',
      (mine.body || []).every((r) => r.status === 'APPLIED'),
      (mine.body || []).map((r) => r.status).join(','),
    );

    // ── Module 10: the safeguards ────────────────────────────────────────────
    console.log('\nModule 10 — safeguards');

    // Rule 2 — inside the cutoff.
    await db.query(
      `UPDATE "StudentFeeAssignment" SET "nextRunAt" = now() + interval '3 hours' WHERE id = $1`,
      [ids.assignment],
    );
    const tooLate = await req('POST', '/subscriptions/me/requests/package', studentToken, {
      packageId: packages.small,
    }, 400);
    check('a request inside the 48h cutoff is refused', tooLate.ok, `status ${tooLate.status}`);

    // Rule 1 — paused.
    await db.query(
      `UPDATE "StudentFeeAssignment" SET "nextRunAt" = now() + interval '20 days', "autoGenerate" = false WHERE id = $1`,
      [ids.assignment],
    );
    const paused = await req('POST', '/subscriptions/me/requests/package', studentToken, {
      packageId: packages.small,
    }, 400);
    check('a paused subscription cannot request changes', paused.ok, `status ${paused.status}`);
    const pausedView = await req('GET', '/subscriptions/me', studentToken);
    check('and it reads as paused', pausedView.body?.status === 'PAUSED', pausedView.body?.status);
    await db.query(`UPDATE "StudentFeeAssignment" SET "autoGenerate" = true WHERE id = $1`, [ids.assignment]);

    // Rule 4 — an audit row per step.
    const { rows: audit } = await db.query(
      `SELECT type FROM "StudentActivity" WHERE "studentId" = $1 AND type LIKE 'SUBSCRIPTION%' ORDER BY "createdAt"`,
      [ids.student],
    );
    check(
      'every step left an audit row',
      audit.length >= 5,
      audit.map((a) => a.type).join(', '),
    );

    // ── Scoping: another coach must not see it ───────────────────────────────
    console.log('\nScoping');
    /*
     * A real second coach, not an admin carrying a COACH claim: the JWT
     * strategy re-reads the user and uses the role on the row, so a forged
     * claim is simply ignored — an admin would have passed this test by being
     * allowed to see everything.
     */
    const { rows: strangerRows } = await db.query(
      `INSERT INTO "User" (id,email,"passwordHash","firstName","lastName",role,status,"updatedAt")
       VALUES (gen_random_uuid(),$1,'x','Smoke','Stranger','ACADEMIC_COACH','ACTIVE',now()) RETURNING id`,
      [emails.other],
    );
    const strangerToken = token(strangerRows[0].id, 'ACADEMIC_COACH', emails.other);
    const strangerList = await req('GET', '/subscriptions/requests?limit=50', strangerToken);
    check(
      'a coach who does not own the student sees none of their requests',
      strangerList.ok && !(strangerList.body.items || []).some((r) => r.student?.id === ids.student),
      `${(strangerList.body?.items || []).length} row(s)`,
    );
    const ownerList = await req('GET', '/subscriptions/requests?limit=50', coachToken);
    check(
      'the owning coach sees them',
      ownerList.ok && (ownerList.body.items || []).some((r) => r.student?.id === ids.student),
    );

    /*
     * ── A package somebody is waiting on cannot be deleted ─────────────────
     *
     * The subscription references are ON DELETE SET NULL, so without a guard
     * the delete succeeds and the damage is invisible: a student told their
     * change was approved simply never gets it. Both delete paths are checked
     * — the single one had no guard at all before.
     */
    console.log('\nDeleting a package somebody is waiting on');

    // The catalogue page deletes LmsPackage rows, so the guard needs one to
    // aim at; it is matched to the relational Package by id.
    const { rows: lms } = await db.query(
      `INSERT INTO "LmsPackage" (id,title,price,billing,level,courses,features,status,description)
       VALUES ($1,$2,75,'Monthly','All',ARRAY[]::text[],ARRAY[]::text[],'Active','smoke') RETURNING id`,
      [packages.big, `${MARKER}-8 Hours`],
    );
    check('a catalogue row exists for it', !!lms[0]?.id);

    // Queue it for next cycle again, then try to delete it.
    await db.query(
      `INSERT INTO "SubscriptionNextCycle" (id,"studentId","nextPackageId","updatedAt")
       VALUES (gen_random_uuid(),$1,$2,now())
       ON CONFLICT ("studentId") DO UPDATE SET "nextPackageId" = EXCLUDED."nextPackageId"`,
      [ids.student, packages.big],
    );

    const delOne = await req('DELETE', `/lms-data/packages/${packages.big}`, adminToken, undefined, 400);
    check('a single delete is refused', delOne.ok, `status ${delOne.status}`);
    // POST is 201 in Nest, not 200.
    const delMany = await req('POST', '/lms-data/packages/bulk-delete', adminToken, { ids: [packages.big] }, 201);
    check(
      'and a bulk delete refuses it too, with a reason',
      delMany.ok && delMany.body?.failed === 1 && /next cycle/i.test(JSON.stringify(delMany.body?.failures ?? '')),
      JSON.stringify(delMany.body).slice(0, 160),
    );
    const { rows: stillThere } = await db.query(
      `SELECT id FROM "Package" WHERE id = $1`, [packages.big],
    );
    check('the package is still there', stillThere.length === 1);

    await db.query(`DELETE FROM "SubscriptionNextCycle" WHERE "studentId" = $1`, [ids.student]);
    await db.query(`DELETE FROM "LmsPackage" WHERE id = $1`, [packages.big]);
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
