import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';

import { EnrollmentStatus, UserStatus } from '../generated/prisma/enums';

export class ListStudentsDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @ApiPropertyOptional({ description: 'Matches name, email or student code' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: UserStatus })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  courseId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  teacherId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  batchId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  coachId?: string;

  @ApiPropertyOptional({ description: 'Only students converted from a trial/lead' })
  @IsOptional()
  @IsString()
  trialConverted?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  joiningDateStart?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  joiningDateEnd?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  nextPaymentDateStart?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  nextPaymentDateEnd?: string;
}

export class CreateStudentDto {
  @ApiProperty({ example: 'ayesha.khan@mail.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({ example: 'Ayesha' })
  @IsString()
  firstName!: string;

  @ApiProperty({ example: 'Khan' })
  @IsString()
  lastName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  gender?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  guardianName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  profession?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10000000)
  fees?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  joiningDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  lastPaymentDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  nextPaymentDate?: string;

  // Optional enrolment: assign the student to a course (by catalogue code) and,
  // optionally, a teacher at creation time. Omit both to create an unassigned
  // student.
  @ApiPropertyOptional({ description: 'LmsCourse code to enrol the student into' })
  @IsOptional()
  @IsString()
  courseCode?: string;

  @ApiPropertyOptional({ description: 'TeacherProfile id to assign for the enrolment' })
  @IsOptional()
  @IsString()
  teacherId?: string;

  // The package the enrolment is billed on. Without it a student created here
  // gets an enrolment with no package: their own subscription page has nothing
  // to show and no package change can be priced.
  @ApiPropertyOptional({ description: 'Package id the enrolment is billed on' })
  @IsOptional()
  @IsString()
  packageId?: string;
}

export class UpdateStudentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  guardianName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  profession?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10000000)
  fees?: number;

  @ApiPropertyOptional({ enum: UserStatus })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  joiningDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  lastPaymentDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  nextPaymentDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  gender?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  // Optional enrolment management: assign/change the student's course (by
  // catalogue code) and/or teacher. Omit to leave enrolments untouched.
  @ApiPropertyOptional({ description: 'LmsCourse code to enrol the student into' })
  @IsOptional()
  @IsString()
  courseCode?: string;

  @ApiPropertyOptional({ description: 'TeacherProfile id to assign for the enrolment' })
  @IsOptional()
  @IsString()
  teacherId?: string;

  // The package the enrolment is billed on. Without it a student created here
  // gets an enrolment with no package: their own subscription page has nothing
  // to show and no package change can be priced.
  @ApiPropertyOptional({ description: 'Package id the enrolment is billed on' })
  @IsOptional()
  @IsString()
  packageId?: string;
}
