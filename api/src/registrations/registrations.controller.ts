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
  UpdateStudentRegistrationDto,
  VerifyRegistrationOtpDto,
} from './dto';

@ApiTags('registrations')
@ApiBearerAuth()
@Controller('registrations')
@Roles(Role.ADMIN)
export class RegistrationsController {
  constructor(private readonly service: RegistrationsService) {}

  @Post()
  @Public()
  @ApiOperation({ summary: 'Public: submit application, receive an email OTP' })
  create(@Body() dto: CreateRegistrationDto) {
    return this.service.requestOtp(dto);
  }

  @Post('verify-otp')
  @Public()
  @ApiOperation({ summary: 'Public: verify the OTP to finalise the application' })
  verifyOtp(@Body() dto: VerifyRegistrationOtpDto) {
    return this.service.verifyOtp(dto.email, dto.otp);
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

  @Get('by-student/:profileId')
  @ApiOperation({ summary: 'Get the full application linked to a student profile' })
  getByStudent(@Param('profileId') profileId: string) {
    return this.service.getByStudent(profileId);
  }

  @Patch('by-student/:profileId')
  @ApiOperation({ summary: 'Edit the full application linked to a student profile' })
  updateByStudent(
    @Param('profileId') profileId: string,
    @Body() dto: UpdateStudentRegistrationDto,
  ) {
    return this.service.updateByStudent(profileId, dto);
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
