import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser, Roles, type AuthUser } from '../auth/decorators';
import { Role } from '../generated/prisma/enums';
import { StudentManagementService } from './student-management.service';
import {
  AddDocumentDto, AddNoteDto, ArchiveDocumentDto, AssignCoachDto, AssignCourseDto,
  ChangeBatchDto, ChangeTeacherDto, DecideTransferDto, FreezeStudentDto, LogCommunicationDto,
  RequestTransferDto, SendStudentMessageDto, SetStudentStatusDto, UpdateEnrollmentDto,
  UpdateStudentAcademicDto, UpdateStudentBasicDto, UpdateStudentParentDto,
} from './dto';

const DOC_DIR = join(process.cwd(), 'uploads', 'student-docs');
const docStorage = diskStorage({
  destination: (_req, _file, cb) => { mkdirSync(DOC_DIR, { recursive: true }); cb(null, DOC_DIR); },
  filename: (_req, file, cb) => {
    const stamp = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = (file.originalname.match(/\.[a-zA-Z0-9]+$/) || [''])[0];
    cb(null, `${stamp}${ext}`);
  },
});

@ApiTags('student-management')
@ApiBearerAuth()
@Controller('student-management')
@Roles(Role.ADMIN, Role.ACADEMIC_COACH)
export class StudentManagementController {
  constructor(private readonly service: StudentManagementService) {}

  // ── Static paths (declare before :id) ───────────────────────────────────────
  @Get('analytics/fleet')
  @ApiOperation({ summary: 'Fleet analytics across all students' })
  fleetAnalytics() {
    return this.service.fleetAnalytics();
  }

  @Get('reports/:type')
  @ApiOperation({ summary: 'Student reports (student/active/inactive/dropout/trial-conversion/course/batch/teacher/country)' })
  report(@Param('type') type: string) {
    return this.service.report(type);
  }

  @Get('coaches')
  @ApiOperation({ summary: 'List assignable Academic Coaches' })
  coaches() {
    return this.service.listCoaches();
  }

  @Get('transfers/pending')
  @ApiOperation({ summary: 'All pending transfer requests awaiting approval' })
  pendingTransfers() {
    return this.service.listPendingTransfers();
  }

  @Post('transfers/:transferId/approve')
  @Roles(Role.ADMIN)
  approveTransfer(@Param('transferId') tid: string, @Body() _dto: DecideTransferDto, @CurrentUser() u: AuthUser) {
    return this.service.decideTransfer(tid, true, actor(u));
  }

  @Post('transfers/:transferId/reject')
  @Roles(Role.ADMIN)
  rejectTransfer(@Param('transferId') tid: string, @Body() _dto: DecideTransferDto, @CurrentUser() u: AuthUser) {
    return this.service.decideTransfer(tid, false, actor(u));
  }

  // ── Hub payload ─────────────────────────────────────────────────────────────
  @Get(':id')
  @ApiOperation({ summary: 'Full student management hub payload' })
  get(@Param('id') id: string) {
    return this.service.getManagement(id);
  }

  // ── Profile edits ───────────────────────────────────────────────────────────
  @Patch(':id/basic')
  updateBasic(@Param('id') id: string, @Body() dto: UpdateStudentBasicDto, @CurrentUser() u: AuthUser) {
    return this.service.updateBasic(id, dto, actor(u));
  }

  @Patch(':id/academic')
  updateAcademic(@Param('id') id: string, @Body() dto: UpdateStudentAcademicDto, @CurrentUser() u: AuthUser) {
    return this.service.updateAcademic(id, dto, actor(u));
  }

  @Patch(':id/parent')
  updateParent(@Param('id') id: string, @Body() dto: UpdateStudentParentDto, @CurrentUser() u: AuthUser) {
    return this.service.updateParent(id, dto, actor(u));
  }

  // ── Course / Batch / Teacher ────────────────────────────────────────────────
  @Post(':id/course')
  assignCourse(@Param('id') id: string, @Body() dto: AssignCourseDto, @CurrentUser() u: AuthUser) {
    return this.service.assignCourse(id, dto, actor(u));
  }

  @Patch(':id/enrollment/:enrollmentId')
  updateEnrollment(@Param('id') id: string, @Param('enrollmentId') eid: string, @Body() dto: UpdateEnrollmentDto, @CurrentUser() u: AuthUser) {
    return this.service.updateEnrollment(id, eid, dto, actor(u));
  }

  @Post(':id/teacher')
  changeTeacher(@Param('id') id: string, @Body() dto: ChangeTeacherDto, @CurrentUser() u: AuthUser) {
    return this.service.changeTeacher(id, dto, actor(u));
  }

  @Post(':id/batch')
  changeBatch(@Param('id') id: string, @Body() dto: ChangeBatchDto, @CurrentUser() u: AuthUser) {
    return this.service.changeBatch(id, dto, actor(u));
  }

  @Get(':id/batch-history')
  batchHistory(@Param('id') id: string) {
    return this.service.getBatchHistory(id);
  }

  // ── Status / freeze ─────────────────────────────────────────────────────────
  @Patch(':id/status')
  setStatus(@Param('id') id: string, @Body() dto: SetStudentStatusDto, @CurrentUser() u: AuthUser) {
    return this.service.setStatus(id, dto, actor(u));
  }

  @Post(':id/freeze')
  freeze(@Param('id') id: string, @Body() dto: FreezeStudentDto, @CurrentUser() u: AuthUser) {
    return this.service.freeze(id, dto, actor(u));
  }

  @Post(':id/reactivate')
  reactivate(@Param('id') id: string, @CurrentUser() u: AuthUser) {
    return this.service.reactivate(id, actor(u));
  }

  // ── Academic Coach ──────────────────────────────────────────────────────────
  @Patch(':id/coach')
  assignCoach(@Param('id') id: string, @Body() dto: AssignCoachDto, @CurrentUser() u: AuthUser) {
    return this.service.assignCoach(id, dto.coachId ?? null, actor(u));
  }

  // ── Transfer approval workflow ──────────────────────────────────────────────
  @Get(':id/transfers')
  transfers(@Param('id') id: string) {
    return this.service.listTransfers(id);
  }

  @Post(':id/transfers')
  requestTransfer(@Param('id') id: string, @Body() dto: RequestTransferDto, @CurrentUser() u: AuthUser) {
    return this.service.requestTransfer(id, dto.kind, dto.reason, dto.payload, actor(u));
  }

  // ── Certificate ─────────────────────────────────────────────────────────────
  @Post(':id/certificate/:enrollmentId')
  certificate(@Param('id') id: string, @Param('enrollmentId') eid: string, @CurrentUser() u: AuthUser) {
    return this.service.issueCertificate(id, eid, actor(u));
  }

  // ── Notes ───────────────────────────────────────────────────────────────────
  @Get(':id/notes')
  notes(@Param('id') id: string) {
    return this.service.getNotes(id);
  }

  @Post(':id/notes')
  addNote(@Param('id') id: string, @Body() dto: AddNoteDto, @CurrentUser() u: AuthUser) {
    return this.service.addNote(id, dto, actor(u));
  }

  // ── Documents ───────────────────────────────────────────────────────────────
  @Get(':id/documents')
  documents(@Param('id') id: string) {
    return this.service.getDocuments(id);
  }

  @Post(':id/documents')
  addDocument(@Param('id') id: string, @Body() dto: AddDocumentDto, @CurrentUser() u: AuthUser) {
    return this.service.addDocument(id, dto, actor(u));
  }

  @Post(':id/documents/upload')
  @UseInterceptors(FileInterceptor('file', { storage: docStorage, limits: { fileSize: 25 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a document file and attach it to the student' })
  uploadDocument(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: { type?: string; label?: string },
    @CurrentUser() u: AuthUser,
  ) {
    if (!file) throw new BadRequestException('No file uploaded.');
    const url = `/uploads/student-docs/${file.filename}`;
    return this.service.addDocument(id, { type: body.type || 'OTHER', label: body.label || file.originalname, url }, actor(u));
  }

  @Patch(':id/documents/archive')
  archiveDocument(@Param('id') id: string, @Body() dto: ArchiveDocumentDto, @CurrentUser() u: AuthUser) {
    return this.service.archiveDocument(id, dto.docId, dto.archived ?? true, actor(u));
  }

  // ── Communication ───────────────────────────────────────────────────────────
  @Get(':id/communication')
  communication(@Param('id') id: string) {
    return this.service.getCommunication(id);
  }

  @Post(':id/message')
  sendMessage(@Param('id') id: string, @Body() dto: SendStudentMessageDto, @CurrentUser() u: AuthUser) {
    return this.service.sendMessage(id, dto, actor(u));
  }

  @Post(':id/log-communication')
  logCommunication(@Param('id') id: string, @Body() dto: LogCommunicationDto, @CurrentUser() u: AuthUser) {
    return this.service.logCommunication(id, dto, actor(u));
  }

  // ── Timeline / Audit ────────────────────────────────────────────────────────
  @Get(':id/timeline')
  timeline(@Param('id') id: string) {
    return this.service.getTimeline(id);
  }

  @Get(':id/audit')
  audit(@Param('id') id: string) {
    return this.service.getAudit(id);
  }

  // ── Attendance / Assignments / Performance ──────────────────────────────────
  @Get(':id/attendance')
  attendance(@Param('id') id: string) {
    return this.service.getAttendance(id);
  }

  @Get(':id/assignments')
  assignments(@Param('id') id: string) {
    return this.service.getAssignments(id);
  }

  @Get(':id/performance')
  performance(@Param('id') id: string) {
    return this.service.getPerformance(id);
  }
}

function actor(u: AuthUser) {
  return { id: u?.id, name: u?.email };
}
