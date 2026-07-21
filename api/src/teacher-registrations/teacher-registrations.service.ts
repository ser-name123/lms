import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';

import { PrismaService } from '../prisma/prisma.service';
import { EmailsService } from '../emails/emails.service';
import { retryOnUniqueClash } from '../common/retry-unique';
import {
  Role,
  UserStatus,
  TeacherRegistrationStatus,
} from '../generated/prisma/enums';
import {
  CreateTeacherRegistrationDto,
  ListTeacherRegistrationsDto,
  ReviewTeacherRegistrationDto,
  UpdateTeacherRegistrationDto,
} from './dto';

// Human-readable label for each pipeline stage (used in notification emails).
const STAGE_LABEL: Record<string, string> = {
  APPLIED: 'Applied',
  SCREENING: 'Screening',
  INTERVIEW: 'Interview',
  DEMO_CLASS: 'Demo Class',
  APPROVAL: 'Approval',
  TRAINING: 'Training',
  ACTIVATED: 'Activated',
  REJECTED: 'Rejected',
  NEEDS_INFO: 'More Information Needed',
};

@Injectable()
export class TeacherRegistrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emails: EmailsService,
  ) {}

  // Applications awaiting email-OTP verification. The DB record is created only
  // after the code is confirmed, mirroring the student flow + auth OTP.
  private otpPending = new Map<
    string,
    { otp: string; expiresAt: Date; attempts: number; dto: CreateTeacherRegistrationDto }
  >();

  private newOtp() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  // ── Public: step 1 — submit application, receive an email OTP ───────────────
  async requestOtp(dto: CreateTeacherRegistrationDto) {
    const email = dto.email.toLowerCase().trim();

    const existingUser = await this.prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      throw new ConflictException(
        'An account with this email already exists. Please sign in instead.',
      );
    }

    // Block a duplicate application that has not reached a terminal state.
    const inFlight = await this.prisma.teacherRegistration.findFirst({
      where: {
        email,
        status: {
          notIn: [
            TeacherRegistrationStatus.REJECTED,
            TeacherRegistrationStatus.ACTIVATED,
          ],
        },
      },
    });
    if (inFlight) {
      throw new ConflictException(
        'An application with this email is already in progress.',
      );
    }

    const otp = this.newOtp();
    this.otpPending.set(email, {
      otp,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      attempts: 0,
      dto: { ...dto, email },
    });

    this.sendOtpEmail(email, `${dto.firstName} ${dto.lastName}`.trim(), otp).catch(
      () => undefined,
    );

    return {
      otpRequired: true,
      email,
      otp, // shown for now; email is the eventual delivery channel
      message: 'A verification code has been sent to your email. Enter it to finish.',
    };
  }

  // ── Public: step 2 — verify the OTP, then create the application ────────────
  async verifyOtp(rawEmail: string, code: string) {
    const email = (rawEmail || '').toLowerCase().trim();
    const record = this.otpPending.get(email);
    if (!record) {
      throw new BadRequestException(
        'No pending application for this email, or the code expired. Please register again.',
      );
    }
    if (record.expiresAt < new Date()) {
      this.otpPending.delete(email);
      throw new BadRequestException('Verification code has expired. Please register again.');
    }
    if (record.otp !== code) {
      record.attempts += 1;
      if (record.attempts >= 5) {
        this.otpPending.delete(email);
        throw new BadRequestException('Too many incorrect attempts. Please register again.');
      }
      throw new BadRequestException('Invalid verification code.');
    }

    this.otpPending.delete(email);
    return this.persist(record.dto);
  }

  private async sendOtpEmail(to: string, name: string, otp: string) {
    const html = this.emailShell(
      'Verify your email',
      `
      <p>Dear ${name || 'applicant'},</p>
      <p>Use the code below to verify your email and complete your teacher application. It is valid for <b>10 minutes</b>.</p>
      <div style="background:#f0f3ff;border:1px dashed #386FA4;border-radius:12px;padding:16px;text-align:center;margin:16px 0;">
        <span style="font-family:'Courier New',monospace;font-size:32px;font-weight:900;letter-spacing:8px;color:#133C55;">${otp}</span>
      </div>
      <p style="color:#6b7280;">If you did not request this, you can ignore this email.</p>
    `,
    );
    await this.emails.sendMail(
      to,
      'Your application verification code',
      `Your verification code is: ${otp} (valid for 10 minutes)`,
      undefined,
      html,
    );
  }

  // Actual DB creation, run only after the email OTP is confirmed.
  private async persist(dto: CreateTeacherRegistrationDto) {
    const passwordHash = await bcrypt.hash(dto.password, 12);

    const created = await this.prisma.teacherRegistration.create({
      data: {
        firstName: dto.firstName,
        middleName: dto.middleName || null,
        lastName: dto.lastName,
        gender: dto.gender || null,
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null,
        nationality: dto.nationality || null,
        country: dto.country || null,
        state: dto.state || null,
        city: dto.city || null,
        address: dto.address || null,
        email: dto.email,
        mobile: dto.mobile || null,
        whatsappNumber: dto.whatsappNumber || null,
        highestQualification: dto.highestQualification || null,
        university: dto.university || null,
        passingYear: dto.passingYear || null,
        experienceYears: dto.experienceYears || null,
        currentEmployer: dto.currentEmployer || null,
        expectedSalary: dto.expectedSalary || null,
        subjects: dto.subjects || null,
        languages: dto.languages || null,
        teachingMode: dto.teachingMode || null,
        availabilityDays: dto.availabilityDays || [],
        availabilitySlots: dto.availabilitySlots || [],
        technicalSkills: dto.technicalSkills || [],
        accountNumber: dto.accountNumber || null,
        ifsc: dto.ifsc || null,
        bankName: dto.bankName || null,
        upi: dto.upi || null,
        taxNumber: dto.taxNumber || null,
        resumeUrl: dto.resumeUrl || null,
        degreeUrl: dto.degreeUrl || null,
        certificatesUrl: dto.certificatesUrl || null,
        govIdUrl: dto.govIdUrl || null,
        photoUrl: dto.photoUrl || null,
        experienceLetterUrl: dto.experienceLetterUrl || null,
        policeVerificationUrl: dto.policeVerificationUrl || null,
        username: dto.username || null,
        passwordHash,
        status: TeacherRegistrationStatus.APPLIED,
      },
      select: { id: true, status: true, firstName: true, lastName: true },
    });

    return {
      id: created.id,
      status: created.status,
      message:
        'Application submitted successfully. Our team will review it and guide you through the hiring process.',
    };
  }

  // ── Admin: list / detail / stats ───────────────────────────────────────────

  // An ACTIVATED row whose profile link is gone is an archived hire: the person
  // was hired, the account has since been deleted. It must not be counted as a
  // live teacher, or this list disagrees with All Teachers. The link nulls
  // itself via ON DELETE SET NULL, so this stays true without anyone
  // remembering to maintain it.
  private static readonly LIVE_ACTIVATED = {
    status: TeacherRegistrationStatus.ACTIVATED,
    teacherProfileId: { not: null },
  };
  private static readonly ARCHIVED = {
    status: TeacherRegistrationStatus.ACTIVATED,
    teacherProfileId: null,
  };

  // ARCHIVED is a view over ACTIVATED, not a stored status — nothing writes it.
  private statusWhere(status?: string) {
    if (!status) return {};
    if (status === 'ARCHIVED') return TeacherRegistrationsService.ARCHIVED;
    if (status === TeacherRegistrationStatus.ACTIVATED) {
      return TeacherRegistrationsService.LIVE_ACTIVATED;
    }
    return { status };
  }

  private withAccountState<T extends { status: string; teacherProfileId: string | null }>(
    reg: T,
  ) {
    return {
      ...reg,
      accountRemoved:
        reg.status === TeacherRegistrationStatus.ACTIVATED &&
        !reg.teacherProfileId,
    };
  }

  async list(dto: ListTeacherRegistrationsDto) {
    const { page = 1, limit = 20, search, status } = dto;

    const where: any = {
      ...this.statusWhere(status),
      ...(search
        ? {
            OR: [
              { firstName: { contains: search, mode: 'insensitive' } },
              { lastName: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
              { approvedTeacherCode: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.teacherRegistration.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.teacherRegistration.count({ where }),
    ]);

    return {
      items: items.map((r) => this.withAccountState(r)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async getOne(id: string) {
    const reg = await this.prisma.teacherRegistration.findUnique({
      where: { id },
    });
    if (!reg) throw new NotFoundException(`Teacher application ${id} not found`);
    return this.withAccountState(reg);
  }

  // The full application linked to an activated teacher profile (null for
  // teachers an admin created directly).
  async getByTeacher(profileId: string) {
    const profile = await this.prisma.teacherProfile.findUnique({
      where: { id: profileId },
      select: { id: true },
    });
    if (!profile) throw new NotFoundException(`Teacher ${profileId} not found`);

    const reg = await this.prisma.teacherRegistration.findFirst({
      where: { teacherProfileId: profileId },
      orderBy: { createdAt: 'desc' },
    });
    // Always false here (the profile was just found), but the shape has to
    // match everywhere the client reads an application.
    return reg ? this.withAccountState(reg) : null;
  }

  // Admin edits the linked application; overlapping fields sync to the live
  // account (name / country, and specialisation from the first subject).
  async updateByTeacher(profileId: string, dto: UpdateTeacherRegistrationDto) {
    const reg = await this.prisma.teacherRegistration.findFirst({
      where: { teacherProfileId: profileId },
      orderBy: { createdAt: 'desc' },
    });
    if (!reg) {
      throw new NotFoundException(
        'No application on file for this teacher (added directly by an admin).',
      );
    }

    const data: any = { ...dto };
    delete data.password;
    if (dto.dateOfBirth !== undefined) {
      data.dateOfBirth = dto.dateOfBirth ? new Date(dto.dateOfBirth) : null;
    }
    delete data.email; // login identity stays stable

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.teacherRegistration.update({
        where: { id: reg.id },
        data,
      });

      const profile = await tx.teacherProfile.findUnique({
        where: { id: profileId },
        select: { userId: true },
      });
      if (profile) {
        await tx.user.update({
          where: { id: profile.userId },
          data: {
            firstName: dto.firstName ?? undefined,
            lastName: dto.lastName ?? undefined,
            country: dto.country ?? undefined,
          },
        });
        if (dto.subjects !== undefined) {
          const specialisation =
            (dto.subjects && String(dto.subjects).split(',')[0].trim()) || null;
          await tx.teacherProfile.update({
            where: { id: profileId },
            data: { specialisation },
          });
        }
      }

      return this.withAccountState(updated);
    });
  }

  async getStats() {
    const s = TeacherRegistrationStatus;
    const [
      total,
      applied,
      screening,
      interview,
      demo,
      approval,
      training,
      activated,
      archived,
      rejected,
      needsInfo,
    ] = await Promise.all([
      this.prisma.teacherRegistration.count(),
      this.prisma.teacherRegistration.count({ where: { status: s.APPLIED } }),
      this.prisma.teacherRegistration.count({ where: { status: s.SCREENING } }),
      this.prisma.teacherRegistration.count({ where: { status: s.INTERVIEW } }),
      this.prisma.teacherRegistration.count({ where: { status: s.DEMO_CLASS } }),
      this.prisma.teacherRegistration.count({ where: { status: s.APPROVAL } }),
      this.prisma.teacherRegistration.count({ where: { status: s.TRAINING } }),
      this.prisma.teacherRegistration.count({
        where: TeacherRegistrationsService.LIVE_ACTIVATED,
      }),
      this.prisma.teacherRegistration.count({
        where: TeacherRegistrationsService.ARCHIVED,
      }),
      this.prisma.teacherRegistration.count({ where: { status: s.REJECTED } }),
      this.prisma.teacherRegistration.count({ where: { status: s.NEEDS_INFO } }),
    ]);

    // "inPipeline" = everything actively moving through the hiring stages.
    const inPipeline =
      applied + screening + interview + demo + approval + training;

    return {
      total,
      applied,
      screening,
      interview,
      demoClass: demo,
      approval,
      training,
      activated,
      archived,
      rejected,
      needsInfo,
      inPipeline,
    };
  }

  // ── Admin: advance / reject / request-info ─────────────────────────────────
  async review(
    id: string,
    dto: ReviewTeacherRegistrationDto,
    reviewerId?: string,
  ) {
    const reg = await this.getOne(id);
    // Blocked only while the account is live. An archived hire (activated, then
    // the account deleted) can be re-activated — that is a re-hire, and it
    // mints a fresh account rather than resurrecting the old one.
    if (
      reg.status === TeacherRegistrationStatus.ACTIVATED &&
      !reg.accountRemoved
    ) {
      throw new BadRequestException(
        'This teacher has already been activated.',
      );
    }

    if (dto.status === 'ACTIVATED') {
      return this.activate(reg, dto.notes, reviewerId);
    }

    const updated = await this.prisma.teacherRegistration.update({
      where: { id },
      data: {
        status: dto.status as TeacherRegistrationStatus,
        reviewNotes: dto.notes ?? reg.reviewNotes,
        interviewDate: dto.interviewDate
          ? new Date(dto.interviewDate)
          : reg.interviewDate,
        demoDate: dto.demoDate ? new Date(dto.demoDate) : reg.demoDate,
        reviewedAt: new Date(),
        reviewedById: reviewerId || null,
      },
    });

    const notification = await this.notify(updated).catch(() => null);
    return { ...this.withAccountState(updated), notification };
  }

  // nextTeacherCode() reads the highest code and adds one, so two activations
  // firing together compute the same code and one dies on the unique index.
  private async activate(reg: any, notes?: string, reviewerId?: string) {
    return retryOnUniqueClash('teacherCode', () =>
      this.activateOnce(reg, notes, reviewerId),
    );
  }

  private async activateOnce(reg: any, notes?: string, reviewerId?: string) {
    const now = new Date();
    const teacherCode = await this.nextTeacherCode();

    const updated = await this.prisma.$transaction(async (tx) => {
      // Guard against a race where the email got taken between apply + activate.
      const clash = await tx.user.findUnique({ where: { email: reg.email } });
      if (clash) {
        throw new ConflictException(
          'A user with this email already exists; cannot activate.',
        );
      }

      const specialisation =
        (reg.subjects && String(reg.subjects).split(',')[0].trim()) || null;

      const user = await tx.user.create({
        data: {
          email: reg.email,
          passwordHash: reg.passwordHash,
          firstName: reg.firstName,
          lastName: reg.lastName,
          country: reg.country,
          role: Role.TEACHER,
          status: UserStatus.ACTIVE,
        },
      });

      const profile = await tx.teacherProfile.create({
        data: {
          teacherCode,
          specialisation,
          bio: reg.highestQualification
            ? `${reg.highestQualification}${reg.university ? ` — ${reg.university}` : ''}`
            : null,
          userId: user.id,
        },
        select: { id: true },
      });

      return tx.teacherRegistration.update({
        where: { id: reg.id },
        data: {
          status: TeacherRegistrationStatus.ACTIVATED,
          reviewNotes: notes ?? reg.reviewNotes,
          reviewedAt: now,
          reviewedById: reviewerId || null,
          teacherProfileId: profile.id,
          approvedTeacherCode: teacherCode,
        },
      });
    });

    const notification = await this.notify(updated).catch(() => null);
    return { ...this.withAccountState(updated), notification };
  }

  private async nextTeacherCode(): Promise<string> {
    const last = await this.prisma.teacherProfile.findFirst({
      orderBy: { teacherCode: 'desc' },
      select: { teacherCode: true },
    });
    if (!last || !last.teacherCode) return 'TR-00001';
    const num = parseInt(last.teacherCode.replace('TR-', ''), 10) || 0;
    return `TR-${String(num + 1).padStart(5, '0')}`;
  }

  // ── Email notifications (SMS/WhatsApp intentionally deferred) ───────────────
  // Returns the dispatched notification so the admin action can echo it back.
  private async notify(reg: any): Promise<{ to: string; subject: string; message: string }> {
    const name = `${reg.firstName} ${reg.lastName}`;
    const stage = STAGE_LABEL[reg.status] || reg.status;
    let subject = '';
    let message = '';
    let html = '';

    if (reg.status === TeacherRegistrationStatus.ACTIVATED) {
      subject = 'Welcome aboard — your teacher account is active 🎉';
      message = `Activated. Teacher ID ${reg.approvedTeacherCode}. You can now sign in with your email and password.`;
      html = this.emailShell(
        'You Are Now a Teacher',
        `
        <p>Dear ${name},</p>
        <p>Congratulations! You have completed the hiring process and your teacher account is now <b>active</b>.</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;">
          <tr><td style="padding:6px 0;color:#6b7280;">Teacher ID</td><td style="padding:6px 0;font-weight:700;">${reg.approvedTeacherCode}</td></tr>
        </table>
        <p>You can now sign in with the email and password you provided during registration.</p>
        ${reg.reviewNotes ? `<p style="color:#6b7280;">Note from the academy: ${reg.reviewNotes}</p>` : ''}
      `,
      );
    } else if (reg.status === TeacherRegistrationStatus.REJECTED) {
      subject = 'Update on your teaching application';
      message = `Your application was not approved.${reg.reviewNotes ? ` Reason: ${reg.reviewNotes}` : ''}`;
      html = this.emailShell(
        'Application Not Approved',
        `
        <p>Dear ${name},</p>
        <p>Thank you for your interest in teaching with us. Unfortunately we are unable to move forward with your application at this time.</p>
        ${reg.reviewNotes ? `<p><b>Reason:</b> ${reg.reviewNotes}</p>` : ''}
      `,
      );
    } else if (reg.status === TeacherRegistrationStatus.NEEDS_INFO) {
      subject = 'We need a little more information';
      message = `We need more information to proceed.${reg.reviewNotes ? ` ${reg.reviewNotes}` : ''}`;
      html = this.emailShell(
        'More Information Needed',
        `
        <p>Dear ${name},</p>
        <p>Your application is progressing — we just need some more details before we continue.</p>
        ${reg.reviewNotes ? `<p><b>What we need:</b> ${reg.reviewNotes}</p>` : ''}
      `,
      );
    } else {
      // A pipeline advance (Screening / Interview / Demo / Approval / Training).
      subject = `Your application has moved to: ${stage}`;
      const when =
        reg.status === TeacherRegistrationStatus.INTERVIEW && reg.interviewDate
          ? ` Interview: ${new Date(reg.interviewDate).toLocaleString()}.`
          : reg.status === TeacherRegistrationStatus.DEMO_CLASS && reg.demoDate
            ? ` Demo class: ${new Date(reg.demoDate).toLocaleString()}.`
            : '';
      message = `Your application advanced to ${stage}.${when}${reg.reviewNotes ? ` ${reg.reviewNotes}` : ''}`;
      const schedule =
        reg.status === TeacherRegistrationStatus.INTERVIEW && reg.interviewDate
          ? `<p><b>Interview scheduled for:</b> ${new Date(reg.interviewDate).toLocaleString()}</p>`
          : reg.status === TeacherRegistrationStatus.DEMO_CLASS && reg.demoDate
            ? `<p><b>Demo class scheduled for:</b> ${new Date(reg.demoDate).toLocaleString()}</p>`
            : '';
      html = this.emailShell(
        `Stage: ${stage}`,
        `
        <p>Dear ${name},</p>
        <p>Good news — your teaching application has advanced to the <b>${stage}</b> stage.</p>
        ${schedule}
        ${reg.reviewNotes ? `<p style="color:#6b7280;">Note: ${reg.reviewNotes}</p>` : ''}
        <p>We will be in touch with the next steps.</p>
      `,
      );
    }

    this.emails
      .sendMail(reg.email, subject, message, undefined, html)
      .catch(() => undefined);

    return { to: reg.email, subject, message };
  }

  private emailShell(title: string, body: string) {
    return `
    <div style="font-family:'Segoe UI',Tahoma,sans-serif;background:#f4f6f8;padding:40px 20px;">
      <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e1e4e8;">
        <div style="background:#133C55;padding:26px;text-align:center;">
          <h1 style="color:#fff;margin:0;font-size:20px;font-weight:800;">${title}</h1>
        </div>
        <div style="padding:28px;color:#1f2937;font-size:14px;line-height:1.7;">${body}</div>
      </div>
    </div>`;
  }

  // ── Public: document upload reference ──────────────────────────────────────
  storeDocumentFile(file?: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file was uploaded');
    }
    return {
      // Served (inline) via GET /teacher-registrations/document/:filename.
      url: `teacher-registrations/document/${file.filename}`,
      fileName: file.originalname,
    };
  }
}
