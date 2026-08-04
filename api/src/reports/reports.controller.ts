import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles, type AuthUser } from '../auth/decorators';
import { Role } from '../generated/prisma/enums';
import { ReportsService } from './reports.service';

@ApiTags('monthly-reports')
@ApiBearerAuth()
@Controller('monthly-reports')
export class ReportsController {
  constructor(private readonly service: ReportsService) {}

  // ── Teacher ──
  @Get('me')
  @Roles(Role.TEACHER)
  @ApiOperation({ summary: "The teacher's own monthly reports" })
  mine(@CurrentUser() user: AuthUser, @Query('periodStart') periodStart?: string) {
    return this.service.myReports(user.id, periodStart);
  }

  @Post('me')
  @Roles(Role.TEACHER)
  @ApiOperation({ summary: 'Create or update a monthly report draft' })
  save(@CurrentUser() user: AuthUser, @Body() dto: any) {
    return this.service.upsertDraft(user.id, dto);
  }

  @Post('me/:id/submit')
  @Roles(Role.TEACHER)
  @ApiOperation({ summary: 'Submit a monthly report for review' })
  submit(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.submit(user.id, id);
  }

  // ── Staff ──
  @Get()
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH)
  @ApiOperation({ summary: 'Submitted monthly reports (coach-scoped)' })
  list(@CurrentUser() user: AuthUser, @Query('status') status?: string) {
    return this.service.listForStaff({ id: user.id, name: user.email, role: user.role }, status);
  }

  @Get('attendance-analytics')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH)
  @ApiOperation({ summary: 'Teacher attendance & punctuality analytics' })
  analytics(@Query('periodStart') periodStart?: string, @Query('periodEnd') periodEnd?: string) {
    return this.service.attendanceAnalytics(periodStart, periodEnd);
  }

  // Salary gate (spec 6D): are the teacher's reports for a period approved?
  @Get('gate/:teacherId')
  @Roles(Role.ADMIN, Role.SUPERVISOR)
  @ApiOperation({ summary: "Whether a teacher's monthly reports for a period are all approved" })
  gate(@Param('teacherId') teacherId: string, @Query('periodStart') periodStart: string) {
    return this.service.reportsGate(teacherId, periodStart);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH)
  @ApiOperation({ summary: 'Monthly report detail' })
  detail(@Param('id') id: string) {
    return this.service.detail(id);
  }

  @Post(':id/supervisor-review')
  @Roles(Role.SUPERVISOR, Role.ADMIN)
  @ApiOperation({ summary: 'Supervisor marks a report reviewed' })
  supervisorReview(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.supervisorReview(id, { id: user.id, name: user.email, role: user.role });
  }

  @Post(':id/admin-review')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Admin marks a report reviewed' })
  adminReview(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.adminReview(id, { id: user.id, name: user.email, role: user.role });
  }

  @Post(':id/approve')
  @Roles(Role.SUPERVISOR, Role.ADMIN)
  @ApiOperation({ summary: 'Approve a monthly report (supervisor)' })
  approve(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.approve(id, { id: user.id, name: user.email, role: user.role });
  }

  @Post(':id/reject')
  @Roles(Role.SUPERVISOR, Role.ADMIN)
  @ApiOperation({ summary: 'Return a monthly report to the teacher' })
  reject(@Param('id') id: string, @Body() dto: { notes?: string }, @CurrentUser() user: AuthUser) {
    return this.service.reject(id, dto, { id: user.id, name: user.email, role: user.role });
  }
}
