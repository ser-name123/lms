import {
  Body,
  Controller,
  Get,
  Ip,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser, Public, Roles, type AuthUser } from '../auth/decorators';
import { Role } from '../generated/prisma/enums';
import { LeadsService } from './leads.service';
import {
  AssignTeacherLeadDto,
  CheckLeadDuplicateDto,
  CoachDecisionDto,
  CreateLeadDto,
  EvaluateLeadDto,
  ListLeadsDto,
  ScheduleTrialDto,
  TrialAttendanceDto,
  TrialFeedbackDto,
  UpdateLeadDto,
  UpdateTrialDto,
  VerifyLeadOtpDto,
} from './dto';

@ApiTags('leads')
@ApiBearerAuth()
@Controller('leads')
@Roles(Role.ADMIN, Role.ACADEMIC_COACH)
export class LeadsController {
  constructor(private readonly service: LeadsService) {}

  @Post()
  @Public()
  @ApiOperation({ summary: 'Public: submit a website lead, receive an email OTP' })
  create(@Body() dto: CreateLeadDto, @Ip() ip: string) {
    return this.service.requestOtp(dto, { ip });
  }

  @Post('verify-otp')
  @Public()
  @ApiOperation({ summary: 'Public: verify the OTP to finalise the lead' })
  verifyOtp(@Body() dto: VerifyLeadOtpDto) {
    return this.service.verifyOtp(dto.email, dto.otp);
  }

  @Post('check-duplicate')
  @Public()
  @ApiOperation({ summary: 'Public: check if an email/mobile already has a lead' })
  checkDuplicate(@Body() dto: CheckLeadDuplicateDto) {
    return this.service.checkDuplicate(dto.email, dto.mobile);
  }

  @Get()
  @ApiOperation({ summary: 'List / filter leads' })
  list(@Query() query: ListLeadsDto) {
    return this.service.list(query);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Lead pipeline + marketing stats' })
  stats() {
    return this.service.getStats();
  }

  @Get('funnel')
  @ApiOperation({ summary: 'Full conversion funnel + trial analytics' })
  funnel() {
    return this.service.getFunnel();
  }

  // ── Teacher: my trial queue (static path — declare before :id) ──────────────
  @Get('trials/mine')
  @Roles(Role.TEACHER, Role.ADMIN, Role.ACADEMIC_COACH)
  @ApiOperation({ summary: "Teacher: my trial classes (today / upcoming / all)" })
  myTrials(@CurrentUser() user: AuthUser, @Query('scope') scope?: 'today' | 'upcoming' | 'all') {
    return this.service.myTrials(user.id, scope || 'upcoming');
  }

  // ── Trial mutations (keyed by trialId — distinct path from :id) ─────────────
  @Patch('trials/:trialId')
  @ApiOperation({ summary: 'Update / reschedule a trial' })
  updateTrial(@Param('trialId') trialId: string, @Body() dto: UpdateTrialDto, @CurrentUser() user: AuthUser) {
    return this.service.updateTrial(trialId, dto, { id: user.id, name: user.email });
  }

  @Post('trials/:trialId/attendance')
  @Roles(Role.TEACHER, Role.ADMIN, Role.ACADEMIC_COACH)
  @ApiOperation({ summary: 'Mark trial attendance (present / absent)' })
  markAttendance(@Param('trialId') trialId: string, @Body() dto: TrialAttendanceDto, @CurrentUser() user: AuthUser) {
    return this.service.markAttendance(trialId, dto, { id: user.id, name: user.email });
  }

  @Post('trials/:trialId/feedback')
  @Roles(Role.TEACHER, Role.ADMIN, Role.ACADEMIC_COACH)
  @ApiOperation({ summary: 'Record teacher / parent feedback for a trial' })
  trialFeedback(@Param('trialId') trialId: string, @Body() dto: TrialFeedbackDto, @CurrentUser() user: AuthUser) {
    return this.service.submitTrialFeedback(trialId, dto, { id: user.id, name: user.email });
  }

  @Post('trials/:trialId/reminder')
  @ApiOperation({ summary: 'Send a reminder email for this trial now' })
  sendReminder(@Param('trialId') trialId: string) {
    return this.service.sendReminderNow(trialId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one lead' })
  getOne(@Param('id') id: string) {
    return this.service.getOne(id);
  }

  @Get(':id/activities')
  @ApiOperation({ summary: 'Activity timeline for a lead' })
  activities(@Param('id') id: string) {
    return this.service.listActivities(id);
  }

  @Get(':id/recommendation')
  @ApiOperation({ summary: 'Level / batch / best-fit teacher recommendation' })
  recommendation(@Param('id') id: string) {
    return this.service.getRecommendation(id);
  }

  @Get(':id/trials')
  @ApiOperation({ summary: 'List the trial classes booked for a lead' })
  trials(@Param('id') id: string) {
    return this.service.listTrials(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update status / priority / coach / add note' })
  update(@Param('id') id: string, @Body() dto: UpdateLeadDto, @CurrentUser() user: AuthUser) {
    return this.service.update(id, dto, { id: user.id, name: user.email });
  }

  @Post(':id/evaluate')
  @ApiOperation({ summary: 'Record evaluation scores (auto overall %)' })
  evaluate(@Param('id') id: string, @Body() dto: EvaluateLeadDto, @CurrentUser() user: AuthUser) {
    return this.service.evaluate(id, dto, { id: user.id, name: user.email });
  }

  @Post(':id/assign-teacher')
  @ApiOperation({ summary: 'Assign a teacher (manual or auto)' })
  assignTeacher(
    @Param('id') id: string,
    @Body() dto: AssignTeacherLeadDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.assignTeacher(id, dto, { id: user.id, name: user.email });
  }

  @Post(':id/trials')
  @ApiOperation({ summary: 'Schedule a trial class for a lead' })
  scheduleTrial(@Param('id') id: string, @Body() dto: ScheduleTrialDto, @CurrentUser() user: AuthUser) {
    return this.service.scheduleTrial(id, dto, { id: user.id, name: user.email });
  }

  @Post(':id/decision')
  @ApiOperation({ summary: 'Coach decision — ENROLL converts the lead to a student' })
  decision(@Param('id') id: string, @Body() dto: CoachDecisionDto, @CurrentUser() user: AuthUser) {
    return this.service.coachDecision(id, dto, { id: user.id, name: user.email });
  }
}
