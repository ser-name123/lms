import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { EmailsModule } from '../emails/emails.module';
import { TeacherRegistrationsController } from './teacher-registrations.controller';
import { TeacherRegistrationsService } from './teacher-registrations.service';

@Module({
  imports: [PrismaModule, EmailsModule],
  controllers: [TeacherRegistrationsController],
  providers: [TeacherRegistrationsService],
})
export class TeacherRegistrationsModule {}
