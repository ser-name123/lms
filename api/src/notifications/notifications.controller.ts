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
  Sse,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Observable } from 'rxjs';

import { CurrentUser, type AuthUser } from '../auth/decorators';
import { NotificationsService } from './notifications.service';
import { NotificationPreferencesService } from './preferences.service';
import { NotificationChannelsService } from './channels.service';
import { NotificationStreamService } from './stream.service';
import {
  ListNotificationsDto,
  PushSubscribeDto,
  PushUnsubscribeDto,
  UpdatePreferencesDto,
} from './dto';
import { listTypes } from './registry';

/*
 * The signed-in user's own notification centre. Every route is scoped to the
 * caller — no id parameter here can address another user's feed — so beyond the
 * global JwtAuthGuard no @Roles gate is needed.
 */

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly service: NotificationsService,
    private readonly preferences: NotificationPreferencesService,
    private readonly channels: NotificationChannelsService,
    private readonly stream: NotificationStreamService,
  ) {}

  // ── Real-time ──────────────────────────────────────────────────────────────

  /*
   * Declared before the parameterised routes so `stream` is not swallowed.
   * The client keeps a slow poll running alongside this: the SSE bus is
   * in-process, so a second API instance would not see these events.
   */
  @Sse('stream')
  @ApiOperation({ summary: 'Server-sent stream of this user’s notifications' })
  stream$(@CurrentUser() user: AuthUser): Observable<{ data: string; type?: string }> {
    return this.stream.subscribe(user.id);
  }

  // ── Feed ───────────────────────────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: "List the current user's notifications" })
  list(@CurrentUser() user: AuthUser, @Query() query: ListNotificationsDto) {
    // The bell and the dashboard widget expect a bare array; the paginated
    // shape lives at /feed so those two callers did not have to change.
    return this.service.listSimple(user.id, query.limit ?? 30);
  }

  @Get('feed')
  @ApiOperation({ summary: 'Filtered, cursor-paginated feed for the inbox page' })
  feed(@CurrentUser() user: AuthUser, @Query() query: ListNotificationsDto) {
    return this.service.list(user.id, query);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Unread total, plus how many of those are critical' })
  unread(@CurrentUser() user: AuthUser) {
    return this.service.unreadCount(user.id);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Per-category totals for the inbox filter chips' })
  summary(@CurrentUser() user: AuthUser) {
    return this.service.summary(user.id);
  }

  @Get('types')
  @ApiOperation({ summary: 'The notification type registry' })
  types() {
    return listTypes();
  }

  // ── Preferences ────────────────────────────────────────────────────────────

  @Get('preferences')
  @ApiOperation({ summary: 'This user’s channel and category preferences' })
  getPreferences(@CurrentUser() user: AuthUser) {
    return this.preferences.get(user.id);
  }

  @Patch('preferences')
  @ApiOperation({ summary: 'Update channel and category preferences' })
  updatePreferences(@CurrentUser() user: AuthUser, @Body() dto: UpdatePreferencesDto) {
    return this.preferences.update(user.id, dto);
  }

  @Post('preferences/reset')
  @HttpCode(200)
  @ApiOperation({ summary: 'Fall back to the default preferences' })
  resetPreferences(@CurrentUser() user: AuthUser) {
    return this.preferences.reset(user.id);
  }

  // ── Web Push ───────────────────────────────────────────────────────────────

  @Get('push/public-key')
  @ApiOperation({ summary: 'VAPID public key the browser needs in order to subscribe' })
  publicKey() {
    return this.channels.publicKey();
  }

  @Post('push/subscribe')
  @HttpCode(200)
  @ApiOperation({ summary: 'Register this browser for push' })
  subscribePush(@CurrentUser() user: AuthUser, @Body() dto: PushSubscribeDto) {
    return this.preferences.subscribePush(user.id, dto);
  }

  @Post('push/unsubscribe')
  @HttpCode(200)
  @ApiOperation({ summary: 'Forget this browser' })
  unsubscribePush(@CurrentUser() user: AuthUser, @Body() dto: PushUnsubscribeDto) {
    return this.preferences.unsubscribePush(user.id, dto.endpoint);
  }

  // ── Mutating (parameterised routes last) ───────────────────────────────────

  @Patch('read-all')
  @ApiOperation({ summary: 'Mark all of my notifications as read' })
  readAll(@CurrentUser() user: AuthUser) {
    return this.service.markAllRead(user.id);
  }

  @Post('archive-read')
  @HttpCode(200)
  @ApiOperation({ summary: 'Archive everything already read' })
  archiveRead(@CurrentUser() user: AuthUser) {
    return this.service.archiveAllRead(user.id);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark one notification as read' })
  read(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.markRead(id, user.id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Archive one notification (history is retained)' })
  archive(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.archive(id, user.id);
  }
}
