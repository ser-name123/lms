import {
  ApiProperty,
  ApiPropertyOptional,
  OmitType,
  PartialType,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import { TeacherRegistrationStatus } from '../generated/prisma/enums';

const TEACHING_MODES = ['ONLINE', 'OFFLINE', 'HYBRID'];

// Public teacher self-registration payload. Only name, email and a password are
// truly required; everything else is optional so the wizard can submit
// partial-but-valid applications.
export class CreateTeacherRegistrationDto {
  // ── Personal ──────────────────────────────────────────────────────────────
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  firstName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  middleName?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  lastName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  gender?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  dateOfBirth?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  nationality?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  state?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;

  // ── Contact ───────────────────────────────────────────────────────────────
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  mobile?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  whatsappNumber?: string;

  // ── Professional ──────────────────────────────────────────────────────────
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  highestQualification?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  university?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  passingYear?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  experienceYears?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  currentEmployer?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  expectedSalary?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  subjects?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  languages?: string;

  @ApiPropertyOptional({ enum: TEACHING_MODES })
  @IsOptional()
  @IsIn(TEACHING_MODES)
  teachingMode?: string;

  // ── Availability + skills ─────────────────────────────────────────────────
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  availabilityDays?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  availabilitySlots?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  technicalSkills?: string[];

  // ── Bank ──────────────────────────────────────────────────────────────────
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  accountNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ifsc?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bankName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  upi?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  taxNumber?: string;

  // ── Documents (relative /uploads references from the upload endpoint) ──────
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  resumeUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  degreeUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  certificatesUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  govIdUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  photoUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  experienceLetterUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  policeVerificationUrl?: string;

  // ── Account ───────────────────────────────────────────────────────────────
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  username?: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;
}

// Admin action to advance the application through the hiring pipeline, or to
// reject / request more info. ACTIVATED is the terminal success state and
// provisions a real teacher account.
const REVIEW_STATUSES = [
  'SCREENING',
  'INTERVIEW',
  'DEMO_CLASS',
  'APPROVAL',
  'TRAINING',
  'ACTIVATED',
  'REJECTED',
  'NEEDS_INFO',
];

export class ReviewTeacherRegistrationDto {
  @ApiProperty({ enum: REVIEW_STATUSES })
  @IsIn(REVIEW_STATUSES)
  status!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  interviewDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  demoDate?: string;
}

// Admin edits every teacher-application field except the password.
export class UpdateTeacherRegistrationDto extends PartialType(
  OmitType(CreateTeacherRegistrationDto, ['password'] as const),
) {}

export class VerifyTeacherRegistrationOtpDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  otp!: string;
}

export class ListTeacherRegistrationsDto {
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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  // ARCHIVED is a filter, not a stored status: activated hires whose account
  // has since been deleted. Nothing ever writes it.
  @ApiPropertyOptional({
    enum: [...Object.values(TeacherRegistrationStatus), 'ARCHIVED'],
  })
  @IsOptional()
  @IsIn([...Object.values(TeacherRegistrationStatus), 'ARCHIVED'])
  status?: string;
}
