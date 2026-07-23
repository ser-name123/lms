import {
  Controller,
  Post,
  Get,
  UseInterceptors,
  UploadedFile,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { EmailsService } from './emails.service';
import { GmailApiService } from './gmail-api.service';
import { ApiBearerAuth, ApiConsumes, ApiBody, ApiTags, ApiOperation } from '@nestjs/swagger';

import { Roles } from '../auth/decorators';
import { Role } from '../generated/prisma/enums';
import { SmtpConfigDto, GmailApiConfigDto } from './dto';

@ApiTags('emails')
@ApiBearerAuth()
@Controller('emails')
@Roles(Role.ADMIN)
export class EmailsController {
  constructor(
    private readonly emailsService: EmailsService,
    private readonly gmailApi: GmailApiService,
  ) {}

  @Post('send')
  @UseInterceptors(FileInterceptor('attachment'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        to: { type: 'string', example: 'student@example.com' },
        subject: { type: 'string', example: 'Class update' },
        message: {
          type: 'string',
          example: 'Hello, your next class is scheduled.',
        },
        attachment: { type: 'string', format: 'binary' },
      },
      required: ['to', 'subject', 'message'],
    },
  })
  async sendEmail(
    @Body('to') to: string,
    @Body('subject') subject: string,
    @Body('message') message: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    await this.emailsService.sendMail(to, subject, message, file);
    return { success: true, message: 'Email sent successfully' };
  }

  @Get('smtp-config')
  @ApiOperation({ summary: 'Get outgoing SMTP configuration' })
  async getSmtpConfig() {
    return this.emailsService.getSmtpConfig();
  }

  @Post('smtp-config')
  @ApiOperation({ summary: 'Save outgoing SMTP configuration' })
  async saveSmtpConfig(@Body() dto: SmtpConfigDto) {
    return this.emailsService.saveSmtpConfig(dto);
  }

  /*
   * Sends one message and reports what the relay actually said.
   *
   * Saving SMTP settings proved nothing before this: the screen said "saved"
   * whether or not a message could ever leave, and every caller in the app
   * swallows send failures, so the first sign of trouble was a family saying
   * they never got their invoice.
   */
  @Post('smtp-test')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send a test email and report the relay response' })
  async sendTestEmail(@Body('to') to?: string) {
    return this.emailsService.sendTestEmail(to);
  }

  /*
   * Gmail API — the transport for sending as gmail.com from a host that blocks
   * SMTP ports. Credentials are write-only: reads say whether each is set,
   * never its value, and a blank field on save keeps the stored one. When
   * configured, this path takes precedence over SMTP for every email the app
   * sends.
   */
  @Get('gmail-api')
  @ApiOperation({ summary: 'Gmail API configuration (secrets masked)' })
  async getGmailApi() {
    return this.gmailApi.publicConfig();
  }

  @Post('gmail-api')
  @ApiOperation({ summary: 'Save Gmail API credentials. Blank fields keep the stored value.' })
  async saveGmailApi(@Body() dto: GmailApiConfigDto) {
    await this.gmailApi.saveConfig(dto);
    return this.gmailApi.publicConfig();
  }

  @Post('gmail-api/disconnect')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove Gmail API credentials and fall back to SMTP' })
  async disconnectGmailApi() {
    await this.gmailApi.clearConfig();
    return this.gmailApi.publicConfig();
  }

  @Post('gmail-api/test')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ask Google whether the saved credentials work' })
  async testGmailApi() {
    return this.gmailApi.testConnection();
  }
}
