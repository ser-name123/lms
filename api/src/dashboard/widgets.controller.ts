import { Body, Controller, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser, Roles, type AuthUser } from '../auth/decorators';
import { Role } from '../generated/prisma/enums';
import { WidgetsService } from './widgets.service';
import { SaveUserLayoutDto, UpdateRoleWidgetsDto } from './dto';

/*
 * Widget configuration.
 *
 * Admin-only routes manage the registry and the per-role enable/disable matrix.
 * The `/me` routes are open to every authenticated role and only ever touch the
 * caller's own layout.
 */

@ApiTags('dashboard-widgets')
@ApiBearerAuth()
@Controller('dashboard/widgets')
export class DashboardWidgetsController {
  constructor(private readonly widgets: WidgetsService) {}

  // Static segments are declared before `:role` so they are not swallowed.

  @Get('me')
  @ApiOperation({ summary: "Widgets the signed-in user's dashboard should render" })
  mine(@CurrentUser() user: AuthUser) {
    return this.widgets.forUser(user.id, user.role);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Save the caller’s own widget order / size / visibility' })
  saveMine(@CurrentUser() user: AuthUser, @Body() dto: SaveUserLayoutDto) {
    return this.widgets.saveUserLayout(user.id, user.role, dto.items);
  }

  @Post('me/reset')
  // Returns the resolved layout rather than creating a resource.
  @HttpCode(200)
  @ApiOperation({ summary: 'Drop personalisation and fall back to role defaults' })
  resetMine(@CurrentUser() user: AuthUser) {
    return this.widgets.resetUserLayout(user.id, user.role);
  }

  @Get('registry')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Full widget registry' })
  registry() {
    return this.widgets.registry();
  }

  @Patch('role')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Enable / disable / reorder widgets for a role' })
  updateRole(@Body() dto: UpdateRoleWidgetsDto) {
    return this.widgets.updateRoleWidgets(dto.role, dto.items);
  }

  @Get('role/:role')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Widget toggle matrix for one role' })
  roleMatrix(@Param('role') role: Role) {
    return this.widgets.roleMatrix(role);
  }
}
