import { Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser, type AuthUser } from '../auth/decorators';
import { NotificationsService } from './notifications.service';

// Every authenticated user sees their own notifications (no @Roles gate here —
// the JwtAuthGuard still applies globally, so anonymous access is blocked).
@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: "List the current user's notifications" })
  list(@CurrentUser() user: AuthUser, @Query('limit') limit?: string) {
    return this.service.list(user.id, limit ? Number(limit) : 30);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Unread notification count for the bell badge' })
  unread(@CurrentUser() user: AuthUser) {
    return this.service.unreadCount(user.id);
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Mark all of my notifications as read' })
  readAll(@CurrentUser() user: AuthUser) {
    return this.service.markAllRead(user.id);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark one notification as read' })
  read(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.markRead(id, user.id);
  }
}
