import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

const WEEKDAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

export class RequestPackageChangeDto {
  @ApiProperty({ description: 'The package the student wants to move to' })
  @IsString()
  @IsNotEmpty()
  packageId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

export class RequestScheduleChangeDto {
  @ApiProperty({ enum: WEEKDAYS, isArray: true })
  @IsArray()
  @IsIn(WEEKDAYS, { each: true })
  days!: string[];

  // Same shape as Batch.startTime, so an approval can be written straight
  // through without a second format to get wrong.
  @ApiProperty({ example: '18:00' })
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'time must be HH:mm, e.g. 18:00',
  })
  time!: string;

  @ApiPropertyOptional({ description: 'ISO date the student would like it to start' })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'Which batch, when the student is in more than one' })
  @IsOptional()
  @IsString()
  batchId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

export class ReviewSubscriptionRequestDto {
  @ApiProperty({ description: 'true to approve, false to reject' })
  @IsBoolean()
  approve!: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  /*
   * Only for a schedule change on a batch the student shares. Rewriting that
   * batch's days and times would move every other student in it, so the coach
   * names the batch this one moves into instead.
   */
  @ApiPropertyOptional({ description: 'Batch to move the student into (shared batches only)' })
  @IsOptional()
  @IsString()
  targetBatchId?: string;
}

export class ListSubscriptionRequestsDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit: number = 20;

  @ApiPropertyOptional({ enum: ['PENDING', 'APPROVED', 'REJECTED', 'APPLIED'] })
  @IsOptional()
  @IsIn(['PENDING', 'APPROVED', 'REJECTED', 'APPLIED'])
  status?: string;

  @ApiPropertyOptional({ enum: ['PACKAGE_CHANGE', 'SCHEDULE_CHANGE'] })
  @IsOptional()
  @IsIn(['PACKAGE_CHANGE', 'SCHEDULE_CHANGE'])
  type?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;
}
