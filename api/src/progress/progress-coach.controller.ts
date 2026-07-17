import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser, Roles, type AuthUser } from '../auth/decorators';
import { Role } from '../generated/prisma/enums';
import { ProgressCoachService } from './progress-coach.service';
import {
  CreateGoalDto,
  CreateMonthlyReviewDto,
  CreateParentMeetingDto,
  ResolveRiskDto,
  UpdateGoalDto,
  UpdateParentMeetingDto,
} from './dto';

const caller = (u: AuthUser) => ({ id: u.id, role: u.role, name: u.email });

@ApiTags('progress-coach')
@ApiBearerAuth()
@Controller('progress/coach')
@Roles(Role.ACADEMIC_COACH, Role.ADMIN)
export class ProgressCoachController {
  constructor(private readonly service: ProgressCoachService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Coach dashboard: students, weak areas, risks' })
  dashboard(@CurrentUser() u: AuthUser) {
    return this.service.dashboard(caller(u));
  }

  @Get('risks')
  @ApiOperation({ summary: 'Open risk flags for the coach’s students' })
  risks(@CurrentUser() u: AuthUser) {
    return this.service.listRisks(caller(u));
  }

  @Post('risks/:id/resolve')
  @ApiOperation({ summary: 'Resolve a risk flag' })
  resolveRisk(@Param('id') id: string, @Body() dto: ResolveRiskDto, @CurrentUser() u: AuthUser) {
    return this.service.resolveRisk(id, dto, caller(u));
  }

  @Post('risks/:id/escalate')
  @ApiOperation({ summary: 'Escalate a risk flag to admin' })
  escalateRisk(@Param('id') id: string, @CurrentUser() u: AuthUser) {
    return this.service.escalateRisk(id, caller(u));
  }

  // Monthly reviews
  @Get('reviews')
  @ApiOperation({ summary: 'List monthly reviews for a student' })
  listReviews(@Query('studentId') studentId: string, @CurrentUser() u: AuthUser) {
    return this.service.listReviews(studentId, caller(u));
  }
  @Post('reviews')
  @ApiOperation({ summary: 'Create/update a monthly review' })
  createReview(@Body() dto: CreateMonthlyReviewDto, @CurrentUser() u: AuthUser) {
    return this.service.createReview(dto, caller(u));
  }

  // Goals
  @Get('goals')
  @ApiOperation({ summary: 'List learning goals for a student' })
  listGoals(@Query('studentId') studentId: string, @CurrentUser() u: AuthUser) {
    return this.service.listGoals(studentId, caller(u));
  }
  @Post('goals')
  @ApiOperation({ summary: 'Create a learning goal' })
  createGoal(@Body() dto: CreateGoalDto, @CurrentUser() u: AuthUser) {
    return this.service.createGoal(dto, caller(u));
  }
  @Patch('goals/:id')
  @ApiOperation({ summary: 'Update a learning goal' })
  updateGoal(@Param('id') id: string, @Body() dto: UpdateGoalDto, @CurrentUser() u: AuthUser) {
    return this.service.updateGoal(id, dto, caller(u));
  }

  // Parent meetings
  @Get('meetings')
  @ApiOperation({ summary: 'List parent meetings for a student' })
  listMeetings(@Query('studentId') studentId: string, @CurrentUser() u: AuthUser) {
    return this.service.listMeetings(studentId, caller(u));
  }
  @Post('meetings')
  @ApiOperation({ summary: 'Schedule a parent meeting / counseling' })
  createMeeting(@Body() dto: CreateParentMeetingDto, @CurrentUser() u: AuthUser) {
    return this.service.createMeeting(dto, caller(u));
  }
  @Patch('meetings/:id')
  @ApiOperation({ summary: 'Update a parent meeting' })
  updateMeeting(@Param('id') id: string, @Body() dto: UpdateParentMeetingDto, @CurrentUser() u: AuthUser) {
    return this.service.updateMeeting(id, dto, caller(u));
  }
}
