/*
 * Smoke test — Module 7: Monthly Assessment + Student Ranking.
 *
 * Walks the whole spec flow end to end:
 *   template created (criteria must total the max) → teacher opens the form for
 *   a closed billing cycle → 15-day rule → marks validated against the rubric →
 *   draft → submit → supervisor returns → resubmit → approve → publish →
 *   published report is read-only → student reads it and leaves parent feedback
 *   → staff review the feedback → ranking generated → badges awarded → the
 *   student sees their own rank but not the whole table.
 *
 * Run: node scripts/smoke-monthly-assessment.cjs   (needs API running + env)
 */
require('dotenv/config');
const jwt = require('jsonwebtoken');
const { Client } = require('pg');

const BASE = process.env.SMOKE_BASE || 'http://localhost:5000/api';
const SECRET = process.env.JWT_ACCESS_SECRET;
const MARKER = 'zz-smoke-ma';

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
const daysAgo = (d) => { const t = new Date(); t.setUTCDate(t.getUTCDate() - d); t.setUTCHours(0, 0, 0, 0); return t; };
const utc = (d) => d.toISOString();

(async () => {
  if (!SECRET) throw new Error('JWT_ACCESS_SECRET is not set');
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();

  const cleanup = async () => {
    const sps = await db.query(
      `SELECT sp.id FROM "StudentProfile" sp JOIN "User" u ON u.id=sp."userId" WHERE u.email LIKE $1`,
      [`%${MARKER}%`],
    );
    for (const sp of sps.rows) {
      const as = await db.query(`SELECT id FROM "MonthlyAssessment" WHERE "studentId"=$1`, [sp.id]);
      for (const a of as.rows) {
        await db.query(`DELETE FROM "AssessmentFeedback" WHERE "assessmentId"=$1`, [a.id]);
        await db.query(`DELETE FROM "MonthlyAssessmentScore" WHERE "assessmentId"=$1`, [a.id]);
      }
      await db.query(`DELETE FROM "MonthlyAssessment" WHERE "studentId"=$1`, [sp.id]);
      await db.query(`DELETE FROM "RankingBadge" WHERE "studentId"=$1`, [sp.id]);
      await db.query(`DELETE FROM "StudentRanking" WHERE "studentId"=$1`, [sp.id]);
      await db.query(`DELETE FROM "StudentActivity" WHERE "studentId"=$1`, [sp.id]);
      await db.query(`DELETE FROM "StudentSubscription" WHERE "studentId"=$1`, [sp.id]);
      await db.query(`DELETE FROM "Enrollment" WHERE "studentId"=$1`, [sp.id]);
      await db.query(`DELETE FROM "StudentProfile" WHERE id=$1`, [sp.id]);
    }
    const tpl = await db.query(`SELECT id FROM "AssessmentTemplate" WHERE name LIKE $1`, [`${MARKER}%`]);
    for (const t of tpl.rows) {
      await db.query(`DELETE FROM "AssessmentCriterion" WHERE "templateId"=$1`, [t.id]);
      await db.query(`DELETE FROM "AssessmentTemplate" WHERE id=$1`, [t.id]);
    }
    await db.query(`DELETE FROM "Course" WHERE title LIKE $1`, [`${MARKER}%`]);
    const tps = await db.query(
      `SELECT tp.id FROM "TeacherProfile" tp JOIN "User" u ON u.id=tp."userId" WHERE u.email LIKE $1`,
      [`%${MARKER}%`],
    );
    for (const tp of tps.rows) await db.query(`DELETE FROM "TeacherProfile" WHERE id=$1`, [tp.id]);
    await db.query(`DELETE FROM "User" WHERE email LIKE $1`, [`%${MARKER}%`]);
  };

  try {
    await cleanup();

    // ── Fixtures ────────────────────────────────────────────────────────────
    const admin = (await db.query(`SELECT id, email FROM "User" WHERE role='ADMIN' LIMIT 1`)).rows[0];
    check('an admin exists', !!admin);
    if (!admin) throw new Error('no admin');
    const adminToken = token(admin.id, 'ADMIN', admin.email);

    // A dedicated course, so the ranking table holds only this smoke's students.
    const course = (await db.query(
      `INSERT INTO "Course" (id,title,slug,price,"durationWeeks",status,"updatedAt")
       VALUES (gen_random_uuid(),$1,$2,10,12,'PUBLISHED',now()) RETURNING id`,
      [`${MARKER} Quran`, `${MARKER}-quran-${Date.now()}`],
    )).rows[0];

    const tu = (await db.query(
      `INSERT INTO "User" (id,email,"passwordHash","firstName","lastName",role,status,"updatedAt")
       VALUES (gen_random_uuid(),$1,'x','Ma','Teacher','TEACHER','ACTIVE',now()) RETURNING id, email`,
      [`${MARKER}-teacher@example.test`],
    )).rows[0];
    const teacher = (await db.query(
      `INSERT INTO "TeacherProfile" (id,"userId","teacherCode",rating) VALUES (gen_random_uuid(),$1,$2,4.0) RETURNING id`,
      [tu.id, `${MARKER}-T-${Date.now()}`],
    )).rows[0];
    const teacherToken = token(tu.id, 'TEACHER', tu.email);

    // Two students, so the ranking has something to rank.
    const mkStudent = async (tag, cycleStartDaysAgo) => {
      const u = (await db.query(
        `INSERT INTO "User" (id,email,"passwordHash","firstName","lastName",role,status,"updatedAt")
         VALUES (gen_random_uuid(),$1,'x',$2,'Stu','STUDENT','ACTIVE',now()) RETURNING id, email`,
        [`${MARKER}-${tag}@example.test`, tag],
      )).rows[0];
      const sp = (await db.query(
        `INSERT INTO "StudentProfile" (id,"userId","studentCode","billingCurrency","parentEmail","parentName")
         VALUES (gen_random_uuid(),$1,$2,'USD',$3,'Test Parent') RETURNING id`,
        [u.id, `${MARKER}-${tag}-${Date.now()}`, `${MARKER}-parent-${tag}@example.test`],
      )).rows[0];
      // Enrolment started before the cycle, so the 15-day rule is satisfied.
      await db.query(
        `INSERT INTO "Enrollment" (id,"studentId","courseId","teacherId",status,"startedAt","updatedAt")
         VALUES (gen_random_uuid(),$1,$2,$3,'ACTIVE',$4,now())`,
        [sp.id, course.id, teacher.id, utc(daysAgo(cycleStartDaysAgo + 5))],
      );
      // A subscription whose 28-day cycle CLOSED — that is what makes the
      // assessment due at all.
      const modelRow = (await db.query(`SELECT id, "pricingMode" FROM "SubscriptionModel" LIMIT 1`)).rows[0];
      if (modelRow) {
        await db.query(
          `INSERT INTO "StudentSubscription"
             (id,"studentId","courseId","modelId","pricingMode",currency,"durationMinutes","weeklyClasses","monthlyHours",
              "startDate","actualCycleStartDate","renewalDate",status,"updatedAt")
           VALUES (gen_random_uuid(),$1,$2,$3,$4,'USD',30,2,4,$5,$5,$6,'ACTIVE',now())`,
          [sp.id, course.id, modelRow.id, modelRow.pricingMode, utc(daysAgo(cycleStartDaysAgo)), utc(daysAgo(cycleStartDaysAgo - 28))],
        );
      }
      return { userId: u.id, email: u.email, profileId: sp.id };
    };
    // Cycle started 35 days ago → it ended 7 days ago → assessable now.
    const s1 = await mkStudent('alpha', 35);
    const s2 = await mkStudent('beta', 35);
    check('fixtures created', !!course && !!teacher && !!s1 && !!s2);

    // ── Template configuration ──────────────────────────────────────────────
    const bad = await req('POST', '/assessment-config/templates', adminToken, {
      name: `${MARKER} Bad`,
      courseId: course.id,
      maxMarks: 100,
      criteria: [{ name: 'Only one', maxMarks: 50 }],
    });
    check('template refused when criteria do not total the max', bad.status === 400, `status ${bad.status}`);

    const tplRes = await req('POST', '/assessment-config/templates', adminToken, {
      name: `${MARKER} Quran Template`,
      courseId: course.id,
      maxMarks: 100,
      passingMarks: 40,
      criteria: [
        { name: 'Attendance & Punctuality', maxMarks: 10 },
        { name: 'Tajweed Rules', maxMarks: 20 },
        { name: 'Pronunciation', maxMarks: 20 },
        { name: 'Fluency', maxMarks: 15 },
        { name: 'Memorization', maxMarks: 15 },
        { name: 'Revision', maxMarks: 10 },
        { name: 'Behaviour', maxMarks: 5 },
        { name: 'Homework', maxMarks: 5 },
      ],
    });
    check('template created', tplRes.status === 201 || tplRes.status === 200, `status ${tplRes.status}`);
    const template = tplRes.body;
    check('template carries 8 criteria totalling 100', template && template.criteria?.length === 8 && template.criteriaTotal === 100,
      template && `${template.criteria?.length} / ${template.criteriaTotal}`);

    const dup = await req('POST', '/assessment-config/templates', adminToken, {
      name: `${MARKER} Second`,
      courseId: course.id,
      maxMarks: 10,
      criteria: [{ name: 'X', maxMarks: 10 }],
    });
    check('second ACTIVE template for the same course refused', dup.status === 400, `status ${dup.status}`);

    // ── Teacher opens the form ──────────────────────────────────────────────
    const form = await req('GET', `/monthly-assessments/form?studentId=${s1.profileId}&courseId=${course.id}`, teacherToken);
    check('teacher can load the assessment form', form.status === 200, `status ${form.status} ${JSON.stringify(form.body).slice(0, 160)}`);
    check('form resolves a finished billing cycle', !!form.body?.cycle?.start, JSON.stringify(form.body?.cycle));
    check('form auto-loads the rubric', form.body?.template?.criteria?.length === 8, String(form.body?.template?.criteria?.length));
    check('form auto-loads the cycle summary', !!form.body?.summary, JSON.stringify(form.body?.summary));
    check('student is eligible (15-day rule met)', form.body?.eligibility?.eligible === true, JSON.stringify(form.body?.eligibility));
    const cycleStart = form.body?.cycle?.start;
    const criteria = form.body?.template?.criteria ?? [];

    /*
     * Marks at `fraction` of each ceiling. The expected total is SUMMED from
     * the same rounded per-criterion marks rather than assumed to be
     * `fraction × 100` — several ceilings are odd, so 0.9 rounds up on each of
     * them and the honest total is 92, not 90. Asserting 90 would have failed a
     * correct server.
     */
    const scoresFor = (fraction) =>
      criteria.map((c) => ({
        criterionId: c.id,
        criterionName: c.name,
        maxMarks: c.maxMarks,
        marks: Math.round(c.maxMarks * fraction),
      }));
    const expectedTotal = (fraction) => scoresFor(fraction).reduce((a, s) => a + s.marks, 0);

    // ── Validation ──────────────────────────────────────────────────────────
    const over = await req('POST', '/monthly-assessments/draft', teacherToken, {
      studentId: s1.profileId, courseId: course.id, cycleStart,
      scores: criteria.map((c, i) => ({ criterionId: c.id, criterionName: c.name, maxMarks: c.maxMarks, marks: i === 0 ? c.maxMarks + 5 : 1 })),
    });
    check('marks above a criterion maximum refused', over.status === 400, `status ${over.status}`);

    const missing = await req('POST', '/monthly-assessments/draft', teacherToken, {
      studentId: s1.profileId, courseId: course.id, cycleStart,
      scores: scoresFor(0.9).slice(0, 3),
    });
    check('missing mandatory criteria refused', missing.status === 400, `status ${missing.status}`);

    const noRemarks = await req('POST', '/monthly-assessments/submit', teacherToken, {
      studentId: s1.profileId, courseId: course.id, cycleStart, scores: scoresFor(0.9),
    });
    check('submit without teacher comments refused', noRemarks.status === 400, `status ${noRemarks.status}`);

    // ── Draft → submit ──────────────────────────────────────────────────────
    const draft = await req('POST', '/monthly-assessments/draft', teacherToken, {
      studentId: s1.profileId, courseId: course.id, cycleStart,
      scores: scoresFor(0.9), teacherRemarks: 'Good progress.',
    });
    check('draft saved', draft.status === 200 || draft.status === 201, `status ${draft.status}`);
    check(`total computed server-side (${expectedTotal(0.9)}/100)`, draft.body?.totalMarks === expectedTotal(0.9), String(draft.body?.totalMarks));
    check('percentage derived from the total', draft.body?.percentage === expectedTotal(0.9), String(draft.body?.percentage));
    check('grade derived from the scale', !!draft.body?.grade, String(draft.body?.grade));
    check('draft status is DRAFT', draft.body?.status === 'DRAFT', draft.body?.status);
    const aId = draft.body?.id;

    /*
     * ── Direct publish (the academy's rule, and the shipped default) ─────────
     *
     * A teacher's submission IS the report: no supervisor gate, it reaches the
     * family the moment they submit. The approval workflow still exists and is
     * exercised further down with the toggle switched on.
     */
    const studentTokenEarly = token(s1.userId, 'STUDENT', s1.email);
    const hiddenBefore = await req('GET', `/monthly-assessments/${aId}`, studentTokenEarly);
    check('a draft is not visible to the student', hiddenBefore.status === 404, `status ${hiddenBefore.status}`);

    const submitted = await req('POST', '/monthly-assessments/submit', teacherToken, {
      studentId: s1.profileId, courseId: course.id, cycleStart,
      scores: scoresFor(0.9), teacherRemarks: 'Good progress.', recommendations: 'Revise Juz 30.',
    });
    check('submitting publishes outright — no approval step', submitted.body?.status === 'PUBLISHED', submitted.body?.status);
    check('publishedAt is stamped on submit', !!submitted.body?.publishedAt, String(submitted.body?.publishedAt));

    const seenNow = await req('GET', `/monthly-assessments/${aId}`, studentTokenEarly);
    check('the student can read it immediately', seenNow.status === 200, `status ${seenNow.status}`);

    // The supervisor is not a gate, but must still be told and able to look.
    const supervisorSees = await req('GET', `/monthly-assessments?studentId=${s1.profileId}`, adminToken);
    check('staff can view the published report',
      Array.isArray(supervisorSees.body) && supervisorSees.body.some((r) => r.id === aId),
      JSON.stringify(supervisorSees.body).slice(0, 160));
    const staffNote = await db.query(
      `SELECT count(*)::int AS n FROM "Notification" n JOIN "User" u ON u.id=n."userId"
       WHERE n.type='MONTHLY_ASSESSMENT_PUBLISHED' AND u.role IN ('SUPERVISOR','ADMIN')`,
    );
    check('supervisors are notified that it published', staffNote.rows[0].n > 0, String(staffNote.rows[0].n));

    const rePublish = await req('POST', `/monthly-assessments/${aId}/publish`, adminToken);
    check('publishing an already-published report is refused', rePublish.status === 400, `status ${rePublish.status}`);

    const lockedEdit = await req('POST', '/monthly-assessments/draft', teacherToken, {
      studentId: s1.profileId, courseId: course.id, cycleStart,
      scores: scoresFor(1), teacherRemarks: 'Rewriting after publication.',
    });
    check('published assessment is read-only', lockedEdit.status === 400, `status ${lockedEdit.status}`);

    // ── Student panel + parent feedback ─────────────────────────────────────
    const studentToken = studentTokenEarly;
    const mine = await req('GET', '/monthly-assessments/mine', studentToken);
    check('student sees their published report', Array.isArray(mine.body) && mine.body.length === 1, JSON.stringify(mine.body).slice(0, 120));
    check('report carries the criteria breakdown', mine.body?.[0]?.scores?.length === 8, String(mine.body?.[0]?.scores?.length));

    const fb = await req('POST', `/monthly-assessments/${aId}/feedback`, studentToken, { rating: 5, comment: 'Very happy with the progress.' });
    check('family feedback accepted from the student panel', fb.body?.submitted === true, JSON.stringify(fb.body).slice(0, 120));

    const pending = await req('GET', '/monthly-assessments/feedback/pending', teacherToken);
    check('teacher sees the feedback awaiting review', Array.isArray(pending.body) && pending.body.some((f) => f.assessmentId === aId),
      JSON.stringify(pending.body).slice(0, 160));
    const fbId = (pending.body || []).find((f) => f.assessmentId === aId)?.id;
    const reviewed = await req('POST', `/monthly-assessments/feedback/${fbId}/review`, teacherToken, { note: 'Thanked the family.' });
    check('feedback can be marked reviewed', reviewed.status === 200, `status ${reviewed.status}`);

    /*
     * ── The approval workflow, with the toggle switched on ──────────────────
     *
     * Still supported, still tested: an academy that wants a supervisor gate
     * turns `requireSupervisorApproval` on and the whole submit → return →
     * resubmit → approve → publish chain applies. The second student doubles as
     * the fixture for it and as the second row the ranking needs.
     */
    const cfg0 = await req('GET', '/assessment-config/settings', adminToken);
    check('approval is OFF by default', cfg0.body?.requireSupervisorApproval === false, String(cfg0.body?.requireSupervisorApproval));
    await req('PATCH', '/assessment-config/settings', adminToken, { requireSupervisorApproval: true });

    const form2 = await req('GET', `/monthly-assessments/form?studentId=${s2.profileId}&courseId=${course.id}`, teacherToken);
    const cycle2 = form2.body?.cycle?.start;
    const sub2 = await req('POST', '/monthly-assessments/submit', teacherToken, {
      studentId: s2.profileId, courseId: course.id, cycleStart: cycle2,
      scores: scoresFor(0.6), teacherRemarks: 'Steady.',
    });
    check('with approval on, submitting only queues it', sub2.body?.status === 'SUBMITTED', sub2.body?.status);
    const a2 = { id: sub2.body?.id };

    const early2 = await req('POST', `/monthly-assessments/${a2.id}/publish`, adminToken);
    check('publish before approval refused', early2.status === 400, `status ${early2.status}`);

    const s2Token = token(s2.userId, 'STUDENT', s2.email);
    const hidden2 = await req('GET', `/monthly-assessments/${a2.id}`, s2Token);
    check('student cannot read an unapproved assessment', hidden2.status === 404, `status ${hidden2.status}`);

    const returned = await req('POST', `/monthly-assessments/${a2.id}/return`, adminToken, { reason: 'Add a revision note.' });
    check('returned for revision', returned.body?.status === 'RETURNED', returned.body?.status);
    check('return reason recorded', returned.body?.returnedReason === 'Add a revision note.', returned.body?.returnedReason);

    const resubmitted = await req('POST', '/monthly-assessments/submit', teacherToken, {
      studentId: s2.profileId, courseId: course.id, cycleStart: cycle2,
      scores: scoresFor(0.6), teacherRemarks: 'Steady. Revision noted.',
    });
    check('teacher may edit and resubmit a RETURNED assessment', resubmitted.body?.status === 'SUBMITTED', resubmitted.body?.status);

    const approved = await req('POST', `/monthly-assessments/${a2.id}/approve`, adminToken);
    check('approved', approved.body?.status === 'APPROVED', approved.body?.status);

    const pub2 = await req('POST', `/monthly-assessments/${a2.id}/publish`, adminToken);
    check('second assessment published', pub2.body?.status === 'PUBLISHED', pub2.body?.status);

    // Back to the academy's setting, so a later run starts where it should.
    await req('PATCH', '/assessment-config/settings', adminToken, { requireSupervisorApproval: false });

    // ── Ranking ─────────────────────────────────────────────────────────────
    const gen = await req('POST', '/rankings/generate', adminToken, { courseId: course.id, cycleStart, publish: true });
    check('ranking generated', gen.status === 200 || gen.status === 201, `status ${gen.status} ${JSON.stringify(gen.body).slice(0, 160)}`);
    check('both students ranked', gen.body?.studentsRanked === 2, String(gen.body?.studentsRanked));
    check('badges awarded', (gen.body?.badgesAwarded ?? 0) > 0, String(gen.body?.badgesAwarded));

    const board = await req('GET', `/rankings?courseId=${course.id}&cycleStart=${encodeURIComponent(cycleStart)}`, adminToken);
    const rows = board.body?.courses?.[0]?.rows ?? [];
    check('leaderboard returns both rows in rank order', rows.length === 2 && rows[0].rank === 1 && rows[1].rank === 2,
      JSON.stringify(rows.map((r) => r.rank)));
    check('the 90% student ranks first', rows[0]?.studentId === s1.profileId, rows[0]?.studentName);
    check('rank 1 earned the gold badge', (rows[0]?.badges ?? []).some((b) => b.rule === 'RANK_1'),
      JSON.stringify(rows[0]?.badges));
    check('score is 0..100', rows[0]?.totalScore > 0 && rows[0]?.totalScore <= 100, String(rows[0]?.totalScore));

    const myRank = await req('GET', '/rankings/mine', studentToken);
    check('student sees their own rank', myRank.body?.cycles?.[0]?.myRank === 1, JSON.stringify(myRank.body?.cycles?.[0]?.myRank));
    check('student sees their badges', (myRank.body?.badges ?? []).length > 0, String((myRank.body?.badges ?? []).length));

    const forbidden = await req('GET', `/rankings?courseId=${course.id}`, studentToken);
    check('student cannot read the full leaderboard endpoint', forbidden.status === 403, `status ${forbidden.status}`);

    // ── Badge notifications reach the student AND the teacher ───────────────
    // The spec's matrix is Student ✓ Teacher ✓ Coach ✗. The teacher half was
    // missing: notifyBadge only ever wrote to the student.
    const badgeNotes = await db.query(
      `SELECT "userId" FROM "Notification" WHERE type='BADGE_AWARDED' AND "userId" = ANY($1::text[])`,
      [[s1.userId, tu.id]],
    );
    const notified = badgeNotes.rows.map((r) => r.userId);
    check('badge notified the student', notified.includes(s1.userId), notified.join(','));
    check('badge notified the teacher', notified.includes(tu.id), notified.join(','));

    const coachNotes = await db.query(
      `SELECT count(*)::int AS n FROM "Notification" n JOIN "User" u ON u.id=n."userId"
       WHERE n.type='BADGE_AWARDED' AND u.role='ACADEMIC_COACH'`,
    );
    check('the coach is left off badge notifications, per the spec', coachNotes.rows[0].n === 0,
      String(coachNotes.rows[0].n));

    const badgeNoteCount = (
      await db.query(`SELECT count(*)::int AS n FROM "Notification" WHERE type='BADGE_AWARDED' AND "userId"=$1`, [s1.userId])
    ).rows[0].n;

    // ── Starter rubrics ─────────────────────────────────────────────────────
    const presets = await req('GET', '/assessment-config/presets', adminToken);
    check('the three shipped rubrics are offered', Array.isArray(presets.body) && presets.body.length === 3,
      JSON.stringify(presets.body).slice(0, 120));
    const keys = (presets.body ?? []).map((p) => p.key);
    check('presets cover Quran, Arabic and Islamic Studies',
      ['QURAN', 'ARABIC', 'ISLAMIC_STUDIES'].every((k) => keys.includes(k)), keys.join(','));
    check('every preset’s criteria add up to its maximum',
      (presets.body ?? []).every((p) => p.criteria.reduce((a, c) => a + c.maxMarks, 0) === p.maxMarks),
      (presets.body ?? []).map((p) => `${p.key}:${p.criteria.reduce((a, c) => a + c.maxMarks, 0)}/${p.maxMarks}`).join(' '));
    check('the Quran rubric is the spec’s eight criteria',
      (presets.body ?? []).find((p) => p.key === 'QURAN')?.criteria.length === 8);

    const presetForbidden = await req('GET', '/assessment-config/presets', teacherToken);
    check('a teacher cannot read the preset library', presetForbidden.status === 403, `status ${presetForbidden.status}`);

    // Seeding never touches a course that already has a rubric — this course
    // has one, so it must not gain a second.
    const before = (await db.query(`SELECT count(*)::int AS n FROM "AssessmentTemplate" WHERE "courseId"=$1`, [course.id])).rows[0].n;
    const seeded = await req('POST', '/assessment-config/presets/seed', adminToken);
    check('seeding starter rubrics succeeds', seeded.status === 200 || seeded.status === 201, `status ${seeded.status}`);
    const after = (await db.query(`SELECT count(*)::int AS n FROM "AssessmentTemplate" WHERE "courseId"=$1`, [course.id])).rows[0].n;
    check('a course that already has a template is left alone', before === after, `${before} → ${after}`);

    // …and a matching course with no rubric does get one, ready to assess.
    const bare = (await db.query(
      `INSERT INTO "Course" (id,title,slug,price,"durationWeeks",status,"updatedAt")
       VALUES (gen_random_uuid(),$1,$2,10,12,'PUBLISHED',now()) RETURNING id`,
      [`${MARKER} Arabic Language`, `${MARKER}-arabic-${Date.now()}`],
    )).rows[0];
    const seeded2 = await req('POST', '/assessment-config/presets/seed', adminToken);
    check('a matching course with no rubric is seeded',
      (seeded2.body?.created ?? []).some((t) => t.includes('Arabic')), JSON.stringify(seeded2.body).slice(0, 160));
    const bareCriteria = (await db.query(
      `SELECT count(*)::int AS n FROM "AssessmentCriterion" c
       JOIN "AssessmentTemplate" t ON t.id=c."templateId" WHERE t."courseId"=$1`,
      [bare.id],
    )).rows[0].n;
    check('the seeded Arabic rubric has all nine criteria', bareCriteria === 9, String(bareCriteria));
    const seeded3 = await req('POST', '/assessment-config/presets/seed', adminToken);
    check('seeding twice creates nothing the second time', (seeded3.body?.created ?? []).length === 0,
      JSON.stringify(seeded3.body).slice(0, 160));

    // ── Audit ───────────────────────────────────────────────────────────────
    const audit = await db.query(
      `SELECT count(*)::int AS n FROM "StudentActivity" WHERE "studentId"=$1 AND type='RANKING_GENERATED'`,
      [s1.profileId],
    );
    check('ranking calculation written to the audit log', audit.rows[0].n > 0, String(audit.rows[0].n));

    const trail = await db.query(
      `SELECT type FROM "StudentActivity" WHERE "studentId"=$1 AND type LIKE 'ASSESSMENT%'`,
      [s1.profileId],
    );
    const types = trail.rows.map((r) => r.type);
    // s1 went the direct route: draft, then published. There is no SUBMITTED
    // entry to find because no such state ever existed for that report.
    check('direct-publish lifecycle audited', ['ASSESSMENT_DRAFT', 'ASSESSMENT_PUBLISHED'].every((t) => types.includes(t)),
      types.join(','));
    check('no phantom approval step in the audit trail', !types.includes('ASSESSMENT_APPROVED'), types.join(','));

    const trail2 = await db.query(
      `SELECT type FROM "StudentActivity" WHERE "studentId"=$1 AND type LIKE 'ASSESSMENT%'`,
      [s2.profileId],
    );
    const types2 = trail2.rows.map((r) => r.type);
    check('approval lifecycle audited when the toggle is on',
      ['ASSESSMENT_SUBMITTED', 'ASSESSMENT_APPROVED', 'ASSESSMENT_PUBLISHED'].every((t) => types2.includes(t)),
      types2.join(','));

    // ── Idempotency ─────────────────────────────────────────────────────────
    const regen = await req('POST', '/rankings/generate', adminToken, { courseId: course.id, cycleStart, publish: true });
    check('regenerating a cycle is idempotent', regen.body?.studentsRanked === 2, String(regen.body?.studentsRanked));
    const badgeCount = await db.query(
      `SELECT count(*)::int AS n FROM "RankingBadge" WHERE "studentId"=$1 AND "cycleStart"=$2`,
      [s1.profileId, cycleStart],
    );
    const badgeCount2 = await db.query(
      `SELECT count(DISTINCT rule)::int AS n FROM "RankingBadge" WHERE "studentId"=$1 AND "cycleStart"=$2`,
      [s1.profileId, cycleStart],
    );
    check('badges are not duplicated on regeneration', badgeCount.rows[0].n === badgeCount2.rows[0].n,
      `${badgeCount.rows[0].n} rows / ${badgeCount2.rows[0].n} distinct`);

    // The badge row is upserted on every regeneration, so the notification has
    // to be gated on the row being NEW — otherwise re-running a cycle spams
    // every student the same congratulations again.
    const badgeNoteAfter = (
      await db.query(`SELECT count(*)::int AS n FROM "Notification" WHERE type='BADGE_AWARDED' AND "userId"=$1`, [s1.userId])
    ).rows[0].n;
    check('regeneration does not re-announce an existing badge', badgeNoteAfter === badgeNoteCount,
      `${badgeNoteCount} → ${badgeNoteAfter}`);
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
