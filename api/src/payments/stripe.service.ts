import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import Stripe from 'stripe';

import { PrismaService } from '../prisma/prisma.service';

/*
 * The Stripe client, and the one place that decides whether Stripe is usable.
 *
 * Where the keys live: SystemSetting first, environment second. The admin
 * settings screen writes the setting, so keys can be rotated without a deploy
 * or shell access; the environment stays the fallback so a server can be
 * provisioned before anyone logs in. Same order as SMTP already uses.
 *
 * The secret key is never sent to a client. Reads return `hasSecretKey`
 * instead, and saving a blank key means "keep the existing one" so an admin can
 * change the publishable key without re-typing the secret — again matching the
 * SMTP screen.
 *
 * With no key configured, nothing here quietly no-ops. A payment path that
 * silently does nothing is exactly what the removed fake checkout did, and it
 * told families their money had arrived. Every call refuses loudly instead.
 */

const SETTING_KEY = 'STRIPE_CONFIG';

export interface StripeConfig {
  secretKey: string;
  publishableKey: string;
  webhookSecret: string;
}

@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);

  /** Rebuilt whenever the secret key changes, so a rotation takes effect at
   *  once rather than at the next restart. */
  private client: Stripe | null = null;
  private clientKey: string | null = null;

  constructor(private readonly prisma: PrismaService) {}

  /** Stripe expects the smallest unit: 12.34 USD is 1234. */
  static toMinorUnits(amount: number): number {
    return Math.round(Number(amount) * 100);
  }

  static fromMinorUnits(minor: number): number {
    return Math.round(Number(minor)) / 100;
  }

  // ── Config ─────────────────────────────────────────────────────────────────

  /** The live values, secret included. Never leaves the server. */
  async config(): Promise<StripeConfig> {
    const row = await this.prisma.systemSetting.findUnique({
      where: { key: SETTING_KEY },
    });
    let stored: Partial<StripeConfig> = {};
    if (row?.value) {
      try {
        stored = JSON.parse(row.value) as Partial<StripeConfig>;
      } catch {
        this.logger.error(`${SETTING_KEY} is not valid JSON — falling back to the environment`);
      }
    }
    const pick = (fromDb: string | undefined, fromEnv: string | undefined) =>
      (fromDb?.trim() || fromEnv?.trim() || '');

    return {
      secretKey: pick(stored.secretKey, process.env.STRIPE_SECRET_KEY),
      publishableKey: pick(stored.publishableKey, process.env.STRIPE_PUBLISHABLE_KEY),
      webhookSecret: pick(stored.webhookSecret, process.env.STRIPE_WEBHOOK_SECRET),
    };
  }

  /**
   * What an admin screen may see: whether each secret is set, never its value.
   *
   * `mode` is read off the key prefix rather than stored separately — one field
   * cannot then disagree with the other, and an admin who has pasted a live key
   * by mistake can see it at a glance.
   */
  async publicConfig() {
    const cfg = await this.config();
    return {
      configured: Boolean(cfg.secretKey),
      publishableKey: cfg.publishableKey || null,
      hasSecretKey: Boolean(cfg.secretKey),
      hasWebhookSecret: Boolean(cfg.webhookSecret),
      mode: cfg.secretKey.startsWith('sk_live')
        ? 'live'
        : cfg.secretKey
          ? 'test'
          : 'unset',
      // So the admin can register the endpoint without guessing the path.
      webhookPath: '/api/payments/webhook',
    };
  }

  /** Blank fields keep whatever is stored — see the note at the top. */
  async saveConfig(input: Partial<StripeConfig>): Promise<void> {
    const current = await this.config();
    const merged: StripeConfig = {
      secretKey: input.secretKey?.trim() || current.secretKey,
      publishableKey:
        input.publishableKey === undefined
          ? current.publishableKey
          : input.publishableKey.trim(),
      webhookSecret: input.webhookSecret?.trim() || current.webhookSecret,
    };
    await this.prisma.systemSetting.upsert({
      where: { key: SETTING_KEY },
      update: { value: JSON.stringify(merged) },
      create: { key: SETTING_KEY, value: JSON.stringify(merged) },
    });
    this.logger.log('Stripe configuration updated from the admin settings screen');
  }

  /**
   * Checks a key actually works, by asking Stripe who we are.
   *
   * A saved key that is wrong looks identical to a right one until a family is
   * halfway through a checkout, so the screen offers this before that happens.
   */
  async testConnection(): Promise<{
    ok: boolean;
    message: string;
    currencies?: string[];
  }> {
    const cfg = await this.config();
    if (!cfg.secretKey) {
      return { ok: false, message: 'No secret key is configured.' };
    }
    try {
      /*
       * The balance is the cheapest call that proves the key works, and it
       * happens to answer the question that actually matters here: which
       * currencies this account settles in. The academy sells in USD, AED and
       * GBP, and a key that cannot take dirhams is worth knowing about now
       * rather than when a family in Dubai is halfway through paying.
       */
      const balance = await new Stripe(cfg.secretKey).balance.retrieve();
      const currencies = [
        ...new Set(balance.available.map((b) => b.currency.toUpperCase())),
      ];
      return {
        ok: true,
        message: `Key accepted by Stripe (${cfg.secretKey.startsWith('sk_live') ? 'LIVE' : 'test'} mode).`,
        currencies,
      };
    } catch (e) {
      return {
        ok: false,
        message: e instanceof Error ? e.message : 'Stripe rejected the key.',
      };
    }
  }

  // ── Client ─────────────────────────────────────────────────────────────────

  async configured(): Promise<boolean> {
    return Boolean((await this.config()).secretKey);
  }

  private async require(): Promise<Stripe> {
    const { secretKey } = await this.config();
    if (!secretKey) {
      throw new ServiceUnavailableException(
        'Online payments are not configured. Add your Stripe keys in Settings.',
      );
    }
    if (!this.client || this.clientKey !== secretKey) {
      this.client = new Stripe(secretKey);
      this.clientKey = secretKey;
      this.logger.log(
        `Stripe client ready (${secretKey.startsWith('sk_live') ? 'LIVE' : 'test'} key)`,
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
  async constructEvent(rawBody: Buffer | string, signature: string): Promise<Stripe.Event> {
    const { webhookSecret } = await this.config();
    if (!webhookSecret) {
      throw new ServiceUnavailableException(
        'No Stripe webhook secret is configured, so no event can be trusted.',
      );
    }
    return Stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  }

  async createCustomer(params: Stripe.CustomerCreateParams): Promise<Stripe.Customer> {
    return (await this.require()).customers.create(params);
  }

  async createPaymentIntent(
    params: Stripe.PaymentIntentCreateParams,
  ): Promise<Stripe.PaymentIntent> {
    return (await this.require()).paymentIntents.create(params);
  }

  async retrievePaymentIntent(id: string): Promise<Stripe.PaymentIntent> {
    return (await this.require()).paymentIntents.retrieve(id);
  }

  async createRefund(params: Stripe.RefundCreateParams): Promise<Stripe.Refund> {
    return (await this.require()).refunds.create(params);
  }
}
