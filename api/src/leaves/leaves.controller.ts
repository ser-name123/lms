import { basename, extname, join, resolve, sep } from 'node:path';
import { createReadStream, existsSync, mkdirSync } from 'node:fs';
import {
  BadRequestException, Body, Controller, Delete, ForbiddenException, Get, HttpCode,
  HttpStatus, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query, Res,
  StreamableFile, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import type { Response } from 'express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser, Roles, type AuthUser } from '../auth/decorators';
import { Role } from '../generated/prisma/enums';
import {
  ApproveLeaveDto, CancelLeaveDto, CreateLeaveDto, DecideImpactDto, EditOwnLeaveDto,
  ListLeavesDto, RejectLeaveDto, RequestInfoDto, RespondInfoDto, SaveLeaveConfigDto,
  UpdateLeaveDto,
} from './dto';
import { LeavesService } from './leaves.service';
import { LeaveImpactService } from './leave-impact.service';
import { LeaveReportsService } from './leave-reports.service';

const actor = (u: AuthUser) => ({ id: u.id, role: u.role });

/*
 * §9.1 supporting documents — a medical certificate and the like.
 *
 * Its own folder, and NOT served statically: a sick note is medical information
 * about a named employee. It is streamed back through the guarded download
 * route below, which checks the caller may see that request at all.
 */
const UPLOAD_DIR = join(process.cwd(), 'uploads', 'leave-docs');
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
 * Module 9 — one controller for every panel.
 *
 * The role list is per route rather than on the class. The pre-Module-9
 * controller carried a class-level @Roles(ADMIN, SUPERVISOR, ACADEMIC_COACH),
 * which meant TEACHERS COULD NOT REACH LEAVE AT ALL — §9.1 says all staff
 * request from their own portal, so the teacher had a spec obligation and no
 * endpoint. Deciding is still admin-only; asking is everyone's.
 */
@ApiTags('leaves')
@ApiBearerAuth()
@Controller('leaves')
export class LeavesController {
  constructor(
    private readonly service: LeavesService,
    private readonly impacts: LeaveImpactService,
    private readonly reports: LeaveReportsService,
  ) {}

  // ── Static routes first, so :id does not swallow them ─────────────────────

  @Get('mine')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH, Role.TEACHER)
  @ApiOperation({ summary: "The caller's own leave history and counters" })
  mine(@CurrentUser() u: AuthUser) {
    return this.service.mine(actor(u));
  }

  @Get('stats')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH)
  @ApiOperation({ summary: 'Leave queue counters' })
  getStats() {
    return this.service.getStats();
  }

  @Get('settings')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH, Role.TEACHER)
  @ApiOperation({ summary: 'Leave types offered and the deduction rules (§9.11)' })
  settings() {
    return this.service.config();
  }

  @Patch('settings')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Configure leave types and deduction rules (§9.11)' })
  saveSettings(@Body() dto: SaveLeaveConfigDto) {
    return this.service.saveConfig(dto);
  }

  @Post('upload')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH, Role.TEACHER)
  @UseInterceptors(FileInterceptor('file', { storage, limits: { fileSize: 25 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a supporting document (§9.1)' })
  upload(@UploadedFile() file: Express.Multer.File | undefined) {
    if (!file) throw new BadRequestException('No file uploaded.');
    // A path, not a URL: this folder is not served statically. See `document`.
    return { url: `leave-docs/${file.filename}`, name: file.originalname };
  }

  // ── §9.5 the coach's affected-classes queue ───────────────────────────────

  @Get('impacts')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH)
  @ApiOperation({ summary: 'Affected students awaiting a decision (§9.5)' })
  listImpacts(@Query('status') status?: string, @Query('leaveId') leaveId?: string) {
    return this.impacts.list(status, leaveId);
  }

  @Get('impacts/:impactId')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH)
  @ApiOperation({ summary: 'One affected student, with their affected classes' })
  getImpact(@Param('impactId', ParseUUIDPipe) impactId: string) {
    return this.impacts.getOne(impactId);
  }

  @Get('impacts/:impactId/replacements')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH)
  @ApiOperation({ summary: 'Teachers free for this student across the window (§9.5 option 2)' })
  replacements(@Param('impactId', ParseUUIDPipe) impactId: string) {
    return this.impacts.availableReplacements(impactId);
  }

  @Post('impacts/:impactId/decide')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH)
  @ApiOperation({ summary: 'Wait / temporary teacher / reschedule (§9.5)' })
  decide(
    @Param('impactId', ParseUUIDPipe) impactId: string,
    @Body() dto: DecideImpactDto,
    @CurrentUser() u: AuthUser,
  ) {
    return this.impacts.decide(impactId, dto, actor(u));
  }

  /** A student (or an admin on their behalf) asking what happened to their classes. */
  @Get('my-impacts')
  @Roles(Role.STUDENT)
  @ApiOperation({ summary: "The student's own affected-class outcome" })
  myImpacts(@CurrentUser() u: AuthUser) {
    return this.impacts.forStudentUser(u.id);
  }

  // ── §9.10 reports ─────────────────────────────────────────────────────────

  @Get('reports/summary')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH)
  reportSummary(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reports.staffLeaveSummary(from, to);
  }

  @Get('reports/paid-unpaid')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH)
  reportPaidUnpaid(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reports.paidVsUnpaid(from, to);
  }

  @Get('reports/unavailability')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH)
  reportUnavailability(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reports.teacherUnavailability(from, to);
  }

  @Get('reports/impact')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH)
  reportImpact(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reports.unavailabilityImpact(from, to);
  }

  @Get('reports/register')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH)
  reportRegister(@Query('month') month?: string) {
    return this.reports.monthlyRegister(month);
  }

  // ── §9.1 / §9.9 requests ──────────────────────────────────────────────────

  @Get()
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH, Role.TEACHER)
  @ApiOperation({ summary: 'Paginated, filtered leave history (§9.9)' })
  list(@Query() query: ListLeavesDto, @CurrentUser() u: AuthUser) {
    return this.service.list(query, actor(u));
  }

  @Post()
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH, Role.TEACHER)
  @ApiOperation({ summary: 'Request leave or teacher unavailability (§9.1)' })
  create(@Body() dto: CreateLeaveDto, @CurrentUser() u: AuthUser) {
    return this.service.create(dto, actor(u));
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH, Role.TEACHER)
  @ApiOperation({ summary: 'One leave request' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) {
    return this.service.findOne(id, actor(u));
  }

  @Get(':id/audit')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH)
  @ApiOperation({ summary: 'Everything that happened to this request (§9.11)' })
  audit(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.auditTrail(id);
  }

  /**
   * The supporting document, streamed rather than linked.
   *
   * A medical certificate names an employee and their condition, so the folder
   * is not served statically — this route checks the caller may see the request
   * before handing the bytes over.
   */
  @Get(':id/document')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH, Role.TEACHER)
  @ApiOperation({ summary: 'Download the supporting document, auth-checked' })
  async document(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() u: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    // findOne 404s for anyone who is neither staff nor the requester.
    const leave = await this.service.findOne(id, actor(u));
    if (!leave.documentUrl) throw new NotFoundException('No document was attached to this request.');

    // Contain the resolved path inside the leave-docs dir: a stored value like
    // "../../.env" must never escape and stream an arbitrary server file.
    const root = resolve(UPLOAD_DIR);
    const filePath = resolve(UPLOAD_DIR, basename(leave.documentUrl));
    if (!filePath.startsWith(root + sep)) throw new ForbiddenException('Invalid file path');
    if (!existsSync(filePath)) throw new NotFoundException('That document is no longer on file.');

    const ext = extname(filePath).toLowerCase();
    const mime =
      ext === '.pdf' ? 'application/pdf'
      : ext === '.png' ? 'image/png'
      : ext === '.webp' ? 'image/webp'
      : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg'
      : 'application/octet-stream';
    res.set({
      'Content-Type': mime,
      'Content-Disposition': `inline; filename="${(leave.documentName ?? basename(filePath)).replace(/"/g, '')}"`,
    });
    return new StreamableFile(createReadStream(filePath));
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH, Role.TEACHER)
  @ApiOperation({ summary: 'Correct your own pending request' })
  editOwn(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EditOwnLeaveDto,
    @CurrentUser() u: AuthUser,
  ) {
    return this.service.editOwn(id, dto, actor(u));
  }

  @Post(':id/cancel')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH, Role.TEACHER)
  @ApiOperation({ summary: 'Withdraw a pending request, or cancel an approved one (admin)' })
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelLeaveDto,
    @CurrentUser() u: AuthUser,
  ) {
    return this.service.cancel(id, dto, actor(u));
  }

  @Post(':id/respond-info')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH, Role.TEACHER)
  @ApiOperation({ summary: 'Answer the admin question (§9.2)' })
  respondInfo(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RespondInfoDto,
    @CurrentUser() u: AuthUser,
  ) {
    return this.service.respondInfo(id, dto, actor(u));
  }

  // ── §9.2 decisions — admin only ───────────────────────────────────────────

  @Post(':id/approve')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Approve, optionally over modified dates, paid or unpaid (§9.2/§9.3)' })
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveLeaveDto,
    @CurrentUser() u: AuthUser,
  ) {
    return this.service.approve(id, dto, actor(u));
  }

  @Post(':id/reject')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Reject with a reason (§9.2)' })
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectLeaveDto,
    @CurrentUser() u: AuthUser,
  ) {
    return this.service.reject(id, dto, actor(u));
  }

  /**
   * §9.7 by hand.
   *
   * The sweep does this on a timer, but a teacher who comes back early — or a
   * sweep that has not ticked yet — should not leave a coach unable to act.
   * Idempotent, so pressing it twice is harmless.
   */
  @Post(':id/return')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark the teacher available again and stand the arrangements down (§9.7)' })
  async completeReturn(@Param('id', ParseUUIDPipe) id: string) {
    await this.impacts.completeReturn(id);
    return this.service.findOne(id);
  }

  @Post(':id/request-info')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Ask the requester for more information (§9.2)' })
  requestInfo(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RequestInfoDto,
    @CurrentUser() u: AuthUser,
  ) {
    return this.service.requestInfo(id, dto, actor(u));
  }

  /** The pre-Module-9 admin screen still PATCHes a raw status through here. */
  @Patch(':id/status')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Set a status directly (legacy screen)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLeaveDto,
    @CurrentUser() u: AuthUser,
  ) {
    return this.service.update(id, dto, actor(u));
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a leave record' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }

  @Post('seed')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Sample leave data — refuses if live records exist' })
  seed() {
    return this.service.seed();
  }
}
