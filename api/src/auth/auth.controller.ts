import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { AuthService } from './auth.service';
import { CurrentUser, Public, type AuthUser } from './decorators';
import { LoginDto, RefreshDto, TokensDto, UpdateProfileDto, VerifyOtpDto, CreateAdminDto } from './dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exchange credentials for OTP requirement' })
  login(@Body() dto: LoginDto): Promise<TokensDto | { otpRequired: boolean; email: string }> {
    return this.auth.login(dto.email, dto.password);
  }

  @Public()
  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify OTP and exchange for access + refresh token pair' })
  verifyOtp(@Req() req: any, @Body() dto: VerifyOtpDto): Promise<TokensDto> {
    const userAgent = req.headers['user-agent'];
    const ipAddress = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress;
    return this.auth.verifyOtp(dto.email, dto.otp, userAgent, ipAddress);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate a refresh token for a fresh pair' })
  refresh(@Req() req: any, @Body() dto: RefreshDto): Promise<TokensDto> {
    const userAgent = req.headers['user-agent'];
    const ipAddress = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress;
    return this.auth.refresh(dto.refreshToken, userAgent, ipAddress);
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke a refresh token' })
  logout(@Body() dto: RefreshDto): Promise<void> {
    return this.auth.logout(dto.refreshToken);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'The signed-in user' })
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id);
  }

  @Patch('profile')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update the signed-in user profile' })
  updateProfile(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.auth.updateProfile(user.id, dto);
  }

  @Get('sessions')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get active sessions for the signed-in user' })
  getSessions(@Req() req: any, @CurrentUser() user: AuthUser) {
    const userAgent = req.headers['user-agent'];
    const ipAddress = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress;
    return this.auth.getSessions(user.id, userAgent, ipAddress);
  }

  @Delete('sessions/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke a specific session' })
  revokeSession(@CurrentUser() user: AuthUser, @Param('id') sessionId: string) {
    return this.auth.revokeSession(user.id, sessionId);
  }

  @Get('admins')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List all administrators (Master admin only)' })
  listAdmins(@CurrentUser() user: AuthUser) {
    return this.auth.listAdmins(user.id);
  }

  @Post('admins')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new administrator (Master admin only)' })
  createAdmin(@CurrentUser() user: AuthUser, @Body() dto: CreateAdminDto) {
    return this.auth.createAdmin(user.id, dto);
  }

  @Delete('admins/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete an administrator (Master admin only)' })
  deleteAdmin(@CurrentUser() user: AuthUser, @Param('id') targetId: string) {
    return this.auth.deleteAdmin(user.id, targetId);
  }
}
