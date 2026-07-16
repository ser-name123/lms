import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Roles } from '../auth/decorators';
import { Role } from '../generated/prisma/enums';
import { CreateLeaveDto, ListLeavesDto, UpdateLeaveDto } from './dto';
import { LeavesService } from './leaves.service';

@ApiTags('leaves')
@ApiBearerAuth()
@Controller('leaves')
@Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH)
export class LeavesController {
  constructor(private readonly service: LeavesService) {}

  @Get()
  @ApiOperation({ summary: 'Paginated, filtered leave requests' })
  list(@Query() query: ListLeavesDto) {
    return this.service.list(query);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get leave requests counters' })
  getStats() {
    return this.service.getStats();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one leave request detail' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Request leave' })
  create(@Body() dto: CreateLeaveDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Approve or decline leave request' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLeaveDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete leave request record' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }

  @Post('seed')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Seed database with exactly 10 leave requests' })
  seed() {
    return this.service.seed();
  }
}
