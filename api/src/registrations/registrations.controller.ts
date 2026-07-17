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

import { CurrentUser, Public, Roles, type AuthUser } from '../auth/decorators';
import { Role } from '../generated/prisma/enums';
import { RegistrationsService } from './registrations.service';
import {
  CreateRegistrationDto,
  ListRegistrationsDto,
  ReviewRegistrationDto,
} from './dto';

@ApiTags('registrations')
@ApiBearerAuth()
@Controller('registrations')
@Roles(Role.ADMIN)
export class RegistrationsController {
  constructor(private readonly service: RegistrationsService) {}

  @Post()
  @Public()
  @ApiOperation({ summary: 'Public: submit a student registration application' })
  create(@Body() dto: CreateRegistrationDto) {
    return this.service.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List / filter registration applications' })
  list(@Query() query: ListRegistrationsDto) {
    return this.service.list(query);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Registration counts by status' })
  stats() {
    return this.service.getStats();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one registration application' })
  getOne(@Param('id') id: string) {
    return this.service.getOne(id);
  }

  @Patch(':id/review')
  @ApiOperation({ summary: 'Approve / reject / request more info' })
  review(
    @Param('id') id: string,
    @Body() dto: ReviewRegistrationDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.review(id, dto, user?.id);
  }
}
