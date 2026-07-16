import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { UserStatus } from '../generated/prisma/enums';

export class ListTeachersDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number = 8;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @IsOptional()
  @IsString()
  specialisation?: string;

  @IsOptional()
  @IsString()
  sortBy?: string;
}

export class CreateTeacherDto {
  @IsString()
  email: string;

  @IsString()
  password?: string;

  @IsString()
  firstName: string;

  @IsString()
  lastName: string;

  @IsOptional()
  @IsString()
  specialisation?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  hourlyRate?: number;

  @IsOptional()
  @IsString()
  bio?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  timezone?: string;
}

export class UpdateTeacherDto {
  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  specialisation?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  hourlyRate?: number;

  @IsOptional()
  @IsString()
  bio?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;
}
