import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { TrialStatus } from '../generated/prisma/enums';

const GENDER_PREFS = ['Male', 'Female', 'Any'];

export class CreateTrialDto {
  @ApiProperty({ example: 'Zayn Malik' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ example: 'zayn@example.com' })
  @IsEmail()
  email!: string;

  @ApiPropertyOptional({ example: '+1 555-0199' })
  @IsOptional()
  @IsString()
  mobile?: string;

  @ApiProperty({ example: 'United Kingdom' })
  @IsString()
  @IsNotEmpty()
  country!: string;

  @ApiProperty({ example: 'Quran' })
  @IsString()
  @IsNotEmpty()
  course!: string;

  @ApiProperty({ example: 'Any' })
  @IsIn(GENDER_PREFS)
  prefTeacherGender!: string;

  @ApiProperty({ example: 10 })
  @Type(() => Number)
  @IsInt()
  @Min(3)
  @Max(120)
  age!: number;

  @ApiPropertyOptional({ example: 'Trial goals details' })
  @IsOptional()
  @IsString()
  goals?: string;

  @ApiPropertyOptional({ enum: TrialStatus })
  @IsOptional()
  @IsIn(Object.values(TrialStatus))
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  scheduledTime?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  assignedTeacher?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  meetLink?: string;
}

// Edit form sends a partial trial; every field is optional but still validated.
export class UpdateTrialDto {
  @IsOptional() @IsString() @IsNotEmpty() name?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() mobile?: string;
  @IsOptional() @IsString() country?: string;
  @IsOptional() @IsString() course?: string;
  @IsOptional() @IsIn(GENDER_PREFS) prefTeacherGender?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(3) @Max(120) age?: number;
  @IsOptional() @IsString() goals?: string;
  @IsOptional() @IsIn(Object.values(TrialStatus)) status?: string;
  @IsOptional() @IsString() scheduledTime?: string;
  @IsOptional() @IsString() assignedTeacher?: string;
  @IsOptional() @IsString() meetLink?: string;
}

export class ScheduleTrialDto {
  @ApiProperty({ example: 'Ustadh Bilal' })
  @IsString()
  teacher!: string;

  @ApiProperty({ example: '2026-07-18 16:00' })
  @IsString()
  dateTime!: string;

  @ApiPropertyOptional({ example: 'https://zoom.us/j/123456789' })
  @IsOptional()
  @IsString()
  meetLink?: string;
}

export class EvaluateTrialDto {
  @ApiProperty({ example: 'A' })
  @IsString()
  pronunciation!: string;

  @ApiProperty({ example: 'B' })
  @IsString()
  fluency!: string;

  @ApiProperty({ example: 'A' })
  @IsString()
  focus!: string;

  @ApiProperty({ example: 'Quran — Level 1' })
  @IsString()
  recommendedLevel!: string;

  @ApiPropertyOptional({ example: 'Evaluation notes here' })
  @IsOptional()
  @IsString()
  notes?: string;
}
