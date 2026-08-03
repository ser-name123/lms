/*
 * Smoke test — Subscription & Package Management, Phase 1 (plan catalogue).
 *
 * Exercises the real HTTP API (so it runs the actual service code) plus a direct
 * DB read to prove the flat LmsPackage catalogue and the relational Package stay
 * in step. Checks:
 *   - the two built-in subscription models are seeded
 *   - a Monthly plan stores its structure and derives monthlyHours (dur×weekly×4)
 *   - an Hourly plan stores per-currency rates, no fixed price, no fixed structure
 *   - the spec tuition example: AED 40/hr × 12 hrs = AED 480
 *   - LmsPackage.id === Package.id with matching mirrored fields
 *   - subscription-model create/delete, and delete-in-use is refused
 *
 * Run: node scripts/smoke-subscription-plans.cjs   (needs the API running + env)
 */
require('dotenv/config');
const jwt = require('jsonwebtoken');
const { Client } = require('pg');

const BASE = process.env.SMOKE_BASE || 'http://localhost:5000/api';
const SECRET = process.env.JWT_ACCESS_SECRET;
const MARKER = 'zz-smoke-plan';

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

const token = (userId, role, email) => jwt.sign({ sub: userId, email, role }, SECRET, { expiresIn: '30m' });

async function req(method, path, auth, payload) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth}` } : {}) },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body };
}

// Mirror of api/src/common/tuition.ts monthlyTuition (HOURLY branch) for the assert.
const hourlyTuition = (rate, durationMinutes, weeklyClasses) =>
  Math.round(rate * (durationMinutes / 60) * weeklyClasses * 4 * 100) / 100;

(async () => {
  if (!SECRET) throw new Error('JWT_ACCESS_SECRET is not set');
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();

  const cleanup = async () => {
    await db.query(`DELETE FROM "Package" WHERE name LIKE $1`, [`${MARKER}%`]);
    await db.query(`DELETE FROM "LmsPackage" WHERE title LIKE $1`, [`${MARKER}%`]);
    await db.query(`DELETE FROM "SubscriptionModel" WHERE key LIKE $1`, [`ZZSMOKE%`]);
  };

  try {
    await cleanup();

    const { rows: admins } = await db.query(`SELECT id, email FROM "User" WHERE role = 'ADMIN' LIMIT 1`);
    if (!admins.length) throw new Error('no ADMIN user to authenticate as');
    const adminToken = token(admins[0].id, 'ADMIN', admins[0].email);

    // --- Built-in models seeded ---
    const models = await req('GET', '/lms-data/subscription-models', adminToken);
    const monthly = (models.body || []).find((m) => m.key === 'MONTHLY');
    const hourly = (models.body || []).find((m) => m.key === 'HOURLY');
    check('MONTHLY model seeded', monthly && monthly.pricingMode === 'FIXED_MONTHLY');
    check('HOURLY model seeded', hourly && hourly.pricingMode === 'HOURLY');
    if (!monthly || !hourly) throw new Error('built-in models missing — is the API on the new build?');

    // --- Monthly plan: 60-min, weekly 5 (Elite) ---
    const monthlyPlan = await req('POST', '/lms-data/packages', adminToken, {
      title: `${MARKER} Elite Monthly`,
      modelId: monthly.id,
      tier: 'Elite',
      priceUSD: 120, priceAED: 440, priceGBP: 96,
      durationMinutes: 60, weeklyClasses: 5,
      rescheduleLimit: 6, familyDiscountPct: 10,
      featureMatrix: { eSyllabus: true, nativeArabicTeacher: true },
      status: 'Active', description: `${MARKER} monthly`,
    });
    check('monthly plan created', monthlyPlan.status === 201, `status ${monthlyPlan.status}`);
    const mId = monthlyPlan.body && monthlyPlan.body.id;

    const { rows: mPkg } = await db.query(`SELECT * FROM "Package" WHERE id = $1`, [mId]);
    const p = mPkg[0] || {};
    check('monthly → Package synced by id', !!mPkg.length);
    check('monthly modelId mapped', p.modelId === monthly.id);
    check('monthly duration=60', Number(p.durationMinutes) === 60);
    check('monthly weekly=5', Number(p.weeklyClasses) === 5);
    check('monthly hours derived = 20', Number(p.monthlyHours) === 20, `got ${p.monthlyHours}`);
    check('monthly classesPerMonth = 20', Number(p.classesPerMonth) === 20, `got ${p.classesPerMonth}`);
    check('monthly priceAED mapped', Number(p.priceAED) === 440);
    check('monthly rescheduleLimit=6', Number(p.rescheduleLimit) === 6);
    check('monthly familyDiscountPct=10', Number(p.familyDiscountPct) === 10);
    check('monthly eSyllabus mirrored true', p.eSyllabus === true);

    // --- Hourly plan: Premium, AED 40/hr ---
    const hourlyPlan = await req('POST', '/lms-data/packages', adminToken, {
      title: `${MARKER} Premium Hourly`,
      modelId: hourly.id,
      tier: 'Premium',
      hourlyRateUSD: 11, hourlyRateAED: 40, hourlyRateGBP: 11,
      rescheduleLimit: 4, familyDiscountPct: 5,
      status: 'Active', description: `${MARKER} hourly`,
    });
    check('hourly plan created', hourlyPlan.status === 201, `status ${hourlyPlan.status}`);
    const hId = hourlyPlan.body && hourlyPlan.body.id;
    const { rows: hPkg } = await db.query(`SELECT * FROM "Package" WHERE id = $1`, [hId]);
    const h = hPkg[0] || {};
    check('hourly → Package synced by id', !!hPkg.length);
    check('hourly rate AED=40', Number(h.hourlyRateAED) === 40);
    check('hourly has no fixed price (priceUSD=0)', Number(h.priceUSD) === 0, `got ${h.priceUSD}`);
    check('hourly has no fixed duration', h.durationMinutes == null);
    check('hourly has no fixed weekly', h.weeklyClasses == null);

    // --- Spec tuition example: AED 40/hr, 60-min, 3×/week → AED 480 ---
    check('tuition AED 40/hr × 12 hrs = 480', hourlyTuition(40, 60, 3) === 480, `got ${hourlyTuition(40, 60, 3)}`);

    // --- Update keeps the two tables in step ---
    const upd = await req('PUT', `/lms-data/packages/${mId}`, adminToken, {
      title: `${MARKER} Elite Monthly`,
      modelId: monthly.id, tier: 'Elite',
      priceUSD: 130, durationMinutes: 30, weeklyClasses: 4,
      status: 'Active', description: `${MARKER} monthly v2`,
    });
    check('monthly plan updated', upd.status === 200, `status ${upd.status}`);
    const { rows: mPkg2 } = await db.query(`SELECT * FROM "Package" WHERE id = $1`, [mId]);
    check('update re-derives hours 30×4×4/60 = 8', Number(mPkg2[0].monthlyHours) === 8, `got ${mPkg2[0].monthlyHours}`);
    const { rows: lms2 } = await db.query(`SELECT "monthlyHours" FROM "LmsPackage" WHERE id = $1`, [mId]);
    check('LmsPackage monthlyHours matches Package', Number(lms2[0].monthlyHours) === Number(mPkg2[0].monthlyHours));

    // --- Subscription model create + delete-in-use guard + delete ---
    const newModel = await req('POST', '/lms-data/subscription-models', adminToken, {
      name: 'Smoke Summer', key: 'ZZSMOKE_SUMMER', pricingMode: 'FIXED_MONTHLY',
    });
    check('custom model created', newModel.status === 201, `status ${newModel.status}`);
    const delInUse = await req('DELETE', `/lms-data/subscription-models/${monthly.id}`, adminToken);
    check('delete of in-use built-in refused', delInUse.status === 400, `status ${delInUse.status}`);
    if (newModel.body && newModel.body.id) {
      const delNew = await req('DELETE', `/lms-data/subscription-models/${newModel.body.id}`, adminToken);
      check('unused custom model deleted', delNew.status === 204, `status ${delNew.status}`);
    }
  } finally {
    await cleanup();
    await db.end();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) {
    console.log('Failures:\n  - ' + failures.join('\n  - '));
    process.exit(1);
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
