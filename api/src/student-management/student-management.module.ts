import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { EmailsModule } from '../emails/emails.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { StudentManagementController } from './student-management.controller';
import { StudentManagementService } from './student-management.service';

@Module({
  imports: [PrismaModule, EmailsModule, NotificationsModule],
  controllers: [StudentManagementController],
  providers: [StudentManagementService],
  exports: [StudentManagementService],
})
export class StudentManagementModule {}
