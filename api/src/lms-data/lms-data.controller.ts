import { createReadStream, existsSync, mkdirSync } from 'fs';
import { extname, join, resolve, sep } from 'path';

import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Put,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { diskStorage } from 'multer';
import type { Response } from 'express';

import { LmsDataService } from './lms-data.service';
import { Public, Roles } from '../auth/decorators';
import { Role } from '../generated/prisma/enums';
import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString } from 'class-validator';

// Uploaded knowledgebase files live under <api>/uploads/knowledgebase.
export const UPLOAD_ROOT = join(process.cwd(), 'uploads');
const KB_UPLOAD_DIR = join(UPLOAD_ROOT, 'knowledgebase');

const kbFileStorage = diskStorage({
  destination: (_req, _file, cb) => {
    mkdirSync(KB_UPLOAD_DIR, { recursive: true });
    cb(null, KB_UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    // Unique on-disk name; the original name is stored separately for display.
    const stamp = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${stamp}${extname(file.originalname)}`);
  },
});

// Only genuine learning-material types are accepted; executables, scripts and
// markup (an XSS/shell vector once served) are rejected before hitting disk.
const ALLOWED_EXTENSIONS = new Set([
  '.pdf', '.doc', '.docx', '.txt', '.rtf', '.odt', '.ppt', '.pptx',
  '.xls', '.xlsx', '.csv',
  '.mp3', '.wav', '.m4a', '.aac', '.ogg',
  '.mp4', '.mov', '.avi', '.mkv', '.webm',
  '.png', '.jpg', '.jpeg', '.gif', '.webp',
  '.zip',
]);

const kbFileFilter = (
  _req: unknown,
  file: Express.Multer.File,
  cb: (error: Error | null, acceptFile: boolean) => void,
) => {
  const ext = extname(file.originalname).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    cb(new BadRequestException(`File type "${ext || 'unknown'}" is not allowed`), false);
    return;
  }
  cb(null, true);
};

// The whole controller is staff-only (ADMIN / SUPERVISOR / ACADEMIC_COACH).
// These endpoints are consumed exclusively by the admin console (all its calls
// carry a Bearer token); students and teachers get their own content through
// the scoped /student-portal and /teacher-portal APIs. The reads used to be
// @Public(), which exposed class/meeting join links + attendee PII and internal
// grading metrics to the open internet — that has been closed.
// Default scope is ADMIN only: managing the course catalogue (courses,
// packages, assignments, assessments, knowledgebase) belongs to admins. The two
// sub-admin roles get explicit, narrower grants via method-level @Roles below —
// ACADEMIC_COACH on classes, both sub-admins on meetings — matching exactly what
// their panels expose. Previously the class-level granted all three roles full
// CRUD over everything, so a supervisor/coach could delete the whole catalogue.
/** The rows a user ticked in a list. */
export class BulkIdsDto {
  @ApiProperty({ type: [String] })
  @IsArray() @IsString({ each: true }) ids!: string[];
}

@ApiTags('lms-data')
@ApiBearerAuth()
@Controller('lms-data')
@Roles(Role.ADMIN)
export class LmsDataController {
  constructor(private readonly service: LmsDataService) {}


  /*
   * Bulk delete. Static segments, so they are declared before the `:id`
   * routes they would otherwise be swallowed by.
   */
  @Post('courses/bulk-delete')
  @ApiOperation({ summary: 'Delete several courses, reporting each outcome' })
  bulkDeleteCourses(@Body() dto: BulkIdsDto) {
    return this.service.deleteCourses(dto.ids);
  }

  @Post('knowledgebase/bulk-delete')
  @ApiOperation({ summary: 'Delete several knowledgebase items' })
  bulkDeleteKnowledgebase(@Body() dto: BulkIdsDto) {
    return this.service.deleteKnowledgebaseMany(dto.ids);
  }

  @Post('packages/bulk-delete')
  @ApiOperation({ summary: 'Delete several packages, reporting each outcome' })
  bulkDeletePackages(@Body() dto: BulkIdsDto) {
    return this.service.deletePackages(dto.ids);
  }

  // Courses
  // Low-sensitivity catalogue (titles/levels/codes), referenced by many admin
  // dropdowns via unauthenticated fetch — kept public. Mutations below still
  // require a staff login.
  @Get('courses')
  @Public()
  @ApiOperation({ summary: 'Get all courses' })
  getCourses() {
    return this.service.getCourses();
  }

  @Post('courses')
  @ApiOperation({ summary: 'Create a course' })
  createCourse(@Body() dto: any) {
    return this.service.createCourse(dto);
  }

  @Put('courses/:id')
  @ApiOperation({ summary: 'Update a course' })
  updateCourse(@Param('id') id: string, @Body() dto: any) {
    return this.service.updateCourse(id, dto);
  }

  @Delete('courses/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a course' })
  deleteCourse(@Param('id') id: string) {
    return this.service.deleteCourse(id);
  }

  // Assignments — retired: superseded by the unified AssignmentsModule
  // (/assignments). The LmsAssignment catalog CRUD lived here previously.

  // Assessments
  @Get('assessments')
  @ApiOperation({ summary: 'Get all assessments' })
  getAssessments() {
    return this.service.getAssessments();
  }

  @Post('assessments')
  @ApiOperation({ summary: 'Create an assessment' })
  createAssessment(@Body() dto: any) {
    return this.service.createAssessment(dto);
  }

  @Put('assessments/:id')
  @ApiOperation({ summary: 'Update an assessment' })
  updateAssessment(@Param('id') id: string, @Body() dto: any) {
    return this.service.updateAssessment(id, dto);
  }

  @Delete('assessments/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an assessment' })
  deleteAssessment(@Param('id') id: string) {
    return this.service.deleteAssessment(id);
  }

  // Knowledgebase
  // List of learning-material metadata (titles/formats). The files themselves
  // are already public via the /uploads/knowledgebase static mount, so the
  // listing stays public too; mutations require a staff login.
  @Get('knowledgebase')
  @Public()
  @ApiOperation({ summary: 'Get all knowledgebase items' })
  getKnowledgebase() {
    return this.service.getKnowledgebase();
  }

  @Post('knowledgebase/upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: kbFileStorage,
      fileFilter: kbFileFilter,
      limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB ceiling
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Store a knowledgebase file, return its reference' })
  uploadKnowledgebaseFile(@UploadedFile() file?: Express.Multer.File) {
    return this.service.storeKnowledgebaseFile(file);
  }

  // Stays public: knowledgebase files are learning material that enrolled
  // students download via bare <a>/window.open (no auth header possible), and
  // the same files are already served from the public /uploads/knowledgebase
  // static mount — so gating this endpoint would add no protection while
  // breaking downloads.
  @Get('knowledgebase/:id/download')
  @Public()
  @ApiOperation({ summary: 'Download a resource (counts one view)' })
  async downloadKnowledgebase(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile | void> {
    const resource = await this.service.registerDownload(id);
    if (!resource.fileUrl) {
      throw new NotFoundException('This resource has no file attached');
    }

    // External links: bounce the browser to the URL.
    if (/^https?:\/\//i.test(resource.fileUrl)) {
      res.redirect(resource.fileUrl);
      return;
    }

    // Contain the resolved path inside the uploads root: a stored fileUrl like
    // "../.env" must never escape and stream an arbitrary server file.
    const uploadsRoot = resolve(UPLOAD_ROOT);
    const filePath = resolve(UPLOAD_ROOT, resource.fileUrl);
    if (filePath !== uploadsRoot && !filePath.startsWith(uploadsRoot + sep)) {
      throw new ForbiddenException('Invalid file path');
    }
    if (!existsSync(filePath)) {
      throw new NotFoundException('Stored file is missing');
    }
    return new StreamableFile(createReadStream(filePath), {
      disposition: `attachment; filename="${resource.fileName ?? 'resource'}"`,
    });
  }

  @Post('knowledgebase')
  @ApiOperation({ summary: 'Create a knowledgebase item' })
  createKnowledgebase(@Body() dto: any) {
    return this.service.createKnowledgebase(dto);
  }

  @Put('knowledgebase/:id')
  @ApiOperation({ summary: 'Update a knowledgebase item' })
  updateKnowledgebase(@Param('id') id: string, @Body() dto: any) {
    return this.service.updateKnowledgebase(id, dto);
  }

  @Delete('knowledgebase/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a knowledgebase item' })
  deleteKnowledgebase(@Param('id') id: string) {
    return this.service.deleteKnowledgebase(id);
  }

  // Packages
  // Pricing/bundle catalogue — low sensitivity and fetched unauthenticated by
  // the invoices + packages admin pages. Kept public; mutations need staff auth.
  @Get('packages')
  @Public()
  @ApiOperation({ summary: 'Get all packages' })
  getPackages() {
    return this.service.getPackages();
  }

  @Post('packages')
  @ApiOperation({ summary: 'Create a package' })
  createPackage(@Body() dto: any) {
    return this.service.createPackage(dto);
  }

  @Put('packages/:id')
  @ApiOperation({ summary: 'Update a package' })
  updatePackage(@Param('id') id: string, @Body() dto: any) {
    return this.service.updatePackage(id, dto);
  }

  @Delete('packages/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a package' })
  deletePackage(@Param('id') id: string) {
    return this.service.deletePackage(id);
  }

  // Classes — the ACADEMIC_COACH panel manages these (its /classes page);
  // SUPERVISOR has no /classes page so stays ADMIN+COACH only.
  @Get('classes')
  @Roles(Role.ADMIN, Role.ACADEMIC_COACH)
  @ApiOperation({ summary: 'Get all classes' })
  getClasses() {
    return this.service.getClasses();
  }

  @Post('classes')
  @Roles(Role.ADMIN, Role.ACADEMIC_COACH)
  @ApiOperation({ summary: 'Create a class' })
  createClass(@Body() dto: any) {
    return this.service.createClass(dto);
  }

  @Put('classes/:id')
  @Roles(Role.ADMIN, Role.ACADEMIC_COACH)
  @ApiOperation({ summary: 'Update a class' })
  updateClass(@Param('id') id: string, @Body() dto: any) {
    return this.service.updateClass(id, dto);
  }

  @Delete('classes/:id')
  @Roles(Role.ADMIN, Role.ACADEMIC_COACH)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a class' })
  deleteClass(@Param('id') id: string) {
    return this.service.deleteClass(id);
  }

  // Meetings — both sub-admin panels expose a /meetings page.
  @Get('meetings')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH)
  @ApiOperation({ summary: 'Get all meetings' })
  getMeetings() {
    return this.service.getMeetings();
  }

  @Post('meetings')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH)
  @ApiOperation({ summary: 'Create a meeting' })
  createMeeting(@Body() dto: any) {
    return this.service.createMeeting(dto);
  }

  @Put('meetings/:id')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH)
  @ApiOperation({ summary: 'Update a meeting' })
  updateMeeting(@Param('id') id: string, @Body() dto: any) {
    return this.service.updateMeeting(id, dto);
  }

  @Delete('meetings/:id')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a meeting' })
  deleteMeeting(@Param('id') id: string) {
    return this.service.deleteMeeting(id);
  }
}
