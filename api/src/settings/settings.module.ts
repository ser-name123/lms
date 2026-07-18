import { Module } from '@nestjs/common';
import { AcademyBillingService, SettingsService } from './settings.service';
import { SettingsController } from './settings.controller';

@Module({
  providers: [SettingsService, AcademyBillingService],
  controllers: [SettingsController],
  exports: [SettingsService, AcademyBillingService],
})
export class SettingsModule {}
