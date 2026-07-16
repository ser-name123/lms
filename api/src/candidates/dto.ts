import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { Type } from 'class-transformer';
import { CandidateStatus } from '../generated/prisma/enums';

export class CreateCandidateDto {
  @ApiProperty({ example: 'Mohammed' })
  @IsString()
  firstName!: string;

  @ApiProperty({ example: 'Taha' })
  @IsString()
  lastName!: string;

  @ApiProperty({ example: 'mohammed.taha@yopmail.com' })
  @IsEmail()
  email!: string;

  @ApiPropertyOptional({ example: '+971554546725' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ example: 'Quran Teacher' })
  @IsString()
  position!: string;

  @ApiPropertyOptional({ example: 'https://lms.local/resumes/taha.pdf' })
  @IsOptional()
  @IsString()
  resumeUrl?: string;

  @ApiPropertyOptional({ example: 'Very strong tajweed credentials' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateCandidateDto {
  @ApiPropertyOptional({ enum: CandidateStatus })
  @IsOptional()
  @IsEnum(CandidateStatus)
  status?: CandidateStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class ListCandidatesDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  page = 1;

  @ApiPropertyOptional({ default: 8 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  limit = 8;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: CandidateStatus })
  @IsOptional()
  @IsEnum(CandidateStatus)
  status?: CandidateStatus;

  @ApiPropertyOptional({ example: 'date_desc' })
  @IsOptional()
  @IsString()
  sortBy?: string;
}
