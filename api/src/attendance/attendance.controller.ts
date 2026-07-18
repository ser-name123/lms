import { Body, Controller, Delete, Get, HttpCode, Ip, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser, Roles, type AuthUser } from '../auth/decorators';
import { Role } from '../generated/prisma/enums';
import { AttendanceService } from './attendance.service';
import {
  AssignStudentsDto,
  AttendanceConfigDto,
  BulkMarkAttendanceDto,
  CreateBatchDto,
  EndClassDto,
  GenerateClassesDto,
  JoinClassDto,
  MarkAttendanceDto,
  RequestCorrectionDto,
  ReviewCorrectionDto,
  ScheduleClassDto,
  UpdateBatchDto,
} from './dto';

@ApiTags('attendance')
@ApiBearerAuth()
@Controller('attendance')
@Roles(Role.ADMIN, Role.ACADEMIC_COACH)
export class AttendanceController {
  constructor(private readonly service: AttendanceService) {}

  // ── Config (admin) ──────────────────────────────────────────────────────────
  @Get('config')
  @ApiOperation({ summary: 'Get configurable attendance rules' })
  getConfig() {
    return this.service.getConfig();
  }

  @Patch('config')
  @ApiOperation({ summary: 'Update attendance rules (thresholds / auto-lock / grace)' })
  updateConfig(@Body() dto: AttendanceConfigDto) {
    return this.service.updateConfig(dto);
  }

  @Post('low-attendance-check')
  @HttpCode(200)
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Run the low-attendance check now (it also runs hourly on its own)',
  })
  runLowAttendanceCheck() {
    return this.service.runLowAttendanceCheck();
  }

  // ── Batches (admin) ─────────────────────────────────────────────────────────
  @Post('batches')
  @ApiOperation({ summary: 'Create a batch' })
  createBatch(@Body() dto: CreateBatchDto) {
    return this.service.createBatch(dto);
  }

  @Get('batches')
  @ApiOperation({ summary: 'List batches' })
  listBatches(@Query() q: { courseId?: string; teacherId?: string; status?: string; search?: string }) {
    return this.service.listBatches(q);
  }

  @Get('batches/:id')
  @ApiOperation({ summary: 'Get one batch (with students)' })
  getBatch(@Param('id') id: string) {
    return this.service.getBatch(id);
  }

  @Patch('batches/:id')
  @ApiOperation({ summary: 'Update a batch' })
  updateBatch(@Param('id') id: string, @Body() dto: UpdateBatchDto) {
    return this.service.updateBatch(id, dto);
  }

  @Post('batches/:id/students')
  @ApiOperation({ summary: 'Assign students to a batch' })
  assignStudents(@Param('id') id: string, @Body() dto: AssignStudentsDto) {
    return this.service.assignStudents(id, dto);
  }

  @Delete('batches/:id/students/:studentId')
  @ApiOperation({ summary: 'Remove a student from a batch' })
  removeStudent(@Param('id') id: string, @Param('studentId') studentId: string) {
    return this.service.removeStudent(id, studentId);
  }

  // ── Class scheduling (admin) ────────────────────────────────────────────────
  @Post('classes')
  @ApiOperation({ summary: 'Schedule a class for a batch' })
  scheduleClass(@Body() dto: ScheduleClassDto) {
    return this.service.scheduleClass(dto);
  }

  @Post('classes/generate')
  @ApiOperation({ summary: "Bulk-generate classes from the batch's weekly schedule" })
  generateClasses(@Body() dto: GenerateClassesDto) {
    return this.service.generateClasses(dto);
  }

  @Get('classes')
  @ApiOperation({ summary: 'List classes (filters: batchId/teacherId/status/date/from/to)' })
  listClasses(@Query() q: { batchId?: string; teacherId?: string; status?: string; date?: string; from?: string; to?: string }) {
    return this.service.listClasses(q);
  }

  // ── Dashboards ──────────────────────────────────────────────────────────────
  @Get('dashboard/admin')
  @ApiOperation({ summary: 'Admin attendance dashboard' })
  adminDashboard() {
    return this.service.adminDashboard();
  }

  @Get('dashboard/teacher')
  @Roles(Role.TEACHER, Role.ADMIN, Role.ACADEMIC_COACH)
  @ApiOperation({ summary: "Teacher attendance dashboard" })
  teacherDashboard(@CurrentUser() user: AuthUser) {
    return this.service.teacherDashboard(user.id);
  }

  @Get('dashboard/student')
  @Roles(Role.STUDENT, Role.ADMIN, Role.ACADEMIC_COACH)
  @ApiOperation({ summary: 'Student attendance dashboard (also used for parent view)' })
  studentDashboard(@CurrentUser() user: AuthUser) {
    return this.service.studentDashboard(user.id);
  }

  // ── Reports (admin) ─────────────────────────────────────────────────────────
  @Get('analytics')
  @ApiOperation({ summary: 'Charts: weekly/monthly trend + teacher/course/batch/country-wise' })
  analytics() {
    return this.service.analytics();
  }

  @Get('reports/:type')
  @ApiOperation({ summary: 'Report: student|teacher|course|batch|monthly|yearly|low|perfect|no-show|late' })
  report(@Param('type') type: string, @Query() q: { from?: string; to?: string; batchId?: string; teacherId?: string; courseId?: string }) {
    return this.service.report(type, q);
  }

  // ── Class attendance view (teacher/admin) ───────────────────────────────────
  @Get('classes/:id')
  @Roles(Role.TEACHER, Role.ADMIN, Role.ACADEMIC_COACH)
  @ApiOperation({ summary: 'Class attendance sheet' })
  classAttendance(@Param('id') id: string) {
    return this.service.getClassAttendance(id);
  }

  // ── Lifecycle: teacher start / end ──────────────────────────────────────────
  @Post('classes/:id/start')
  @Roles(Role.TEACHER, Role.ADMIN, Role.ACADEMIC_COACH)
  @ApiOperation({ summary: 'Teacher starts the class' })
  startClass(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.startClass(id, user.id, user.role !== Role.TEACHER);
  }

  @Post('classes/:id/end')
  @Roles(Role.TEACHER, Role.ADMIN, Role.ACADEMIC_COACH)
  @ApiOperation({ summary: 'Teacher ends the class (finalises attendance)' })
  endClass(@Param('id') id: string, @Body() dto: EndClassDto, @CurrentUser() user: AuthUser) {
    return this.service.endClass(id, user.id, user.role !== Role.TEACHER, dto);
  }

  @Post('classes/:id/cancel')
  @Roles(Role.TEACHER, Role.ADMIN, Role.ACADEMIC_COACH)
  @ApiOperation({ summary: 'Cancel a class (no attendance counted; students notified)' })
  cancelClass(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.cancelClass(id, user.id, user.role !== Role.TEACHER, { id: user.id, name: user.email });
  }

  @Post('classes/:id/mark')
  @Roles(Role.TEACHER, Role.ADMIN, Role.ACADEMIC_COACH)
  @ApiOperation({ summary: 'Teacher marks/verifies a single student' })
  mark(@Param('id') id: string, @Body() dto: MarkAttendanceDto, @CurrentUser() user: AuthUser) {
    return this.service.markAttendance(id, dto, user.id, user.role !== Role.TEACHER, { id: user.id, name: user.email });
  }

  @Post('classes/:id/mark-bulk')
  @Roles(Role.TEACHER, Role.ADMIN, Role.ACADEMIC_COACH)
  @ApiOperation({ summary: 'Teacher bulk-marks students' })
  async markBulk(@Param('id') id: string, @Body() dto: BulkMarkAttendanceDto, @CurrentUser() user: AuthUser) {
    for (const e of dto.entries) {
      await this.service.markAttendance(id, e, user.id, user.role !== Role.TEACHER, { id: user.id, name: user.email });
    }
    return this.service.getClassAttendance(id);
  }

  // ── Lifecycle: student join / leave ─────────────────────────────────────────
  @Post('classes/:id/join')
  @Roles(Role.STUDENT)
  @ApiOperation({ summary: 'Student joins the class (records join time/device/IP)' })
  join(@Param('id') id: string, @Body() dto: JoinClassDto, @CurrentUser() user: AuthUser, @Ip() ip: string, @Req() req: any) {
    const ua = req.headers['user-agent'] as string | undefined;
    return this.service.studentJoin(id, user.id, { ip, device: dto.device, browser: dto.browser || ua });
  }

  @Post('classes/:id/leave')
  @Roles(Role.STUDENT)
  @ApiOperation({ summary: 'Student leaves the class (records leave time + duration)' })
  leave(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.studentLeave(id, user.id);
  }

  // ── Corrections ─────────────────────────────────────────────────────────────
  @Post('corrections')
  @Roles(Role.TEACHER, Role.ADMIN, Role.ACADEMIC_COACH)
  @ApiOperation({ summary: 'Raise an attendance correction request' })
  requestCorrection(@Body() dto: RequestCorrectionDto, @CurrentUser() user: AuthUser) {
    return this.service.requestCorrection(dto, { id: user.id, name: user.email });
  }

  @Get('corrections')
  @ApiOperation({ summary: 'List correction requests (admin)' })
  listCorrections(@Query('status') status?: string) {
    return this.service.listCorrections(status);
  }

  @Patch('corrections/:id')
  @ApiOperation({ summary: 'Approve / reject a correction (admin)' })
  reviewCorrection(@Param('id') id: string, @Body() dto: ReviewCorrectionDto, @CurrentUser() user: AuthUser) {
    return this.service.reviewCorrection(id, dto, { id: user.id, name: user.email });
  }
}
