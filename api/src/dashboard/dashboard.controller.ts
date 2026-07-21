import { Controller, ForbiddenException, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser, Roles, type AuthUser } from '../auth/decorators';
import { Role } from '../generated/prisma/enums';
import { SuperAdminDashboardService } from './super-admin.service';
import { AdminOpsDashboardService } from './admin-ops.service';
import { CoachDashboardService } from './coach.service';
import { TeacherDashboardService } from './teacher-dash.service';
import { StudentDashboardService } from './student-dash.service';
import { DashboardCommonService } from './common.service';
import { AnnouncementsService } from './announcements.service';
import { CalendarDto, DashboardRangeDto, GlobalSearchDto, ParentDashboardDto } from './dto';
import { resolveRange } from './dashboard.range';

/*
 * Role dashboards.
 *
 * ADMIN      → Super Admin console (whole-academy monitoring)
 * SUPERVISOR → Admin console (day-to-day operations)
 *
 * Every route is scoped to the caller: a teacher can only ever load their own
 * dashboard, a parent only their linked children. `/dashboard/my` dispatches on
 * the caller's role so the frontend shell does not need to branch.
 */

@ApiTags('dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly superAdmin: SuperAdminDashboardService,
    private readonly adminOps: AdminOpsDashboardService,
    private readonly coach: CoachDashboardService,
    private readonly teacher: TeacherDashboardService,
    private readonly student: StudentDashboardService,
    private readonly common: DashboardCommonService,
    private readonly announcements: AnnouncementsService,
  ) {}

  // ── Role dashboards ───────────────────────────────────────────────────────

  @Get('super-admin')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Whole-academy KPIs, live stats and charts' })
  superAdminDashboard(@Query() query: DashboardRangeDto) {
    return this.superAdmin.dashboard(resolveRange(query.range, query.from, query.to));
  }

  @Get('admin')
  @Roles(Role.ADMIN, Role.SUPERVISOR)
  @ApiOperation({ summary: 'Day-to-day operations: today, queues, upcoming classes' })
  adminDashboard(@Query() query: DashboardRangeDto) {
    return this.adminOps.dashboard(resolveRange(query.range, query.from, query.to));
  }

  @Get('coach')
  @Roles(Role.ACADEMIC_COACH, Role.ADMIN)
  @ApiOperation({ summary: "Academic coach's roster, risks, reviews and trends" })
  coachDashboard(@CurrentUser() user: AuthUser, @Query() query: DashboardRangeDto) {
    return this.coach.dashboard(user.id, resolveRange(query.range, query.from, query.to));
  }

  @Get('teacher')
  @Roles(Role.TEACHER)
  @ApiOperation({ summary: "Teacher's schedule, pending work and student summary" })
  teacherDashboard(@CurrentUser() user: AuthUser, @Query() query: DashboardRangeDto) {
    return this.teacher.dashboard(user.id, resolveRange(query.range, query.from, query.to));
  }

  @Get('student')
  @Roles(Role.STUDENT)
  @ApiOperation({ summary: "Student's classes, work, progress and achievements" })
  studentDashboard(@CurrentUser() user: AuthUser, @Query() query: DashboardRangeDto) {
    return this.student.dashboard(user.id, resolveRange(query.range, query.from, query.to));
  }

  /** Dispatches to whichever dashboard the caller's role owns. */
  @Get('my')
  @ApiOperation({ summary: "The signed-in user's own dashboard, chosen by role" })
  myDashboard(@CurrentUser() user: AuthUser, @Query() query: ParentDashboardDto) {
    const range = resolveRange(query.range, query.from, query.to);
    switch (user.role) {
      case Role.ADMIN:
        return this.superAdmin.dashboard(range);
      case Role.SUPERVISOR:
        return this.adminOps.dashboard(range);
      case Role.ACADEMIC_COACH:
        return this.coach.dashboard(user.id, range);
      case Role.TEACHER:
        return this.teacher.dashboard(user.id, range);
      case Role.STUDENT:
        return this.student.dashboard(user.id, range);
      default:
        throw new ForbiddenException('No dashboard for this role.');
    }
  }

  // ── Common features (every authenticated role) ────────────────────────────

  @Get('search')
  @ApiOperation({ summary: 'Global search, scoped to what the caller may see' })
  search(@CurrentUser() user: AuthUser, @Query() query: GlobalSearchDto) {
    return this.common.search(user, query.q, query.limit ?? 5);
  }

  @Get('calendar')
  @ApiOperation({ summary: 'Classes, assignments, assessments, meetings and holidays' })
  calendar(@CurrentUser() user: AuthUser, @Query() query: CalendarDto) {
    return this.common.calendar(user, query.from, query.to);
  }

  @Get('activity')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH, Role.TEACHER)
  @ApiOperation({ summary: 'Recent academy activity feed' })
  activity() {
    return this.common.recentActivity();
  }

  @Get('announcements')
  @ApiOperation({ summary: 'Published announcements for the caller’s role' })
  announcementFeed(@CurrentUser() user: AuthUser) {
    return this.announcements.feed(user.id, user.role);
  }
}
