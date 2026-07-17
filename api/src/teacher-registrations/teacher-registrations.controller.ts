import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { createReadStream, existsSync, mkdirSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
import type { Response } from 'express';

import { CurrentUser, Public, Roles, type AuthUser } from '../auth/decorators';
import { Role } from '../generated/prisma/enums';
import { TeacherRegistrationsService } from './teacher-registrations.service';
import {
  CreateTeacherRegistrationDto,
  ListTeacherRegistrationsDto,
  ReviewTeacherRegistrationDto,
  UpdateTeacherRegistrationDto,
  VerifyTeacherRegistrationOtpDto,
} from './dto';

// Uploaded teacher documents live under <api>/uploads/teacher-docs.
const UPLOAD_ROOT = join(process.cwd(), 'uploads');
const DOC_DIR = join(UPLOAD_ROOT, 'teacher-docs');

const docStorage = diskStorage({
  destination: (_req, _file, cb) => {
    mkdirSync(DOC_DIR, { recursive: true });
    cb(null, DOC_DIR);
  },
  filename: (_req, file, cb) => {
    const stamp = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${stamp}${extname(file.originalname)}`);
  },
});

// Resumes / degrees / IDs / photos — documents and images only.
const DOC_EXTENSIONS = new Set([
  '.pdf', '.doc', '.docx', '.png', '.jpg', '.jpeg', '.gif', '.webp',
]);

const docFilter = (
  _req: unknown,
  file: Express.Multer.File,
  cb: (error: Error | null, acceptFile: boolean) => void,
) => {
  const ext = extname(file.originalname).toLowerCase();
  if (!DOC_EXTENSIONS.has(ext)) {
    cb(new ForbiddenException(`File type "${ext || 'unknown'}" is not allowed`), false);
    return;
  }
  cb(null, true);
};

@ApiTags('teacher-registrations')
@ApiBearerAuth()
@Controller('teacher-registrations')
@Roles(Role.ADMIN)
export class TeacherRegistrationsController {
  constructor(private readonly service: TeacherRegistrationsService) {}

  @Post()
  @Public()
  @ApiOperation({ summary: 'Public: submit teacher application, receive an email OTP' })
  create(@Body() dto: CreateTeacherRegistrationDto) {
    return this.service.requestOtp(dto);
  }

  @Post('verify-otp')
  @Public()
  @ApiOperation({ summary: 'Public: verify the OTP to finalise the teacher application' })
  verifyOtp(@Body() dto: VerifyTeacherRegistrationOtpDto) {
    return this.service.verifyOtp(dto.email, dto.otp);
  }

  @Post('document-upload')
  @Public()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: docStorage,
      fileFilter: docFilter,
      limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB ceiling
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Public: upload a teacher document, return its reference' })
  uploadDocument(@UploadedFile() file?: Express.Multer.File) {
    return this.service.storeDocumentFile(file);
  }

  @Get()
  @ApiOperation({ summary: 'List / filter teacher applications' })
  list(@Query() query: ListTeacherRegistrationsDto) {
    return this.service.list(query);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Teacher application counts by pipeline stage' })
  stats() {
    return this.service.getStats();
  }

  // Documents are sensitive (IDs, bank docs) — ADMIN only (class @Roles applies).
  @Get('document/:filename')
  @ApiOperation({ summary: 'Serve a stored teacher document inline (admin only)' })
  serveDocument(
    @Param('filename') filename: string,
    @Res({ passthrough: true }) res: Response,
  ): StreamableFile {
    const docsRoot = resolve(DOC_DIR);
    const filePath = resolve(DOC_DIR, filename);
    if (!filePath.startsWith(docsRoot + sep)) {
      throw new ForbiddenException('Invalid file path');
    }
    if (!existsSync(filePath)) {
      throw new NotFoundException('Document not found');
    }
    const ext = extname(filePath).toLowerCase();
    const mime =
      ext === '.pdf'
        ? 'application/pdf'
        : ext === '.png'
          ? 'image/png'
          : ext === '.webp'
            ? 'image/webp'
            : ext === '.gif'
              ? 'image/gif'
              : ext === '.doc'
                ? 'application/msword'
                : ext === '.docx'
                  ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                  : 'image/jpeg';
    res.set({ 'Content-Type': mime, 'Content-Disposition': 'inline' });
    return new StreamableFile(createReadStream(filePath));
  }

  @Get('by-teacher/:profileId')
  @ApiOperation({ summary: 'Get the full application linked to a teacher profile' })
  getByTeacher(@Param('profileId') profileId: string) {
    return this.service.getByTeacher(profileId);
  }

  @Patch('by-teacher/:profileId')
  @ApiOperation({ summary: 'Edit the full application linked to a teacher profile' })
  updateByTeacher(
    @Param('profileId') profileId: string,
    @Body() dto: UpdateTeacherRegistrationDto,
  ) {
    return this.service.updateByTeacher(profileId, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one teacher application' })
  getOne(@Param('id') id: string) {
    return this.service.getOne(id);
  }

  @Patch(':id/review')
  @ApiOperation({ summary: 'Advance stage / reject / request more info / activate' })
  review(
    @Param('id') id: string,
    @Body() dto: ReviewTeacherRegistrationDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.review(id, dto, user?.id);
  }
}
