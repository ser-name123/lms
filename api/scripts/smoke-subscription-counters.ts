/*
 * Smoke test — Feature A (live class counters) + refill.
 *
 * Exercises the two new SubscriptionsService methods directly against the real
 * DB (no HTTP — the logic runs in in-process sweeps, not behind an endpoint):
 *   - consumeClassForSubscription: a locked, COMPLETED class decrements
 *     remainingClasses and increments completedClasses for each attending
 *     student; an EXCUSED attendee and a non-COMPLETED (cancelled) class do not.
 *   - refillCycle: a new billing cycle refills the allowance and rolls the
 *     renewal date to the fee assignment's next run.
 *
 * Run: npx tsx scripts/smoke-subscription-counters.ts   (needs DB env)
 */
import 'dotenv/config';
import { randomUUID } from 'crypto';
import { PrismaService } from '../src/prisma/prisma.service';
import { SubscriptionsService } from '../src/subscriptions/subscriptions.service';

const prisma = new PrismaService();
const svc = new SubscriptionsService(prisma as any, {} as any);

let pass = 0;
let fail = 0;
const fails: string[] = [];
const check = (name: string, cond: boolean, detail?: string) => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; fails.push(`${name}${detail ? ` — ${detail}` : ''}`); console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
};

const MARK = `zz-smoke-counters-${Date.now()}`;
const ids: Record<string, string> = {};

async function main() {
  // Built-in MONTHLY model (seeded on boot).
  const model = await prisma.subscriptionModel.findFirst({ where: { key: 'MONTHLY' } });
  if (!model) throw new Error('MONTHLY subscription model not seeded — is the app booted?');

  // Student + teacher users/profiles.
  const studentUser = await prisma.user.create({
    data: { email: `${MARK}-stu@x.io`, passwordHash: 'x', firstName: 'Count', lastName: 'Student', role: 'STUDENT' as any },
  });
  ids.studentUser = studentUser.id;
  const student = await prisma.studentProfile.create({
    data: { userId: studentUser.id, studentCode: `${MARK}-S1` },
  });
  ids.student = student.id;

  const teacherUser = await prisma.user.create({
    data: { email: `${MARK}-tea@x.io`, passwordHash: 'x', firstName: 'Count', lastName: 'Teacher', role: 'TEACHER' as any },
  });
  ids.teacherUser = teacherUser.id;
  const teacher = await prisma.teacherProfile.create({
    data: { userId: teacherUser.id, teacherCode: `${MARK}-T1` },
  });
  ids.teacher = teacher.id;

  const course = await prisma.course.create({
    data: { title: `${MARK} Course`, slug: `${MARK}-course`, price: 0 },
  });
  ids.course = course.id;

  const batch = await prisma.batch.create({
    data: { code: `${MARK}-B1`, name: `${MARK} Batch`, courseId: course.id, teacherId: teacher.id, status: 'ACTIVE' as any },
  });
  ids.batch = batch.id;

  // Active subscription: weekly 2 → monthly 8 classes.
  const sub = await prisma.studentSubscription.create({
    data: {
      studentId: student.id,
      modelId: model.id,
      pricingMode: 'FIXED_MONTHLY' as any,
      currency: 'AED',
      durationMinutes: 30,
      weeklyClasses: 2,
      monthlyHours: 4,
      remainingClasses: 8,
      completedClasses: 0,
      batchId: batch.id,
      status: 'ACTIVE' as any,
    },
  });
  ids.sub = sub.id;

  const mkClass = async (status: string) => {
    const c = await prisma.classSession.create({
      data: {
        courseId: course.id,
        teacherId: teacher.id,
        batchId: batch.id,
        title: `${MARK} class`,
        startsAt: new Date('2026-01-05T10:00:00Z'),
        endsAt: new Date('2026-01-05T10:30:00Z'),
        status: status as any,
      },
    });
    return c.id;
  };
  const mkAttendee = async (classId: string, status: string) =>
    prisma.classAttendee.create({ data: { id: randomUUID(), classId, studentId: student.id, status: status as any } });

  // 1) A COMPLETED class with a PRESENT attendee consumes one class.
  const c1 = await mkClass('COMPLETED');
  ids.c1 = c1;
  await mkAttendee(c1, 'PRESENT');
  await svc.consumeClassForSubscription(c1);
  let after = await prisma.studentSubscription.findUnique({ where: { id: sub.id } });
  check('PRESENT on COMPLETED class → remaining 8→7', after!.remainingClasses === 7, `got ${after!.remainingClasses}`);
  check('PRESENT on COMPLETED class → completed 0→1', after!.completedClasses === 1, `got ${after!.completedClasses}`);

  // 2) An EXCUSED attendee does not consume.
  const c2 = await mkClass('COMPLETED');
  ids.c2 = c2;
  await mkAttendee(c2, 'EXCUSED');
  await svc.consumeClassForSubscription(c2);
  after = await prisma.studentSubscription.findUnique({ where: { id: sub.id } });
  check('EXCUSED attendee → counters unchanged (still 7 / 1)', after!.remainingClasses === 7 && after!.completedClasses === 1, `got ${after!.remainingClasses}/${after!.completedClasses}`);

  // 3) A non-COMPLETED (CANCELLED) class does not consume even if PRESENT.
  const c3 = await mkClass('CANCELLED');
  ids.c3 = c3;
  await mkAttendee(c3, 'PRESENT');
  await svc.consumeClassForSubscription(c3);
  after = await prisma.studentSubscription.findUnique({ where: { id: sub.id } });
  check('CANCELLED class → counters unchanged (still 7 / 1)', after!.remainingClasses === 7 && after!.completedClasses === 1, `got ${after!.remainingClasses}/${after!.completedClasses}`);

  // 4) An ABSENT attendee on a held class still consumes the slot.
  const c4 = await mkClass('COMPLETED');
  ids.c4 = c4;
  await mkAttendee(c4, 'ABSENT');
  await svc.consumeClassForSubscription(c4);
  after = await prisma.studentSubscription.findUnique({ where: { id: sub.id } });
  check('ABSENT on held class → remaining 7→6', after!.remainingClasses === 6, `got ${after!.remainingClasses}`);
  check('ABSENT on held class → completed 1→2', after!.completedClasses === 2, `got ${after!.completedClasses}`);

  // 5) refillCycle: a new cycle refills to the monthly count and rolls renewal
  // to the fee assignment's next run.
  const plan = await prisma.feePlan.create({ data: { name: `${MARK} plan` } });
  ids.plan = plan.id;
  const nextRun = new Date('2026-03-01T00:00:00Z');
  const fa = await prisma.studentFeeAssignment.create({
    data: { studentId: student.id, planId: plan.id, nextRunAt: nextRun, active: true, autoGenerate: true },
  });
  ids.fa = fa.id;
  await prisma.studentSubscription.update({
    where: { id: sub.id },
    data: { remainingClasses: 0, completedClasses: 8, feeAssignmentId: fa.id, renewalDate: new Date('2026-02-01T00:00:00Z'), rescheduleCounter: 3 },
  });
  await svc.refillCycle(student.id);
  after = await prisma.studentSubscription.findUnique({ where: { id: sub.id } });
  check('refill → remaining back to monthly (weekly 2 → 8)', after!.remainingClasses === 8, `got ${after!.remainingClasses}`);
  check('refill → completed reset to 0', after!.completedClasses === 0, `got ${after!.completedClasses}`);
  // 28-day cadence: renewalDate rolls forward to a future date and the fee
  // assignment's next run is kept in step with it.
  check('refill → renewalDate rolled into the future', !!after!.renewalDate && after!.renewalDate > new Date(), `got ${after!.renewalDate?.toISOString()}`);
  const faAfter = await prisma.studentFeeAssignment.findUnique({ where: { id: fa.id } });
  check('refill → fee nextRunAt matches renewalDate', faAfter!.nextRunAt?.toISOString() === after!.renewalDate?.toISOString(), `fee ${faAfter!.nextRunAt?.toISOString()} vs ${after!.renewalDate?.toISOString()}`);
  check('refill → minutesUsed reset to 0', after!.minutesUsed === 0);
  // Flow-diagram: "Reset Cycle Counters: Hours, Classes, Reschedules Used".
  check('refill → rescheduleCounter reset to 0', after!.rescheduleCounter === 0, `got ${after!.rescheduleCounter}`);

  // 6) The depleted-subscription query (Feature E) would find a run-out sub.
  await prisma.studentSubscription.update({ where: { id: sub.id }, data: { remainingClasses: 0 } });
  const depleted = await prisma.studentSubscription.findFirst({
    where: { id: sub.id, status: 'ACTIVE', remainingClasses: { lte: 0 }, feeAssignmentId: { not: null } },
  });
  check('depleted sub is discoverable by the hours-completed sweep', !!depleted);
}

async function cleanup() {
  try {
    await prisma.classAttendee.deleteMany({ where: { studentId: ids.student } });
    for (const c of [ids.c1, ids.c2, ids.c3, ids.c4]) if (c) await prisma.classSession.delete({ where: { id: c } }).catch(() => undefined);
    if (ids.sub) await prisma.studentSubscription.delete({ where: { id: ids.sub } }).catch(() => undefined);
    if (ids.fa) await prisma.studentFeeAssignment.delete({ where: { id: ids.fa } }).catch(() => undefined);
    if (ids.plan) await prisma.feePlan.delete({ where: { id: ids.plan } }).catch(() => undefined);
    if (ids.batch) await prisma.batch.delete({ where: { id: ids.batch } }).catch(() => undefined);
    if (ids.student) await prisma.studentProfile.delete({ where: { id: ids.student } }).catch(() => undefined);
    if (ids.teacher) await prisma.teacherProfile.delete({ where: { id: ids.teacher } }).catch(() => undefined);
    if (ids.course) await prisma.course.delete({ where: { id: ids.course } }).catch(() => undefined);
    if (ids.studentUser) await prisma.user.delete({ where: { id: ids.studentUser } }).catch(() => undefined);
    if (ids.teacherUser) await prisma.user.delete({ where: { id: ids.teacherUser } }).catch(() => undefined);
  } catch (e) {
    console.log('cleanup warning:', (e as Error).message);
  }
}

main()
  .catch((e) => { fail++; fails.push(`threw: ${e.message}`); console.error(e); })
  .finally(async () => {
    await cleanup();
    await prisma.$disconnect();
    console.log(`\n${pass} passed, ${fail} failed`);
    if (fails.length) { console.log('FAILURES:\n - ' + fails.join('\n - ')); process.exit(1); }
  });
