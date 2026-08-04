import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles, type AuthUser } from '../auth/decorators';
import { Role } from '../generated/prisma/enums';
import { AbsencesService } from './absences.service';

@ApiTags('teacher-absences')
@ApiBearerAuth()
@Controller('teacher-absences')
export class AbsencesController {
  constructor(private readonly service: AbsencesService) {}

  @Get()
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH)
  @ApiOperation({ summary: 'Teacher-absent classes needing a reschedule (coach-scoped)' })
  list(@CurrentUser() user: AuthUser, @Query('status') status?: string) {
    return this.service.list({ id: user.id, name: user.email, role: user.role }, status);
  }

  @Post(':id/reschedule')
  @Roles(Role.ADMIN, Role.ACADEMIC_COACH)
  @ApiOperation({ summary: 'Reschedule a teacher-absent class into a new session' })
  reschedule(@Param('id') id: string, @Body() dto: { newStartsAt: string }, @CurrentUser() user: AuthUser) {
    return this.service.reschedule(id, dto, { id: user.id, name: user.email, role: user.role });
  }

  @Post(':id/dismiss')
  @Roles(Role.ADMIN, Role.ACADEMIC_COACH)
  @ApiOperation({ summary: 'Dismiss a teacher-absent task (handled another way)' })
  dismiss(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.dismiss(id, { id: user.id, name: user.email, role: user.role });
  }
}
