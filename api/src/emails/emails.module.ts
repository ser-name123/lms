import { Module } from '@nestjs/common';
import { EmailsService } from './emails.service';
import { EmailsController } from './emails.controller';
import { GmailApiService } from './gmail-api.service';

@Module({
  providers: [EmailsService, GmailApiService],
  controllers: [EmailsController],
  exports: [EmailsService],
})
export class EmailsModule {}
