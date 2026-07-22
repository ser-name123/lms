import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';

import { PrismaService } from '../prisma/prisma.service';
import { courseForCode } from '../common/catalogue-course';
import { EmailsService } from '../emails/emails.service';
import {
  Role,
  UserStatus,
  CourseStatus,
  EnrollmentStatus,
  RegistrationStatus,
} from '../generated/prisma/enums';
import {
  CreateRegistrationDto,
  ListRegistrationsDto,
  ReviewRegistrationDto,
  UpdateStudentRegistrationDto,
} from './dto';

@Injectable()
export class RegistrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emails: EmailsService,
  ) {}

  // Pending applications awaiting email-OTP verification. The DB record is only
  // created once the applicant confirms the code, so unverified emails never
  // leave junk rows. In-memory + short TTL, mirroring the auth OTP flow.
  private otpPending = new Map<
    string,
    { otp: string; expiresAt: Date; attempts: number; dto: CreateRegistrationDto }
  >();

  private newOtp() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  // ── Public: step 1 — submit application, receive an email OTP ───────────────
  async requestOtp(dto: CreateRegistrationDto) {
    const email = dto.studentEmail.toLowerCase().trim();

    // An email that already owns an account cannot register again.
    const existingUser = await this.prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      throw new ConflictException(
        'An account with this email already exists. Please sign in instead.',
      );
    }

    // Block a duplicate application that is still awaiting review.
    const pending = await this.prisma.studentRegistration.findFirst({
      where: {
        studentEmail: email,
        status: { in: [RegistrationStatus.PENDING, RegistrationStatus.NEEDS_INFO] },
      },
    });
    if (pending) {
      throw new ConflictException(
        'An application with this email is already under review.',
      );
    }

    const otp = this.newOtp();
    this.otpPending.set(email, {
      otp,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 min TTL
      attempts: 0,
      dto: { ...dto, studentEmail: email },
    });

    // Fire the OTP email in the background (SMTP delay must not block the client).
    // The code is also returned in the response for now; email delivery is the
    // eventual channel.
    this.sendOtpEmail(email, `${dto.firstName} ${dto.lastName}`.trim(), otp).catch(
      () => undefined,
    );

    return {
      otpRequired: true,
      email,
      otp, // shown to the client for now; will move to email-only later
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

  // Actual DB creation, run only after the email OTP is confirmed.
  private async persist(dto: CreateRegistrationDto) {
    const email = dto.studentEmail.toLowerCase().trim();
    const passwordHash = await bcrypt.hash(dto.password, 12);

    const created = await this.prisma.studentRegistration.create({
      data: {
        registrantType: dto.registrantType || 'STUDENT',
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
        studentEmail: email,
        studentMobile: dto.studentMobile || null,
        parentEmail: dto.parentEmail || null,
        parentMobile: dto.parentMobile || null,
        emergencyContact: dto.emergencyContact || null,
        whatsappNumber: dto.whatsappNumber || null,
        currentSchool: dto.currentSchool || null,
        board: dto.board || null,
        className: dto.className || null,
        grade: dto.grade || null,
        subjects: dto.subjects || null,
        language: dto.language || null,
        courseCode: dto.courseCode || null,
        courseTitle: dto.courseTitle || null,
        batch: dto.batch || null,
        preferredTiming: dto.preferredTiming || null,
        learningMode: dto.learningMode || null,
        fatherName: dto.fatherName || null,
        motherName: dto.motherName || null,
        occupation: dto.occupation || null,
        guardianRelation: dto.guardianRelation || null,
        guardianAddress: dto.guardianAddress || null,
        guardianEmail: dto.guardianEmail || null,
        guardianPhone: dto.guardianPhone || null,
        username: dto.username || null,
        passwordHash,
        status: RegistrationStatus.PENDING,
      },
      select: { id: true, status: true, firstName: true, lastName: true },
    });

    return {
      id: created.id,
      status: created.status,
      message:
        'Application submitted successfully. It is now pending admin approval.',
    };
  }

  private async sendOtpEmail(to: string, name: string, otp: string) {
    const html = this.emailShell(
      'Verify your email',
      `
      <p>Dear ${name || 'applicant'},</p>
      <p>Use the code below to verify your email and complete your registration. It is valid for <b>10 minutes</b>.</p>
      <div style="background:#f0f3ff;border:1px dashed #386FA4;border-radius:12px;padding:16px;text-align:center;margin:16px 0;">
        <span style="font-family:'Courier New',monospace;font-size:32px;font-weight:900;letter-spacing:8px;color:#133C55;">${otp}</span>
      </div>
      <p style="color:#6b7280;">If you did not request this, you can ignore this email.</p>
    `,
    );
    await this.emails.sendMail(
      to,
      'Your registration verification code',
      `Your verification code is: ${otp} (valid for 10 minutes)`,
      undefined,
      html,
    );
  }

  // ── Admin: list / detail / stats ───────────────────────────────────────────
  async list(dto: ListRegistrationsDto) {
    const { page = 1, limit = 20, search, status } = dto;

    const where: any = {
      ...(status ? { status } : {}),
      ...(search
        ? {
            OR: [
              { firstName: { contains: search, mode: 'insensitive' } },
              { lastName: { contains: search, mode: 'insensitive' } },
              { studentEmail: { contains: search, mode: 'insensitive' } },
              { admissionNumber: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.studentRegistration.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.studentRegistration.count({ where }),
    ]);

    return {
      items,
      meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  }

  async getOne(id: string) {
    const reg = await this.prisma.studentRegistration.findUnique({
      where: { id },
    });
    if (!reg) throw new NotFoundException(`Registration ${id} not found`);
    return reg;
  }

  // The full application linked to an approved student profile (may be null for
  // students an admin created directly, who never went through registration).
  async getByStudent(profileId: string) {
    const profile = await this.prisma.studentProfile.findUnique({
      where: { id: profileId },
      select: { id: true },
    });
    if (!profile) throw new NotFoundException(`Student ${profileId} not found`);

    return this.prisma.studentRegistration.findFirst({
      where: { studentProfileId: profileId },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Admin edits the linked application AND the change syncs to the live account
  // for the overlapping fields (name / country / phone / gender / guardian).
  async updateByStudent(profileId: string, dto: UpdateStudentRegistrationDto) {
    const reg = await this.prisma.studentRegistration.findFirst({
      where: { studentProfileId: profileId },
      orderBy: { createdAt: 'desc' },
    });
    if (!reg) {
      throw new NotFoundException(
        'No registration on file for this student (added directly by an admin).',
      );
    }

    const data: any = { ...dto };
    delete data.password; // never editable here
    if (dto.dateOfBirth !== undefined) {
      data.dateOfBirth = dto.dateOfBirth ? new Date(dto.dateOfBirth) : null;
    }
    // studentEmail is the stored application email; the login email is not
    // touched from here to keep the account's identity stable.
    delete data.studentEmail;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.studentRegistration.update({
        where: { id: reg.id },
        data,
      });

      const profile = await tx.studentProfile.findUnique({
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
        await tx.studentProfile.update({
          where: { id: profileId },
          data: {
            phone: dto.studentMobile ?? undefined,
            gender: dto.gender ?? undefined,
            guardianName:
              dto.fatherName || dto.motherName || dto.guardianRelation
                ? dto.fatherName || dto.motherName || dto.guardianRelation
                : undefined,
          },
        });
      }

      return updated;
    });
  }

  async getStats() {
    const [total, pending, approved, rejected, needsInfo] = await Promise.all([
      this.prisma.studentRegistration.count(),
      this.prisma.studentRegistration.count({ where: { status: RegistrationStatus.PENDING } }),
      this.prisma.studentRegistration.count({ where: { status: RegistrationStatus.APPROVED } }),
      this.prisma.studentRegistration.count({ where: { status: RegistrationStatus.REJECTED } }),
      this.prisma.studentRegistration.count({ where: { status: RegistrationStatus.NEEDS_INFO } }),
    ]);
    return { total, pending, approved, rejected, needsInfo };
  }

  // ── Admin: review (approve / reject / needs-info) ───────────────────────────
  async review(id: string, dto: ReviewRegistrationDto, reviewerId?: string) {
    const reg = await this.getOne(id);
    if (reg.status === RegistrationStatus.APPROVED) {
      throw new BadRequestException(
        'This application has already been approved.',
      );
    }

    if (dto.status === 'APPROVED') {
      return this.approve(reg, dto.notes, reviewerId);
    }

    // Reject / Needs-info: just record the decision + notes.
    const updated = await this.prisma.studentRegistration.update({
      where: { id },
      data: {
        status:
          dto.status === 'REJECTED'
            ? RegistrationStatus.REJECTED
            : RegistrationStatus.NEEDS_INFO,
        reviewNotes: dto.notes || null,
        reviewedAt: new Date(),
        reviewedById: reviewerId || null,
      },
    });

    const notification = await this.notify(updated).catch(() => null);
    return { ...updated, notification };
  }

  private async approve(reg: any, notes?: string, reviewerId?: string) {
    const now = new Date();
    const year = now.getFullYear();

    // Sequences: student code follows the students module; admission/roll are
    // derived from how many applications have been approved so far.
    const [studentCount, approvedCount] = await Promise.all([
      this.prisma.studentProfile.count(),
      this.prisma.studentRegistration.count({
        where: { status: RegistrationStatus.APPROVED },
      }),
    ]);
    const studentCode = `ST-${String(studentCount + 1).padStart(5, '0')}`;
    const seq = approvedCount + 1;
    const admissionNumber = `ADM-${year}-${String(seq).padStart(4, '0')}`;
    const rollNumber = `${year}${String(seq).padStart(4, '0')}`;

    const updated = await this.prisma.$transaction(async (tx) => {
      // Create the real student account using the already-hashed password the
      // applicant chose during registration.
      const profile = await tx.studentProfile.create({
        data: {
          studentCode,
          phone: reg.studentMobile,
          gender: reg.gender,
          guardianName:
            reg.fatherName || reg.motherName || reg.guardianRelation || null,
          joiningDate: now,
          user: {
            create: {
              email: reg.studentEmail,
              passwordHash: reg.passwordHash,
              firstName: reg.firstName,
              lastName: reg.lastName,
              country: reg.country,
              role: Role.STUDENT,
              status: UserStatus.ACTIVE,
            },
          },
        },
        select: { id: true },
      });

      // Enrol into the selected course (mirroring LmsCourse -> Course) if any.
      if (reg.courseCode) {
        // A code nobody catalogued is a shrug here, not an error: the account
        // is what matters and a coach can enrol them by hand.
        const course = await courseForCode(tx, reg.courseCode);
        if (course) {
          await tx.enrollment.create({
            data: {
              studentId: profile.id,
              courseId: course.id,
              status: EnrollmentStatus.ACTIVE,
              startedAt: now,
            },
          });
        }
      }

      return tx.studentRegistration.update({
        where: { id: reg.id },
        data: {
          status: RegistrationStatus.APPROVED,
          reviewNotes: notes || null,
          reviewedAt: now,
          reviewedById: reviewerId || null,
          studentProfileId: profile.id,
          admissionNumber,
          rollNumber,
          approvedStudentCode: studentCode,
        },
      });
    });

    const notification = await this.notify(updated).catch(() => null);
    return { ...updated, notification };
  }

  // ── Email notifications (SMS/WhatsApp intentionally deferred) ───────────────
  // Returns the notification it dispatched so the admin action can echo it back
  // in its response (visible now; email is the eventual delivery channel).
  private async notify(reg: any): Promise<{ to: string; subject: string; message: string }> {
    const name = `${reg.firstName} ${reg.lastName}`;
    let subject = '';
    let message = '';
    let html = '';

    if (reg.status === RegistrationStatus.APPROVED) {
      subject = 'Your admission is approved 🎉';
      message = `Approved. Student ID ${reg.approvedStudentCode}, Admission ${reg.admissionNumber}, Roll ${reg.rollNumber}. You can now sign in.`;
      html = this.emailShell(
        'Admission Approved',
        `
        <p>Dear ${name},</p>
        <p>Congratulations! Your registration has been <b>approved</b>. Your student account is now active.</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;">
          <tr><td style="padding:6px 0;color:#6b7280;">Student ID</td><td style="padding:6px 0;font-weight:700;">${reg.approvedStudentCode}</td></tr>
          <tr><td style="padding:6px 0;color:#6b7280;">Admission No.</td><td style="padding:6px 0;font-weight:700;">${reg.admissionNumber}</td></tr>
          <tr><td style="padding:6px 0;color:#6b7280;">Roll No.</td><td style="padding:6px 0;font-weight:700;">${reg.rollNumber}</td></tr>
        </table>
        <p>You can now sign in with the email and password you provided during registration.</p>
        ${reg.reviewNotes ? `<p style="color:#6b7280;">Note from the academy: ${reg.reviewNotes}</p>` : ''}
      `,
      );
    } else if (reg.status === RegistrationStatus.REJECTED) {
      subject = 'Update on your admission application';
      message = `Your application was not approved.${reg.reviewNotes ? ` Reason: ${reg.reviewNotes}` : ''}`;
      html = this.emailShell(
        'Application Not Approved',
        `
        <p>Dear ${name},</p>
        <p>Thank you for your interest. Unfortunately your application could not be approved at this time.</p>
        ${reg.reviewNotes ? `<p><b>Reason:</b> ${reg.reviewNotes}</p>` : ''}
      `,
      );
    } else {
      subject = 'We need a little more information';
      message = `We need more information to proceed.${reg.reviewNotes ? ` ${reg.reviewNotes}` : ''}`;
      html = this.emailShell(
        'More Information Needed',
        `
        <p>Dear ${name},</p>
        <p>Your application is almost there — we need some more details before we can proceed.</p>
        ${reg.reviewNotes ? `<p><b>What we need:</b> ${reg.reviewNotes}</p>` : ''}
      `,
      );
    }

    this.emails
      .sendMail(reg.studentEmail, subject, message, undefined, html)
      .catch(() => undefined);

    return { to: reg.studentEmail, subject, message };
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
}
