import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Roles } from '../auth/decorators';
import { Role } from '../generated/prisma/enums';
import { DashboardService } from './dashboard.service';

@ApiTags('dashboard')
@ApiBearerAuth()
@Controller('dashboard')
@Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Aggregated KPIs, activity and chart data' })
  overview() {
    return this.dashboard.overview();
  }
}
