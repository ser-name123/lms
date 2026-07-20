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
import { Throttle } from '@nestjs/throttler';

import { CurrentUser, Public, Roles, type AuthUser } from '../auth/decorators';
import { Role } from '../generated/prisma/enums';
import { LeadsService } from './leads.service';
import { LeadAvailabilityService } from './availability.service';
import {
  AssignTeacherLeadDto,
  CoachDecisionDto,
  CreateLeadDto,
  EvaluateLeadDto,
  ListLeadsDto,
  ScheduleTrialDto,
  TrialAttendanceDto,
  TrialFeedbackDto,
  TrialInfoFormDto,
  TrialReportDto,
  TrialStatusDto,
  UpdateLeadDto,
  UpdateTrialDto,
} from './dto';

/*
 * The caller, in the shape the service expects.
 *
 * `role` has to travel with it: a lead belongs to the coach it was assigned
 * to, and LeadsService decides visibility from this. Passing only { id, name }
 * — as this controller used to — silently disables that scoping and hands
 * every coach the whole pipeline.
 */
const actor = (user: AuthUser) => ({ id: user.id, name: user.email, role: user.role });

@ApiTags('leads')
@ApiBearerAuth()
@Controller('leads')
@Roles(Role.ADMIN, Role.ACADEMIC_COACH)
export class LeadsController {
  constructor(
    private readonly service: LeadsService,
    private readonly availabilityService: LeadAvailabilityService,
  ) {}

  @Post()
  @Public()
  @ApiOperation({ summary: 'Public: book a free trial class (creates lead + trial + Zoom link)' })
  create(@Body() dto: CreateLeadDto, @Ip() ip: string) {
    return this.service.book(dto, { ip });
  }

  @Get('availability')
  @Public()
  @ApiOperation({
    summary: 'Public: bookable 30-minute slots for one date, merged across teachers',
  })
  availability(@Query('date') date: string) {
    return this.availabilityService.slotsFor(date);
  }

  @Get('teacher-availability')
  @ApiOperation({
    summary: 'Who is free on a date, per teacher — the coach assignment screen',
  })
  teacherAvailability(@Query('date') date: string) {
    return this.availabilityService.teacherAvailabilityFor(date);
  }

  @Get()
  @ApiOperation({ summary: 'List / filter leads (a coach sees only their own)' })
  list(@Query() query: ListLeadsDto, @CurrentUser() user: AuthUser) {
    return this.service.list(query, actor(user));
  }

  @Get('stats')
  @ApiOperation({ summary: 'Lead pipeline + marketing stats, scoped to the caller' })
  stats(@CurrentUser() user: AuthUser) {
    return this.service.getStats(actor(user));
  }

  @Get('funnel')
  @ApiOperation({ summary: 'Full conversion funnel + trial analytics, scoped to the caller' })
  funnel(@CurrentUser() user: AuthUser) {
    return this.service.getFunnel(actor(user));
  }

  // ── Teacher: my trial queue (static path — declare before :id) ──────────────
  @Get('trials/mine')
  @Roles(Role.TEACHER, Role.ADMIN, Role.ACADEMIC_COACH)
  @ApiOperation({ summary: "Teacher: my trial classes (today / upcoming / all)" })
  myTrials(@CurrentUser() user: AuthUser, @Query('scope') scope?: 'today' | 'upcoming' | 'all') {
    return this.service.myTrials(user.id, scope || 'upcoming');
  }

  @Get('trial-options')
  @Roles(Role.TEACHER, Role.ADMIN, Role.ACADEMIC_COACH)
  @ApiOperation({ summary: 'Courses, packages and levels a trial report can recommend' })
  trialOptions() {
    return this.service.trialOptions();
  }

  // ── Trial mutations (keyed by trialId — distinct path from :id) ─────────────
  @Patch('trials/:trialId')
  @ApiOperation({ summary: 'Update / reschedule a trial' })
  updateTrial(@Param('trialId') trialId: string, @Body() dto: UpdateTrialDto, @CurrentUser() user: AuthUser) {
    return this.service.updateTrial(trialId, dto, actor(user));
  }

  @Post('trials/:trialId/attendance')
  @Roles(Role.TEACHER, Role.ADMIN, Role.ACADEMIC_COACH)
  @ApiOperation({ summary: 'Mark trial attendance (present / absent)' })
  markAttendance(@Param('trialId') trialId: string, @Body() dto: TrialAttendanceDto, @CurrentUser() user: AuthUser) {
    return this.service.markAttendance(trialId, dto, actor(user));
  }

  @Post('trials/:trialId/feedback')
  @Roles(Role.TEACHER, Role.ADMIN, Role.ACADEMIC_COACH)
  @ApiOperation({ summary: 'Record teacher / parent feedback for a trial' })
  trialFeedback(@Param('trialId') trialId: string, @Body() dto: TrialFeedbackDto, @CurrentUser() user: AuthUser) {
    return this.service.submitTrialFeedback(trialId, dto, actor(user));
  }

  @Post('trials/:trialId/status')
  @Roles(Role.TEACHER, Role.ADMIN, Role.ACADEMIC_COACH)
  @ApiOperation({
    summary: 'Teacher: close the trial out as completed or a no-show',
  })
  setTrialStatus(
    @Param('trialId') trialId: string,
    @Body() dto: TrialStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.setTrialStatus(trialId, dto, actor(user));
  }

  // ── The teacher's trial report ──────────────────────────────────────────────
  @Get('trials/:trialId/report')
  @Roles(Role.TEACHER, Role.ADMIN, Role.ACADEMIC_COACH)
  @ApiOperation({ summary: 'Trial report so far, with the booking the teacher must verify' })
  getReport(@Param('trialId') trialId: string, @CurrentUser() user: AuthUser) {
    return this.service.getTrialReport(trialId, actor(user));
  }

  @Patch('trials/:trialId/report')
  @Roles(Role.TEACHER, Role.ADMIN, Role.ACADEMIC_COACH)
  @ApiOperation({ summary: 'Save the trial report as a draft' })
  saveReport(
    @Param('trialId') trialId: string,
    @Body() dto: TrialReportDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.saveTrialReport(trialId, dto, actor(user));
  }

  @Post('trials/:trialId/report/submit')
  @Roles(Role.TEACHER, Role.ADMIN, Role.ACADEMIC_COACH)
  @ApiOperation({ summary: 'Submit the trial report — completes the trial and alerts the coach' })
  submitReport(
    @Param('trialId') trialId: string,
    @Body() dto: TrialReportDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.submitTrialReport(trialId, dto, actor(user));
  }

  @Post('trials/:trialId/info-request')
  @ApiOperation({
    summary: 'Send the family a link to complete the details the trial did not capture',
  })
  requestInfo(@Param('trialId') trialId: string, @CurrentUser() user: AuthUser) {
    return this.service.requestMissingInfo(trialId, actor(user));
  }

  /*
   * The two public halves of that link. Rate limited well below the global
   * 100/min: nobody legitimately opens this more than a handful of times, and
   * the only thing an attacker can do with the endpoint is guess tokens.
   */
  @Get('info-form/:token')
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Public: what the family is being asked to fill in' })
  infoForm(@Param('token') token: string) {
    return this.service.getInfoForm(token);
  }

  @Post('info-form/:token')
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Public: the family submits their preferences' })
  submitInfoForm(@Param('token') token: string, @Body() dto: TrialInfoFormDto) {
    return this.service.submitInfoForm(token, dto);
  }

  @Post('trials/:trialId/reminder')
  @ApiOperation({ summary: 'Send a reminder email for this trial now' })
  sendReminder(@Param('trialId') trialId: string, @CurrentUser() user: AuthUser) {
    return this.service.sendReminderNow(trialId, actor(user));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one lead' })
  getOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.getOne(id, actor(user));
  }

  @Get(':id/activities')
  @ApiOperation({ summary: 'Activity timeline for a lead' })
  activities(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.listActivities(id, actor(user));
  }

  @Get(':id/recommendation')
  @ApiOperation({ summary: 'Level / batch / best-fit teacher recommendation' })
  recommendation(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.getRecommendation(id, actor(user));
  }

  @Get(':id/trials')
  @ApiOperation({ summary: 'List the trial classes booked for a lead' })
  trials(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.listTrials(id, actor(user));
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update status / priority / coach / add note' })
  update(@Param('id') id: string, @Body() dto: UpdateLeadDto, @CurrentUser() user: AuthUser) {
    return this.service.update(id, dto, actor(user));
  }

  @Post(':id/evaluate')
  @ApiOperation({ summary: 'Record evaluation scores (auto overall %)' })
  evaluate(@Param('id') id: string, @Body() dto: EvaluateLeadDto, @CurrentUser() user: AuthUser) {
    return this.service.evaluate(id, dto, actor(user));
  }

  @Post(':id/assign-teacher')
  @ApiOperation({ summary: 'Assign a teacher (manual or auto)' })
  assignTeacher(
    @Param('id') id: string,
    @Body() dto: AssignTeacherLeadDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.assignTeacher(id, dto, actor(user));
  }

  @Post(':id/trials')
  @ApiOperation({ summary: 'Schedule a trial class for a lead' })
  scheduleTrial(@Param('id') id: string, @Body() dto: ScheduleTrialDto, @CurrentUser() user: AuthUser) {
    return this.service.scheduleTrial(id, dto, actor(user));
  }

  @Post(':id/decision')
  @ApiOperation({ summary: 'Coach decision — ENROLL converts the lead to a student' })
  decision(@Param('id') id: string, @Body() dto: CoachDecisionDto, @CurrentUser() user: AuthUser) {
    return this.service.coachDecision(id, dto, actor(user));
  }
}
