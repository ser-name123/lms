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
import { ApiBearerAuth, ApiConsumes, ApiBody, ApiTags, ApiOperation } from '@nestjs/swagger';

import { Roles } from '../auth/decorators';
import { Role } from '../generated/prisma/enums';
import { SmtpConfigDto } from './dto';

@ApiTags('emails')
@ApiBearerAuth()
@Controller('emails')
@Roles(Role.ADMIN)
export class EmailsController {
  constructor(private readonly emailsService: EmailsService) {}

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
}
