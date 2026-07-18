import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';

import { PrismaService } from '../prisma/prisma.service';
import { EmailsService } from '../emails/emails.service';
import { NotificationsService } from '../notifications/notifications.service';
import { Role, UserStatus } from '../generated/prisma/enums';
import { AuthUser } from '../auth/decorators';
import { CreateParentAccountDto, LinkParentDto } from './dto';

/*
 * Parent account provisioning (admin-driven).
 *
 * Parents previously had no login at all — their details lived only as fields
 * on StudentProfile. This creates a real PARENT User from those fields and
 * links it to the child, so the parent dashboard has an identity to hang off.
 *
 * An existing parent User is reused rather than duplicated, which is what makes
 * one login covering several siblings work.
 */

@Injectable()
export class ParentLinksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emails: EmailsService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Every parent account linked to a given student. */
  async forStudent(studentId: string) {
    const links = await this.prisma.parentLink.findMany({
      where: { studentId },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        relationship: true,
        isPrimary: true,
        createdAt: true,
        parentUser: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            status: true,
            lastLoginAt: true,
          },
        },
      },
    });

    return links.map((l) => ({
      linkId: l.id,
      parentUserId: l.parentUser.id,
      name: `${l.parentUser.firstName} ${l.parentUser.lastName}`.trim(),
      email: l.parentUser.email,
      status: l.parentUser.status,
      lastLoginAt: l.parentUser.lastLoginAt?.toISOString() ?? null,
      relationship: l.relationship,
      isPrimary: l.isPrimary,
      linkedAt: l.createdAt.toISOString(),
    }));
  }

  /**
   * Create (or reuse) a parent login for a student, defaulting every field to
   * the guardian details already captured on the student profile.
   */
  async createAccount(actor: AuthUser, dto: CreateParentAccountDto) {
    const student = await this.prisma.studentProfile.findUnique({
      where: { id: dto.studentId },
      select: {
        id: true,
        parentName: true,
        parentEmail: true,
        parentRelationship: true,
        parentMobile: true,
        user: { select: { firstName: true, lastName: true } },
      },
    });
    if (!student) throw new NotFoundException('Student not found');

    const email = (dto.email ?? student.parentEmail ?? '').trim().toLowerCase();
    if (!email) {
      throw new BadRequestException(
        'No parent email on file — provide one, or set it on the student profile first',
      );
    }

    // Split the stored "parentName" when explicit names were not supplied.
    const [fallbackFirst, ...fallbackRest] = (student.parentName ?? '').trim().split(/\s+/);
    const firstName = dto.firstName ?? (fallbackFirst || 'Parent');
    const lastName = dto.lastName ?? (fallbackRest.join(' ') || student.user.lastName);

    const existing = await this.prisma.user.findUnique({ where: { email } });

    if (existing && existing.role !== Role.PARENT) {
      throw new BadRequestException(
        `${email} already belongs to a ${existing.role} account and cannot be reused as a parent login`,
      );
    }

    let parentUser = existing;
    let tempPassword: string | null = null;

    if (!parentUser) {
      // A random password is issued and emailed; nothing is ever logged.
      tempPassword = randomBytes(9).toString('base64url');
      parentUser = await this.prisma.user.create({
        data: {
          email,
          passwordHash: await bcrypt.hash(tempPassword, 10),
          firstName,
          lastName,
          role: Role.PARENT,
          status: UserStatus.ACTIVE,
          phone: student.parentMobile ?? null,
        },
      });
    }

    const link = await this.prisma.parentLink.upsert({
      where: {
        parentUserId_studentId: { parentUserId: parentUser.id, studentId: student.id },
      },
      create: {
        parentUserId: parentUser.id,
        studentId: student.id,
        relationship: dto.relationship ?? student.parentRelationship ?? null,
        // First link for this parent becomes their primary child.
        isPrimary: !(await this.prisma.parentLink.count({
          where: { parentUserId: parentUser.id },
        })),
      },
      update: {
        ...(dto.relationship === undefined ? {} : { relationship: dto.relationship }),
      },
    });

    await this.prisma.studentActivity
      .create({
        data: {
          studentId: student.id,
          kind: 'AUDIT',
          type: 'PARENT_ACCOUNT_LINKED',
          title: 'Parent login linked',
          description: `${email} linked as parent`,
          actorId: actor.id,
          actorName: actor.email,
        },
      })
      .catch(() => undefined);

    if (tempPassword) {
      await this.emails
        .sendMail(
          email,
          'Your parent portal access',
          `Assalamu Alaikum ${firstName},\n\nA parent account has been created for you to follow ${student.user.firstName}'s progress.\n\nEmail: ${email}\nTemporary password: ${tempPassword}\n\nPlease sign in and change your password.`,
          undefined,
          `<p>Assalamu Alaikum ${firstName},</p>
           <p>A parent account has been created for you to follow <strong>${student.user.firstName}</strong>'s progress.</p>
           <p><strong>Email:</strong> ${email}<br/><strong>Temporary password:</strong> ${tempPassword}</p>
           <p>Please sign in and change your password.</p>`,
        )
        .catch(() => undefined);
    }

    await this.notifications
      .createFor(parentUser.id, {
        type: 'PARENT_LINKED',
        title: 'Parent portal access',
        body: `You can now follow ${student.user.firstName}'s progress.`,
        link: '/parent/dashboard',
      })
      .catch(() => undefined);

    return {
      parentUserId: parentUser.id,
      email,
      linkId: link.id,
      created: Boolean(tempPassword),
      // Surfaced once so the admin can relay it if the email bounces.
      temporaryPassword: tempPassword,
    };
  }

  /** Link an already-existing parent account to another child. */
  async link(dto: LinkParentDto) {
    const [parent, student] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: dto.parentUserId }, select: { role: true } }),
      this.prisma.studentProfile.findUnique({ where: { id: dto.studentId }, select: { id: true } }),
    ]);
    if (!parent || parent.role !== Role.PARENT) throw new NotFoundException('Parent account not found');
    if (!student) throw new NotFoundException('Student not found');

    if (dto.isPrimary) {
      await this.prisma.parentLink.updateMany({
        where: { parentUserId: dto.parentUserId },
        data: { isPrimary: false },
      });
    }

    return this.prisma.parentLink.upsert({
      where: {
        parentUserId_studentId: { parentUserId: dto.parentUserId, studentId: dto.studentId },
      },
      create: {
        parentUserId: dto.parentUserId,
        studentId: dto.studentId,
        relationship: dto.relationship ?? null,
        isPrimary: dto.isPrimary ?? false,
      },
      update: {
        ...(dto.relationship === undefined ? {} : { relationship: dto.relationship }),
        ...(dto.isPrimary === undefined ? {} : { isPrimary: dto.isPrimary }),
      },
    });
  }

  async unlink(linkId: string) {
    const link = await this.prisma.parentLink.findUnique({ where: { id: linkId } });
    if (!link) throw new NotFoundException('Link not found');
    await this.prisma.parentLink.delete({ where: { id: linkId } });
    return { success: true };
  }
}
