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
import { CreateTeacherDto, ListTeachersDto, UpdateTeacherDto } from './dto';
import { TeachersService } from './teachers.service';

@ApiTags('teachers')
@ApiBearerAuth()
@Controller('teachers')
@Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH)
export class TeachersController {
  constructor(private readonly service: TeachersService) {}

  @Get()
  @ApiOperation({ summary: 'Paginated, searchable teacher list' })
  list(@Query() query: ListTeachersDto) {
    return this.service.list(query);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get teacher dashboard stats' })
  getStats() {
    return this.service.getStats();
  }

  @Get(':id')
  @ApiOperation({ summary: 'One teacher profile with user details' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @Roles(Role.ADMIN, Role.ACADEMIC_COACH)
  @ApiOperation({
    summary: 'Create a teacher (also creates their user account)',
  })
  create(@Body() dto: CreateTeacherDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.ACADEMIC_COACH)
  @ApiOperation({ summary: 'Update a teacher profile' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTeacherDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a teacher profile and account' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }

  @Get(':id/sessions')
  @ApiOperation({ summary: 'Get active login sessions for a teacher' })
  getSessions(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getSessions(id);
  }

  @Delete(':id/sessions/:sessionId')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke a teacher login session' })
  revokeSession(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ) {
    return this.service.revokeSession(id, sessionId);
  }
}
