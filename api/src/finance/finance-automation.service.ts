import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailsService } from '../emails/emails.service';
import { FinanceSettingsService } from './finance-settings.service';
import { BillingService } from './billing.service';
import { PayrollService } from './payroll.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { Role } from '../generated/prisma/enums';

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class FinanceAutomationService implements OnModuleInit {
  private readonly logger = new Logger(FinanceAutomationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly emails: EmailsService,
    private readonly settings: FinanceSettingsService,
    private readonly billing: BillingService,
    private readonly payroll: PayrollService,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  onModuleInit() {
    // Run shortly after boot, then daily. No @nestjs/schedule (project convention).
    setTimeout(() => this.runSweep().catch(() => undefined), 30_000).unref();
    setInterval(() => this.runSweep().catch(() => undefined), DAY_MS).unref();
  }

  async runSweep() {
    const cfg = await this.settings.getConfig();
    try {
      await this.markOverdue();
    } catch (e) {
      this.logger.warn(`overdue sweep failed: ${(e as Error).message}`);
    }
    // Start/resume subscription breaks BEFORE renewals: a break that should have
    // resumed today must be ACTIVE again before the renewal pass considers it,
    // and one starting today must flip to ON_BREAK so the renewal pass skips it.
    try {
      const { started, resumed } = await this.subscriptions.processBreaks(new Date());
      if (started || resumed) this.logger.log(`Breaks: ${started} started, ${resumed} resumed.`);
    } catch (e) {
      this.logger.warn(`break sweep failed: ${(e as Error).message}`);
    }
    if (cfg.autoInvoice) {
      try {
        await this.generateDueRecurring();
      } catch (e) {
        this.logger.warn(`recurring sweep failed: ${(e as Error).message}`);
      }
    }
    try {
      await this.sendDueReminders(cfg.reminderDaysBefore);
    } catch (e) {
      this.logger.warn(`reminder sweep failed: ${(e as Error).message}`);
    }
    if (new Date().getDate() === cfg.salaryDayOfMonth) {
      try {
        await this.generateMonthlyPayroll();
      } catch (e) {
        this.logger.warn(`payroll sweep failed: ${(e as Error).message}`);
      }
    }
  }

  /** Flip past-due unpaid invoices to OVERDUE and alert student + admins. */
  private async markOverdue() {
    const now = new Date();
    const due = await this.prisma.invoice.findMany({
      where: {
        dueAt: { lt: now },
        status: { in: ['SENT', 'PENDING', 'PARTIALLY_PAID'] as never },
      },
      select: {
        id: true,
        number: true,
        currency: true,
        amount: true,
        paidAmount: true,
        student: {
          select: {
            parentEmail: true,
            user: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
      take: 500,
    });
    if (!due.length) return;

    await this.prisma.invoice.updateMany({
      where: { id: { in: due.map((d) => d.id) } },
      data: { status: 'OVERDUE' },
    });

    for (const inv of due) {
      const balance = Number(inv.amount) - Number(inv.paidAmount);
      const userId = inv.student?.user?.id;
      if (userId) {
        await this.notifications.createFor(userId, {
          type: 'INVOICE_OVERDUE',
          title: `Invoice ${inv.number} overdue`,
          body: `An outstanding balance of ${inv.currency} ${balance} is now overdue.`,
          link: '/student/invoices',
        });
      }
      if (inv.student?.parentEmail) {
        await this.emails
          .sendMail(
            inv.student.parentEmail,
            `Invoice ${inv.number} is overdue`,
            `Invoice ${inv.number} has an overdue balance of ${inv.currency} ${balance}. Please arrange payment at your earliest convenience.`,
          )
          .catch(() => undefined);
      }
    }
    await this.notifications.createForRoles([Role.ADMIN], {
      type: 'INVOICES_OVERDUE',
      title: 'Overdue invoices',
      body: `${due.length} invoice(s) became overdue.`,
      link: '/invoices',
    });
  }

  /** Mint invoices for anything due: subscription cycle renewals + generic fees. */
  private async generateDueRecurring() {
    const now = new Date();
    await this.renewSubscriptionCycles(now);
    await this.generateGenericRecurring(now);
  }

  /*
   * The 28-day subscription cycle-close + renewal (the spec's daily cron).
   *
   * Fires for every ACTIVE subscription whose cycle has ended (renewalDate passed)
   * OR whose class allowance has run out ("every 28 days OR when hours completed").
   * For each, in order: lock the closed cycle's classes, apply any queued
   * package/schedule change, generate the next 28-day schedule, raise the cycle
   * invoice, refill the counters and roll the renewal date + fee run 28 days on,
   * then notify the student, teacher and coach. Each student is isolated so one
   * failure never stops the rest.
   */
  private async renewSubscriptionCycles(now: Date) {
    const due = await this.prisma.studentSubscription.findMany({
      where: {
        status: 'ACTIVE',
        feeAssignmentId: { not: null },
        OR: [{ renewalDate: { not: null, lte: now } }, { remainingClasses: { lte: 0 } }],
      },
      select: { id: true, studentId: true, batchId: true, feeAssignmentId: true },
      take: 500,
    });
    let count = 0;
    for (const sub of due) {
      try {
        // 1. Close the old cycle — its classes become immutable.
        await this.subscriptions.lockClosedCycleClasses(sub.batchId, now);
        // 2. Apply any queued package/schedule change (takes effect this cycle).
        const applied = await this.subscriptions.applyNextCycleFor(sub.studentId).catch(() => null);
        if (applied?.applied?.length) {
          this.logger.log(`Applied queued change for student ${sub.studentId}: ${applied.applied.join('; ')}`);
        }
        // 3. Generate the next 28-day schedule (no-op if the queued change already did).
        await this.subscriptions.generateNextCycleForSubscription(sub.studentId);
        // 4. Raise the cycle invoice.
        const created = await this.billing.generateForAssignment(sub.feeAssignmentId!, now).catch(() => null);
        if (created) count++;
        // 5. Refill counters + roll renewalDate & fee nextRunAt 28 days forward.
        await this.subscriptions.refillCycle(sub.studentId);
        // 6. Notify student + teacher + coach.
        await this.subscriptions.notifyCycleRenewed(sub.studentId);
      } catch (e) {
        this.logger.warn(`Subscription cycle renewal failed for student ${sub.studentId}: ${(e as Error).message}`);
      }
    }
    if (count) this.logger.log(`Renewed ${count} subscription cycle(s).`);
  }

  /*
   * Generic recurring fee billing (non-subscription assignments) — the original
   * calendar-month path, left untouched. Subscription-linked assignments are
   * excluded; they renew on their own 28-day cadence above.
   */
  private async generateGenericRecurring(now: Date) {
    const subLinked = await this.prisma.studentSubscription.findMany({
      where: { status: 'ACTIVE', feeAssignmentId: { not: null } },
      select: { feeAssignmentId: true },
    });
    const excluded = subLinked.map((s) => s.feeAssignmentId!).filter(Boolean);
    const assignments = await this.prisma.studentFeeAssignment.findMany({
      where: {
        active: true,
        autoGenerate: true,
        nextRunAt: { not: null, lte: now },
        id: { notIn: excluded },
      },
      select: { id: true, nextRunAt: true },
      take: 500,
    });
    let count = 0;
    for (const a of assignments) {
      const created = await this.billing.generateForAssignment(a.id, a.nextRunAt ?? now).catch(() => null);
      if (created) count++;
    }
    if (count) this.logger.log(`Auto-generated ${count} recurring invoice(s).`);
  }

  /** Remind about invoices coming due within N days. */
  private async sendDueReminders(daysBefore: number) {
    const now = new Date();
    const windowEnd = new Date(now.getTime() + daysBefore * DAY_MS);
    const upcoming = await this.prisma.invoice.findMany({
      where: {
        dueAt: { gte: now, lte: windowEnd },
        status: { in: ['SENT', 'PENDING', 'PARTIALLY_PAID'] as never },
      },
      select: {
        number: true,
        currency: true,
        amount: true,
        paidAmount: true,
        dueAt: true,
        student: {
          select: {
            parentEmail: true,
            user: { select: { id: true } },
          },
        },
      },
      take: 500,
    });
    for (const inv of upcoming) {
      const balance = Number(inv.amount) - Number(inv.paidAmount);
      const userId = inv.student?.user?.id;
      if (userId) {
        await this.notifications.createFor(userId, {
          type: 'INVOICE_DUE_SOON',
          title: `Invoice ${inv.number} due soon`,
          body: `A payment of ${inv.currency} ${balance} is due by ${inv.dueAt?.toLocaleDateString('en-US')}.`,
          link: '/student/invoices',
        });
      }
      if (inv.student?.parentEmail) {
        await this.emails
          .sendMail(
            inv.student.parentEmail,
            `Reminder: invoice ${inv.number} due soon`,
            `This is a friendly reminder that invoice ${inv.number} (${inv.currency} ${balance}) is due by ${inv.dueAt?.toLocaleDateString('en-US')}.`,
          )
          .catch(() => undefined);
      }
    }
  }

  /** Generate the payroll run for the current month (idempotent per period). */
  private async generateMonthlyPayroll() {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    const { generatedCount } = await this.payroll.generate({
      billingPeriodStart: start.toISOString(),
      billingPeriodEnd: end.toISOString(),
    });
    if (generatedCount) {
      await this.notifications.createForRoles([Role.ADMIN], {
        type: 'PAYROLL_GENERATED',
        title: 'Payroll generated',
        body: `${generatedCount} payout(s) generated for ${start.toLocaleString('en-US', { month: 'long', year: 'numeric' })}. Review & approve.`,
        link: '/payouts',
      });
    }
  }
}
