import { Module } from '@nestjs/common';

import { EmailsModule } from '../emails/emails.module';
import { NotificationsModule } from '../notifications/notifications.module';

import { DashboardController } from './dashboard.controller';
import { DashboardWidgetsController } from './widgets.controller';
import { AnnouncementsController } from './announcements.controller';
import { ParentLinksController } from './parent-links.controller';

import { SuperAdminDashboardService } from './super-admin.service';
import { AdminOpsDashboardService } from './admin-ops.service';
import { CoachDashboardService } from './coach.service';
import { TeacherDashboardService } from './teacher-dash.service';
import { StudentDashboardService } from './student-dash.service';
import { ParentDashboardService } from './parent-dash.service';
import { DashboardCommonService } from './common.service';
import { WidgetsService } from './widgets.service';
import { AnnouncementsService } from './announcements.service';
import { ParentLinksService } from './parent-links.service';

@Module({
  imports: [NotificationsModule, EmailsModule],
  controllers: [
    DashboardController,
    DashboardWidgetsController,
    AnnouncementsController,
    ParentLinksController,
  ],
  providers: [
    SuperAdminDashboardService,
    AdminOpsDashboardService,
    CoachDashboardService,
    TeacherDashboardService,
    StudentDashboardService,
    ParentDashboardService,
    DashboardCommonService,
    WidgetsService,
    AnnouncementsService,
    ParentLinksService,
  ],
})
export class DashboardModule {}
