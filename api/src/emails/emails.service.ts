import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class EmailsService {
  private readonly logger = new Logger(EmailsService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  private async getTransporter() {
    try {
      const configSetting = await this.prisma.systemSetting.findUnique({
        where: { key: 'SMTP_CONFIG' },
      });

      if (configSetting) {
        const custom = JSON.parse(configSetting.value);
        if (custom.user && custom.pass) {
          const transportOptions: any = {
            host: custom.host || 'smtp.gmail.com',
            port: Number(custom.port || 587),
            secure: custom.secure === true || custom.secure === 'true',
            auth: {
              user: custom.user,
              pass: custom.pass,
            },
          };
          // Gmail transporter helper
          if (custom.host && custom.host.includes('gmail.com')) {
            transportOptions.service = 'gmail';
          }
          return {
            transporter: nodemailer.createTransport(transportOptions),
            from: custom.from || custom.user,
          };
        }
      }
    } catch (err) {
      this.logger.error(
        'Failed to parse custom SMTP config from database, using env fallback',
        err,
      );
    }

    // Fallback to env variables
    const user = this.config.get<string>('SMTP_USER');
    const pass = this.config.get<string>('SMTP_PASS');
    const host = this.config.get<string>('SMTP_HOST');
    const from = this.config.get<string>('SMTP_FROM') || user;

    /* When SMTP_HOST is set (e.g. Brevo relay on port 2525 — Render blocks the
       standard 587/465 submission ports), connect to that host directly.
       Without it we default to Gmail, which keeps local dev working with just
       SMTP_USER/SMTP_PASS. */
    if (host) {
      return {
        transporter: nodemailer.createTransport({
          host,
          port: Number(this.config.get<string>('SMTP_PORT') || 2525),
          secure: this.config.get<string>('SMTP_SECURE') === 'true',
          auth: { user, pass },
        }),
        from,
      };
    }

    return {
      transporter: nodemailer.createTransport({
        service: 'gmail',
        auth: { user, pass },
      }),
      from,
    };
  }

  /** Reads the raw SMTP config (password included) — internal use only. */
  private async readSmtpConfig() {
    const configSetting = await this.prisma.systemSetting.findUnique({
      where: { key: 'SMTP_CONFIG' },
    });
    if (configSetting) {
      try {
        return JSON.parse(configSetting.value);
      } catch {
        // Fall back to env variables below
      }
    }
    return {
      host: this.config.get<string>('SMTP_HOST') || 'smtp.gmail.com',
      port: Number(this.config.get<string>('SMTP_PORT') || 587),
      user: this.config.get<string>('SMTP_USER') || '',
      pass: this.config.get<string>('SMTP_PASS') || '',
      from:
        this.config.get<string>('SMTP_FROM') ||
        this.config.get<string>('SMTP_USER') ||
        '',
      secure: this.config.get<string>('SMTP_SECURE') === 'true',
    };
  }

  /** The password is never sent to the client; `hasPass` signals it is set. */
  async getSmtpConfig() {
    const cfg = await this.readSmtpConfig();
    return { ...cfg, pass: '', hasPass: Boolean(cfg.pass) };
  }

  async saveSmtpConfig(config: any) {
    // A blank password on save means "keep the existing one", so admins can
    // edit other fields without re-typing (and without it being echoed back).
    const stored = { ...config };
    if (!config.pass) {
      const existing = await this.readSmtpConfig();
      stored.pass = existing.pass;
    }
    await this.prisma.systemSetting.upsert({
      where: { key: 'SMTP_CONFIG' },
      update: { value: JSON.stringify(stored) },
      create: { key: 'SMTP_CONFIG', value: JSON.stringify(stored) },
    });
    return { success: true };
  }

  async sendMail(
    to: string,
    subject: string,
    text: string,
    file?: Express.Multer.File,
    html?: string,
  ) {
    /*
     * This used to log only here, BEFORE the send, and most of the 31 callers
     * end in `.catch(() => undefined)`. So a rejected message and a delivered
     * one produced exactly the same single line, and "email is not arriving"
     * left no trace anywhere to look at. The outcome is logged below instead —
     * including the relay's own response, which is what says whether it was
     * accepted — and a failure is logged at error level here even though the
     * caller will swallow it, because the caller swallowing it is precisely why
     * nobody would otherwise find out.
     */
    this.logger.debug(`Sending email to ${to} with subject "${subject}"`);
    const { transporter, from } = await this.getTransporter();

    const mailOptions: nodemailer.SendMailOptions = {
      from: `"AL FURQAN Console" <${from}>`,
      to,
      subject,
      text,
      html,
      attachments: file
        ? [
            {
              filename: file.originalname,
              content: file.buffer,
            },
          ]
        : [],
    };

    try {
      const info = await transporter.sendMail(mailOptions);
      /*
       * A relay can accept a message for some recipients and refuse others in
       * the same call, which resolves successfully. `rejected` is the only
       * place that shows, so it is checked rather than assumed empty.
       */
      if (info.rejected?.length) {
        this.logger.error(
          `Email to ${to} ("${subject}") was REJECTED for ${info.rejected.join(', ')} — ${info.response ?? 'no response'}`,
        );
      } else {
        this.logger.log(
          `Email accepted for ${to} ("${subject}") — ${info.response ?? 'no response'}`,
        );
      }
      return info;
    } catch (e) {
      const err = e as { code?: string; responseCode?: number; message?: string };
      this.logger.error(
        `Email to ${to} ("${subject}") FAILED — ` +
          `${err.code ?? 'no code'}/${err.responseCode ?? '-'}: ${err.message ?? 'unknown error'}`,
      );
      throw e;
    }
  }

  /**
   * Sends a message to the configured sender address and reports what the relay
   * said, for the admin settings screen.
   *
   * "Accepted by the relay" is not "delivered": the relay can take a message
   * and the receiving side still bin it, which is exactly what happens when the
   * From domain has not authorised this relay to send for it. The result says
   * so rather than reporting a clean success nobody can act on.
   */
  async sendTestEmail(to?: string) {
    const { from } = await this.getTransporter();
    const target = to?.trim() || from;
    try {
      const info = await this.sendMail(
        target,
        'Test email from the AL FURQAN console',
        'If you are reading this, the mail relay accepted and delivered a message from the console.',
      );
      const domain = String(from).split('@')[1] ?? '';
      return {
        ok: !info.rejected?.length,
        to: target,
        from,
        response: info.response ?? null,
        /*
         * The common cause of "accepted but never arrives": sending as an
         * address at a domain the academy does not control, through a relay
         * that domain has not authorised. The receiver fails SPF/DKIM
         * alignment and files it as spam.
         */
        warning: ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com'].includes(
          domain.toLowerCase(),
        )
          ? `The sender address is at ${domain}, which does not authorise this relay to send on its behalf. Messages may be accepted here and still land in spam. Use an address at a domain you control and verify it with your mail provider.`
          : null,
      };
    } catch (e) {
      const err = e as { code?: string; responseCode?: number; message?: string };
      return {
        ok: false,
        to: target,
        from,
        response: null,
        error: `${err.code ?? 'error'}: ${err.message ?? 'unknown'}`,
        warning: null,
      };
    }
  }
}
