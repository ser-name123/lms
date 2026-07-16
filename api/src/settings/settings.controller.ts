import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SettingsService, SystemSettingsDto } from './settings.service';
import { Public, Roles } from '../auth/decorators';
import { Role } from '../generated/prisma/enums';

@ApiTags('settings')
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

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
