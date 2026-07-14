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
      this.logger.error('Failed to parse custom SMTP config from database, using env fallback', err);
    }

    // Fallback to env variables
    const user = this.config.get<string>('SMTP_USER');
    const pass = this.config.get<string>('SMTP_PASS');
    return {
      transporter: nodemailer.createTransport({
        service: 'gmail',
        auth: { user, pass },
      }),
      from: user,
    };
  }

  async getSmtpConfig() {
    const configSetting = await this.prisma.systemSetting.findUnique({
      where: { key: 'SMTP_CONFIG' },
    });
    if (!configSetting) return null;
    try {
      return JSON.parse(configSetting.value);
    } catch {
      return null;
    }
  }

  async saveSmtpConfig(config: any) {
    await this.prisma.systemSetting.upsert({
      where: { key: 'SMTP_CONFIG' },
      update: { value: JSON.stringify(config) },
      create: { key: 'SMTP_CONFIG', value: JSON.stringify(config) },
    });
    return { success: true };
  }

  async sendMail(to: string, subject: string, text: string, file?: Express.Multer.File, html?: string) {
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
