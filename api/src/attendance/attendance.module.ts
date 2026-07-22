import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { EmailsModule } from '../emails/emails.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';

@Module({
  imports: [PrismaModule, EmailsModule, NotificationsModule],
  controllers: [AttendanceController],
  providers: [AttendanceService],
  // Exported so the subscription rollover can regenerate a batch's classes
  // through the same generator the attendance screens use, rather than growing
  // a second copy of the weekly-schedule logic that could drift from it.
  exports: [AttendanceService],
})
export class AttendanceModule {}
