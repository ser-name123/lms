import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, IsString, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';
import { LeaveType, LeaveRequestStatus } from '../generated/prisma/enums';

export class CreateLeaveDto {
  @ApiProperty({ example: 'user-id-here' })
  @IsString()
  userId!: string;

  @ApiProperty({ enum: LeaveType, example: LeaveType.CASUAL })
  @IsEnum(LeaveType)
  leaveType!: LeaveType;

  @ApiProperty({ example: '2026-07-16T00:00:00.000Z' })
  @IsDateString()
  startDate!: string;

  @ApiProperty({ example: '2026-07-18T00:00:00.000Z' })
  @IsDateString()
  endDate!: string;

  @ApiProperty({ example: 'Medical checkup' })
  @IsString()
  reason!: string;
}

export class UpdateLeaveDto {
  @ApiPropertyOptional({ enum: LeaveRequestStatus })
  @IsOptional()
  @IsEnum(LeaveRequestStatus)
  status?: LeaveRequestStatus;

  @ApiPropertyOptional({ example: 'Approved, get well soon' })
  @IsOptional()
  @IsString()
  adminNotes?: string;
}

export class ListLeavesDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  page = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  limit = 20;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: LeaveRequestStatus })
  @IsOptional()
  @IsEnum(LeaveRequestStatus)
  status?: LeaveRequestStatus;

  @ApiPropertyOptional({ example: 'date_desc' })
  @IsOptional()
  @IsString()
  sortBy?: string;
}
