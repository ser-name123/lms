import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser, Roles, type AuthUser } from '../auth/decorators';
import { Role } from '../generated/prisma/enums';
import { AnnouncementsService } from './announcements.service';
import { CreateAnnouncementDto, UpdateAnnouncementDto } from './dto';

/*
 * Announcements. Reading is open to every authenticated role (each sees only
 * its own audience slice); authoring is admin-only.
 */

@ApiTags('announcements')
@ApiBearerAuth()
@Controller('announcements')
export class AnnouncementsController {
  constructor(private readonly announcements: AnnouncementsService) {}

  @Get('feed')
  @ApiOperation({ summary: 'Announcements visible to the caller' })
  feed(@CurrentUser() user: AuthUser) {
    return this.announcements.feed(user.id, user.role);
  }

  @Get()
  @Roles(Role.ADMIN, Role.SUPERVISOR)
  @ApiOperation({ summary: 'All announcements, including drafts and expired' })
  listAll() {
    return this.announcements.listAll();
  }

  @Post()
  @Roles(Role.ADMIN, Role.SUPERVISOR)
  @ApiOperation({ summary: 'Publish an announcement' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateAnnouncementDto) {
    return this.announcements.create(user, dto);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark an announcement read for the caller' })
  markRead(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.announcements.markRead(id, user.id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.SUPERVISOR)
  @ApiOperation({ summary: 'Edit an announcement' })
  update(@Param('id') id: string, @Body() dto: UpdateAnnouncementDto) {
    return this.announcements.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Delete an announcement' })
  remove(@Param('id') id: string) {
    return this.announcements.remove(id);
  }
}
