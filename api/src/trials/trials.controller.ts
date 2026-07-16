import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Roles } from '../auth/decorators';
import { Role } from '../generated/prisma/enums';
import {
  CreateTrialDto,
  ScheduleTrialDto,
  EvaluateTrialDto,
  UpdateTrialDto,
} from './dto';
import { TrialsService } from './trials.service';

// Trial evaluation is the ACADEMIC_COACH panel's core job (/evaluation page),
// so coaches get everything except delete, which stays ADMIN-only.
@ApiTags('trials')
@ApiBearerAuth()
@Controller('trials')
@Roles(Role.ADMIN, Role.ACADEMIC_COACH)
export class TrialsController {
  constructor(private readonly service: TrialsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all trial class inquiries' })
  list() {
    return this.service.list();
  }

  @Post()
  @ApiOperation({ summary: 'Create new trial class inquiry' })
  create(@Body() dto: CreateTrialDto) {
    return this.service.create(dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update trial class inquiry details' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTrialDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete trial class inquiry' })
  delete(@Param('id') id: string) {
    return this.service.delete(id);
  }

  @Put(':id/schedule')
  @ApiOperation({ summary: 'Schedule an active trial' })
  schedule(
    @Param('id') id: string,
    @Body() dto: ScheduleTrialDto,
  ) {
    return this.service.schedule(id, dto);
  }

  @Put(':id/evaluate')
  @ApiOperation({ summary: 'Evaluate and grade completed trial' })
  evaluate(
    @Param('id') id: string,
    @Body() dto: EvaluateTrialDto,
  ) {
    return this.service.evaluate(id, dto);
  }
}
