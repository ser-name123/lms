import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser, Roles, type AuthUser } from '../auth/decorators';
import { Role } from '../generated/prisma/enums';
import { ParentLinksService } from './parent-links.service';
import { CreateParentAccountDto, LinkParentDto } from './dto';

/*
 * Admin-driven parent account provisioning. Parents never self-register — an
 * admin creates the login from the guardian details already on the student
 * profile, and the credentials go out by email.
 */

@ApiTags('parent-links')
@ApiBearerAuth()
@Controller('parent-links')
@Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH)
export class ParentLinksController {
  constructor(private readonly parentLinks: ParentLinksService) {}

  @Get('student/:studentId')
  @ApiOperation({ summary: 'Parent accounts linked to a student' })
  forStudent(@Param('studentId') studentId: string) {
    return this.parentLinks.forStudent(studentId);
  }

  @Post('account')
  @Roles(Role.ADMIN, Role.SUPERVISOR)
  @ApiOperation({ summary: 'Create (or reuse) a parent login and link it to a student' })
  createAccount(@CurrentUser() user: AuthUser, @Body() dto: CreateParentAccountDto) {
    return this.parentLinks.createAccount(user, dto);
  }

  @Post('link')
  @Roles(Role.ADMIN, Role.SUPERVISOR)
  @ApiOperation({ summary: 'Link an existing parent account to another child' })
  link(@Body() dto: LinkParentDto) {
    return this.parentLinks.link(dto);
  }

  @Delete(':linkId')
  @Roles(Role.ADMIN, Role.SUPERVISOR)
  @ApiOperation({ summary: 'Unlink a parent from a student' })
  unlink(@Param('linkId') linkId: string) {
    return this.parentLinks.unlink(linkId);
  }
}
