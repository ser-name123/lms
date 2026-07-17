import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators';
import { Role } from '../generated/prisma/enums';
import { FeePlansService } from './fee-plans.service';
import {
  AssignFeePlanDto,
  CreateFeePlanDto,
  ListFeePlansDto,
  UpdateAssignmentDto,
  UpdateFeePlanDto,
} from './dto';

@ApiTags('finance')
@ApiBearerAuth()
@Controller('finance/fee-plans')
@Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH)
export class FeePlansController {
  constructor(private readonly service: FeePlansService) {}

  @Get()
  @ApiOperation({ summary: 'List fee plans' })
  list(@Query() query: ListFeePlansDto) {
    return this.service.list(query);
  }

  // Static route must precede :id.
  @Get('assignments')
  @ApiOperation({ summary: 'List student fee-plan assignments' })
  assignments(@Query('studentId') studentId?: string) {
    return this.service.assignments(studentId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Fee plan detail' })
  getOne(@Param('id') id: string) {
    return this.service.getOne(id);
  }

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Create a fee plan' })
  create(@Body() dto: CreateFeePlanDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update a fee plan' })
  update(@Param('id') id: string, @Body() dto: UpdateFeePlanDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Archive a fee plan' })
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  @Post('assign')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Assign a fee plan to a student' })
  assign(@Body() dto: AssignFeePlanDto) {
    return this.service.assign(dto);
  }

  @Patch('assignments/:id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update a fee-plan assignment' })
  updateAssignment(@Param('id') id: string, @Body() dto: UpdateAssignmentDto) {
    return this.service.updateAssignment(id, dto);
  }

  @Delete('assignments/:id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Remove a fee-plan assignment' })
  removeAssignment(@Param('id') id: string) {
    return this.service.removeAssignment(id);
  }
}
