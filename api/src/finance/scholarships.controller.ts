import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles, type AuthUser } from '../auth/decorators';
import { Role } from '../generated/prisma/enums';
import { ScholarshipsService } from './scholarships.service';
import {
  CreateScholarshipDto,
  ListScholarshipsDto,
  ReviewScholarshipDto,
} from './dto';

const actor = (u: AuthUser) => ({ id: u?.id, name: u?.email });

@ApiTags('finance')
@ApiBearerAuth()
@Controller('finance/scholarships')
@Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH)
export class ScholarshipsController {
  constructor(private readonly service: ScholarshipsService) {}

  @Get()
  @ApiOperation({ summary: 'List scholarships' })
  list(@Query() query: ListScholarshipsDto) {
    return this.service.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Scholarship detail' })
  getOne(@Param('id') id: string) {
    return this.service.getOne(id);
  }

  // A coach can request a scholarship on a student's behalf; only admins approve.
  @Post()
  @ApiOperation({ summary: 'Create a scholarship request' })
  create(@Body() dto: CreateScholarshipDto, @CurrentUser() user: AuthUser) {
    return this.service.create(dto, actor(user));
  }

  @Post(':id/review')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Approve or reject a scholarship request' })
  review(
    @Param('id') id: string,
    @Body() dto: ReviewScholarshipDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.review(id, dto, actor(user));
  }
}
