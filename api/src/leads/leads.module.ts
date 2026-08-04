import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { EmailsModule } from '../emails/emails.module';
import { NotificationsModule } from '../notifications/notifications.module';
// Conversion raises the student's first invoice through the finance module's
// own numbering rather than minting invoice numbers of its own.
import { FinanceModule } from '../finance/finance.module';
// Conversion provisions the student's batch, schedule, fee assignment and stored
// subscription record through the subscriptions module.
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { EarningsModule } from '../earnings/earnings.module';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';
import { LeadAvailabilityService } from './availability.service';
import { ZoomService } from './zoom.service';

@Module({
  imports: [PrismaModule, EmailsModule, NotificationsModule, FinanceModule, SubscriptionsModule, EarningsModule],
  controllers: [LeadsController],
  providers: [LeadsService, LeadAvailabilityService, ZoomService],
  // Settings reads Zoom's configured state for its integrations panel.
  exports: [ZoomService],
})
export class LeadsModule {}
