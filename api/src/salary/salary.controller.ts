import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles, type AuthUser } from '../auth/decorators';
import { Role } from '../generated/prisma/enums';
import { SalaryService } from './salary.service';

@ApiTags('salary')
@ApiBearerAuth()
@Controller('salary')
export class SalaryController {
  constructor(private readonly service: SalaryService) {}

  // ── Calculation + dashboard (admin + supervisor read) ──
  @Post('calculate')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Calculate/recalculate teacher salaries for a period' })
  calculate(@Body() dto: { periodStart: string; periodEnd: string }) {
    return this.service.calculate(dto.periodStart, dto.periodEnd);
  }

  @Get()
  @Roles(Role.ADMIN, Role.SUPERVISOR)
  @ApiOperation({ summary: 'Salary dashboard rows (optionally for one period)' })
  list(@Query('periodStart') periodStart?: string) {
    return this.service.list(periodStart);
  }

  // Teacher-facing: my own salaries. Declared before ':id' so 'me' is not
  // captured as a salary id by the param route below.
  @Get('me')
  @Roles(Role.TEACHER)
  @ApiOperation({ summary: "A teacher's own Module-6 salary records (breakdown + adjustments + payments)" })
  mine(@CurrentUser() user: AuthUser) {
    return this.service.mySalaries(user.id);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.SUPERVISOR)
  @ApiOperation({ summary: 'Salary detail — breakdown, adjustments, earnings' })
  detail(@Param('id') id: string) {
    return this.service.detail(id);
  }

  @Get(':id/payments')
  @Roles(Role.ADMIN, Role.SUPERVISOR)
  @ApiOperation({ summary: 'Payment history for a salary (Wise attempts)' })
  payments(@Param('id') id: string) {
    return this.service.paymentHistory(id);
  }

  // ── Adjust / review / approve (admin) ──
  @Post(':id/adjust')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Add an itemised salary adjustment (extra pay / deduction)' })
  adjust(@Param('id') id: string, @Body() dto: { type: 'EXTRA_PAY' | 'DEDUCTION'; amount: number; reason: string }, @CurrentUser() user: AuthUser) {
    return this.service.addAdjustment(id, dto, { id: user.id, name: user.email, role: user.role });
  }

  @Post(':id/review')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Move a salary to Under Review' })
  review(@Param('id') id: string) {
    return this.service.setUnderReview(id);
  }

  @Post(':id/approve')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Approve a salary for payment' })
  approve(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.approve(id, { id: user.id, name: user.email, role: user.role });
  }

  @Post(':id/pay')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Pay an approved salary via Wise (mock)' })
  pay(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.pay(id, { id: user.id, name: user.email, role: user.role });
  }

  // ── Teacher payout (recipient) details — admin ──
  @Get('teacher/:teacherId/payout-details')
  @Roles(Role.ADMIN, Role.SUPERVISOR)
  @ApiOperation({ summary: "A teacher's Wise payout/recipient details" })
  getPayout(@Param('teacherId') teacherId: string) {
    return this.service.getPayoutDetails(teacherId);
  }

  @Patch('teacher/:teacherId/payout-details')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: "Update a teacher's Wise payout/recipient details" })
  updatePayout(
    @Param('teacherId') teacherId: string,
    @Body() dto: { recipientName?: string; payoutCountry?: string; payoutBankName?: string; iban?: string; swift?: string; wiseRecipientId?: string; payoutCurrency?: string },
  ) {
    return this.service.updatePayoutDetails(teacherId, dto);
  }
}
