import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser, Roles, type AuthUser } from '../auth/decorators';
import { Role } from '../generated/prisma/enums';
import { TeacherManagementService } from './teacher-management.service';
import {
  AssignBatchesDto, AssignStudentsDto, SendTeacherMessageDto, SetAvailabilityDto,
  SetTeacherStatusDto, TransferStudentsDto, UpdateTeachingDto, UpdateTeacherProfileDto,
} from './dto';

@ApiTags('teacher-management')
@ApiBearerAuth()
@Controller('teacher-management')
@Roles(Role.ADMIN, Role.ACADEMIC_COACH)
export class TeacherManagementController {
  constructor(private readonly service: TeacherManagementService) {}

  // ── Teacher self-service (own availability) — declare before :id ────────────
  @Get('me/availability')
  @Roles(Role.TEACHER)
  @ApiOperation({ summary: "Teacher: get my own availability" })
  myAvailability(@CurrentUser() user: AuthUser) {
    return this.service.myAvailability(user.id);
  }

  @Put('me/availability')
  @Roles(Role.TEACHER)
  @ApiOperation({ summary: "Teacher: submit my availability (needs admin approval)" })
  submitMyAvailability(@CurrentUser() user: AuthUser, @Body() dto: SetAvailabilityDto) {
    return this.service.submitMyAvailability(user.id, dto);
  }

  // ── Fleet analytics + report (static paths — declare before :id) ────────────
  @Get('analytics/fleet')
  @ApiOperation({ summary: 'Fleet analytics across all teachers' })
  fleetAnalytics() {
    return this.service.fleetAnalytics();
  }

  @Get('reports/performance')
  @ApiOperation({ summary: 'Teacher performance report (one row per teacher)' })
  performanceReport() {
    return this.service.performanceReport();
  }

  @Get('assignable/students')
  @ApiOperation({ summary: 'Unassigned enrollments available to assign' })
  assignable(@Query('search') search?: string) {
    return this.service.getAssignable(search);
  }

  // ── Admin / coach ───────────────────────────────────────────────────────────
  @Get(':id')
  @ApiOperation({ summary: 'Full teacher-management profile' })
  getManagement(@Param('id') id: string) {
    return this.service.getManagement(id);
  }

  @Post(':id/students/assign')
  @ApiOperation({ summary: 'Assign students (enrollments) to this teacher' })
  assignStudents(@Param('id') id: string, @Body() dto: AssignStudentsDto) {
    return this.service.assignStudents(id, dto.enrollmentIds);
  }

  @Delete(':id/students/:enrollmentId')
  @ApiOperation({ summary: 'Remove (unassign) a student from this teacher' })
  removeStudent(@Param('id') id: string, @Param('enrollmentId') enrollmentId: string) {
    return this.service.removeStudent(id, enrollmentId);
  }

  @Get(':id/batches')
  @ApiOperation({ summary: 'Assigned + available batches' })
  getBatches(@Param('id') id: string) {
    return this.service.getBatches(id);
  }

  @Post(':id/batches/assign')
  @ApiOperation({ summary: 'Assign batches to this teacher' })
  assignBatches(@Param('id') id: string, @Body() dto: AssignBatchesDto) {
    return this.service.assignBatches(id, dto.batchIds);
  }

  @Delete(':id/batches/:batchId')
  @ApiOperation({ summary: 'Unassign a batch from this teacher' })
  unassignBatch(@Param('id') id: string, @Param('batchId') batchId: string) {
    return this.service.unassignBatch(id, batchId);
  }

  @Patch(':id/archive')
  @ApiOperation({ summary: 'Archive / unarchive the teacher' })
  archive(@Param('id') id: string, @Body() body: { archived?: boolean }) {
    return this.service.archive(id, body.archived !== false);
  }

  @Patch(':id/teaching')
  @ApiOperation({ summary: 'Set subjects / levels / teaching modes' })
  updateTeaching(@Param('id') id: string, @Body() dto: UpdateTeachingDto, @CurrentUser() user: AuthUser) {
    return this.service.updateTeaching(id, dto, { id: user.id, name: user.email });
  }

  @Patch(':id/profile')
  @ApiOperation({ summary: 'Update profile enrichment fields' })
  updateProfile(@Param('id') id: string, @Body() dto: UpdateTeacherProfileDto) {
    return this.service.updateProfile(id, dto);
  }

  @Put(':id/availability')
  @ApiOperation({ summary: 'Set teacher availability (admin — auto-approved)' })
  setAvailability(@Param('id') id: string, @Body() dto: SetAvailabilityDto) {
    return this.service.setAvailability(id, dto, { byTeacher: false });
  }

  @Patch(':id/availability/approve')
  @ApiOperation({ summary: 'Approve / unapprove submitted availability' })
  approveAvailability(@Param('id') id: string, @Body() body: { approve?: boolean }) {
    return this.service.approveAvailability(id, body.approve !== false);
  }

  @Get(':id/students')
  @ApiOperation({ summary: 'Assigned students' })
  getStudents(@Param('id') id: string) {
    return this.service.getStudents(id);
  }

  @Post(':id/students/transfer')
  @ApiOperation({ summary: 'Transfer students to another teacher' })
  transfer(@Param('id') id: string, @Body() dto: TransferStudentsDto, @CurrentUser() user: AuthUser) {
    return this.service.transferStudents(id, dto, { id: user.id, name: user.email });
  }

  @Get(':id/schedule')
  @ApiOperation({ summary: 'Weekly schedule' })
  getSchedule(@Param('id') id: string) {
    return this.service.getSchedule(id);
  }

  @Get(':id/performance')
  @ApiOperation({ summary: 'Performance metrics + system rating' })
  getPerformance(@Param('id') id: string) {
    return this.service.getPerformance(id);
  }

  @Get(':id/analytics')
  @ApiOperation({ summary: 'Per-teacher charts (monthly hours, subject distribution)' })
  getAnalytics(@Param('id') id: string) {
    return this.service.getAnalytics(id);
  }

  @Get(':id/documents')
  @ApiOperation({ summary: 'Teacher documents (from profile / registration)' })
  getDocuments(@Param('id') id: string) {
    return this.service.getDocuments(id);
  }

  @Get(':id/communication')
  @ApiOperation({ summary: 'Communication history (notifications)' })
  getCommunication(@Param('id') id: string) {
    return this.service.getCommunication(id);
  }

  @Post(':id/message')
  @ApiOperation({ summary: 'Send a message / announcement to the teacher' })
  sendMessage(@Param('id') id: string, @Body() dto: SendTeacherMessageDto) {
    return this.service.sendMessage(id, dto);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Activate / suspend / pause the teacher account' })
  setStatus(@Param('id') id: string, @Body() dto: SetTeacherStatusDto) {
    return this.service.setStatus(id, dto);
  }
}
