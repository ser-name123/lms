import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomUUID } from 'node:crypto';

import { PrismaService } from '../prisma/prisma.service';
import { UserStatus } from '../generated/prisma/enums';
import type { TokensDto, UpdateProfileDto } from './dto';
import { EmailsService } from '../emails/emails.service';

/* Refresh tokens are high-entropy already, so a fast SHA-256 digest is the
   right store — bcrypt here would only add latency. Passwords still use
   bcrypt, where slowness is the whole point. */
const digest = (token: string) => createHash('sha256').update(token).digest('hex');

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private otpStore = new Map<string, { otp: string; expiresAt: Date }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly emails: EmailsService,
  ) {}

  async login(email: string, password: string): Promise<TokensDto | { otpRequired: boolean; email: string }> {
    const user = await this.prisma.user.findUnique({ where: { email } });

    /* One message for "no such user" and "wrong password" alike, so the
       endpoint cannot be used to enumerate registered emails. */
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Account is not active');
    }

    // Generate 6-digit OTP code
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    this.otpStore.set(user.email, {
      otp,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minute TTL
    });

    // Send email with verification code
    const htmlTemplate = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f6f8; padding: 40px 20px; text-align: center;">
        <div style="max-width: 500px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05); border: 1px solid #e1e4e8;">
          
          <!-- Header Banner -->
          <div style="background-color: #5b73e8; padding: 30px; text-align: center;">
            <h1 style="color: #ffffff; margin: 0; font-size: 26px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase;">
              Edumin
            </h1>
            <p style="color: #e0e5ff; margin: 5px 0 0 0; font-size: 14px; font-weight: 600;">
              LMS Admin Console
            </p>
          </div>

          <!-- Body Content -->
          <div style="padding: 40px 30px; text-align: left;">
            <h2 style="color: #1f2937; margin: 0 0 16px 0; font-size: 20px; font-weight: 700; text-align: center;">
              Verification Code
            </h2>
            <p style="color: #4b5563; font-size: 15px; line-height: 1.6; margin: 0 0 30px 0; text-align: center;">
              Please use the verification code below to log in to your Edumin account. This code is valid for <b>5 minutes</b>.
            </p>

            <!-- OTP Box -->
            <div style="background-color: #f0f3ff; border: 1px dashed #5b73e8; border-radius: 12px; padding: 18px; text-align: center; margin-bottom: 30px;">
              <span style="font-family: 'Courier New', Courier, monospace; font-size: 36px; font-weight: 900; letter-spacing: 8px; color: #5b73e8; display: inline-block; margin-left: 8px;">
                ${otp}
              </span>
            </div>

            <p style="color: #9ca3af; font-size: 12px; line-height: 1.5; margin: 0; text-align: center;">
              If you did not request this login verification code, please ignore this email or contact support if you suspect unauthorized access.
            </p>
          </div>

          <!-- Footer -->
          <div style="background-color: #fafbfc; border-top: 1px solid #f0f3f6; padding: 20px 30px; text-align: center;">
            <p style="color: #9ca3af; margin: 0; font-size: 12px; font-weight: 600;">
              © ${new Date().getFullYear()} Edumin LMS. All rights reserved.
            </p>
          </div>

        </div>
      </div>
    `;

    // Log generated verification code to console (retrievable in server/Render logs)
    this.logger.log(`[OTP] Generated verification code for ${user.email} is: ${otp}`);

    // Dispatch verification mail asynchronously in the background so SMTP delay doesn't block client response
    this.emails.sendMail(
      user.email,
      'Edumin Login Verification Code',
      `Your verification code is: ${otp}\nThis code is valid for 5 minutes.`,
      undefined,
      htmlTemplate,
    ).catch(err => {
      this.logger.error(`Failed to send verification email to ${user.email}: ${err.message}`, err.stack);
    });

    return { otpRequired: true, email: user.email };
  }

  async verifyOtp(email: string, otpCode: string, userAgent?: string, ipAddress?: string): Promise<TokensDto> {
    const record = this.otpStore.get(email);
    if (!record) {
      throw new UnauthorizedException('No verification code requested or session expired');
    }

    if (record.expiresAt < new Date()) {
      this.otpStore.delete(email);
      throw new UnauthorizedException('Verification code has expired');
    }

    if (record.otp !== otpCode) {
      throw new UnauthorizedException('Invalid verification code');
    }

    this.otpStore.delete(email);

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return this.issueTokens(user.id, userAgent, ipAddress);
  }

  async refresh(refreshToken: string, userAgent?: string, ipAddress?: string): Promise<TokensDto> {
    let userId: string;
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string }>(refreshToken, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
      userId = payload.sub;
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: digest(refreshToken) },
    });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token is no longer valid');
    }

    // Rotate: a refresh token is single-use, so a stolen one dies on first reuse.
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    return this.issueTokens(userId, userAgent, ipAddress);
  }

  async logout(refreshToken: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: digest(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async me(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        status: true,
        avatarUrl: true,
        lastLoginAt: true,
      },
    });
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const data: any = {};
    if (dto.firstName !== undefined) data.firstName = dto.firstName;
    if (dto.lastName !== undefined) data.lastName = dto.lastName;
    if (dto.email !== undefined) data.email = dto.email;
    if (dto.avatarUrl !== undefined) data.avatarUrl = dto.avatarUrl;
    if (dto.password !== undefined) {
      data.passwordHash = await bcrypt.hash(dto.password, 12);
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data,
    });

    return {
      id: updated.id,
      email: updated.email,
      firstName: updated.firstName,
      lastName: updated.lastName,
      role: updated.role,
      status: updated.status,
      avatarUrl: updated.avatarUrl,
      lastLoginAt: updated.lastLoginAt,
    };
  }

  private async issueTokens(userId: string, userAgent?: string, ipAddress?: string): Promise<TokensDto> {
    /* TTLs arrive from config as plain strings; jsonwebtoken types expect its
       own `StringValue` template literal, so the options are asserted once. */
    const accessOptions = {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.config.get<string>('JWT_ACCESS_TTL', '15m'),
    } as JwtSignOptions;

    const refreshOptions = {
      secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      expiresIn: this.config.get<string>('JWT_REFRESH_TTL', '7d'),
    } as JwtSignOptions;

    const accessToken = await this.jwt.signAsync({ sub: userId }, accessOptions);
    const refreshToken = await this.jwt.signAsync(
      { sub: userId, jti: randomUUID() },
      refreshOptions,
    );

    const { exp } = this.jwt.decode<{ exp: number }>(refreshToken);

    await this.prisma.refreshToken.create({
      data: {
        tokenHash: digest(refreshToken),
        userId,
        expiresAt: new Date(exp * 1000),
        userAgent,
        ipAddress,
      },
    });

    return { accessToken, refreshToken };
  }

  async getSessions(userId: string, currentUserAgent?: string, currentIpAddress?: string) {
    const sessions = await this.prisma.refreshToken.findMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        userAgent: true,
        ipAddress: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return sessions.map((s) => ({
      ...s,
      isCurrent: s.userAgent === currentUserAgent && s.ipAddress === currentIpAddress,
    }));
  }

  async revokeSession(userId: string, sessionId: string) {
    await this.prisma.refreshToken.updateMany({
      where: {
        id: sessionId,
        userId,
      },
      data: {
        revokedAt: new Date(),
      },
    });
    return { success: true };
  }
}
