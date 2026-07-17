import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser, Roles, type AuthUser } from '../auth/decorators';
import { Role } from '../generated/prisma/enums';
import { ProgressStudentService } from './progress-student.service';

@ApiTags('progress-student')
@ApiBearerAuth()
@Controller('progress/student')
@Roles(Role.STUDENT)
export class ProgressStudentController {
  constructor(private readonly service: ProgressStudentService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'The signed-in student’s full progress view' })
  dashboard(@CurrentUser() user: AuthUser) {
    return this.service.dashboard(user.id);
  }
}
