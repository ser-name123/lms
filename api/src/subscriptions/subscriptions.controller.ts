import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser, Roles, type AuthUser } from '../auth/decorators';
import { Role } from '../generated/prisma/enums';
import { SubscriptionsService } from './subscriptions.service';
import {
  ListSubscriptionRequestsDto,
  RequestPackageChangeDto,
  RequestScheduleChangeDto,
  ReviewSubscriptionRequestDto,
} from './dto';

/*
 * Two audiences on one service. The student half is read-and-ask only: there is
 * no endpoint here that lets a student change their own package or timetable,
 * which is the point of the feature rather than an oversight.
 */
@ApiTags('Subscriptions')
@ApiBearerAuth()
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly service: SubscriptionsService) {}

  // ── Student ───────────────────────────────────────────────────────────────

  @Get('me')
  @Roles(Role.STUDENT)
  @ApiOperation({ summary: 'The current subscription — package, schedule, cycle, status' })
  me(@CurrentUser() user: AuthUser) {
    return this.service.currentForUser(user.id);
  }

  @Get('me/packages')
  @Roles(Role.STUDENT)
  @ApiOperation({ summary: 'Packages this student could move to' })
  myPackageOptions(@CurrentUser() user: AuthUser) {
    return this.service.packageOptions(user.id);
  }

  @Get('me/requests')
  @Roles(Role.STUDENT)
  @ApiOperation({ summary: 'This student’s own change requests' })
  myRequests(@CurrentUser() user: AuthUser) {
    return this.service.myRequests(user.id);
  }

  @Post('me/requests/package')
  @Roles(Role.STUDENT)
  @ApiOperation({ summary: 'Ask to change package from the next billing cycle' })
  requestPackage(
    @CurrentUser() user: AuthUser,
    @Body() dto: RequestPackageChangeDto,
  ) {
    return this.service.requestPackageChange(user.id, dto, {
      id: user.id,
      name: user.email,
      role: user.role,
    });
  }

  @Post('me/requests/schedule')
  @Roles(Role.STUDENT)
  @ApiOperation({ summary: 'Ask to change class days/time from the next billing cycle' })
  requestSchedule(
    @CurrentUser() user: AuthUser,
    @Body() dto: RequestScheduleChangeDto,
  ) {
    return this.service.requestScheduleChange(user.id, dto, {
      id: user.id,
      name: user.email,
      role: user.role,
    });
  }

  // ── Staff. Static routes first, or :id swallows them ──────────────────────

  @Get('requests')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH)
  @ApiOperation({ summary: 'Change requests — coaches see their own students' })
  list(@Query() dto: ListSubscriptionRequestsDto, @CurrentUser() user: AuthUser) {
    return this.service.list(dto, { id: user.id, name: user.email, role: user.role });
  }

  @Get('requests/:id')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH)
  @ApiOperation({ summary: 'One request with the price / hours / availability comparison' })
  detail(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.detail(id, { id: user.id, name: user.email, role: user.role });
  }

  @Patch('requests/:id/review')
  @Roles(Role.ADMIN, Role.ACADEMIC_COACH)
  @ApiOperation({ summary: 'Approve or reject. Approving queues it for the next cycle.' })
  review(
    @Param('id') id: string,
    @Body() dto: ReviewSubscriptionRequestDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.review(id, dto, {
      id: user.id,
      name: user.email,
      role: user.role,
    });
  }

  // Staff-facing view of any student's subscription, for the approval screen
  // and the student hub.
  @Get('student/:studentId')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH)
  @ApiOperation({ summary: 'A student’s current subscription' })
  forStudent(@Param('studentId') studentId: string) {
    return this.service.currentFor(studentId);
  }

  /*
   * Apply a queued change now instead of waiting for the cycle. Normally the
   * billing sweep does this on its own; this exists for the days it did not —
   * the sweep errored, or the academy agreed to move somebody early. Admin
   * only, and it writes the same audit row the automatic path does.
   */
  @Post('student/:studentId/apply-now')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Apply this student’s queued change immediately' })
  applyNow(@Param('studentId') studentId: string) {
    return this.service.applyNextCycleFor(studentId);
  }
}
