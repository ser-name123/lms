import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateTrialDto {
  @ApiProperty({ example: 'Zayn Malik' })
  @IsString()
  name!: string;

  @ApiProperty({ example: 'zayn@example.com' })
  @IsString()
  email!: string;

  @ApiPropertyOptional({ example: '+1 555-0199' })
  @IsOptional()
  @IsString()
  mobile?: string;

  @ApiProperty({ example: 'United Kingdom' })
  @IsString()
  country!: string;

  @ApiProperty({ example: 'Quran' })
  @IsString()
  course!: string;

  @ApiProperty({ example: 'Any' })
  @IsString()
  prefTeacherGender!: string;

  @ApiProperty({ example: 10 })
  @IsNumber()
  age!: number;

  @ApiPropertyOptional({ example: 'Trial goals details' })
  @IsOptional()
  @IsString()
  goals?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
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
