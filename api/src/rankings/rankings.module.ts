import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { MonthlyAssessmentsModule } from '../monthly-assessments/monthly-assessments.module';
import { RankingsService } from './rankings.service';
import { RankingsController } from './rankings.controller';

/*
 * Depends on MonthlyAssessmentsModule and never the other way round — the
 * assessment side has no idea rankings exist. Auto-ranking runs as a sweep
 * inside RankingsService for exactly that reason.
 */
@Module({
  imports: [PrismaModule, NotificationsModule, MonthlyAssessmentsModule],
  controllers: [RankingsController],
  providers: [RankingsService],
  exports: [RankingsService],
})
export class RankingsModule {}
