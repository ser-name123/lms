import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import { ApiExcludeEndpoint, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { PaymentsService } from './payments.service';
import { StripeService } from './stripe.service';
import { SaveStripeSettingsDto, VerifyPaymentIntentDto } from './dto';
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

  /*
   * The admin settings screen. ADMIN only, and deliberately narrower than the
   * rest of the finance module: these are the credentials that move money, not
   * a report about it.
   *
   * The response says WHETHER each secret is set, never what it is — a key that
   * can be read back off a screen is a key that leaks through a screenshot, a
   * support session or a browser cache.
   */
  @Get('settings')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Stripe configuration (secrets masked)' })
  settings() {
    return this.stripe.publicConfig();
  }

  @Put('settings')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Save Stripe keys. Blank fields keep the stored value.' })
  async saveSettings(@Body() dto: SaveStripeSettingsDto) {
    await this.stripe.saveConfig(dto);
    return this.stripe.publicConfig();
  }

  @Post('settings/test')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ask Stripe whether the saved key works' })
  testSettings() {
    // A wrong key looks exactly like a right one until a family is mid-checkout.
    return this.stripe.testConnection();
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
      event = await this.stripe.constructEvent(raw, signature);
    } catch (e) {
      throw new BadRequestException(
        `Signature verification failed: ${e instanceof Error ? e.message : 'unknown'}`,
      );
    }

    return this.payments.handleEvent(event);
  }

  @Post('verify-intent')
  @Roles(Role.STUDENT, Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify Stripe payment intent and mark invoice paid if succeeded' })
  verifyIntent(@Body() dto: VerifyPaymentIntentDto) {
    return this.payments.verifyIntent(dto.paymentIntentId);
  }
}
