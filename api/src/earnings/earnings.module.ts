import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { EarningsService } from './earnings.service';
import { EarningsController } from './earnings.controller';
import { AbsencesService } from './absences.service';
import { AbsencesController } from './absences.controller';

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [EarningsController, AbsencesController],
  providers: [EarningsService, AbsencesService],
  exports: [EarningsService],
})
export class EarningsModule {}
