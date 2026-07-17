import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { EmailsModule } from '../emails/emails.module';

import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';
import { FinanceSettingsService } from './finance-settings.service';

import { FeePlansController } from './fee-plans.controller';
import { FeePlansService } from './fee-plans.service';

import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';

import { DiscountsController } from './discounts.controller';
import { DiscountsService } from './discounts.service';

import { ScholarshipsController } from './scholarships.controller';
import { ScholarshipsService } from './scholarships.service';

import { RefundsController } from './refunds.controller';
import { RefundsService } from './refunds.service';

import { PayrollController } from './payroll.controller';
import { PayrollService } from './payroll.service';

import { FinanceStudentController } from './finance-student.controller';
import { FinanceStudentService } from './finance-student.service';

import { FinanceTeacherController } from './finance-teacher.controller';
import { FinanceTeacherService } from './finance-teacher.service';

import { FinanceAutomationService } from './finance-automation.service';

@Module({
  imports: [PrismaModule, NotificationsModule, EmailsModule],
  controllers: [
    FinanceController,
    FeePlansController,
    BillingController,
    DiscountsController,
    ScholarshipsController,
    RefundsController,
    PayrollController,
    FinanceStudentController,
    FinanceTeacherController,
  ],
  providers: [
    FinanceService,
    FinanceSettingsService,
    FeePlansService,
    BillingService,
    DiscountsService,
    ScholarshipsService,
    RefundsService,
    PayrollService,
    FinanceStudentService,
    FinanceTeacherService,
    FinanceAutomationService,
  ],
  exports: [FinanceSettingsService, BillingService, PayrollService],
})
export class FinanceModule {}
