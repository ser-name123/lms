import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles, type AuthUser } from '../auth/decorators';
import { Role } from '../generated/prisma/enums';
import { FinanceTeacherService } from './finance-teacher.service';

@ApiTags('finance')
@ApiBearerAuth()
@Controller('finance/teacher')
@Roles(Role.TEACHER)
export class FinanceTeacherController {
  constructor(private readonly service: FinanceTeacherService) {}

  @Get('dashboard')
  @ApiOperation({ summary: "The signed-in teacher's payroll view (payroll only)" })
  dashboard(@CurrentUser() user: AuthUser) {
    return this.service.dashboard(user.id);
  }
}
