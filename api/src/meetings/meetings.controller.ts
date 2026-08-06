import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import {
  BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query,
  UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser, Roles, type AuthUser } from '../auth/decorators';
import { Role } from '../generated/prisma/enums';
import { MeetingsService } from './meetings.service';
import { MeetingSeriesService } from './meeting-series.service';
import { MeetingReportsService } from './meeting-reports.service';
import {
  ActionItemDto, AddAttachmentDto, CancelMeetingDto, CreateMeetingDto, ListMeetingsQuery,
  MarkAttendanceDto, RescheduleMeetingDto, SaveMeetingConfigDto, SaveMinutesDto, SaveSeriesDto,
  UpdateActionItemDto, UpdateMeetingDto,
} from './dto';

const actor = (u: AuthUser) => ({ id: u.id, email: u.email, role: u.role });

/*
 * 8.8 — recordings, documents, presentations and training material.
 *
 * Same disk-storage shape the assignments and expenses controllers use, in its
 * own folder so a meeting recording is never served from an assignment path.
 * The limit is 500 MB rather than the usual 100: a sixty-minute recording is
 * routinely larger than a homework PDF, and the point of the feature is to
 * store the recording.
 */
const UPLOAD_DIR = join(process.cwd(), 'uploads', 'meetings');
const storage = diskStorage({
  destination: (_req, _file, cb) => {
    mkdirSync(UPLOAD_DIR, { recursive: true });
    cb(null, UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const stamp = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = (file.originalname.match(/\.[a-zA-Z0-9]+$/) || [''])[0];
    cb(null, `${stamp}${ext}`);
  },
});

/*
 * Module 8 — one controller for every panel.
 *
 * The same meeting row backs the admin, supervisor, coach, teacher and student
 * screens; what differs is which transitions each role may make, and that is
 * expressed with @Roles plus ownership checks in the service rather than five
 * parallel controllers that would drift apart.
 *
 * STUDENT appears on the read and join routes only — the spec lets a coach or
 * supervisor put a student IN a meeting, never let them run one.
 */
@ApiTags('meetings')
@ApiBearerAuth()
@Controller('meetings')
export class MeetingsController {
  constructor(
    private readonly service: MeetingsService,
    private readonly series: MeetingSeriesService,
    private readonly reports: MeetingReportsService,
  ) {}

  // ── Static routes first, so :id does not swallow them ─────────────────────

  /**
   * 8.8 — upload a recording, document, presentation or training file.
   *
   * Students are excluded: they may open what is attached to a meeting they
   * were in, but the spec puts uploading with "authorized staff".
   */
  @Post('upload')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH, Role.TEACHER)
  @UseInterceptors(FileInterceptor('file', { storage, limits: { fileSize: 500 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a meeting recording or document' })
  upload(@UploadedFile() file: Express.Multer.File | undefined) {
    if (!file) throw new BadRequestException('No file uploaded.');
    return { url: `/uploads/meetings/${file.filename}`, name: file.originalname };
  }

  @Get('mine')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH, Role.TEACHER, Role.STUDENT)
  @ApiOperation({ summary: "The caller's own meetings, split upcoming / past / cancelled" })
  mine(@CurrentUser() u: AuthUser) {
    return this.service.mine(actor(u));
  }

  @Get('my-stats')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH, Role.TEACHER, Role.STUDENT)
  @ApiOperation({ summary: "The caller's own attendance and open action items" })
  myStats(@CurrentUser() u: AuthUser) {
    return this.reports.myStats(u.id);
  }

  @Get('my-actions')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH, Role.TEACHER, Role.STUDENT)
  @ApiOperation({ summary: 'Action items assigned to the caller, across meetings' })
  myActions(@CurrentUser() u: AuthUser, @Query('status') status?: string) {
    return this.service.myActionItems(actor(u), status);
  }

  @Get('invitables')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH, Role.TEACHER)
  @ApiOperation({ summary: 'Staff, students and courses available to invite' })
  invitables(@CurrentUser() u: AuthUser) {
    return this.service.invitableUsers(actor(u));
  }

  @Get('dashboard')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH)
  @ApiOperation({ summary: 'Counts, minutes owed and attendance for the admin header' })
  dashboard() {
    return this.reports.dashboard();
  }

  // ── Settings + recurring series (8.2, 8.3) ────────────────────────────────

  @Get('settings')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH, Role.TEACHER)
  @ApiOperation({ summary: 'Reminder offsets, lateness threshold and platform defaults' })
  settings() {
    return this.service.config();
  }

  @Patch('settings')
  @Roles(Role.ADMIN, Role.SUPERVISOR)
  @ApiOperation({ summary: 'Save the meeting rules' })
  saveSettings(@Body() dto: SaveMeetingConfigDto) {
    return this.service.saveConfig(dto);
  }

  @Get('series')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH)
  @ApiOperation({ summary: 'Recurring meeting schedules' })
  listSeries() {
    return this.series.listSeries();
  }

  @Post('series')
  @Roles(Role.ADMIN, Role.SUPERVISOR)
  @ApiOperation({ summary: 'Create a recurring schedule' })
  createSeries(@Body() dto: SaveSeriesDto, @CurrentUser() u: AuthUser) {
    return this.series.createSeries(dto, actor(u));
  }

  @Put('series/:id')
  @Roles(Role.ADMIN, Role.SUPERVISOR)
  @ApiOperation({ summary: 'Change a recurring schedule (regenerates untouched future dates)' })
  updateSeries(@Param('id') id: string, @Body() dto: SaveSeriesDto, @CurrentUser() u: AuthUser) {
    return this.series.updateSeries(id, dto, actor(u));
  }

  @Delete('series/:id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Delete a recurring schedule (its meetings survive)' })
  deleteSeries(@Param('id') id: string) {
    return this.series.deleteSeries(id);
  }

  @Post('series/:id/generate')
  @Roles(Role.ADMIN, Role.SUPERVISOR)
  @HttpCode(200)
  @ApiOperation({ summary: 'Generate this series’ upcoming occurrences now' })
  async generateSeries(@Param('id') id: string) {
    const created = await this.series.generateFor(id);
    return { created };
  }

  // ── Reports (8.11) ────────────────────────────────────────────────────────

  @Get('reports/attendance')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH)
  @ApiOperation({ summary: 'Per-meeting attendance' })
  reportAttendance(@Query('from') from?: string, @Query('to') to?: string, @Query('type') type?: string) {
    return this.reports.attendanceReport(from, to, type);
  }

  @Get('reports/staff')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH)
  @ApiOperation({ summary: 'Attendance percentage per staff member' })
  reportStaff(@Query('from') from?: string, @Query('to') to?: string, @Query('role') role?: string) {
    return this.reports.staffAttendance(from, to, role);
  }

  @Get('reports/missed')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH)
  @ApiOperation({ summary: 'Who missed what' })
  reportMissed(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reports.missedMeetings(from, to);
  }

  @Get('reports/minutes')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH)
  @ApiOperation({ summary: 'Minutes written, outstanding and compliance' })
  reportMinutes(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reports.minutesReport(from, to);
  }

  @Get('reports/actions')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH)
  @ApiOperation({ summary: 'Action item status across meetings' })
  reportActions(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('assignedToId') assignedToId?: string,
  ) {
    return this.reports.actionItemReport(from, to, assignedToId);
  }

  @Get('reports/training')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH)
  @ApiOperation({ summary: 'Training session attendance per staff member' })
  reportTraining(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reports.trainingReport(from, to);
  }

  // ── Action items, addressed by their own id ───────────────────────────────

  @Patch('action-items/:itemId')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH, Role.TEACHER, Role.STUDENT)
  @ApiOperation({ summary: 'Update an action item (assignee may only move its status)' })
  updateAction(@Param('itemId') itemId: string, @Body() dto: UpdateActionItemDto, @CurrentUser() u: AuthUser) {
    return this.service.updateActionItem(itemId, dto, actor(u));
  }

  @Delete('action-items/:itemId')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH, Role.TEACHER)
  @ApiOperation({ summary: 'Remove an action item' })
  deleteAction(@Param('itemId') itemId: string, @CurrentUser() u: AuthUser) {
    return this.service.deleteActionItem(itemId, actor(u));
  }

  @Delete('attachments/:attachmentId')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH, Role.TEACHER)
  @ApiOperation({ summary: 'Remove an attachment' })
  deleteAttachment(@Param('attachmentId') attachmentId: string, @CurrentUser() u: AuthUser) {
    return this.service.deleteAttachment(attachmentId, actor(u));
  }

  // ── Meetings ──────────────────────────────────────────────────────────────

  @Get()
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH, Role.TEACHER, Role.STUDENT)
  @ApiOperation({ summary: 'Meetings (a non-staff caller sees only their own)' })
  list(@Query() q: ListMeetingsQuery, @CurrentUser() u: AuthUser) {
    return this.service.list(q, actor(u));
  }

  @Post()
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH, Role.TEACHER)
  @ApiOperation({ summary: 'Schedule a meeting' })
  create(@Body() dto: CreateMeetingDto, @CurrentUser() u: AuthUser) {
    return this.service.create(dto, actor(u));
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH, Role.TEACHER, Role.STUDENT)
  @ApiOperation({ summary: 'One meeting in full' })
  getOne(@Param('id') id: string, @CurrentUser() u: AuthUser) {
    return this.service.getOne(id, actor(u));
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH, Role.TEACHER)
  @ApiOperation({ summary: 'Edit a meeting' })
  update(@Param('id') id: string, @Body() dto: UpdateMeetingDto, @CurrentUser() u: AuthUser) {
    return this.service.update(id, dto, actor(u));
  }

  @Post(':id/reschedule')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH, Role.TEACHER)
  @HttpCode(200)
  @ApiOperation({ summary: 'Move a meeting and tell everyone' })
  reschedule(@Param('id') id: string, @Body() dto: RescheduleMeetingDto, @CurrentUser() u: AuthUser) {
    return this.service.reschedule(id, dto, actor(u));
  }

  @Post(':id/cancel')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH, Role.TEACHER)
  @HttpCode(200)
  @ApiOperation({ summary: 'Cancel a meeting and tell everyone' })
  cancel(@Param('id') id: string, @Body() dto: CancelMeetingDto, @CurrentUser() u: AuthUser) {
    return this.service.cancel(id, dto, actor(u));
  }

  @Post(':id/start')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH, Role.TEACHER)
  @HttpCode(200)
  @ApiOperation({ summary: 'Mark the meeting live' })
  start(@Param('id') id: string, @CurrentUser() u: AuthUser) {
    return this.service.start(id, actor(u));
  }

  @Post(':id/end')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH, Role.TEACHER)
  @HttpCode(200)
  @ApiOperation({ summary: 'Complete the meeting and settle attendance' })
  end(@Param('id') id: string, @CurrentUser() u: AuthUser) {
    return this.service.end(id, actor(u));
  }

  // ── Attendance (8.5) ──────────────────────────────────────────────────────

  @Post(':id/join')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH, Role.TEACHER, Role.STUDENT)
  @HttpCode(200)
  @ApiOperation({ summary: 'Join from the portal — records the join time' })
  join(@Param('id') id: string, @CurrentUser() u: AuthUser) {
    return this.service.join(id, actor(u));
  }

  @Post(':id/leave')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH, Role.TEACHER, Role.STUDENT)
  @HttpCode(200)
  @ApiOperation({ summary: 'Leave — records the duration and derives the status' })
  leave(@Param('id') id: string, @CurrentUser() u: AuthUser) {
    return this.service.leave(id, actor(u));
  }

  @Post(':id/attendance')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH, Role.TEACHER)
  @HttpCode(200)
  @ApiOperation({ summary: 'Correct a participant’s status, or excuse them' })
  markAttendance(@Param('id') id: string, @Body() dto: MarkAttendanceDto, @CurrentUser() u: AuthUser) {
    return this.service.markAttendance(id, dto, actor(u));
  }

  // ── Minutes (8.6) ─────────────────────────────────────────────────────────

  @Put(':id/minutes')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH, Role.TEACHER)
  @ApiOperation({ summary: 'Save minutes as a draft' })
  saveMinutes(@Param('id') id: string, @Body() dto: SaveMinutesDto, @CurrentUser() u: AuthUser) {
    return this.service.saveMinutes(id, dto, actor(u));
  }

  @Post(':id/minutes/publish')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH, Role.TEACHER)
  @HttpCode(200)
  @ApiOperation({ summary: 'Publish the minutes to every participant' })
  publishMinutes(@Param('id') id: string, @CurrentUser() u: AuthUser) {
    return this.service.publishMinutes(id, actor(u));
  }

  @Post(':id/minutes/reopen')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH)
  @HttpCode(200)
  @ApiOperation({ summary: 'Reopen published minutes for correction' })
  reopenMinutes(@Param('id') id: string, @CurrentUser() u: AuthUser) {
    return this.service.reopenMinutes(id, actor(u));
  }

  // ── Action items + attachments ────────────────────────────────────────────

  @Post(':id/action-items')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH, Role.TEACHER)
  @ApiOperation({ summary: 'Assign an action item' })
  addAction(@Param('id') id: string, @Body() dto: ActionItemDto, @CurrentUser() u: AuthUser) {
    return this.service.addActionItem(id, dto, actor(u));
  }

  @Post(':id/attachments')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH, Role.TEACHER)
  @ApiOperation({ summary: 'Attach a recording, document or training material' })
  addAttachment(@Param('id') id: string, @Body() dto: AddAttachmentDto, @CurrentUser() u: AuthUser) {
    return this.service.addAttachment(id, dto, actor(u));
  }

  @Get(':id/audit')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH, Role.TEACHER)
  @ApiOperation({ summary: 'Everything that has happened to this meeting' })
  audit(@Param('id') id: string, @CurrentUser() u: AuthUser) {
    return this.service.auditTrail(id, actor(u));
  }
}
