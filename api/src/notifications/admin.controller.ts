import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser, Roles, type AuthUser } from '../auth/decorators';
import { Role } from '../generated/prisma/enums';
import { NotificationAdminService } from './admin.service';
import { NotificationBroadcastService } from './broadcast.service';
import { NotificationTemplatesService } from './templates.service';
import { NotificationSweepsService } from './sweeps.service';
import { NotificationComposeService } from './compose.service';
import {
  AnalyticsDto,
  BroadcastDto,
  ComposeDto,
  CreateTemplateDto,
  NotificationCentreDto,
  PreviewTemplateDto,
  REPORT_KINDS,
  ReportKind,
  UpdateTemplateDto,
} from './dto';

/*
 * Admin notification management, plus the compose endpoints every staff role
 * shares.
 *
 * Broadcast, templates, retry and the analytics are ADMIN-only. Compose carries
 * no @Roles at all — every role including PARENT has an outbox, and the list
 * each of them may reach is narrowed per relationship inside
 * NotificationComposeService, which `send` validates against rather than
 * re-deriving. Guarding by role here would duplicate that rule badly.
 */

@ApiTags('notification-admin')
@ApiBearerAuth()
@Controller('notification-admin')
export class NotificationAdminController {
  constructor(
    private readonly admin: NotificationAdminService,
    private readonly broadcasts: NotificationBroadcastService,
    private readonly templates: NotificationTemplatesService,
    private readonly sweeps: NotificationSweepsService,
    private readonly compose: NotificationComposeService,
  ) {}

  // ── Compose (every role with an outbox) ────────────────────────────────────

  @Get('compose/recipients')
  @ApiOperation({ summary: 'Everyone the caller may send a notification to' })
  recipients(@CurrentUser() user: AuthUser) {
    return this.compose.allowedRecipients(user);
  }

  @Post('compose')
  @HttpCode(200)
  @ApiOperation({ summary: 'Send a direct notification to chosen recipients' })
  send(@CurrentUser() user: AuthUser, @Body() dto: ComposeDto) {
    return this.compose.send(user, dto);
  }

  // ── Dashboard ──────────────────────────────────────────────────────────────

  @Get('dashboard')
  @Roles(Role.ADMIN, Role.SUPERVISOR)
  @ApiOperation({ summary: 'KPI cards, channel health and live connection count' })
  dashboard() {
    return this.admin.dashboard();
  }

  @Get('meta')
  @Roles(Role.ADMIN, Role.SUPERVISOR)
  @ApiOperation({ summary: 'Registry and enum vocabulary for the filters' })
  meta() {
    return this.admin.meta();
  }

  @Get('audience-options')
  @Roles(Role.ADMIN, Role.SUPERVISOR)
  @ApiOperation({ summary: 'Courses, batches and students for the broadcast picker' })
  audienceOptions(@Query('q') q?: string) {
    return this.admin.audienceOptions(q);
  }

  @Get('centre')
  @Roles(Role.ADMIN, Role.SUPERVISOR)
  @ApiOperation({ summary: 'Notification centre — every notification with its channel outcomes' })
  centre(@Query() query: NotificationCentreDto) {
    return this.admin.centre(query);
  }

  @Get('failures')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Failed deliveries awaiting retry' })
  failures(@Query('limit') limit?: string) {
    return this.admin.failures(limit ? Number(limit) : 100);
  }

  @Post('failures/:deliveryId/retry')
  @Roles(Role.ADMIN)
  @HttpCode(200)
  @ApiOperation({ summary: 'Retry one failed delivery now' })
  retry(@Param('deliveryId') deliveryId: string) {
    return this.sweeps.retryOne(deliveryId);
  }

  @Post('failures/retry-all')
  @Roles(Role.ADMIN)
  @HttpCode(200)
  @ApiOperation({ summary: 'Run the retry sweep immediately' })
  retryAll() {
    return this.sweeps.retryFailed();
  }

  // ── Analytics & reports ────────────────────────────────────────────────────

  @Get('analytics')
  @Roles(Role.ADMIN, Role.SUPERVISOR)
  @ApiOperation({ summary: 'Cards and charts for the notification dashboard' })
  analytics(@Query() query: AnalyticsDto) {
    return this.admin.analytics(query);
  }

  @Get('reports/:kind')
  @Roles(Role.ADMIN, Role.SUPERVISOR)
  @ApiOperation({ summary: 'One of: daily, delivery, read, failure, engagement, channel' })
  report(@Param('kind') kind: string, @Query() query: AnalyticsDto) {
    const safe = (REPORT_KINDS as readonly string[]).includes(kind)
      ? (kind as ReportKind)
      : 'daily';
    return this.admin.report(safe, query);
  }

  // ── Broadcasts ─────────────────────────────────────────────────────────────

  @Get('broadcasts')
  @Roles(Role.ADMIN, Role.SUPERVISOR)
  @ApiOperation({ summary: 'Broadcast history, newest first' })
  listBroadcasts(@Query('limit') limit?: string) {
    return this.broadcasts.list(limit ? Number(limit) : 50);
  }

  @Post('broadcasts/preview')
  @Roles(Role.ADMIN, Role.SUPERVISOR)
  @HttpCode(200)
  @ApiOperation({ summary: 'How many people this audience resolves to, without sending' })
  previewBroadcast(@Body() dto: BroadcastDto) {
    return this.broadcasts.preview(dto);
  }

  @Post('broadcasts')
  @Roles(Role.ADMIN, Role.SUPERVISOR)
  @ApiOperation({ summary: 'Send a broadcast now, schedule it, or save it as a draft' })
  createBroadcast(@CurrentUser() user: AuthUser, @Body() dto: BroadcastDto) {
    return this.broadcasts.create(dto, user);
  }

  @Patch('broadcasts/:id')
  @Roles(Role.ADMIN, Role.SUPERVISOR)
  @ApiOperation({ summary: 'Edit a draft broadcast, or send/schedule it' })
  updateBroadcast(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: BroadcastDto,
  ) {
    return this.broadcasts.update(id, dto, user);
  }

  @Get('broadcasts/:id')
  @Roles(Role.ADMIN, Role.SUPERVISOR)
  @ApiOperation({ summary: 'One broadcast with its delivered and read counts' })
  getBroadcast(@Param('id') id: string) {
    return this.broadcasts.get(id);
  }

  @Post('broadcasts/:id/cancel')
  @Roles(Role.ADMIN, Role.SUPERVISOR)
  @HttpCode(200)
  @ApiOperation({ summary: 'Cancel a scheduled broadcast before it goes out' })
  cancelBroadcast(@Param('id') id: string) {
    return this.broadcasts.cancel(id);
  }

  @Post('broadcasts/:id/send-now')
  @Roles(Role.ADMIN)
  @HttpCode(200)
  @ApiOperation({ summary: 'Send a scheduled broadcast immediately' })
  sendNow(@Param('id') id: string) {
    return this.broadcasts.run(id);
  }

  @Post('scheduled/run')
  @Roles(Role.ADMIN)
  @HttpCode(200)
  @ApiOperation({ summary: 'Run the scheduled-broadcast sweep immediately' })
  runScheduled() {
    return this.sweeps.dispatchScheduled();
  }

  // ── Templates ──────────────────────────────────────────────────────────────

  @Get('templates')
  @Roles(Role.ADMIN, Role.SUPERVISOR)
  @ApiOperation({ summary: 'Every message template with its placeholders' })
  listTemplates() {
    return this.templates.list();
  }

  @Post('templates')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Create a template' })
  createTemplate(@Body() dto: CreateTemplateDto) {
    return this.templates.create(dto);
  }

  @Get('templates/:code')
  @Roles(Role.ADMIN, Role.SUPERVISOR)
  @ApiOperation({ summary: 'One template' })
  getTemplate(@Param('code') code: string) {
    return this.templates.get(code);
  }

  @Patch('templates/:code')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Edit a template (system templates are editable)' })
  updateTemplate(@Param('code') code: string, @Body() dto: UpdateTemplateDto) {
    return this.templates.update(code, dto);
  }

  @Delete('templates/:code')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Delete a template (system templates cannot be deleted)' })
  deleteTemplate(@Param('code') code: string) {
    return this.templates.remove(code);
  }

  @Post('templates/:code/preview')
  @Roles(Role.ADMIN, Role.SUPERVISOR)
  @HttpCode(200)
  @ApiOperation({ summary: 'Render a template with sample or supplied values' })
  previewTemplate(@Param('code') code: string, @Body() dto: PreviewTemplateDto) {
    return this.templates.preview(code, dto.vars ?? {});
  }
}
