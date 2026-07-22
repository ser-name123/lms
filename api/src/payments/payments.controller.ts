import {
  BadRequestException,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { ApiExcludeEndpoint, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { PaymentsService } from './payments.service';
import { StripeService } from './stripe.service';
import { CurrentUser, Public, Roles, type AuthUser } from '../auth/decorators';
import { Role } from '../generated/prisma/enums';

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly stripe: StripeService,
  ) {}

  @Get('config')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH, Role.STUDENT)
  @ApiOperation({ summary: 'Publishable key and whether online payment is available' })
  config() {
    return this.payments.config();
  }

  @Post('invoices/:invoiceId/intent')
  @Roles(Role.STUDENT, Role.ADMIN, Role.SUPERVISOR)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Start a card payment for what is owed on an invoice' })
  createIntent(
    @CurrentUser() user: AuthUser,
    @Param('invoiceId') invoiceId: string,
  ) {
    /*
     * No amount is accepted from the caller. It is read off the invoice, so a
     * request cannot settle a 500 bill by offering 1.
     */
    return this.payments.createIntentForInvoice(invoiceId, {
      id: user.id,
      role: user.role,
    });
  }

  /*
   * Stripe's callback. Public because Stripe has no account here — the
   * signature is what makes it trustworthy, and an unsigned or mis-signed body
   * is rejected before anything is read out of it.
   *
   * Excluded from Swagger: it is not an endpoint anyone should call by hand,
   * and publishing it invites exactly that.
   */
  @Post('webhook')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  async webhook(
    @Req() req: Request,
    @Headers('stripe-signature') signature?: string,
  ) {
    if (!signature) throw new BadRequestException('Missing stripe-signature header');

    const raw = (req as Request & { body: Buffer }).body;
    if (!Buffer.isBuffer(raw)) {
      // Would mean the raw-body middleware for this route stopped applying;
      // every signature check would fail and the reason would be invisible.
      throw new BadRequestException('Webhook body was parsed before verification');
    }

    let event;
    try {
      event = this.stripe.constructEvent(raw, signature);
    } catch (e) {
      throw new BadRequestException(
        `Signature verification failed: ${e instanceof Error ? e.message : 'unknown'}`,
      );
    }

    return this.payments.handleEvent(event);
  }
}
