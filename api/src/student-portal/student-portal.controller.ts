import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser, Roles, type AuthUser } from '../auth/decorators';
import { Role } from '../generated/prisma/enums';
import { StudentPortalService } from './student-portal.service';

@ApiTags('student-portal')
@ApiBearerAuth()
@Controller('student-portal')
@Roles(Role.STUDENT)
export class StudentPortalController {
  constructor(private readonly service: StudentPortalService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Get aggregated student dashboard metrics and lists' })
  getDashboard(@CurrentUser() user: AuthUser) {
    return this.service.getDashboard(user.id);
  }

  @Get('enrollments')
  @ApiOperation({ summary: 'Get enrolled courses and details' })
  getEnrollments(@CurrentUser() user: AuthUser) {
    return this.service.getEnrollments(user.id);
  }

  @Get('classes')
  @ApiOperation({ summary: 'Get scheduled and past class sessions' })
  getClasses(@CurrentUser() user: AuthUser) {
    return this.service.getClasses(user.id);
  }

  @Post('classes/:classId/attend')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark student attendance for a class session' })
  attendClass(
    @CurrentUser() user: AuthUser,
    @Param('classId') classId: string,
  ) {
    return this.service.attendClass(user.id, classId);
  }

  @Get('assignments')
  @ApiOperation({ summary: 'Get assignments and submissions details' })
  getAssignments(@CurrentUser() user: AuthUser) {
    return this.service.getAssignments(user.id);
  }

  @Post('assignments/:assignmentId/submit')
  @ApiOperation({ summary: 'Submit an assignment solution' })
  submitAssignment(
    @CurrentUser() user: AuthUser,
    @Param('assignmentId') assignmentId: string,
    @Body() dto: { content: string; fileUrl?: string },
  ) {
    return this.service.submitAssignment(
      user.id,
      assignmentId,
      dto.content,
      dto.fileUrl,
    );
  }

  @Get('invoices')
  @ApiOperation({ summary: 'Get fee invoices' })
  getInvoices(@CurrentUser() user: AuthUser) {
    return this.service.getInvoices(user.id);
  }

  @Post('invoices/:invoiceId/pay')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Simulate invoice payment' })
  payInvoice(
    @CurrentUser() user: AuthUser,
    @Param('invoiceId') invoiceId: string,
  ) {
    return this.service.payInvoice(user.id, invoiceId);
  }

  @Get('profile')
  @ApiOperation({ summary: 'Get personal student profile' })
  getProfile(@CurrentUser() user: AuthUser) {
    return this.service.getProfile(user.id);
  }

  @Patch('profile')
  @ApiOperation({ summary: 'Update personal student profile details' })
  updateProfile(@CurrentUser() user: AuthUser, @Body() dto: any) {
    return this.service.updateProfile(user.id, dto);
  }

  @Get('meetings')
  @ApiOperation({ summary: 'Get active webinars and meetings' })
  getMeetings(@CurrentUser() user: AuthUser) {
    return this.service.getMeetings(user.id);
  }

  @Get('knowledgebase')
  @ApiOperation({ summary: 'Get student course learning materials' })
  getKnowledgebase(@CurrentUser() user: AuthUser) {
    return this.service.getKnowledgebase(user.id);
  }

  @Post('profile/avatar-upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req, file, cb) => {
          const dir = join(process.cwd(), 'uploads', 'avatars');
          if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
          cb(null, dir);
        },
        filename: (req, file, cb) => {
          const ext = extname(file.originalname);
          const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
          cb(null, `avatar-${unique}${ext}`);
        },
      }),
    }),
  )
  @ApiOperation({ summary: 'Upload student profile photo/avatar' })
  uploadAvatar(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded');
    const relativePath = `uploads/avatars/${file.filename}`;
    return { url: relativePath, fileName: file.filename };
  }
}
