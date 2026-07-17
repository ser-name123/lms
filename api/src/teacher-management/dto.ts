import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray, IsIn, IsNotEmpty, IsObject, IsOptional, IsString,
} from 'class-validator';

export class UpdateTeachingDto {
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) subjects?: string[];
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) levels?: string[];
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) teachingModes?: string[];
}

// { Monday: [{ from: "09:00", to: "13:00" }], Tuesday: [...] }
export class SetAvailabilityDto {
  @ApiProperty({ type: 'object', additionalProperties: true })
  @IsObject() availability!: Record<string, { from: string; to: string }[]>;
}

export class UpdateTeacherProfileDto {
  @ApiPropertyOptional() @IsOptional() @IsString() gender?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() dateOfBirth?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() nationality?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() timeZone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() address?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() whatsapp?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() qualification?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() experienceYears?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) languages?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() bio?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() specialisation?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() joiningDate?: string;
}

export class TransferStudentsDto {
  @ApiProperty({ type: [String], description: 'Enrollment ids to transfer' })
  @IsArray() @IsString({ each: true }) enrollmentIds!: string[];
  @ApiProperty({ description: 'Destination TeacherProfile id' })
  @IsString() @IsNotEmpty() toTeacherId!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() reason?: string;
}

export class SendTeacherMessageDto {
  @ApiProperty() @IsString() @IsNotEmpty() title!: string;
  @ApiProperty() @IsString() @IsNotEmpty() body!: string;
  @ApiPropertyOptional({ enum: ['IN_APP', 'EMAIL', 'BOTH'], default: 'BOTH' })
  @IsOptional() @IsIn(['IN_APP', 'EMAIL', 'BOTH']) channel?: string;
}

export class SetTeacherStatusDto {
  @ApiProperty({ enum: ['ACTIVE', 'INACTIVE', 'PAUSED'] })
  @IsIn(['ACTIVE', 'INACTIVE', 'PAUSED']) status!: string;
}

export class AssignStudentsDto {
  @ApiProperty({ type: [String], description: 'Enrollment ids to (re)assign to this teacher' })
  @IsArray() @IsString({ each: true }) enrollmentIds!: string[];
}

export class AssignBatchesDto {
  @ApiProperty({ type: [String], description: 'Batch ids to assign to this teacher' })
  @IsArray() @IsString({ each: true }) batchIds!: string[];
}
