import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { LeavesController } from './leaves.controller';
import { LeavesService } from './leaves.service';
import { LeaveImpactService } from './leave-impact.service';
import { LeaveReportsService } from './leave-reports.service';

/*
 * Module 9 — Employee Leave & Teacher Unavailability.
 *
 * SubscriptionsModule is imported for §9.5 option 1: pausing a student's
 * classes and pushing their billing cycle out is the same arithmetic as a
 * student break, and it stays in one place rather than being reimplemented
 * here — a divergence there would quietly cost a family money.
 *
 * TeacherManagementModule is deliberately NOT imported any more. It provided
 * `cancelClassesForLeave`, which approval used to call; §9.5 replaces that with
 * the coach's per-student decision.
 */
@Module({
  imports: [PrismaModule, NotificationsModule, SubscriptionsModule],
  controllers: [LeavesController],
  providers: [LeavesService, LeaveImpactService, LeaveReportsService],
  exports: [LeavesService, LeaveImpactService],
})
export class LeavesModule {}
