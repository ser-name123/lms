import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type Stripe from 'stripe';

import { PrismaService } from '../prisma/prisma.service';
import { StripeService } from './stripe.service';
import { BillingService } from '../finance/billing.service';
import { InvoiceStatus, Role } from '../generated/prisma/enums';
import { round2 } from '../finance/finance.config';

/*
 * Taking money for an invoice.
 *
 * Two rules shape everything here:
 *
 *  1. The amount is read from the invoice on the server. The browser says WHICH
 *     invoice, never HOW MUCH — otherwise a caller can pay a 500 bill with 1.
 *
 *  2. Only a verified webhook marks an invoice paid. The browser gets told the
 *     card succeeded, but the browser can lie, close, or never come back; the
 *     webhook is signed by Stripe and retried until we accept it. Both funnel
 *     into BillingService.recordPayment, which is the only writer of paidAmount,
 *     Receipts and invoice status.
 */

/** Currencies Stripe charges without a decimal part — none we sell in, but the
 *  conversion must not silently assume 100 if that ever changes. */
const ZERO_DECIMAL = new Set(['JPY', 'KRW', 'VND']);

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeService,
    private readonly billing: BillingService,
  ) {}

  /** What the client needs to mount Stripe.js, and whether it is worth trying. */
  async config() {
    const cfg = await this.stripe.publicConfig();
    return {
      configured: cfg.configured,
      publishableKey: cfg.publishableKey,
      webhooksConfigured: cfg.hasWebhookSecret,
      mode: cfg.mode,
    };
  }

  private toMinor(amount: number, currency: string): number {
    if (ZERO_DECIMAL.has(currency.toUpperCase())) return Math.round(amount);
    return Math.round(amount * 100);
  }

  /**
   * A PaymentIntent for what is still owed on this invoice.
   *
   * Re-callable: an abandoned checkout leaves an intent behind, and the same
   * invoice re-opened reuses it rather than stacking up intents Stripe will
   * chase for the same money.
   */
  async createIntentForInvoice(
    invoiceId: string,
    actor: { id: string; role: Role },
  ) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        student: {
          select: {
            id: true,
            stripeCustomerId: true,
            user: { select: { id: true, email: true, firstName: true, lastName: true } },
          },
        },
      },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');

    // A student may only pay their own. Staff may raise a link for anyone.
    if (actor.role === Role.STUDENT && invoice.student?.user?.id !== actor.id) {
      throw new NotFoundException('Invoice not found');
    }
    if (
      invoice.status === InvoiceStatus.CANCELLED ||
      invoice.status === InvoiceStatus.VOID
    ) {
      throw new BadRequestException('This invoice is not payable.');
    }

    const balance = round2(Number(invoice.amount) - Number(invoice.paidAmount));
    if (balance <= 0) {
      throw new BadRequestException('This invoice has nothing left to pay.');
    }

    // Reuse the family's Stripe customer, or make one on first payment.
    let customerId = invoice.student?.stripeCustomerId ?? null;
    if (!customerId && invoice.student) {
      const created = await this.stripe.createCustomer({
        email: invoice.student.user?.email ?? undefined,
        name: invoice.student.user
          ? `${invoice.student.user.firstName} ${invoice.student.user.lastName}`
          : undefined,
        metadata: { studentProfileId: invoice.student.id },
      });
      customerId = created.id;
      await this.prisma.studentProfile.update({
        where: { id: invoice.student.id },
        data: { stripeCustomerId: customerId },
      });
    }

    const intent = await this.stripe.createPaymentIntent({
      amount: this.toMinor(balance, invoice.currency),
      currency: invoice.currency.toLowerCase(),
      customer: customerId ?? undefined,
      automatic_payment_methods: { enabled: true },
      /*
       * The webhook arrives with nothing but the intent, so the invoice id has
       * to travel on it. Without this the only way back to the invoice would be
       * matching on amount, which two families owing the same fee would break.
       */
      metadata: {
        invoiceId: invoice.id,
        invoiceNumber: invoice.number,
        studentProfileId: invoice.student?.id ?? '',
      },
      description: `Invoice ${invoice.number}`,
    });

    return {
      clientSecret: intent.client_secret,
      publishableKey: (await this.stripe.publicConfig()).publishableKey,
      amount: balance,
      currency: invoice.currency,
      invoiceNumber: invoice.number,
    };
  }

  // ── Webhook ────────────────────────────────────────────────────────────────

  /**
   * Handles one Stripe event, exactly once.
   *
   * The insert of the event row is the lock. Stripe redelivers on timeouts,
   * non-2xx replies and manual retries, and two deliveries of one
   * payment_intent.succeeded would take the money twice on our books. A
   * duplicate loses the race on the primary key and returns `duplicate` —
   * the caller answers 200, because retrying will never help.
   */
  async handleEvent(event: Stripe.Event): Promise<{ status: string }> {
    try {
      await this.prisma.stripeWebhookEvent.create({
        data: {
          id: event.id,
          type: event.type,
          payload: event.data.object as never,
        },
      });
    } catch {
      this.logger.log(`Ignoring duplicate delivery of ${event.id} (${event.type})`);
      return { status: 'duplicate' };
    }

    try {
      let invoiceId: string | null = null;
      switch (event.type) {
        case 'payment_intent.succeeded':
          invoiceId = await this.onPaymentSucceeded(
            event.data.object as Stripe.PaymentIntent,
          );
          break;
        case 'payment_intent.payment_failed':
          invoiceId = await this.onPaymentFailed(
            event.data.object as Stripe.PaymentIntent,
          );
          break;
        default:
          // Recorded above, deliberately not acted on. Answering 200 stops
          // Stripe retrying an event we will never do anything with.
          break;
      }
      await this.prisma.stripeWebhookEvent.update({
        where: { id: event.id },
        data: { handled: true, processedAt: new Date(), invoiceId },
      });
      return { status: 'handled' };
    } catch (e) {
      const message = e instanceof Error ? e.message : 'handler failed';
      this.logger.error(`Webhook ${event.id} (${event.type}) failed: ${message}`);
      await this.prisma.stripeWebhookEvent.update({
        where: { id: event.id },
        data: { error: message, processedAt: new Date() },
      });
      // Rethrow so the controller answers 5xx and Stripe retries: the event is
      // recorded as unhandled, and a retry re-runs it rather than being
      // swallowed as a duplicate.
      throw e;
    }
  }

  private async onPaymentSucceeded(intent: Stripe.PaymentIntent): Promise<string | null> {
    const invoiceId = intent.metadata?.invoiceId;
    if (!invoiceId) {
      this.logger.warn(`PaymentIntent ${intent.id} carries no invoiceId — ignored`);
      return null;
    }

    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { id: true, amount: true, paidAmount: true, currency: true, status: true },
    });
    if (!invoice) {
      this.logger.error(`PaymentIntent ${intent.id} names unknown invoice ${invoiceId}`);
      return null;
    }

    /*
     * The amount comes off the intent Stripe actually charged, not off the
     * invoice: if the balance changed between checkout and settlement (a staff
     * member recorded a cash payment meanwhile) we must book what was taken,
     * and recordPayment will reject anything above the remaining balance rather
     * than overpay it.
     */
    const paid = ZERO_DECIMAL.has(invoice.currency.toUpperCase())
      ? intent.amount_received
      : intent.amount_received / 100;
    const balance = round2(Number(invoice.amount) - Number(invoice.paidAmount));
    if (balance <= 0) {
      this.logger.warn(
        `Invoice ${invoiceId} was already settled when ${intent.id} arrived — no double booking`,
      );
      return invoiceId;
    }

    await this.billing.recordPayment(
      invoiceId,
      {
        amount: round2(Math.min(paid, balance)),
        method: 'STRIPE',
        reference: intent.id,
        notes: 'Recorded automatically from a verified Stripe webhook.',
      },
      { name: 'Stripe' },
    );
    this.logger.log(`Invoice ${invoiceId} settled by ${intent.id}`);
    return invoiceId;
  }

  private async onPaymentFailed(intent: Stripe.PaymentIntent): Promise<string | null> {
    const invoiceId = intent.metadata?.invoiceId ?? null;
    // Nothing on the invoice changes — it was never paid. Recorded so a family
    // saying "my card was declined" can be checked rather than taken on trust.
    this.logger.warn(
      `Payment failed for invoice ${invoiceId ?? 'unknown'}: ` +
        `${intent.last_payment_error?.message ?? 'no reason given'}`,
    );
    return invoiceId;
  }
}
