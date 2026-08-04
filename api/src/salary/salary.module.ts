import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SalaryService } from './salary.service';
import { SalaryController } from './salary.controller';
import { WiseService } from './wise.service';

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [SalaryController],
  providers: [SalaryService, WiseService],
  exports: [SalaryService],
})
export class SalaryModule {}
