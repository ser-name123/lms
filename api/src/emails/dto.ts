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

/*
 * Every field optional, and a blank one keeps the stored value. The screen
 * never receives the client secret or refresh token back, so it cannot send
 * them back — without this rule, editing only the sender would wipe them.
 */
export class GmailApiConfigDto {
  @IsOptional()
  @IsString()
  clientId?: string;

  @IsOptional()
  @IsString()
  clientSecret?: string;

  @IsOptional()
  @IsString()
  refreshToken?: string;

  @IsOptional()
  @IsString()
  sender?: string;
}
