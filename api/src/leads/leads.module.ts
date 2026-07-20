import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { EmailsModule } from '../emails/emails.module';
import { NotificationsModule } from '../notifications/notifications.module';
// Conversion raises the student's first invoice through the finance module's
// own numbering rather than minting invoice numbers of its own.
import { FinanceModule } from '../finance/finance.module';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';
import { LeadAvailabilityService } from './availability.service';
import { ZoomService } from './zoom.service';

@Module({
  imports: [PrismaModule, EmailsModule, NotificationsModule, FinanceModule],
  controllers: [LeadsController],
  providers: [LeadsService, LeadAvailabilityService, ZoomService],
  // Settings reads Zoom's configured state for its integrations panel.
  exports: [ZoomService],
})
export class LeadsModule {}
