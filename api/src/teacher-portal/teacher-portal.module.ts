import { Module } from '@nestjs/common';
import { TeacherPortalService } from './teacher-portal.service';
import { TeacherPortalController } from './teacher-portal.controller';

@Module({
  providers: [TeacherPortalService],
  controllers: [TeacherPortalController],
  exports: [TeacherPortalService],
})
export class TeacherPortalModule {}
