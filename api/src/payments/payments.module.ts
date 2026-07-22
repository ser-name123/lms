import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { FinanceModule } from '../finance/finance.module';

import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { StripeService } from './stripe.service';

/*
 * Stripe lives in its own module, but it does not write to invoices itself: it
 * depends on FinanceModule for BillingService.recordPayment, which stays the
 * single writer of paidAmount, Receipts and invoice status. A second place that
 * settles invoices is precisely what the removed fake checkout was.
 */
@Module({
  imports: [PrismaModule, FinanceModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, StripeService],
  exports: [StripeService],
})
export class PaymentsModule {}
