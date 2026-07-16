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
  list(@Query() query: ListEmployeesDto) {
    return this.service.list(query);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get employee dashboard stats' })
  getStats() {
    return this.service.getStats();
  }

  @Get(':id')
  @ApiOperation({ summary: 'One employee profile details' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
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

  @Get(':id/sessions')
  @ApiOperation({ summary: 'Get active login sessions for the employee' })
  getSessions(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getSessions(id);
  }

  @Delete(':id/sessions/:sessionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke a specific employee login session' })
  revokeSession(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ) {
    return this.service.revokeSession(id, sessionId);
  }
}
