import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  AcademyBillingDto,
  AcademyBillingService,
  SettingsService,
  SystemSettingsDto,
} from './settings.service';
import { Public, Roles } from '../auth/decorators';
import { Role } from '../generated/prisma/enums';

@ApiTags('settings')
@Controller('settings')
export class SettingsController {
  constructor(
    private readonly settingsService: SettingsService,
    private readonly billing: AcademyBillingService,
  ) {}

  /* Billing routes are declared before the bare '' routes below purely for
     readability — they are distinct static segments, so order is not load-
     bearing here. */

  @Get('billing')
  @ApiBearerAuth()
  @Roles(Role.ADMIN, Role.SUPERVISOR)
  @ApiOperation({ summary: 'Academy billing identity used on invoice headers' })
  getBilling() {
    return this.billing.get();
  }

  @Post('billing')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update academy billing identity (Admin only)' })
  saveBilling(@Body() dto: AcademyBillingDto) {
    return this.billing.save(dto);
  }

  @Public() // Allow public access so frontend root layout can fetch logo, favicon, colors, and head scripts on load
  @Get()
  @ApiOperation({ summary: 'Get website public settings' })
  getSettings() {
    return this.settingsService.getSettings();
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update system settings (Admin only)' })
  saveSettings(@Body() dto: SystemSettingsDto) {
    return this.settingsService.saveSettings(dto);
  }
}
