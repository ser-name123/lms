import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';

import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard, RolesGuard } from './auth/guards';
import { HealthController } from './health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { StudentsModule } from './students/students.module';
import { EmailsModule } from './emails/emails.module';
import { SettingsModule } from './settings/settings.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    StudentsModule,
    EmailsModule,
    SettingsModule,
  ],
  controllers: [HealthController],
  providers: [
    // Auth is deny-by-default: every route is guarded unless it opts out with
    // @Public(), so a new controller cannot be left unprotected by omission.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
