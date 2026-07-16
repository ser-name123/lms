import {
  Controller,
  Post,
  Get,
  UseInterceptors,
  UploadedFile,
  Body,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { EmailsService } from './emails.service';
import { ApiConsumes, ApiBody, ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('emails')
@Controller('emails')
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
  async saveSmtpConfig(@Body() dto: any) {
    return this.emailsService.saveSmtpConfig(dto);
  }
}
