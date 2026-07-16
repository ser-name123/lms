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

import { CurrentUser, Roles, type AuthUser } from '../auth/decorators';
import { Role } from '../generated/prisma/enums';
import { CreateEmployeeDto, ListEmployeesDto, UpdateEmployeeDto } from './dto';
import { EmployeesService } from './employees.service';

@ApiTags('employees')
@ApiBearerAuth()
@Controller('employees')
@Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH)
export class EmployeesController {
  constructor(private readonly service: EmployeesService) {}

  @Get()
  @ApiOperation({ summary: 'Paginated, searchable employee list' })
  list(@Query() query: ListEmployeesDto, @CurrentUser() user: AuthUser) {
    return this.service.list(query, user.role === Role.ADMIN);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get employee dashboard stats' })
  getStats(@CurrentUser() user: AuthUser) {
    return this.service.getStats(user.role === Role.ADMIN);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One employee profile details' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.service.findOne(id, user.role === Role.ADMIN);
  }

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Create a new employee account' })
  create(@Body() dto: CreateEmployeeDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update an employee profile' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEmployeeDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an employee profile (cascades user)' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }

  // Viewing/revoking another user's active sessions (with IP + device) is an
  // admin-only power everywhere else (students, teachers) — keep it consistent
  // so a SUPERVISOR/ACADEMIC_COACH cannot force-logout a fellow staff member.
  @Get(':id/sessions')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get active login sessions for the employee' })
  getSessions(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getSessions(id);
  }

  @Delete(':id/sessions/:sessionId')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke a specific employee login session' })
  revokeSession(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ) {
    return this.service.revokeSession(id, sessionId);
  }
}
