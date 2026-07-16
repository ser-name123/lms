import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Roles } from '../auth/decorators';
import { Role } from '../generated/prisma/enums';
import { CreateStudentDto, ListStudentsDto, UpdateStudentDto } from './dto';
import { StudentsService } from './students.service';

@ApiTags('students')
@ApiBearerAuth()
@Controller('students')
@Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH)
export class StudentsController {
  constructor(private readonly students: StudentsService) {}

  @Get()
  @ApiOperation({ summary: 'Paginated, searchable student list' })
  list(@Query() query: ListStudentsDto) {
    return this.students.list(query);
  }

  @Get('courses')
  @ApiOperation({ summary: 'Get all courses' })
  getCoursesList() {
    return this.students.getCoursesList();
  }

  @Get('teachers')
  @ApiOperation({ summary: 'Get all teachers' })
  getTeachersList() {
    return this.students.getTeachersList();
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get student dashboard stats' })
  getStats() {
    return this.students.getStats();
  }

  @Get(':id')
  @ApiOperation({ summary: 'One student with their enrolments' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.students.findOne(id);
  }

  @Post()
  @Roles(Role.ADMIN, Role.ACADEMIC_COACH)
  @ApiOperation({
    summary: 'Create a student (also creates their user account)',
  })
  create(@Body() dto: CreateStudentDto) {
    return this.students.create(dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.ACADEMIC_COACH)
  @ApiOperation({ summary: 'Update a student' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStudentDto,
  ) {
    return this.students.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a student and their account' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.students.remove(id);
  }

  @Get(':id/sessions')
  @ApiOperation({ summary: 'Get active login sessions for a student' })
  getSessions(@Param('id', ParseUUIDPipe) id: string) {
    return this.students.getSessions(id);
  }

  @Delete(':id/sessions/:sessionId')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke a student login session' })
  revokeSession(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ) {
    return this.students.revokeSession(id, sessionId);
  }
}
