import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles, type AuthUser } from '../auth/decorators';
import { Role } from '../generated/prisma/enums';
import { EarningsService } from './earnings.service';

@ApiTags('earnings')
@ApiBearerAuth()
@Controller('earnings')
export class EarningsController {
  constructor(private readonly service: EarningsService) {}

  // ── Teacher: own earnings ledger + dashboard summary ──
  @Get('me')
  @Roles(Role.TEACHER)
  @ApiOperation({ summary: "The signed-in teacher's earnings ledger" })
  myLedger(@CurrentUser() user: AuthUser, @Query('limit') limit?: string) {
    return this.service.myLedger(user.id, limit ? Number(limit) : undefined);
  }

  @Get('me/summary')
  @Roles(Role.TEACHER)
  @ApiOperation({ summary: "Today/weekly/monthly/pending/paid earnings for the dashboard" })
  mySummary(@CurrentUser() user: AuthUser) {
    return this.service.mySummary(user.id);
  }

  // ── Staff: any teacher's ledger + summary ──
  @Get('teacher/:teacherId')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH)
  @ApiOperation({ summary: "A teacher's earnings ledger (staff)" })
  ledgerFor(@Param('teacherId') teacherId: string, @Query('limit') limit?: string) {
    return this.service.ledgerFor(teacherId, limit ? Number(limit) : undefined);
  }

  @Get('teacher/:teacherId/summary')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH)
  @ApiOperation({ summary: "A teacher's earnings summary (staff)" })
  summaryFor(@Param('teacherId') teacherId: string) {
    return this.service.summaryFor(teacherId);
  }
}
