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
import { CreateCandidateDto, ListCandidatesDto, UpdateCandidateDto } from './dto';
import { CandidatesService } from './candidates.service';

@ApiTags('candidates')
@ApiBearerAuth()
@Controller('candidates')
@Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH)
export class CandidatesController {
  constructor(private readonly service: CandidatesService) {}

  @Get()
  @ApiOperation({ summary: 'Paginated, filtered candidate list' })
  list(@Query() query: ListCandidatesDto) {
    return this.service.list(query);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get candidate recruitment stats summary' })
  getStats() {
    return this.service.getStats();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one candidate application detail' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Add a new candidate application manually' })
  create(@Body() dto: CreateCandidateDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.ACADEMIC_COACH)
  @ApiOperation({ summary: 'Update candidate status/notes' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCandidateDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a candidate application' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }

  @Post('seed')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Seed realistic candidate records' })
  seed() {
    return this.service.seed();
  }
}
