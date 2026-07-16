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
    this.logger.log(`Sending email to ${to} with subject "${subject}"`);
    const { transporter, from } = await this.getTransporter();

    const mailOptions: nodemailer.SendMailOptions = {
      from: `"Edumin Console" <${from}>`,
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

    return transporter.sendMail(mailOptions);
  }
}
