import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser, Roles, type AuthUser } from '../auth/decorators';
import { Role } from '../generated/prisma/enums';
import { RankingsService } from './rankings.service';
import { GenerateRankingDto, ListRankingsQuery } from '../monthly-assessments/dto';

const actor = (u: AuthUser) => ({ id: u.id, email: u.email, role: u.role });

/*
 * Course-wise student rankings.
 *
 * The read surface is deliberately split three ways rather than filtered on one
 * endpoint: staff get the whole table, a teacher gets the courses they teach,
 * and a student gets their own row plus the configured top-N. Trying to express
 * all three through one `GET /rankings` is how a student ends up able to page
 * through everybody else's scores.
 */
@ApiTags('rankings')
@ApiBearerAuth()
@Controller('rankings')
export class RankingsController {
  constructor(private readonly service: RankingsService) {}

  @Get('cycles')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH, Role.TEACHER)
  @ApiOperation({ summary: 'Cycles that have a ranking (period picker)' })
  cycles() {
    return this.service.cycles();
  }

  @Get('generatable')
  @Roles(Role.ADMIN, Role.SUPERVISOR)
  @ApiOperation({ summary: 'Cycles with published assessments, and whether they are ranked yet' })
  generatable() {
    return this.service.generatable();
  }

  @Get('analytics')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH)
  @ApiOperation({ summary: 'Score bands, per-course averages and biggest movers' })
  analytics(@Query('courseId') courseId?: string) {
    return this.service.analytics(courseId);
  }

  @Get('mine')
  @Roles(Role.STUDENT)
  @ApiOperation({ summary: "The student's own rank, score, badges and the visible top-N" })
  mine(@CurrentUser() u: AuthUser) {
    return this.service.myRanking(u.id);
  }

  @Get('teacher')
  @Roles(Role.TEACHER)
  @ApiOperation({ summary: 'Leaderboards for the courses this teacher teaches' })
  teacher(@Query() q: ListRankingsQuery, @CurrentUser() u: AuthUser) {
    return this.service.teacherLeaderboard(u.id, q);
  }

  @Get('student/:studentId')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH, Role.TEACHER)
  @ApiOperation({ summary: "One student's ranking history + badges (admin student hub)" })
  forStudent(@Param('studentId') studentId: string) {
    return this.service.forStudent(studentId);
  }

  @Post('generate')
  @Roles(Role.ADMIN, Role.SUPERVISOR)
  @HttpCode(200)
  @ApiOperation({ summary: 'Generate (and optionally publish) the ranking for a cycle' })
  generate(@Body() dto: GenerateRankingDto, @CurrentUser() u: AuthUser) {
    return this.service.generate(dto, actor(u));
  }

  @Get()
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH)
  @ApiOperation({ summary: 'Full course-wise leaderboard for a cycle' })
  leaderboard(@Query() q: ListRankingsQuery) {
    return this.service.leaderboard(q);
  }
}
