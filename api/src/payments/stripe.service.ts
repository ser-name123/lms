import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import Stripe from 'stripe';

/*
 * The Stripe client, and the one place that decides whether Stripe is usable.
 *
 * Keys live in the environment, not in SystemSetting: they are secrets, and the
 * settings table is read by screens and dumped by the export script.
 *
 * When the keys are absent — a fresh clone, CI, a developer machine — this does
 * NOT quietly no-op. A payment path that silently does nothing is what the
 * removed fake checkout did, and it told families their money had arrived.
 * Every method here refuses loudly instead, and `configured` lets a screen ask
 * first so it can say so before taking anyone through a checkout.
 */

@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
  private readonly client: Stripe | null;

  /** Stripe expects the smallest unit: 12.34 USD is 1234. */
  static toMinorUnits(amount: number): number {
    return Math.round(Number(amount) * 100);
  }

  static fromMinorUnits(minor: number): number {
    return Math.round(Number(minor)) / 100;
  }

  constructor() {
    const key = process.env.STRIPE_SECRET_KEY?.trim();
    if (key) {
      this.client = new Stripe(key);
      this.logger.log(
        `Stripe enabled (${key.startsWith('sk_live') ? 'LIVE' : 'test'} key)`,
      );
    } else {
      this.client = null;
      this.logger.warn('STRIPE_SECRET_KEY is not set — online payments are disabled');
    }
  }

  get configured(): boolean {
    return this.client !== null;
  }

  /** True once a webhook secret exists; without it no event can be trusted. */
  get webhooksConfigured(): boolean {
    return Boolean(process.env.STRIPE_WEBHOOK_SECRET?.trim());
  }

  get publishableKey(): string | null {
    return process.env.STRIPE_PUBLISHABLE_KEY?.trim() || null;
  }

  private require(): Stripe {
    if (!this.client) {
      throw new ServiceUnavailableException(
        'Online payments are not configured on this server.',
      );
    }
    return this.client;
  }

  /**
   * Verifies a webhook came from Stripe and has not been altered.
   *
   * Anyone can POST our webhook URL; the signature is the only thing that makes
   * an event trustworthy, and it is checked against the RAW body — a parsed and
   * re-serialised body will not verify.
   */
  constructEvent(rawBody: Buffer | string, signature: string): Stripe.Event {
    const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
    if (!secret) {
      throw new ServiceUnavailableException('STRIPE_WEBHOOK_SECRET is not set.');
    }
    return Stripe.webhooks.constructEvent(rawBody, signature, secret);
  }

  async createCustomer(params: Stripe.CustomerCreateParams): Promise<Stripe.Customer> {
    return this.require().customers.create(params);
  }

  async createPaymentIntent(
    params: Stripe.PaymentIntentCreateParams,
  ): Promise<Stripe.PaymentIntent> {
    return this.require().paymentIntents.create(params);
  }

  async retrievePaymentIntent(id: string): Promise<Stripe.PaymentIntent> {
    return this.require().paymentIntents.retrieve(id);
  }

  async createRefund(params: Stripe.RefundCreateParams): Promise<Stripe.Refund> {
    return this.require().refunds.create(params);
  }
}
