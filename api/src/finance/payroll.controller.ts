import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators';
import { Role } from '../generated/prisma/enums';
import { PayrollService } from './payroll.service';
import { GeneratePayrollDto, UpsertPayrollConfigDto } from './dto';

@ApiTags('finance')
@ApiBearerAuth()
@Controller('finance/payroll')
@Roles(Role.ADMIN, Role.SUPERVISOR)
export class PayrollController {
  constructor(private readonly service: PayrollService) {}

  @Get('config')
  @ApiOperation({ summary: 'List staff payroll configs (per employee)' })
  listConfigs() {
    return this.service.listConfigs();
  }

  @Post('config')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Set an employee payroll config' })
  upsertConfig(@Body() dto: UpsertPayrollConfigDto) {
    return this.service.upsertConfig(dto);
  }

  @Delete('config/:userId')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Remove an employee payroll config' })
  deleteConfig(@Param('userId') userId: string) {
    return this.service.deleteConfig(userId);
  }

  @Post('generate')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Generate payroll for a period (config-aware)' })
  generate(@Body() dto: GeneratePayrollDto) {
    return this.service.generate(dto);
  }

  @Post('payslip/:payoutId')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Issue + email a payslip for a payout' })
  issuePayslip(@Param('payoutId') payoutId: string) {
    return this.service.issuePayslip(payoutId);
  }
}
