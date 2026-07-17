import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard, RolesGuard } from './auth/guards';
import { HealthController } from './health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { StudentsModule } from './students/students.module';
import { TeachersModule } from './teachers/teachers.module';
import { EmailsModule } from './emails/emails.module';
import { SettingsModule } from './settings/settings.module';
import { EmployeesModule } from './employees/employees.module';
import { CandidatesModule } from './candidates/candidates.module';
import { LeavesModule } from './leaves/leaves.module';
import { InvoicesModule } from './invoices/invoices.module';
import { TrialsModule } from './trials/trials.module';
import { CategoriesModule } from './categories/categories.module';
import { LmsDataModule } from './lms-data/lms-data.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { PayoutsModule } from './payouts/payouts.module';
import { ExpensesModule } from './expenses/expenses.module';
import { StudentPortalModule } from './student-portal/student-portal.module';
import { ChatModule } from './chat/chat.module';
import { TeacherPortalModule } from './teacher-portal/teacher-portal.module';
import { RegistrationsModule } from './registrations/registrations.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Baseline rate limit for every route (100 req/min per IP); auth routes
    // tighten this further with @Throttle. Blocks brute-force / abuse.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    PrismaModule,
    AuthModule,
    StudentsModule,
    TeachersModule,
    EmailsModule,
    SettingsModule,
    EmployeesModule,
    CandidatesModule,
    LeavesModule,
    InvoicesModule,
    TrialsModule,
    CategoriesModule,
    LmsDataModule,
    DashboardModule,
    PayoutsModule,
    ExpensesModule,
    StudentPortalModule,
    ChatModule,
    TeacherPortalModule,
    RegistrationsModule,
  ],
  controllers: [HealthController],
  providers: [
    // Rate limiting runs first, before auth, so floods are shed cheaply.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Auth is deny-by-default: every route is guarded unless it opts out with
    // @Public(), so a new controller cannot be left unprotected by omission.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
