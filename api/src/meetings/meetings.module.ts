import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { LeadsModule } from '../leads/leads.module';
import { MeetingsService } from './meetings.service';
import { MeetingSeriesService } from './meeting-series.service';
import { MeetingReportsService } from './meeting-reports.service';
import { MeetingsController } from './meetings.controller';

/*
 * LeadsModule is imported only for its ZoomService, which it already exports
 * for the trial booking. Creating a second Zoom client here would mean two
 * token caches racing each other against a rate-limited endpoint.
 */
@Module({
  imports: [PrismaModule, NotificationsModule, LeadsModule],
  controllers: [MeetingsController],
  providers: [MeetingsService, MeetingSeriesService, MeetingReportsService],
  exports: [MeetingsService, MeetingReportsService],
})
export class MeetingsModule {}
