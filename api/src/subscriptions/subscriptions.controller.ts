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
import { SubscriptionsService } from './subscriptions.service';
import {
  ListSubscriptionRequestsDto,
  ModifyScheduleDto,
  RequestBreakDto,
  RequestPackageChangeDto,
  RequestScheduleChangeDto,
  ReviewSubscriptionRequestDto,
} from './dto';

/*
 * Two audiences on one service. The student half is read-and-ask only: there is
 * no endpoint here that lets a student change their own package or timetable,
 * which is the point of the feature rather than an oversight.
 */
@ApiTags('Subscriptions')
@ApiBearerAuth()
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly service: SubscriptionsService) {}

  // ── Student ───────────────────────────────────────────────────────────────

  @Get('me')
  @Roles(Role.STUDENT)
  @ApiOperation({ summary: 'The current subscription — package, schedule, cycle, status' })
  me(@CurrentUser() user: AuthUser) {
    return this.service.currentForUser(user.id);
  }

  @Get('me/packages')
  @Roles(Role.STUDENT)
  @ApiOperation({ summary: 'Packages this student could move to' })
  myPackageOptions(@CurrentUser() user: AuthUser) {
    return this.service.packageOptions(user.id);
  }

  @Get('me/requests')
  @Roles(Role.STUDENT)
  @ApiOperation({ summary: 'This student’s own change requests' })
  myRequests(@CurrentUser() user: AuthUser) {
    return this.service.myRequests(user.id);
  }

  @Get('me/schedule-availability')
  @Roles(Role.STUDENT)
  @ApiOperation({ summary: 'The current teacher’s availability, for the day/time pickers' })
  myScheduleAvailability(@CurrentUser() user: AuthUser) {
    return this.service.myScheduleAvailability(user.id);
  }

  @Post('me/reschedule')
  @Roles(Role.STUDENT)
  @ApiOperation({ summary: 'Move one upcoming class within the plan’s reschedule allowance' })
  reschedule(@CurrentUser() user: AuthUser, @Body() dto: { sessionId: string; newStartsAt: string }) {
    return this.service.requestReschedule(user.id, dto.sessionId, dto.newStartsAt);
  }

  @Get('me/reschedule-slots')
  @Roles(Role.STUDENT)
  @ApiOperation({ summary: 'Available slots a class can be moved to (student picker)' })
  myRescheduleSlots(@CurrentUser() user: AuthUser, @Query('sessionId') sessionId: string) {
    return this.service.myRescheduleSlots(user.id, sessionId);
  }

  // ── Teacher-initiated reschedule (needs academic-coach approval) ────────────

  @Get('teacher/reschedulable')
  @Roles(Role.TEACHER)
  @ApiOperation({ summary: 'The teacher’s upcoming reschedulable classes + per-student counter' })
  teacherReschedulable(@CurrentUser() user: AuthUser) {
    return this.service.teacherReschedulableClasses(user.id);
  }

  @Get('teacher/reschedule-slots')
  @Roles(Role.TEACHER)
  @ApiOperation({ summary: 'Available slots for a teacher reschedule' })
  teacherRescheduleSlots(@CurrentUser() user: AuthUser, @Query('sessionId') sessionId: string) {
    return this.service.teacherRescheduleSlots(user.id, sessionId);
  }

  @Post('teacher/reschedule')
  @Roles(Role.TEACHER)
  @ApiOperation({ summary: 'Request to move a class (max 2 per student per cycle)' })
  teacherRequestReschedule(
    @CurrentUser() user: AuthUser,
    @Body() dto: { sessionId: string; newStartsAt: string; reason?: string },
  ) {
    return this.service.teacherRequestReschedule(user.id, dto.sessionId, dto.newStartsAt, dto.reason);
  }

  @Post('me/requests/package')
  @Roles(Role.STUDENT)
  @ApiOperation({ summary: 'Ask to change package from the next billing cycle' })
  requestPackage(
    @CurrentUser() user: AuthUser,
    @Body() dto: RequestPackageChangeDto,
  ) {
    return this.service.requestPackageChange(user.id, dto, {
      id: user.id,
      name: user.email,
      role: user.role,
    });
  }

  @Post('me/requests/schedule')
  @Roles(Role.STUDENT)
  @ApiOperation({ summary: 'Ask to change class days/time from the next billing cycle' })
  requestSchedule(
    @CurrentUser() user: AuthUser,
    @Body() dto: RequestScheduleChangeDto,
  ) {
    return this.service.requestScheduleChange(user.id, dto, {
      id: user.id,
      name: user.email,
      role: user.role,
    });
  }

  @Post('me/requests/break')
  @Roles(Role.STUDENT)
  @ApiOperation({ summary: 'Ask to pause the subscription for a fixed window' })
  requestBreak(@CurrentUser() user: AuthUser, @Body() dto: RequestBreakDto) {
    return this.service.requestBreak(user.id, dto, {
      id: user.id,
      name: user.email,
      role: user.role,
    });
  }

  // ── Staff. Static routes first, or :id swallows them ──────────────────────

  @Get('requests')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH)
  @ApiOperation({ summary: 'Change requests — coaches see their own students' })
  list(@Query() dto: ListSubscriptionRequestsDto, @CurrentUser() user: AuthUser) {
    return this.service.list(dto, { id: user.id, name: user.email, role: user.role });
  }

  @Get('requests/:id')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH)
  @ApiOperation({ summary: 'One request with the price / hours / availability comparison' })
  detail(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.detail(id, { id: user.id, name: user.email, role: user.role });
  }

  // Teacher reschedule requests — coaches see their own students; approve/reject
  // is admin + coach. Static paths declared before the parameterised ones.
  @Get('reschedule-requests')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH)
  @ApiOperation({ summary: 'Teacher reschedule requests — coaches see their own students' })
  rescheduleRequests(
    @Query('status') status: string | undefined,
    @Query('page') page: string | undefined,
    @Query('limit') limit: string | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.listRescheduleRequests(
      { status, page: page ? Number(page) : undefined, limit: limit ? Number(limit) : undefined },
      { id: user.id, name: user.email, role: user.role },
    );
  }

  // Student-initiated reschedules are auto-applied (no approval row); this
  // read-only audit feed surfaces them next to the teacher queue.
  @Get('reschedule-log')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH)
  @ApiOperation({ summary: 'Student-initiated reschedules (read-only audit feed)' })
  rescheduleLog(
    @Query('page') page: string | undefined,
    @Query('limit') limit: string | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.listStudentReschedules(
      { page: page ? Number(page) : undefined, limit: limit ? Number(limit) : undefined },
      { id: user.id, name: user.email, role: user.role },
    );
  }

  @Patch('reschedule-requests/:id/review')
  @Roles(Role.ADMIN, Role.ACADEMIC_COACH)
  @ApiOperation({ summary: 'Approve or reject a teacher reschedule request' })
  reviewReschedule(
    @Param('id') id: string,
    @Body() dto: { approve: boolean; notes?: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.reviewTeacherReschedule(id, dto, { id: user.id, name: user.email, role: user.role });
  }

  @Patch('requests/:id/review')
  @Roles(Role.ADMIN, Role.ACADEMIC_COACH)
  @ApiOperation({ summary: 'Approve or reject. Approving queues it for the next cycle.' })
  review(
    @Param('id') id: string,
    @Body() dto: ReviewSubscriptionRequestDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.review(id, dto, {
      id: user.id,
      name: user.email,
      role: user.role,
    });
  }

  // Staff-facing view of any student's subscription, for the approval screen
  // and the student hub.
  @Get('student/:studentId')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH)
  @ApiOperation({ summary: 'A student’s current subscription' })
  forStudent(@Param('studentId') studentId: string) {
    return this.service.currentFor(studentId);
  }

  // A coach/admin raises a break on a student's behalf (phone / WhatsApp / chat).
  @Post('student/:studentId/break')
  @Roles(Role.ADMIN, Role.ACADEMIC_COACH)
  @ApiOperation({ summary: 'Raise a break request on a student’s behalf' })
  breakForStudent(
    @Param('studentId') studentId: string,
    @Body() dto: RequestBreakDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.requestBreakForStudent(studentId, dto, { id: user.id, name: user.email, role: user.role });
  }

  // AC "Modify Schedule": preview the impact (affected classes + conflicts)…
  @Post('student/:studentId/modify-schedule/preview')
  @Roles(Role.ADMIN, Role.ACADEMIC_COACH)
  @ApiOperation({ summary: 'Preview a schedule modification — affected classes + conflicts' })
  previewModify(
    @Param('studentId') studentId: string,
    @Body() dto: ModifyScheduleDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.previewModifySchedule(studentId, dto, { id: user.id, name: user.email, role: user.role });
  }

  // …then apply it at the chosen scope.
  @Post('student/:studentId/modify-schedule')
  @Roles(Role.ADMIN, Role.ACADEMIC_COACH)
  @ApiOperation({ summary: 'Modify a student’s schedule (days/time/teacher) at a chosen scope' })
  modifySchedule(
    @Param('studentId') studentId: string,
    @Body() dto: ModifyScheduleDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.modifySchedule(studentId, dto, { id: user.id, name: user.email, role: user.role });
  }

  // Migrate a student to another subscription model/plan (e.g. Monthly → Hourly),
  // preserving all history. Admin-only, per the spec.
  @Post('student/:studentId/migrate')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Migrate a student to another model/plan, keeping history' })
  migrate(
    @Param('studentId') studentId: string,
    @Body() dto: { newPackageId: string; durationMinutes?: number; weeklyClasses?: number },
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.migrateModel(studentId, dto, { id: user.id, name: user.email, role: user.role });
  }

  /*
   * Apply a queued change now instead of waiting for the cycle. Normally the
   * billing sweep does this on its own; this exists for the days it did not —
   * the sweep errored, or the academy agreed to move somebody early. Admin
   * only, and it writes the same audit row the automatic path does.
   */
  @Post('student/:studentId/apply-now')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Apply this student’s queued change immediately' })
  applyNow(@Param('studentId') studentId: string) {
    return this.service.applyNextCycleFor(studentId);
  }
}
