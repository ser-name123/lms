import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles, type AuthUser } from '../auth/decorators';
import { Role } from '../generated/prisma/enums';
import { RefundsService } from './refunds.service';
import { CreateRefundDto, ListRefundsDto, ReviewRefundDto } from './dto';

const actor = (u: AuthUser) => ({ id: u?.id, name: u?.email });

@ApiTags('finance')
@ApiBearerAuth()
@Controller('finance/refunds')
@Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH)
export class RefundsController {
  constructor(private readonly service: RefundsService) {}

  @Get()
  @ApiOperation({ summary: 'List refunds' })
  list(@Query() query: ListRefundsDto) {
    return this.service.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Refund detail' })
  getOne(@Param('id') id: string) {
    return this.service.getOne(id);
  }

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Request a refund' })
  create(@Body() dto: CreateRefundDto, @CurrentUser() user: AuthUser) {
    return this.service.create(dto, actor(user));
  }

  @Post(':id/review')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Approve or reject a refund' })
  review(
    @Param('id') id: string,
    @Body() dto: ReviewRefundDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.review(id, dto, actor(user));
  }

  @Post(':id/process')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Mark an approved refund as processed' })
  process(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.process(id, actor(user));
  }
}
