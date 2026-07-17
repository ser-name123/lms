import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { EmailsModule } from '../emails/emails.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TeacherManagementController } from './teacher-management.controller';
import { TeacherManagementService } from './teacher-management.service';

@Module({
  imports: [PrismaModule, EmailsModule, NotificationsModule],
  controllers: [TeacherManagementController],
  providers: [TeacherManagementService],
  exports: [TeacherManagementService],
})
export class TeacherManagementModule {}
