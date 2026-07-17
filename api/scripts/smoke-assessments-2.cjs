/* Round-2 smoke test: coding question (testCases + language), proctored
 * assessment (violations), issued certificate number. Cleans up after itself. */
require('dotenv/config');
const { Client } = require('pg');
const jwt = require('jsonwebtoken');

const BASE = `http://localhost:${process.env.PORT || 5000}/api`;
const SECRET = process.env.JWT_ACCESS_SECRET;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
async function api(method, path, token, body) {
  const res = await fetch(`${BASE}${path}`, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined });
  const t = await res.text(); let j; try { j = JSON.parse(t); } catch { j = t; } return { status: res.status, json: j };
}

(async () => {
  const db = new Client({ connectionString: process.env.DATABASE_URL || process.env.DIRECT_URL });
  await db.connect();
  const created = { assessmentId: null, questionIds: [] };
  try {
    const teacher = (await db.query(`SELECT u.id AS "userId", tp.id AS "profileId" FROM "User" u JOIN "TeacherProfile" tp ON tp."userId"=u.id LIMIT 1`)).rows[0];
    const student = (await db.query(`SELECT u.id AS "userId", sp.id AS "profileId" FROM "User" u JOIN "StudentProfile" sp ON sp."userId"=u.id LIMIT 1`)).rows[0];
    const teacherT = jwt.sign({ sub: teacher.userId }, SECRET);
    const studentT = jwt.sign({ sub: student.userId }, SECRET);

    console.log('\n1) Coding question with test cases');
    const q = await api('POST', '/assessments/questions', teacherT, {
      subject: 'SMOKE-Code', type: 'CODING', text: 'Return the input unchanged.', difficulty: 'EASY', marks: 10,
      language: 'javascript', testCases: [{ input: 'hello', expected: 'hello', sample: true }, { input: 'x', expected: 'x' }],
      rubric: [{ name: 'Correctness', max: 10 }],
    });
    ok(q.status === 201 && q.json.testCases?.length === 2, `Coding question created with 2 test cases (${q.status})`);
    created.questionIds = [q.json.id];

    console.log('\n2) Proctored assessment + certificate');
    const create = await api('POST', '/assessments', teacherT, {
      title: 'SMOKE Coding + Proctored', type: 'PRACTICE_TEST', subject: 'SMOKE-Code', durationMin: 30,
      passingMarks: 4, attemptsAllowed: 1, proctored: true, certificateEnabled: true, certificateThreshold: 60,
      targetType: 'SELECTED', targetStudentIds: [student.profileId], questionIds: created.questionIds,
    });
    ok(create.status === 201 && create.json.proctored === true, `Assessment created, proctored=${create.json.proctored}`);
    created.assessmentId = create.json.id;
    await api('POST', `/assessments/${created.assessmentId}/publish`, teacherT);

    console.log('\n3) Student take — coding payload + proctored flag');
    const take = await api('GET', `/assessments/${created.assessmentId}/take`, studentT);
    ok(take.json.proctored === true, `take.proctored = ${take.json.proctored}`);
    const cq = take.json.questions[0];
    ok(cq.type === 'CODING' && cq.language === 'javascript' && cq.testCases?.length === 2, `Coding question carries language + testCases (${cq.testCases?.length})`);
    const attemptId = take.json.attemptId;

    console.log('\n4) Submit with proctoring violations');
    await api('POST', `/assessments/attempts/${attemptId}/answer`, studentT, { questionId: q.json.id, response: 'function solve(i){return i;}', timeSpentSec: 42 });
    const submit = await api('POST', `/assessments/attempts/${attemptId}/submit`, studentT, {
      timeSpentSec: 60, violations: 2, proctorLog: [{ type: 'tab-hidden', at: new Date().toISOString() }, { type: 'copy', at: new Date().toISOString() }],
      answers: [{ questionId: q.json.id, response: 'function solve(i){return i;}' }],
    });
    ok(submit.json.status === 'SUBMITTED' && submit.json.hasSubjective === true, `Submitted (coding → teacher eval), status=${submit.json.status}`);
    const viol = (await db.query(`SELECT violations FROM "AssessmentAttempt" WHERE id=$1`, [attemptId])).rows[0];
    ok(viol && viol.violations === 2, `Violations stored (${viol?.violations})`);

    console.log('\n5) Teacher evaluates coding + publishes → certificate issued');
    const evalRes = await api('POST', `/assessments/attempts/${attemptId}/evaluate`, teacherT, {
      answers: [{ questionId: q.json.id, awardedMarks: 10, rubricScores: { Correctness: 10 }, feedback: 'Correct.' }], publish: true,
    });
    ok(evalRes.json.score === 10 && evalRes.json.passed === true, `Evaluated 10/10 passed (${evalRes.json.score})`);

    const result = await api('GET', `/assessments/attempts/${attemptId}/result`, studentT);
    ok(result.json.certificateNo && /^CERT-\d{4}-/.test(result.json.certificateNo), `Certificate number issued: ${result.json.certificateNo}`);
    ok(result.json.violations === 2, `Result exposes violations (${result.json.violations})`);

    const cert = await api('GET', `/assessments/attempts/${attemptId}/certificate`, studentT);
    ok(cert.status === 200 && cert.json.certificateNo, `Certificate payload has number (${cert.json.certificateNo})`);
  } catch (e) { fail++; console.error('EXCEPTION:', e.message); }
  finally {
    if (created.assessmentId) await db.query(`DELETE FROM "Assessment" WHERE id=$1`, [created.assessmentId]).catch(() => {});
    if (created.questionIds.length) await db.query(`DELETE FROM "Question" WHERE id = ANY($1)`, [created.questionIds]).catch(() => {});
    await db.end();
    console.log(`\n==== ${pass} passed, ${fail} failed ====`);
    process.exit(fail ? 1 : 0);
  }
})();
