import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser, Roles, type AuthUser } from '../auth/decorators';
import { Role } from '../generated/prisma/enums';
import { ProgressService } from './progress.service';
import {
  AddRemarkDto,
  FlagStudentDto,
  ListProgressDto,
  UpdateProgressConfigDto,
} from './dto';

const actor = (u: AuthUser) => ({ id: u?.id, name: u?.email });

@ApiTags('progress')
@ApiBearerAuth()
@Controller('progress')
@Roles(Role.ADMIN, Role.ACADEMIC_COACH)
export class ProgressController {
  constructor(private readonly service: ProgressService) {}

  @Get('config')
  @ApiOperation({ summary: 'Get progress score weights + thresholds' })
  getConfig() {
    return this.service.getConfig();
  }

  @Patch('config')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update progress score weights + thresholds' })
  updateConfig(@Body() dto: UpdateProgressConfigDto) {
    return this.service.updateConfig(dto);
  }

  @Get('dashboard')
  @ApiOperation({ summary: 'Academy-wide progress dashboard (cards + charts)' })
  dashboard() {
    return this.service.adminDashboard();
  }

  @Get('students')
  @ApiOperation({ summary: 'Filtered, paginated student progress list' })
  list(@Query() query: ListProgressDto) {
    return this.service.list(query);
  }

  @Get('students/:id')
  @ApiOperation({ summary: 'Full progress detail for one student' })
  studentDetail(@Param('id') id: string) {
    return this.service.studentDetail(id);
  }

  @Get('students/:id/history')
  @ApiOperation({ summary: 'Snapshot history (archive) for one student' })
  studentHistory(@Param('id') id: string) {
    return this.service.studentHistory(id);
  }

  @Post('students/:id/remark')
  @ApiOperation({ summary: 'Add a progress remark (staff note)' })
  addRemark(
    @Param('id') id: string,
    @Body() dto: AddRemarkDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.addRemark(id, dto, actor(user));
  }

  @Post('students/:id/flag')
  @ApiOperation({ summary: 'Flag a student at risk (notifies coach)' })
  flag(
    @Param('id') id: string,
    @Body() dto: FlagStudentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.flagStudent(id, dto, actor(user));
  }

  @Post('snapshot')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Capture a monthly progress snapshot for all students' })
  snapshot() {
    return this.service.snapshotAll();
  }

  // ── Skills ────────────────────────────────────────────────────────────────
  @Get('skills')
  @ApiOperation({ summary: 'List course skills' })
  listSkills(@Query('courseId') courseId?: string) {
    return this.service.listSkills(courseId);
  }

  @Post('skills')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Create a course skill' })
  createSkill(@Body() dto: { courseId: string; name: string; order?: number }) {
    return this.service.createSkill(dto);
  }

  @Delete('skills/:id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Archive a course skill' })
  deleteSkill(@Param('id') id: string) {
    return this.service.deleteSkill(id);
  }

  @Get('badges')
  @ApiOperation({ summary: 'List the badge catalogue' })
  listBadges() {
    return this.service.listBadges();
  }

  @Get('reports')
  @ApiOperation({ summary: 'Progress report (student/course/teacher/batch/country/coach/monthly/quarterly/parent/certificate)' })
  report(@Query('type') type = 'student') {
    return this.service.report(type);
  }

  @Get('analytics')
  @ApiOperation({ summary: 'Progress analytics (completion, skills, goals, growth)' })
  analytics() {
    return this.service.analytics();
  }
}
