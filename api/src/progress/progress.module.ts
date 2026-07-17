import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { EmailsModule } from '../emails/emails.module';
import { StudentManagementModule } from '../student-management/student-management.module';
import { AssessmentsModule } from '../assessments/assessments.module';
import { ProgressController } from './progress.controller';
import { ProgressService } from './progress.service';
import { ProgressEngineService } from './progress-engine.service';
import { ProgressTeacherController } from './progress-teacher.controller';
import { ProgressTeacherService } from './progress-teacher.service';
import { ProgressStudentController } from './progress-student.controller';
import { ProgressStudentService } from './progress-student.service';
import { ProgressCoachController } from './progress-coach.controller';
import { ProgressCoachService } from './progress-coach.service';

@Module({
  imports: [
    PrismaModule,
    NotificationsModule,
    EmailsModule,
    StudentManagementModule,
    AssessmentsModule,
  ],
  controllers: [
    ProgressController,
    ProgressTeacherController,
    ProgressStudentController,
    ProgressCoachController,
  ],
  providers: [
    ProgressService,
    ProgressEngineService,
    ProgressTeacherService,
    ProgressStudentService,
    ProgressCoachService,
  ],
  exports: [ProgressEngineService, ProgressService],
})
export class ProgressModule {}
