import { Body, Controller, Get, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators';
import { Role } from '../generated/prisma/enums';
import { FinanceService } from './finance.service';
import { FinanceSettingsService } from './finance-settings.service';
import { UpdateFinanceConfigDto } from './dto';

@ApiTags('finance')
@ApiBearerAuth()
@Controller('finance')
@Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH)
export class FinanceController {
  constructor(
    private readonly finance: FinanceService,
    private readonly settings: FinanceSettingsService,
  ) {}

  @Get('config')
  @ApiOperation({ summary: 'Finance settings (currency, tax, reminders)' })
  getConfig() {
    return this.settings.getConfig();
  }

  @Patch('config')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update finance settings' })
  updateConfig(@Body() dto: UpdateFinanceConfigDto) {
    return this.settings.updateConfig(dto);
  }

  @Get('dashboard')
  @ApiOperation({ summary: 'Unified finance dashboard (cards + charts)' })
  dashboard() {
    return this.finance.dashboard();
  }

  @Get('analytics')
  @ApiOperation({ summary: 'Finance analytics (trends, distributions)' })
  analytics() {
    return this.finance.analytics();
  }

  @Get('reports')
  @ApiOperation({ summary: 'Financial report by type (for table + CSV export)' })
  report(@Query('type') type = 'collection') {
    return this.finance.report(type);
  }
}
