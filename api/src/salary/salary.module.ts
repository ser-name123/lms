import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { LeavesModule } from '../leaves/leaves.module';
import { SalaryService } from './salary.service';
import { SalaryController } from './salary.controller';
import { WiseService } from './wise.service';

@Module({
  // LeavesModule for §9.3 — unpaid leave deducted at calculation time. The
  // dependency runs one way only: leaves never imports salary.
  imports: [PrismaModule, NotificationsModule, LeavesModule],
  controllers: [SalaryController],
  providers: [SalaryService, WiseService],
  exports: [SalaryService],
})
export class SalaryModule {}
