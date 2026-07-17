import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser, Roles, type AuthUser } from '../auth/decorators';
import { Role } from '../generated/prisma/enums';
import { ProgressTeacherService } from './progress-teacher.service';
import { CreateFeedbackDto } from './dto';

const actor = (u: AuthUser) => ({ id: u?.id, name: u?.email });

@ApiTags('progress-teacher')
@ApiBearerAuth()
@Controller('progress/teacher')
@Roles(Role.TEACHER)
export class ProgressTeacherController {
  constructor(private readonly service: ProgressTeacherService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Teacher progress dashboard (cards + student roster)' })
  dashboard(@CurrentUser() user: AuthUser) {
    return this.service.dashboard(user.id);
  }

  @Get('students/:id')
  @ApiOperation({ summary: 'Progress detail for one of the teacher’s students' })
  studentDetail(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.studentDetail(user.id, id);
  }

  @Get('students/:id/feedback')
  @ApiOperation({ summary: 'Feedback history for a student' })
  listFeedback(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.listFeedback(user.id, id);
  }

  @Post('feedback')
  @ApiOperation({ summary: 'Add quick class feedback for a student' })
  addFeedback(@CurrentUser() user: AuthUser, @Body() dto: CreateFeedbackDto) {
    return this.service.addFeedback(user.id, dto, actor(user));
  }
}
