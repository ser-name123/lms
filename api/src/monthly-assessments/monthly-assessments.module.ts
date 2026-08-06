import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { EmailsModule } from '../emails/emails.module';
import { AssessmentTemplatesService } from './templates.service';
import { AssessmentConfigController } from './templates.controller';
import { MonthlyAssessmentsService } from './assessments.service';
import { MonthlyAssessmentsController } from './assessments.controller';

@Module({
  imports: [PrismaModule, NotificationsModule, EmailsModule],
  controllers: [AssessmentConfigController, MonthlyAssessmentsController],
  providers: [AssessmentTemplatesService, MonthlyAssessmentsService],
  // RankingsModule reads the same config (weightage, top-N) and the same grade
  // ladders, so the config service is exported rather than duplicated.
  exports: [AssessmentTemplatesService, MonthlyAssessmentsService],
})
export class MonthlyAssessmentsModule {}
