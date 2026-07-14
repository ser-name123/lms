import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomUUID } from 'node:crypto';

import { PrismaService } from '../prisma/prisma.service';
import { UserStatus } from '../generated/prisma/enums';
import type { TokensDto } from './dto';

/* Refresh tokens are high-entropy already, so a fast SHA-256 digest is the
   right store — bcrypt here would only add latency. Passwords still use
   bcrypt, where slowness is the whole point. */
const digest = (token: string) => createHash('sha256').update(token).digest('hex');

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async login(email: string, password: string): Promise<TokensDto> {
    const user = await this.prisma.user.findUnique({ where: { email } });

    /* One message for "no such user" and "wrong password" alike, so the
       endpoint cannot be used to enumerate registered emails. */
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Account is not active');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return this.issueTokens(user.id);
  }

  async refresh(refreshToken: string): Promise<TokensDto> {
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

    return this.issueTokens(userId);
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

  private async issueTokens(userId: string): Promise<TokensDto> {
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
      },
    });

    return { accessToken, refreshToken };
  }
}
