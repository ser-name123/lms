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
   * Stripe redelivers on timeouts, non-2xx replies and manual retries, and two
   * deliveries of one payment_intent.succeeded must not take the money twice.
   *
   * Two locks, because one is not enough. The event row stops a repeat of work
   * that COMPLETED. It cannot stop a repeat of work that failed halfway,
   * because the row is written before the handler runs — so the money-level
   * guard is the PaymentIntent id already being on a Payment row, checked in
   * onPaymentSucceeded. The first makes retries cheap; the second makes them
   * safe.
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
      /*
       * The row exists, but that alone does not mean the work was done.
       *
       * This used to return `duplicate` for any repeat delivery. The row is
       * written BEFORE the handler runs, so a handler that failed left the row
       * behind and Stripe's retry — the thing that exists to rescue exactly
       * that case — was answered "already handled, thanks". A blip while
       * recording a payment meant the family was charged, the invoice stayed
       * unpaid, and we reported success. Proved with a failing event: delivery
       * one 400, delivery two 200 duplicate, row still handled=false.
       *
       * So only a row that actually completed is a duplicate. An unfinished one
       * is retried, which is safe because onPaymentSucceeded refuses to book a
       * PaymentIntent it has already booked.
       */
      const existing = await this.prisma.stripeWebhookEvent.findUnique({
        where: { id: event.id },
        select: { handled: true },
      });
      if (existing?.handled) {
        this.logger.log(`Ignoring duplicate delivery of ${event.id} (${event.type})`);
        return { status: 'duplicate' };
      }
      this.logger.warn(
        `Retrying ${event.id} (${event.type}) — a previous delivery did not complete`,
      );
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
      // Rethrow so the controller answers non-2xx and Stripe retries. The row
      // stays handled=false, which is what lets the retry re-run the handler
      // instead of being dismissed as a duplicate.
      throw e;
    }
  }

  private async onPaymentSucceeded(intent: Stripe.PaymentIntent): Promise<string | null> {
    const invoiceId = intent.metadata?.invoiceId;
    if (!invoiceId) {
      this.logger.warn(`PaymentIntent ${intent.id} carries no invoiceId — ignored`);
      return null;
    }

    /*
     * The real guard against taking the money twice.
     *
     * The event row stops a repeat delivery, but it is written before the
     * handler runs, so it cannot prove the payment was booked — and a retry of
     * an unfinished event now genuinely re-runs this method. The PaymentIntent
     * id is what Stripe charged, so a Payment already carrying it means this
     * money is already on the invoice, however many times we arrive here.
     */
    const already = await this.prisma.payment.findFirst({
      where: { reference: intent.id, status: 'SUCCEEDED' },
      select: { id: true },
    });
    if (already) {
      this.logger.log(`${intent.id} is already recorded on invoice ${invoiceId}`);
      return invoiceId;
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
     * A cancelled or void invoice can never accept this payment, so retrying is
     * pointless — recorded and reported as handled rather than left for Stripe
     * to redeliver for three days. It needs a human: money was taken against an
     * invoice that was withdrawn, and that is a refund, not a retry.
     */
    if (
      invoice.status === InvoiceStatus.CANCELLED ||
      invoice.status === InvoiceStatus.VOID
    ) {
      this.logger.error(
        `${intent.id} paid ${invoice.status} invoice ${invoiceId} — needs a refund, not a retry`,
      );
      return invoiceId;
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

  async verifyIntent(paymentIntentId: string): Promise<{ status: string; invoiceId?: string }> {
    const intent = await this.stripe.retrievePaymentIntent(paymentIntentId);
    if (intent.status !== 'succeeded') {
      return { status: intent.status };
    }

    const invoiceId = await this.onPaymentSucceeded(intent);
    return { status: 'succeeded', invoiceId: invoiceId ?? undefined };
  }
}
