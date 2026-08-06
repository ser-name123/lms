import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser, Roles, type AuthUser } from '../auth/decorators';
import { Role } from '../generated/prisma/enums';
import { MonthlyAssessmentsService } from './assessments.service';
import {
  ListAssessmentsQuery, ReopenAssessmentDto, ReturnAssessmentDto, ReviewFeedbackDto,
  SaveAssessmentDto, SubmitFeedbackDto,
} from './dto';

const actor = (u: AuthUser) => ({ id: u.id, email: u.email, role: u.role });

/*
 * Monthly assessments. One controller for every panel, because the row is the
 * same row whoever is looking — what differs is which transitions each role may
 * make, and that is expressed with @Roles rather than four parallel endpoints.
 *
 * Ownership within a role is enforced in the service: a teacher only ever sees
 * and writes their own students, a student only their own published reports.
 */
@ApiTags('monthly-assessments')
@ApiBearerAuth()
@Controller('monthly-assessments')
export class MonthlyAssessmentsController {
  constructor(private readonly service: MonthlyAssessmentsService) {}

  // ── Static routes first, so they are not swallowed by :id ──────────────────

  @Get('dashboard/admin')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH)
  @ApiOperation({ summary: 'Status counts, grade spread, pass rate, overdue' })
  adminDashboard() {
    return this.service.adminDashboard();
  }

  @Get('dashboard/teacher')
  @Roles(Role.TEACHER)
  @ApiOperation({ summary: "The teacher's own counts" })
  teacherDashboard(@CurrentUser() u: AuthUser) {
    return this.service.teacherDashboard(actor(u));
  }

  @Get('due')
  @Roles(Role.TEACHER, Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH)
  @ApiOperation({ summary: 'Students whose finished cycle still needs an assessment' })
  due(@CurrentUser() u: AuthUser) {
    return this.service.dueList(actor(u));
  }

  @Get('form')
  @Roles(Role.TEACHER, Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH)
  @ApiOperation({ summary: 'Everything the assessment screen needs for one student + cycle' })
  form(
    @Query('studentId') studentId: string,
    @Query('courseId') courseId: string,
    @CurrentUser() u: AuthUser,
    @Query('cycleStart') cycleStart?: string,
  ) {
    return this.service.loadForm(studentId, courseId, cycleStart, actor(u));
  }

  @Get('mine')
  @Roles(Role.STUDENT)
  @ApiOperation({ summary: "The student's own published reports" })
  mine(@CurrentUser() u: AuthUser) {
    return this.service.myReports(u.id);
  }

  @Get('student/:studentId')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH, Role.TEACHER)
  @ApiOperation({ summary: 'Every assessment for one student (admin student hub)' })
  forStudent(@Param('studentId') studentId: string) {
    return this.service.forStudent(studentId);
  }

  @Get('feedback/pending')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.TEACHER)
  @ApiOperation({ summary: 'Family feedback nobody has reviewed yet' })
  pendingFeedback(@CurrentUser() u: AuthUser) {
    return this.service.pendingFeedback(actor(u));
  }

  @Post('feedback/:feedbackId/review')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.TEACHER)
  @HttpCode(200)
  @ApiOperation({ summary: 'Mark family feedback as reviewed' })
  reviewFeedback(
    @Param('feedbackId') feedbackId: string,
    @Body() dto: ReviewFeedbackDto,
    @CurrentUser() u: AuthUser,
  ) {
    return this.service.reviewFeedback(feedbackId, dto, actor(u));
  }

  @Post('publish-batch')
  @Roles(Role.ADMIN, Role.SUPERVISOR)
  @HttpCode(200)
  @ApiOperation({ summary: 'Publish several approved assessments at once' })
  publishBatch(@Body() dto: { ids: string[] }, @CurrentUser() u: AuthUser) {
    return this.service.publishBatch(dto?.ids ?? [], actor(u));
  }

  // ── Write ──────────────────────────────────────────────────────────────────

  @Post('draft')
  @Roles(Role.TEACHER, Role.ADMIN, Role.SUPERVISOR)
  @HttpCode(200)
  @ApiOperation({ summary: 'Save marks and comments without submitting' })
  draft(@Body() dto: SaveAssessmentDto, @CurrentUser() u: AuthUser) {
    return this.service.save(dto, actor(u), false);
  }

  @Post('submit')
  @Roles(Role.TEACHER, Role.ADMIN, Role.SUPERVISOR)
  @HttpCode(200)
  @ApiOperation({ summary: 'Submit the assessment for supervisor review' })
  submit(@Body() dto: SaveAssessmentDto, @CurrentUser() u: AuthUser) {
    return this.service.save(dto, actor(u), true);
  }

  // ── List + detail ──────────────────────────────────────────────────────────

  @Get()
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH, Role.TEACHER)
  @ApiOperation({ summary: 'Assessment rows (a teacher sees only their own)' })
  list(@Query() q: ListAssessmentsQuery, @CurrentUser() u: AuthUser) {
    return this.service.list(q, actor(u));
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH, Role.TEACHER, Role.STUDENT)
  @ApiOperation({ summary: 'One assessment in full' })
  getOne(@Param('id') id: string, @CurrentUser() u: AuthUser) {
    return this.service.getOne(id, actor(u));
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  @Post(':id/review')
  @Roles(Role.ADMIN, Role.SUPERVISOR)
  @HttpCode(200)
  @ApiOperation({ summary: 'Claim a submitted assessment for review' })
  review(@Param('id') id: string, @CurrentUser() u: AuthUser) {
    return this.service.setUnderReview(id, actor(u));
  }

  @Post(':id/approve')
  @Roles(Role.ADMIN, Role.SUPERVISOR)
  @HttpCode(200)
  @ApiOperation({ summary: 'Approve a submitted assessment' })
  approve(@Param('id') id: string, @CurrentUser() u: AuthUser) {
    return this.service.approve(id, actor(u));
  }

  @Post(':id/return')
  @Roles(Role.ADMIN, Role.SUPERVISOR)
  @HttpCode(200)
  @ApiOperation({ summary: 'Send an assessment back to the teacher with a reason' })
  returnForRevision(
    @Param('id') id: string,
    @Body() dto: ReturnAssessmentDto,
    @CurrentUser() u: AuthUser,
  ) {
    return this.service.returnForRevision(id, dto, actor(u));
  }

  @Post(':id/publish')
  @Roles(Role.ADMIN, Role.SUPERVISOR)
  @HttpCode(200)
  @ApiOperation({ summary: 'Publish to the student panel (read-only thereafter)' })
  publish(@Param('id') id: string, @CurrentUser() u: AuthUser) {
    return this.service.publish(id, actor(u));
  }

  @Post(':id/reopen')
  @Roles(Role.ADMIN, Role.SUPERVISOR)
  @HttpCode(200)
  @ApiOperation({ summary: 'Reopen a published assessment for correction' })
  reopen(@Param('id') id: string, @Body() dto: ReopenAssessmentDto, @CurrentUser() u: AuthUser) {
    return this.service.reopen(id, dto, actor(u));
  }

  // ── Family feedback (submitted from the student panel) ─────────────────────

  @Post(':id/feedback')
  @Roles(Role.STUDENT, Role.ADMIN, Role.SUPERVISOR)
  @HttpCode(200)
  @ApiOperation({ summary: 'Parent/guardian feedback on a published report' })
  submitFeedback(
    @Param('id') id: string,
    @Body() dto: SubmitFeedbackDto,
    @CurrentUser() u: AuthUser,
  ) {
    return this.service.submitFeedback(id, dto, actor(u));
  }
}
