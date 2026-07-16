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

import { CurrentUser, Roles } from '../auth/decorators';
import { Role } from '../generated/prisma/enums';
import { TeacherPortalService } from './teacher-portal.service';
import type { AuthUser } from '../auth/decorators';

@ApiTags('teacher-portal')
@ApiBearerAuth()
@Controller('teacher-portal')
@Roles(Role.TEACHER)
export class TeacherPortalController {
  constructor(private readonly service: TeacherPortalService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Get teacher dashboard statistics' })
  getDashboard(@CurrentUser() user: AuthUser) {
    return this.service.getDashboard(user.id);
  }

  @Get('classes')
  @ApiOperation({ summary: 'Get active teacher schedule classes' })
  getClasses(@CurrentUser() user: AuthUser) {
    return this.service.getClasses(user.id);
  }

  @Get('students')
  @ApiOperation({ summary: 'Get teacher assigned subject students roster' })
  getStudents(@CurrentUser() user: AuthUser) {
    return this.service.getEnrolledStudents(user.id);
  }

  @Get('assignments')
  @ApiOperation({ summary: 'Get subject homework submissions' })
  getHomeworkSubmissions(@CurrentUser() user: AuthUser) {
    return this.service.getHomeworkSubmissions(user.id);
  }

  @Post('assignments/:submissionId/grade')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Grade a student homework submission' })
  gradeHomework(
    @CurrentUser() user: AuthUser,
    @Param('submissionId') submissionId: string,
    @Body() body: { grade: number; feedback: string },
  ) {
    return this.service.gradeHomework(
      user.id,
      submissionId,
      body.grade,
      body.feedback,
    );
  }

  @Get('payouts')
  @ApiOperation({ summary: 'Get teacher wage/salary payout lists' })
  getPayouts(@CurrentUser() user: AuthUser) {
    return this.service.getPayouts(user.id);
  }

  @Get('profile')
  @ApiOperation({ summary: 'Get teacher personal details profile' })
  getProfile(@CurrentUser() user: AuthUser) {
    return this.service.getProfile(user.id);
  }

  @Patch('profile')
  @ApiOperation({ summary: 'Update teacher personal details profile' })
  updateProfile(@CurrentUser() user: AuthUser, @Body() dto: any) {
    return this.service.updateProfile(user.id, dto);
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
  @ApiOperation({ summary: 'Upload teacher profile photo/avatar' })
  uploadAvatar(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded');
    const relativePath = `uploads/avatars/${file.filename}`;
    return { url: relativePath, fileName: file.filename };
  }

  @Get('meetings')
  @ApiOperation({ summary: 'Get active teacher portal meetings' })
  getMeetings(@CurrentUser() user: AuthUser) {
    return this.service.getMeetings(user.id);
  }
}
