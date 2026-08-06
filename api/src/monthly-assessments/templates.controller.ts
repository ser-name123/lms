import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser, Roles, type AuthUser } from '../auth/decorators';
import { Role } from '../generated/prisma/enums';
import { AssessmentTemplatesService } from './templates.service';
import {
  CreateTemplateDto, ListTemplatesQuery, SaveAssessmentConfigDto, SaveBadgeDto,
  SaveGradingScaleDto, UpdateTemplateDto,
} from './dto';

const actor = (u: AuthUser) => ({ id: u.id, email: u.email, role: u.role });

/*
 * Assessment configuration. Admin and Supervisor own it — the spec names both.
 * The read endpoints are open to teachers as well, because the assessment form
 * has to render the rubric and the grade ladder the marks will be judged by.
 */
@ApiTags('assessment-config')
@ApiBearerAuth()
@Controller('assessment-config')
@Roles(Role.ADMIN, Role.SUPERVISOR)
export class AssessmentConfigController {
  constructor(private readonly service: AssessmentTemplatesService) {}

  // ── Meta + module config ───────────────────────────────────────────────────

  @Get('meta')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH, Role.TEACHER)
  @ApiOperation({ summary: 'Courses, levels and grading scales for the config screens' })
  meta() {
    return this.service.meta();
  }

  @Get('settings')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH, Role.TEACHER)
  @ApiOperation({ summary: 'Deadline rules + ranking weightage' })
  config() {
    return this.service.config();
  }

  @Patch('settings')
  @ApiOperation({ summary: 'Save deadline rules + ranking weightage' })
  saveConfig(@Body() dto: SaveAssessmentConfigDto) {
    return this.service.saveConfig(dto);
  }

  // ── Grading scales ─────────────────────────────────────────────────────────

  @Get('grading-scales')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH, Role.TEACHER)
  @ApiOperation({ summary: 'Every configured grade ladder' })
  listScales() {
    return this.service.listScales();
  }

  @Post('grading-scales')
  @ApiOperation({ summary: 'Create a grade ladder' })
  createScale(@Body() dto: SaveGradingScaleDto) {
    return this.service.createScale(dto);
  }

  @Put('grading-scales/:id')
  @ApiOperation({ summary: 'Replace a grade ladder' })
  updateScale(@Param('id') id: string, @Body() dto: SaveGradingScaleDto) {
    return this.service.updateScale(id, dto);
  }

  @Delete('grading-scales/:id')
  @ApiOperation({ summary: 'Delete an unused grade ladder' })
  deleteScale(@Param('id') id: string) {
    return this.service.deleteScale(id);
  }

  // ── Badges ─────────────────────────────────────────────────────────────────

  @Get('badges')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH, Role.TEACHER, Role.STUDENT)
  @ApiOperation({ summary: 'Badge configuration' })
  listBadges() {
    return this.service.listBadges();
  }

  @Patch('badges')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Rename, re-icon, enable or threshold a badge' })
  saveBadge(@Body() dto: SaveBadgeDto) {
    return this.service.saveBadge(dto);
  }

  // ── Templates ──────────────────────────────────────────────────────────────

  @Get('presets')
  @Roles(Role.ADMIN, Role.SUPERVISOR)
  @ApiOperation({ summary: "The spec's shipped rubrics, to start a template from" })
  presets() {
    return this.service.presets();
  }

  @Post('presets/seed')
  @ApiOperation({ summary: 'Seed starter rubrics into matching courses that have none' })
  seedPresets() {
    return this.service.seedStarterTemplates();
  }

  @Get('templates')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH, Role.TEACHER)
  @ApiOperation({ summary: 'Assessment templates' })
  listTemplates(@Query() q: ListTemplatesQuery) {
    return this.service.listTemplates(q);
  }

  @Post('templates')
  @ApiOperation({ summary: 'Create a template with its criteria' })
  createTemplate(@Body() dto: CreateTemplateDto, @CurrentUser() u: AuthUser) {
    return this.service.createTemplate(dto, actor(u));
  }

  @Get('templates/:id')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH, Role.TEACHER)
  @ApiOperation({ summary: 'One template' })
  getTemplate(@Param('id') id: string) {
    return this.service.getTemplate(id);
  }

  @Patch('templates/:id')
  @ApiOperation({ summary: 'Update a template and/or replace its criteria' })
  updateTemplate(@Param('id') id: string, @Body() dto: UpdateTemplateDto) {
    return this.service.updateTemplate(id, dto);
  }

  @Post('templates/:id/activate')
  @ApiOperation({ summary: 'Make this the active template for its course' })
  activate(@Param('id') id: string) {
    return this.service.setTemplateStatus(id, 'ACTIVE');
  }

  @Post('templates/:id/deactivate')
  @ApiOperation({ summary: 'Retire a template without losing its history' })
  deactivate(@Param('id') id: string) {
    return this.service.setTemplateStatus(id, 'INACTIVE');
  }

  @Post('templates/:id/duplicate')
  @ApiOperation({ summary: 'Copy a template as a new inactive draft' })
  duplicate(@Param('id') id: string, @CurrentUser() u: AuthUser) {
    return this.service.duplicateTemplate(id, actor(u));
  }

  @Delete('templates/:id')
  @ApiOperation({ summary: 'Delete a template that has never been used' })
  deleteTemplate(@Param('id') id: string) {
    return this.service.deleteTemplate(id);
  }
}
