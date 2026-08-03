/*
 * One-shot backfill — materialise a StudentSubscription for every active student
 * who does not have one yet, from the three loose rows a subscription used to be
 * assembled from (Enrollment + Batch + StudentFeeAssignment + Package). Legacy
 * students are all on the Monthly model, so that is what they are recorded as.
 *
 * Idempotent: a student who already has a subscription row is skipped, so it is
 * safe to re-run. Pass --dry to print what it would do without writing.
 *
 * Run: node scripts/backfill-student-subscriptions.cjs [--dry]
 */
require('dotenv/config');
const { Client } = require('pg');

const DRY = process.argv.includes('--dry');

const priceFor = (pkg, currency) => {
  const raw = currency === 'AED' ? pkg.priceAED : currency === 'GBP' ? pkg.priceGBP : pkg.priceUSD;
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
};

(async () => {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  try {
    const { rows: models } = await db.query(`SELECT id FROM "SubscriptionModel" WHERE key = 'MONTHLY' LIMIT 1`);
    if (!models.length) throw new Error('MONTHLY subscription model not seeded — boot the API once first.');
    const monthlyModelId = models[0].id;

    // Active students with an active enrolment and NO subscription row yet.
    const { rows: candidates } = await db.query(`
      SELECT e.id AS "enrollmentId", e."studentId", e."courseId", e."packageId",
             sp."billingCurrency", sp."nextPaymentDate"
      FROM "Enrollment" e
      JOIN "StudentProfile" sp ON sp.id = e."studentId"
      WHERE e.status = 'ACTIVE'
        AND NOT EXISTS (SELECT 1 FROM "StudentSubscription" ss WHERE ss."studentId" = e."studentId")
      ORDER BY e."startedAt" DESC NULLS LAST
    `);

    let created = 0;
    const seen = new Set();
    for (const c of candidates) {
      if (seen.has(c.studentId)) continue; // one subscription per student in this pass
      seen.add(c.studentId);

      const currency = c.billingCurrency || 'USD';

      const pkgRes = c.packageId
        ? await db.query(`SELECT * FROM "Package" WHERE id = $1`, [c.packageId])
        : { rows: [] };
      const pkg = pkgRes.rows[0] || {};

      const batchRes = await db.query(
        `SELECT b.id, b."daysOfWeek" FROM "BatchStudent" bs JOIN "Batch" b ON b.id = bs."batchId"
         WHERE bs."studentId" = $1 ORDER BY bs."addedAt" ASC LIMIT 1`,
        [c.studentId],
      );
      const batch = batchRes.rows[0] || null;

      const faRes = await db.query(
        `SELECT id, "nextRunAt" FROM "StudentFeeAssignment" WHERE "studentId" = $1 ORDER BY "createdAt" DESC LIMIT 1`,
        [c.studentId],
      );
      const fa = faRes.rows[0] || null;

      // Derive the structure. Prefer the plan's typed values; fall back to the
      // class count for weekly, and a 60-minute class when nothing says otherwise.
      const durationMinutes = Number(pkg.durationMinutes) || 60;
      const classesPerMonth = Number(pkg.classesPerMonth) || 0;
      const weeklyClasses = Number(pkg.weeklyClasses) || (classesPerMonth ? Math.max(1, Math.round(classesPerMonth / 4)) : 2);
      const monthlyHours = Number(pkg.monthlyHours) || Math.round((durationMinutes / 60) * weeklyClasses * 4);
      const remaining = classesPerMonth || weeklyClasses * 4;
      const monthlyPrice = priceFor(pkg, currency);
      const rescheduleLimit = Number(pkg.rescheduleLimit) || 0;
      const familyDiscountPct = Number(pkg.familyDiscountPct) || 0;
      const renewalDate = fa?.nextRunAt || c.nextPaymentDate || null;

      if (DRY) {
        console.log(`  would create: student ${c.studentId} · ${weeklyClasses}×/wk · ${monthlyHours}h · ${currency} ${monthlyPrice ?? '—'}`);
        created += 1;
        continue;
      }

      await db.query(
        `INSERT INTO "StudentSubscription"
          (id, "studentId", "enrollmentId", "courseId", "modelId", "pricingMode", "planId",
           currency, "monthlyPrice", "durationMinutes", "weeklyClasses", "monthlyHours",
           "billingCycle", "startDate", "renewalDate", "remainingClasses", "completedClasses",
           "rescheduleCounter", "rescheduleLimit", "familyDiscountPct", "batchId", "feeAssignmentId",
           status, "createdAt", "updatedAt")
         VALUES
          (gen_random_uuid(), $1, $2, $3, $4, 'FIXED_MONTHLY', $5,
           $6, $7, $8, $9, $10,
           'MONTHLY', now(), $11, $12, 0,
           0, $13, $14, $15, $16,
           'ACTIVE', now(), now())`,
        [
          c.studentId, c.enrollmentId, c.courseId, monthlyModelId, c.packageId ?? null,
          currency, monthlyPrice, durationMinutes, weeklyClasses, monthlyHours,
          renewalDate, remaining, rescheduleLimit, familyDiscountPct,
          batch?.id ?? null, fa?.id ?? null,
        ],
      );
      created += 1;
    }

    console.log(`\n${DRY ? '[dry] ' : ''}${created} student subscription(s) ${DRY ? 'would be' : ''} created (${candidates.length} candidate rows).`);
  } finally {
    await db.end();
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
