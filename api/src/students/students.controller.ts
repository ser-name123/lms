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

  @Get(':id')
  @ApiOperation({ summary: 'One student with their enrolments' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.students.findOne(id);
  }

  @Post()
  @Roles(Role.ADMIN, Role.ACADEMIC_COACH)
  @ApiOperation({ summary: 'Create a student (also creates their user account)' })
  create(@Body() dto: CreateStudentDto) {
    return this.students.create(dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.ACADEMIC_COACH)
  @ApiOperation({ summary: 'Update a student' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateStudentDto) {
    return this.students.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a student and their account' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.students.remove(id);
  }
}
