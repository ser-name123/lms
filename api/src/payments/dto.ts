import { IsOptional, IsString } from 'class-validator';

/*
 * Every field optional, and a blank one means "keep what is stored".
 *
 * The screen never receives the secret key back, so it cannot send it back
 * either. Without this rule, saving the form after changing only the
 * publishable key would wipe the secret with the empty string the input holds.
 */
export class SaveStripeSettingsDto {
  @IsOptional()
  @IsString()
  secretKey?: string;

  @IsOptional()
  @IsString()
  publishableKey?: string;

  @IsOptional()
  @IsString()
  webhookSecret?: string;
}
