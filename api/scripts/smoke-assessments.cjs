/* End-to-end smoke test for the Assessment Management module. Creates a couple
 * of bank questions, an assessment (1 objective + 1 subjective) targeting one
 * student, publishes, has the student take + submit, teacher evaluates +
 * publishes, verifies the student result — then cleans everything up. */
require('dotenv/config');
const { Client } = require('pg');
const jwt = require('jsonwebtoken');

const BASE = `http://localhost:${process.env.PORT || 5000}/api`;
const SECRET = process.env.JWT_ACCESS_SECRET;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };

async function api(method, path, token, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json };
}

(async () => {
  const db = new Client({ connectionString: process.env.DATABASE_URL || process.env.DIRECT_URL });
  await db.connect();
  const created = { assessmentId: null, questionIds: [] };
  try {
    const admin = (await db.query(`SELECT id FROM "User" WHERE role='ADMIN' LIMIT 1`)).rows[0];
    const teacher = (await db.query(`SELECT u.id AS "userId", tp.id AS "profileId" FROM "User" u JOIN "TeacherProfile" tp ON tp."userId"=u.id LIMIT 1`)).rows[0];
    const student = (await db.query(`SELECT u.id AS "userId", sp.id AS "profileId" FROM "User" u JOIN "StudentProfile" sp ON sp."userId"=u.id LIMIT 1`)).rows[0];
    if (!admin || !teacher || !student) { console.log('Need at least one admin, teacher and student in the DB.'); process.exit(1); }
    const adminT = jwt.sign({ sub: admin.id }, SECRET);
    const teacherT = jwt.sign({ sub: teacher.userId }, SECRET);
    const studentT = jwt.sign({ sub: student.userId }, SECRET);

    console.log('\n1) Question bank');
    const q1 = await api('POST', '/assessments/questions', teacherT, {
      subject: 'SMOKE-Math', type: 'MCQ', text: 'What is 2 + 2?', difficulty: 'EASY', marks: 5,
      options: [{ id: 'a', text: '3' }, { id: 'b', text: '4', correct: true }, { id: 'c', text: '5' }],
    });
    ok(q1.status === 201 && q1.json.id, `MCQ created (${q1.status})`);
    const q2 = await api('POST', '/assessments/questions', teacherT, {
      subject: 'SMOKE-Math', type: 'SHORT_ANSWER', text: 'Explain addition in one line.', difficulty: 'MEDIUM', marks: 5,
      rubric: [{ name: 'Clarity', max: 5 }],
    });
    ok(q2.status === 201 && q2.json.id, `Subjective created (${q2.status})`);
    created.questionIds = [q1.json.id, q2.json.id];

    const qList = await api('GET', '/assessments/questions?subject=SMOKE-Math', teacherT);
    ok(qList.json.items?.length >= 2, `Question bank lists them (${qList.json.items?.length})`);

    console.log('\n2) Create + publish assessment');
    const create = await api('POST', '/assessments', teacherT, {
      title: 'SMOKE Weekly Test', type: 'WEEKLY_TEST', subject: 'SMOKE-Math', durationMin: 30,
      passingMarks: 4, totalMarks: 10, attemptsAllowed: 1, showResultImmediately: false,
      targetType: 'SELECTED', targetStudentIds: [student.profileId], questionIds: created.questionIds,
      certificateEnabled: true, certificateThreshold: 60,
    });
    ok(create.status === 201 && create.json.id, `Assessment created (${create.status})`);
    created.assessmentId = create.json.id;
    ok(create.json.totalMarks === 10, `Total marks summed to 10 (${create.json.totalMarks})`);
    ok(create.json.questionList?.length === 2, `2 questions linked (${create.json.questionList?.length})`);

    const pub = await api('POST', `/assessments/${created.assessmentId}/publish`, teacherT);
    ok(pub.status === 201 && pub.json.status === 'PUBLISHED', `Published, notified ${pub.json.notified}`);

    console.log('\n3) Student takes it');
    const mine = await api('GET', '/assessments/mine', studentT);
    const mineRow = (mine.json || []).find((a) => a.id === created.assessmentId);
    ok(mineRow && mineRow.canAttempt, `Student sees it, canAttempt=${mineRow?.canAttempt}`);

    const take = await api('GET', `/assessments/${created.assessmentId}/take`, studentT);
    ok(take.status === 200 && take.json.attemptId, `Attempt started (${take.status})`);
    const attemptId = take.json.attemptId;
    const mcq = take.json.questions.find((q) => q.type === 'MCQ');
    ok(mcq && mcq.options && !('correct' in (mcq.options[0] || {})), 'Take payload hides correct flags');

    // Answer the MCQ correctly and write the subjective answer.
    await api('POST', `/assessments/attempts/${attemptId}/answer`, studentT, { questionId: q1.json.id, response: ['b'], timeSpentSec: 10 });
    await api('POST', `/assessments/attempts/${attemptId}/answer`, studentT, { questionId: q2.json.id, response: 'Addition combines two numbers into their sum.', timeSpentSec: 20 });

    const submit = await api('POST', `/assessments/attempts/${attemptId}/submit`, studentT, { timeSpentSec: 40 });
    ok(submit.status === 201 && submit.json.status === 'SUBMITTED', `Submitted, status=${submit.json.status}`);
    ok(submit.json.autoScore === 5 && submit.json.correct === 1, `MCQ auto-scored 5, correct=1 (auto=${submit.json.autoScore})`);
    ok(submit.json.hasSubjective === true, 'Flagged as needing teacher evaluation');

    console.log('\n4) Result not visible before evaluation');
    const early = await api('GET', `/assessments/attempts/${attemptId}/result`, studentT);
    ok(early.json.available === false, 'Result hidden until published');

    console.log('\n5) Teacher evaluates + publishes');
    const attempt = await api('GET', `/assessments/attempts/${attemptId}`, teacherT);
    ok(attempt.json.answerList?.length === 2, `Teacher sees ${attempt.json.answerList?.length} answers`);
    const evalRes = await api('POST', `/assessments/attempts/${attemptId}/evaluate`, teacherT, {
      answers: [{ questionId: q2.json.id, awardedMarks: 4, rubricScores: { Clarity: 4 }, feedback: 'Good.' }],
      teacherFeedback: 'Well done overall.', publish: true,
    });
    ok(evalRes.status === 201 && evalRes.json.score === 9, `Evaluated: score 9/10 (${evalRes.json.score})`);
    ok(evalRes.json.passed === true, `Marked passed (${evalRes.json.passed})`);

    console.log('\n6) Student sees the published result');
    const result = await api('GET', `/assessments/attempts/${attemptId}/result`, studentT);
    ok(result.json.available === true, 'Result now available');
    ok(result.json.score === 9 && result.json.percentage === 90, `Score 9 (90%) — got ${result.json.score} (${result.json.percentage}%)`);
    ok(result.json.correctCount === 1 && result.json.questions?.length === 2, 'Question-wise analysis present');
    ok(result.json.certEligible === true, `Certificate eligible (${result.json.certEligible})`);

    const cert = await api('GET', `/assessments/attempts/${attemptId}/certificate`, studentT);
    ok(cert.status === 200 && cert.json.percentage === 90, `Certificate payload returned (${cert.status})`);

    console.log('\n7) Dashboards + analytics + question analytics');
    const adminDash = await api('GET', '/assessments/dashboard/admin', adminT);
    ok(adminDash.json.cards && adminDash.json.cards.total >= 1, `Admin dashboard (total=${adminDash.json.cards?.total})`);
    const qa = await api('GET', `/assessments/analytics/questions?assessmentId=${created.assessmentId}`, teacherT);
    ok(Array.isArray(qa.json) && qa.json.length === 2, `Question analytics (${qa.json?.length} rows)`);
  } catch (e) {
    fail++; console.error('EXCEPTION:', e.message);
  } finally {
    // Cleanup — assessment cascades to links/attempts/answers.
    if (created.assessmentId) await db.query(`DELETE FROM "Assessment" WHERE id=$1`, [created.assessmentId]).catch(() => {});
    if (created.questionIds.length) await db.query(`DELETE FROM "Question" WHERE id = ANY($1)`, [created.questionIds]).catch(() => {});
    await db.end();
    console.log(`\n==== ${pass} passed, ${fail} failed ====`);
    process.exit(fail ? 1 : 0);
  }
})();
