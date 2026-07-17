import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles, type AuthUser } from '../auth/decorators';
import { Role } from '../generated/prisma/enums';
import { FinanceStudentService } from './finance-student.service';

@ApiTags('finance')
@ApiBearerAuth()
@Controller('finance/student')
@Roles(Role.STUDENT)
export class FinanceStudentController {
  constructor(private readonly service: FinanceStudentService) {}

  @Get('dashboard')
  @ApiOperation({ summary: "The signed-in student's fee profile" })
  dashboard(@CurrentUser() user: AuthUser) {
    return this.service.dashboard(user.id);
  }
}
