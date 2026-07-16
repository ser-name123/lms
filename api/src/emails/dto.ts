import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class SmtpConfigDto {
  @IsString()
  host!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  port!: number;

  @IsString()
  user!: string;

  // Blank means "keep the existing password" (handled in the service).
  @IsOptional()
  @IsString()
  pass?: string;

  @IsString()
  from!: string;

  @IsOptional()
  @IsBoolean()
  secure?: boolean;
}
