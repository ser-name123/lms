import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { EmailsModule } from '../emails/emails.module';
import { NotificationsModule } from '../notifications/notifications.module';
// Consuming a class from the student's subscription (remaining/completed counts)
// when its attendance locks.
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { EarningsModule } from '../earnings/earnings.module';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';

@Module({
  imports: [PrismaModule, EmailsModule, NotificationsModule, SubscriptionsModule, EarningsModule],
  controllers: [AttendanceController],
  providers: [AttendanceService],
})
export class AttendanceModule {}
