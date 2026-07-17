import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser, Roles, type AuthUser } from '../auth/decorators';
import { Role } from '../generated/prisma/enums';
import { AssignmentsService } from './assignments.service';
import {
  CreateAssignmentDto, GradeSubmissionDto, ListAssignmentsQuery,
  SubmitAssignmentDto, UpdateAssignmentDto,
} from './dto';

const DIR = join(process.cwd(), 'uploads', 'assignments');
const storage = diskStorage({
  destination: (_req, _file, cb) => { mkdirSync(DIR, { recursive: true }); cb(null, DIR); },
  filename: (_req, file, cb) => {
    const stamp = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = (file.originalname.match(/\.[a-zA-Z0-9]+$/) || [''])[0];
    cb(null, `${stamp}${ext}`);
  },
});

const actor = (u: AuthUser) => ({ id: u.id, role: u.role });

@ApiTags('assignments')
@ApiBearerAuth()
@Controller('assignments')
@Roles(Role.ADMIN, Role.ACADEMIC_COACH, Role.TEACHER)
export class AssignmentsController {
  constructor(private readonly service: AssignmentsService) {}

  // ── File upload (staff + students) ──────────────────────────────────────────
  @Post('upload')
  @Roles(Role.ADMIN, Role.ACADEMIC_COACH, Role.TEACHER, Role.STUDENT)
  @UseInterceptors(FileInterceptor('file', { storage, limits: { fileSize: 100 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload an attachment / submission file' })
  upload(@UploadedFile() file: Express.Multer.File | undefined) {
    if (!file) throw new BadRequestException('No file uploaded.');
    return { url: `/uploads/assignments/${file.filename}`, name: file.originalname };
  }

  // ── Static dashboards / analytics / reports / calendar (before :id) ─────────
  @Get('dashboard/admin')
  @Roles(Role.ADMIN, Role.ACADEMIC_COACH)
  adminDashboard() { return this.service.adminDashboard(); }

  @Get('dashboard/teacher')
  @Roles(Role.TEACHER)
  teacherDashboard(@CurrentUser() u: AuthUser) { return this.service.teacherDashboard(u.id); }

  @Get('analytics')
  @Roles(Role.ADMIN, Role.ACADEMIC_COACH)
  analytics() { return this.service.analytics(); }

  @Get('reports/:type')
  @Roles(Role.ADMIN, Role.ACADEMIC_COACH)
  report(@Param('type') type: string) { return this.service.report(type); }

  @Get('calendar')
  calendar(@Query('month') month: string | undefined, @CurrentUser() u: AuthUser) { return this.service.calendar(month, actor(u)); }

  @Get('meta')
  @ApiOperation({ summary: 'Courses + batches (+teachers for admin) the actor can target' })
  meta(@CurrentUser() u: AuthUser) { return this.service.meta(actor(u)); }

  @Get('students')
  @ApiOperation({ summary: 'Candidate students for SELECTED targeting' })
  targetStudents(@Query('courseId') courseId?: string, @Query('batchId') batchId?: string) { return this.service.targetStudents(courseId, batchId); }

  @Get('submissions/:submissionId/similarity')
  @ApiOperation({ summary: 'Plagiarism similarity % vs peers' })
  similarity(@Param('submissionId') sid: string) { return this.service.similarity(sid); }

  // ── Student ─────────────────────────────────────────────────────────────────
  @Get('mine')
  @Roles(Role.STUDENT)
  mine(@CurrentUser() u: AuthUser) { return this.service.listMine(u.id); }

  @Get(':id/mine')
  @Roles(Role.STUDENT)
  openMine(@Param('id') id: string, @CurrentUser() u: AuthUser) { return this.service.studentOpen(id, u.id); }

  @Post(':id/draft')
  @Roles(Role.STUDENT)
  draft(@Param('id') id: string, @Body() dto: SubmitAssignmentDto, @CurrentUser() u: AuthUser) { return this.service.saveDraft(id, u.id, dto); }

  @Post(':id/submit')
  @Roles(Role.STUDENT)
  submit(@Param('id') id: string, @Body() dto: SubmitAssignmentDto, @CurrentUser() u: AuthUser) { return this.service.submit(id, u.id, dto); }

  // ── Grading (teacher / admin) ───────────────────────────────────────────────
  @Post('submissions/:submissionId/grade')
  grade(@Param('submissionId') sid: string, @Body() dto: GradeSubmissionDto, @CurrentUser() u: AuthUser) { return this.service.grade(sid, dto, actor(u)); }

  @Post('submissions/:submissionId/review')
  review(@Param('submissionId') sid: string) { return this.service.startReview(sid); }

  // ── CRUD + lifecycle ────────────────────────────────────────────────────────
  @Post()
  create(@Body() dto: CreateAssignmentDto, @CurrentUser() u: AuthUser) { return this.service.create(dto, actor(u)); }

  @Get()
  list(@Query() q: ListAssignmentsQuery, @CurrentUser() u: AuthUser) { return this.service.list(q, actor(u)); }

  @Get(':id')
  getOne(@Param('id') id: string, @CurrentUser() u: AuthUser) { return this.service.getOne(id, actor(u)); }

  @Get(':id/submissions')
  submissions(@Param('id') id: string) { return this.service.getSubmissions(id); }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAssignmentDto, @CurrentUser() u: AuthUser) { return this.service.update(id, dto, actor(u)); }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() u: AuthUser) { return this.service.remove(id, actor(u)); }

  @Post(':id/publish')
  publish(@Param('id') id: string) { return this.service.publish(id); }

  @Post(':id/unpublish')
  unpublish(@Param('id') id: string, @CurrentUser() u: AuthUser) { return this.service.setLifecycle(id, 'unpublish', actor(u)); }

  @Post(':id/archive')
  archive(@Param('id') id: string, @CurrentUser() u: AuthUser) { return this.service.setLifecycle(id, 'archive', actor(u)); }

  @Post(':id/close')
  close(@Param('id') id: string, @CurrentUser() u: AuthUser) { return this.service.setLifecycle(id, 'close', actor(u)); }

  @Post(':id/lock')
  @Roles(Role.ADMIN, Role.ACADEMIC_COACH)
  lock(@Param('id') id: string, @CurrentUser() u: AuthUser) { return this.service.setLifecycle(id, 'lock', actor(u)); }

  @Post(':id/unlock')
  @Roles(Role.ADMIN, Role.ACADEMIC_COACH)
  unlock(@Param('id') id: string, @CurrentUser() u: AuthUser) { return this.service.setLifecycle(id, 'unlock', actor(u)); }

  @Post(':id/duplicate')
  duplicate(@Param('id') id: string, @CurrentUser() u: AuthUser) { return this.service.duplicate(id, actor(u)); }
}
