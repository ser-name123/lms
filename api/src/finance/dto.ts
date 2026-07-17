import { PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  Max,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  DiscountReason,
  DiscountType,
  FeeComponentType,
  FeePlanCycle,
  PayrollModel,
} from '../generated/prisma/enums';

// ─── Fee plans ────────────────────────────────────────────────────────────────

export class FeeComponentInput {
  @IsEnum(FeeComponentType)
  type!: FeeComponentType;

  @IsString()
  @MinLength(1)
  label!: string;

  @IsNumber()
  @Min(0)
  amount!: number;
}

export class CreateFeePlanDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsEnum(FeePlanCycle)
  cycle!: FeePlanCycle;

  @IsOptional()
  @IsString()
  courseId?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FeeComponentInput)
  components!: FeeComponentInput[];
}

export class UpdateFeePlanDto extends PartialType(CreateFeePlanDto) {}

export class ListFeePlansDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  active?: string; // "true" / "false"
}

export class AssignFeePlanDto {
  @IsString()
  studentId!: string;

  @IsString()
  planId!: string;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsBoolean()
  autoGenerate?: boolean;

  @IsOptional()
  @IsString()
  discountId?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  // Immediately mint the first invoice for the current period.
  @IsOptional()
  @IsBoolean()
  generateNow?: boolean;
}

export class UpdateAssignmentDto {
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsBoolean()
  autoGenerate?: boolean;

  @IsOptional()
  @IsString()
  discountId?: string;

  @IsOptional()
  @IsString()
  nextRunAt?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

// ─── Invoices / payments ──────────────────────────────────────────────────────

export class InvoiceItemInput {
  @IsEnum(FeeComponentType)
  type!: FeeComponentType;

  @IsString()
  @MinLength(1)
  label!: string;

  @IsNumber()
  @Min(0)
  amount!: number;
}

export class GenerateInvoiceDto {
  @IsOptional()
  @IsString()
  studentId?: string;

  // Custom / external recipient (name + email stored in notes payload).
  @IsOptional()
  @IsString()
  customName?: string;

  @IsOptional()
  @IsString()
  customEmail?: string;

  @IsOptional()
  @IsString()
  feePlanId?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InvoiceItemInput)
  items?: InvoiceItemInput[];

  @IsOptional()
  @IsString()
  discountId?: string;

  @IsOptional()
  @IsString()
  scholarshipId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  taxPct?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  periodLabel?: string;

  @IsOptional()
  @IsString()
  issuedAt?: string;

  @IsOptional()
  @IsString()
  dueAt?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  // DRAFT keeps it unsent; SENT/PENDING marks it payable + notifies.
  @IsOptional()
  @IsString()
  status?: string;
}

export class ListInvoicesDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  studentId?: string;

  @IsOptional()
  @IsString()
  sortBy?: string;
}

export class RecordPaymentDto {
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsString()
  method!: string; // UPI / BANK_TRANSFER / CARD / RAZORPAY / STRIPE / CASH

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsString()
  paidAt?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

// ─── Discounts ────────────────────────────────────────────────────────────────

export class CreateDiscountDto {
  @IsOptional()
  @IsString()
  code?: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsEnum(DiscountType)
  type!: DiscountType;

  @IsNumber()
  @Min(0)
  value!: number;

  @IsEnum(DiscountReason)
  reason!: DiscountReason;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateDiscountDto extends PartialType(CreateDiscountDto) {}

// ─── Scholarships ─────────────────────────────────────────────────────────────

export class CreateScholarshipDto {
  @IsString()
  studentId!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsEnum(DiscountType)
  type!: DiscountType;

  @IsNumber()
  @Min(0)
  value!: number;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class ReviewScholarshipDto {
  @IsString()
  status!: string; // APPROVED / REJECTED

  @IsOptional()
  @IsString()
  reviewNotes?: string;
}

export class ListScholarshipsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  search?: string;
}

// ─── Refunds ──────────────────────────────────────────────────────────────────

export class CreateRefundDto {
  @IsOptional()
  @IsString()
  invoiceId?: string;

  @IsOptional()
  @IsString()
  paymentId?: string;

  @IsOptional()
  @IsString()
  studentId?: string;

  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsString()
  @MinLength(1)
  reason!: string;

  @IsOptional()
  @IsString()
  method?: string;
}

export class ReviewRefundDto {
  @IsString()
  status!: string; // APPROVED / REJECTED

  @IsOptional()
  @IsString()
  reviewNotes?: string;
}

export class ListRefundsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  search?: string;
}

// ─── Payroll ──────────────────────────────────────────────────────────────────

export class UpsertPayrollConfigDto {
  @IsString()
  userId!: string;

  @IsEnum(PayrollModel)
  model!: PayrollModel;

  @IsOptional()
  @IsNumber()
  @Min(0)
  baseSalary?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  perClassRate?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  perHourRate?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  perStudentRate?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  standardBonus?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class GeneratePayrollDto {
  @IsString()
  billingPeriodStart!: string;

  @IsString()
  billingPeriodEnd!: string;
}

// ─── Finance config ───────────────────────────────────────────────────────────

export class UpdateFinanceConfigDto {
  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsBoolean()
  taxEnabled?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  taxPct?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(30)
  reminderDaysBefore?: number;

  @IsOptional()
  @IsBoolean()
  overdueReminders?: boolean;

  @IsOptional()
  @IsBoolean()
  autoInvoice?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(28)
  salaryDayOfMonth?: number;
}
