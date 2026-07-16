import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { InvoiceStatus } from '../generated/prisma/enums';

export class CreateInvoiceDto {
  @ApiProperty({ example: 'INV-2026-001' })
  @IsString()
  number!: string;

  @ApiProperty({ example: 'student-id-here' })
  @IsString()
  studentId!: string;

  @ApiProperty({ example: 142.50 })
  @IsNumber()
  amount!: number;

  @ApiPropertyOptional({ enum: InvoiceStatus, default: InvoiceStatus.DRAFT })
  @IsOptional()
  @IsEnum(InvoiceStatus)
  status?: InvoiceStatus;

  @ApiPropertyOptional({ example: '2026-07-16' })
  @IsOptional()
  @IsString()
  issuedAt?: string;

  @ApiPropertyOptional({ example: '2026-07-30' })
  @IsOptional()
  @IsString()
  dueAt?: string;
}

export class UpdateInvoiceDto {
  @ApiPropertyOptional({ example: 142.50 })
  @IsOptional()
  @IsNumber()
  amount?: number;

  @ApiPropertyOptional({ enum: InvoiceStatus })
  @IsOptional()
  @IsEnum(InvoiceStatus)
  status?: InvoiceStatus;

  @ApiPropertyOptional({ example: '2026-07-30' })
  @IsOptional()
  @IsString()
  dueAt?: string;
}

export class ListInvoicesDto {
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

  @ApiPropertyOptional({ enum: InvoiceStatus })
  @IsOptional()
  @IsEnum(InvoiceStatus)
  status?: InvoiceStatus;

  @ApiPropertyOptional({ example: 'date-desc' })
  @IsOptional()
  @IsString()
  sortBy?: string;
}
