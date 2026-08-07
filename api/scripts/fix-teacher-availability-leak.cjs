/*
 * One-off data repair: TR-00001's fabricated 24/7 availability.
 *
 * TeacherProfile 2ed78957 ("Master Teacher", TR-00001) carried availability of
 * all seven days 00:00-23:59 with availabilityApproved = true. That was never a
 * real schedule — it is byte-for-byte the WIDE constant from
 * smoke-class-reschedule.cjs, which used to overwrite the first teacher in the
 * table and restore it afterwards. A crashed run skipped the restore, and every
 * later run then captured the corrupted value as its "original" and wrote it
 * back. The smoke was fixed on 2026-08-05 to create its own fixture, but the
 * leaked value stayed in the database.
 *
 * Consequences while it stood:
 *   - the academy's busiest teacher was offered for trial and enrolment slots
 *     at every hour of every day, including 3am and Sundays;
 *   - smoke-trial-teacher failed (16/21), because the merged-availability
 *     search kept picking this teacher over the two the test creates.
 *
 * The replacement is NOT a guess. It is read off their 1398 real non-cancelled
 * classes, which fall into exactly two start times and five weekdays:
 *
 *     Monday     18:00 - 21:00     426 classes
 *     Tuesday    20:00 - 21:00      40
 *     Wednesday  18:00 - 21:00     457
 *     Thursday   20:00 - 21:00      43
 *     Friday     18:00 - 21:00     432
 *     (nothing on Saturday or Sunday)
 *
 * Deliberately not widened. Availability is a statement of willingness and this
 * is only evidence of what they have actually taught — widening it would be the
 * same kind of invention the leak was. If they will take more, that is one edit
 * on the availability screen.
 *
 * timeZone is set to NULL alongside. It held 'Asia/Kolkata', and it is the only
 * non-null timeZone in the table: both readers do `timeZone || 'UTC'`, batch
 * startTime and ClassSession.startsAt are stamped as UTC wall-clock, the trial
 * slot API reports `timeZone: 'UTC'`, and the only other teacher with
 * availability has it null. Left as Asia/Kolkata, these hours would be read
 * 5h30m away from the classes they describe.
 *
 * availabilityApproved stays true: the new windows are a strict subset of the
 * 24/7 that was already approved, so this can only ever offer them for less.
 *
 * Idempotent — safe to re-run; it reports "already correct" and changes nothing.
 *
 *   node scripts/fix-teacher-availability-leak.cjs          # apply
 *   node scripts/fix-teacher-availability-leak.cjs --dry    # show, change nothing
 */
require('dotenv/config');
const { Client } = require('pg');

const TEACHER_PROFILE_ID = '2ed78957-5721-400d-a1f7-af0dfd175681';
const DRY = process.argv.includes('--dry');

/** Derived from the class history above. Times are UTC wall-clock. */
const AVAILABILITY = {
  Monday: [{ from: '18:00', to: '21:00' }],
  Tuesday: [{ from: '20:00', to: '21:00' }],
  Wednesday: [{ from: '18:00', to: '21:00' }],
  Thursday: [{ from: '20:00', to: '21:00' }],
  Friday: [{ from: '18:00', to: '21:00' }],
};

/*
 * Order-independent compare. Postgres `jsonb` does not preserve key order, so
 * comparing JSON.stringify output against an object literal reports a
 * difference that is not there — and the re-run then falls through to the
 * "refusing to overwrite" branch and exits 1, which reads like a failure.
 */
function sameSchedule(a, b) {
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  const ka = Object.keys(a).sort();
  const kb = Object.keys(b).sort();
  if (ka.length !== kb.length || ka.some((k, i) => k !== kb[i])) return false;
  return ka.every((day) => {
    const wa = a[day];
    const wb = b[day];
    if (!Array.isArray(wa) || !Array.isArray(wb) || wa.length !== wb.length) return false;
    return wa.every((w, i) => w?.from === wb[i]?.from && w?.to === wb[i]?.to);
  });
}

/** The fabricated shape, so we only ever overwrite that and never a real one. */
function isLeakedWide(availability) {
  if (!availability || typeof availability !== 'object') return false;
  const days = Object.keys(availability);
  if (days.length !== 7) return false;
  return days.every((d) => {
    const w = availability[d];
    return (
      Array.isArray(w) && w.length === 1 && w[0]?.from === '00:00' && w[0]?.to === '23:59'
    );
  });
}

(async () => {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  try {
    const t = (await db.query(
      `SELECT tp.id, tp."teacherCode", tp.availability, tp."timeZone",
              tp."availabilityApproved", u.email
         FROM "TeacherProfile" tp JOIN "User" u ON u.id = tp."userId"
        WHERE tp.id = $1`, [TEACHER_PROFILE_ID])).rows[0];

    if (!t) {
      console.log('That teacher profile is not in this database — nothing to do.');
      return;
    }
    console.log(`${t.teacherCode} · ${t.email}`);
    console.log(`  current timeZone : ${t.timeZone ?? '(null)'}`);
    console.log(`  current hours    : ${JSON.stringify(t.availability)}`);

    if (sameSchedule(t.availability, AVAILABILITY) && !t.timeZone) {
      console.log('\nAlready repaired — nothing to change.');
      return;
    }

    /*
     * Refuse if it is not the leaked shape. If somebody has since set a real
     * schedule by hand, overwriting it with a script would be a second version
     * of the same mistake.
     */
    if (!isLeakedWide(t.availability)) {
      console.log('\nThis is NOT the leaked 24/7 shape — refusing to overwrite a real schedule.');
      console.log('If it still needs changing, do it on the availability screen.');
      process.exitCode = 1;
      return;
    }

    console.log(`\n  new timeZone     : (null)  → read as UTC, like every other teacher`);
    console.log(`  new hours        : ${JSON.stringify(AVAILABILITY)}`);

    if (DRY) {
      console.log('\n--dry: nothing was written.');
      return;
    }

    await db.query(
      `UPDATE "TeacherProfile"
          SET availability = $2, "timeZone" = NULL, "availabilitySubmittedAt" = now()
        WHERE id = $1`,
      [TEACHER_PROFILE_ID, JSON.stringify(AVAILABILITY)],
    );
    console.log('\nDone. availabilityApproved left as-is — the new hours are a subset of what was approved.');
  } finally {
    await db.end();
  }
})();
