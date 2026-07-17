import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser, Roles, type AuthUser } from '../auth/decorators';
import { Role } from '../generated/prisma/enums';
import { AssessmentsService } from './assessments.service';
import {
  CreateAssessmentDto, CreateQuestionDto, EvaluateAttemptDto, ListAssessmentsQuery,
  ListQuestionsQuery, SaveAnswerDto, SetQuestionsDto, SubmitAttemptDto, UpdateAssessmentDto,
  UpdateQuestionDto,
} from './dto';

const DIR = join(process.cwd(), 'uploads', 'assessments');
const storage = diskStorage({
  destination: (_req, _file, cb) => { mkdirSync(DIR, { recursive: true }); cb(null, DIR); },
  filename: (_req, file, cb) => {
    const stamp = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = (file.originalname.match(/\.[a-zA-Z0-9]+$/) || [''])[0];
    cb(null, `${stamp}${ext}`);
  },
});

const actor = (u: AuthUser) => ({ id: u.id, role: u.role });

@ApiTags('assessments')
@ApiBearerAuth()
@Controller('assessments')
@Roles(Role.ADMIN, Role.ACADEMIC_COACH, Role.TEACHER)
export class AssessmentsController {
  constructor(private readonly service: AssessmentsService) {}

  // ── File upload (staff for question media + students for file answers) ──────
  @Post('upload')
  @Roles(Role.ADMIN, Role.ACADEMIC_COACH, Role.TEACHER, Role.STUDENT)
  @UseInterceptors(FileInterceptor('file', { storage, limits: { fileSize: 100 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload media / a file answer' })
  upload(@UploadedFile() file: Express.Multer.File | undefined) {
    if (!file) throw new BadRequestException('No file uploaded.');
    return { url: `/uploads/assessments/${file.filename}`, name: file.originalname };
  }

  // ── Question Bank (admin + teacher) ─────────────────────────────────────────
  @Post('questions')
  createQuestion(@Body() dto: CreateQuestionDto, @CurrentUser() u: AuthUser) { return this.service.createQuestion(dto, actor(u)); }

  @Get('questions')
  listQuestions(@Query() q: ListQuestionsQuery) { return this.service.listQuestions(q); }

  @Get('questions/meta')
  questionMeta() { return this.service.questionMeta(); }

  @Get('questions/:id')
  getQuestion(@Param('id') id: string) { return this.service.getQuestion(id); }

  @Patch('questions/:id')
  updateQuestion(@Param('id') id: string, @Body() dto: UpdateQuestionDto) { return this.service.updateQuestion(id, dto); }

  @Post('questions/:id/archive')
  archiveQuestion(@Param('id') id: string) { return this.service.archiveQuestion(id, true); }

  @Post('questions/:id/restore')
  restoreQuestion(@Param('id') id: string) { return this.service.archiveQuestion(id, false); }

  @Delete('questions/:id')
  removeQuestion(@Param('id') id: string) { return this.service.removeQuestion(id); }

  // ── Static: dashboards / analytics / reports / calendar / meta ──────────────
  @Get('dashboard/admin')
  @Roles(Role.ADMIN, Role.ACADEMIC_COACH)
  adminDashboard() { return this.service.adminDashboard(); }

  @Get('dashboard/teacher')
  @Roles(Role.TEACHER)
  teacherDashboard(@CurrentUser() u: AuthUser) { return this.service.teacherDashboard(u.id); }

  @Get('analytics')
  @Roles(Role.ADMIN, Role.ACADEMIC_COACH)
  analytics() { return this.service.analytics(); }

  @Get('analytics/questions')
  @Roles(Role.ADMIN, Role.ACADEMIC_COACH, Role.TEACHER)
  questionAnalytics(@Query('assessmentId') assessmentId?: string) { return this.service.questionAnalytics(assessmentId); }

  @Get('reports/:type')
  @Roles(Role.ADMIN, Role.ACADEMIC_COACH)
  report(@Param('type') type: string) { return this.service.report(type); }

  @Get('calendar')
  calendar(@Query('month') month: string | undefined, @CurrentUser() u: AuthUser) { return this.service.calendar(month, actor(u)); }

  @Get('meta')
  meta(@CurrentUser() u: AuthUser) { return this.service.meta(actor(u)); }

  @Get('students')
  targetStudents(@Query('courseId') courseId?: string, @Query('batchId') batchId?: string) { return this.service.targetStudents(courseId, batchId); }

  @Get('student/:studentId/attempts')
  @Roles(Role.ADMIN, Role.ACADEMIC_COACH, Role.TEACHER)
  @ApiOperation({ summary: "A student's assessment history (Student Hub + parent read-only)" })
  studentAttempts(@Param('studentId') studentId: string) { return this.service.studentAttempts(studentId); }

  // ── Student flow ────────────────────────────────────────────────────────────
  @Get('mine')
  @Roles(Role.STUDENT)
  mine(@CurrentUser() u: AuthUser) { return this.service.listMine(u.id); }

  @Get(':id/take')
  @Roles(Role.STUDENT)
  take(@Param('id') id: string, @CurrentUser() u: AuthUser) { return this.service.take(id, u.id); }

  @Post('attempts/:attemptId/answer')
  @Roles(Role.STUDENT)
  saveAnswer(@Param('attemptId') aid: string, @Body() dto: SaveAnswerDto, @CurrentUser() u: AuthUser) { return this.service.saveAnswer(aid, u.id, dto); }

  @Post('attempts/:attemptId/submit')
  @Roles(Role.STUDENT)
  submitAttempt(@Param('attemptId') aid: string, @Body() dto: SubmitAttemptDto, @CurrentUser() u: AuthUser) { return this.service.submitAttempt(aid, u.id, dto); }

  @Get('attempts/:attemptId/result')
  @Roles(Role.STUDENT)
  attemptResult(@Param('attemptId') aid: string, @CurrentUser() u: AuthUser) { return this.service.attemptResult(aid, u.id); }

  @Get('attempts/:attemptId/certificate')
  @Roles(Role.STUDENT)
  certificate(@Param('attemptId') aid: string, @CurrentUser() u: AuthUser) { return this.service.certificate(aid, u.id); }

  // ── Attempt review / evaluation (teacher / admin) ───────────────────────────
  @Get('attempts/:attemptId')
  getAttempt(@Param('attemptId') aid: string) { return this.service.getAttempt(aid); }

  @Post('attempts/:attemptId/review')
  startReview(@Param('attemptId') aid: string) { return this.service.startReview(aid); }

  @Post('attempts/:attemptId/evaluate')
  evaluate(@Param('attemptId') aid: string, @Body() dto: EvaluateAttemptDto, @CurrentUser() u: AuthUser) { return this.service.evaluate(aid, dto, actor(u)); }

  // ── Assessment CRUD + lifecycle ─────────────────────────────────────────────
  @Post()
  create(@Body() dto: CreateAssessmentDto, @CurrentUser() u: AuthUser) { return this.service.createAssessment(dto, actor(u)); }

  @Get()
  list(@Query() q: ListAssessmentsQuery, @CurrentUser() u: AuthUser) { return this.service.list(q, actor(u)); }

  @Get(':id')
  getOne(@Param('id') id: string, @CurrentUser() u: AuthUser) { return this.service.getOne(id, actor(u)); }

  @Get(':id/attempts')
  attempts(@Param('id') id: string) { return this.service.getAttempts(id); }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAssessmentDto, @CurrentUser() u: AuthUser) { return this.service.updateAssessment(id, dto, actor(u)); }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() u: AuthUser) { return this.service.removeAssessment(id, actor(u)); }

  @Post(':id/questions')
  setQuestions(@Param('id') id: string, @Body() dto: SetQuestionsDto, @CurrentUser() u: AuthUser) { return this.service.setQuestions(id, dto.questionIds, actor(u)); }

  @Post(':id/autofill')
  autofill(@Param('id') id: string, @CurrentUser() u: AuthUser) { return this.service.autofill(id, actor(u)); }

  @Post(':id/publish')
  publish(@Param('id') id: string) { return this.service.publish(id); }

  @Post(':id/publish-results')
  publishResults(@Param('id') id: string, @CurrentUser() u: AuthUser) { return this.service.publishResults(id, actor(u)); }

  @Post(':id/unpublish')
  unpublish(@Param('id') id: string, @CurrentUser() u: AuthUser) { return this.service.setLifecycle(id, 'unpublish', actor(u)); }

  @Post(':id/live')
  goLive(@Param('id') id: string, @CurrentUser() u: AuthUser) { return this.service.setLifecycle(id, 'live', actor(u)); }

  @Post(':id/close')
  close(@Param('id') id: string, @CurrentUser() u: AuthUser) { return this.service.setLifecycle(id, 'close', actor(u)); }

  @Post(':id/archive')
  archive(@Param('id') id: string, @CurrentUser() u: AuthUser) { return this.service.setLifecycle(id, 'archive', actor(u)); }

  @Post(':id/lock')
  @Roles(Role.ADMIN, Role.ACADEMIC_COACH)
  lock(@Param('id') id: string, @CurrentUser() u: AuthUser) { return this.service.setLifecycle(id, 'lock', actor(u)); }

  @Post(':id/unlock')
  @Roles(Role.ADMIN, Role.ACADEMIC_COACH)
  unlock(@Param('id') id: string, @CurrentUser() u: AuthUser) { return this.service.setLifecycle(id, 'unlock', actor(u)); }

  @Post(':id/clone')
  clone(@Param('id') id: string, @CurrentUser() u: AuthUser) { return this.service.clone(id, actor(u)); }
}
