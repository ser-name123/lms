import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { NotificationPriority as Pri, Role } from '../generated/prisma/enums';
import { AuthUser } from '../auth/decorators';
import { NotificationEngineService } from './engine.service';
import { ComposeDto } from './dto';

/*
 * Role-to-role messaging.
 *
 * Each role may only reach the people the spec lists for it, and — crucially —
 * a teacher, coach, student or parent may only reach the *particular* people
 * they are connected to, not everyone holding that role. A parent reaches the
 * staff teaching their own linked children and nobody else; note they cannot
 * reach students at all, including their own child, since the child has their
 * own account and this is a staff channel. `allowedRecipients` is the one
 * place that decides, and `send` validates against the very same list rather
 * than re-deriving it, so the picker and the guard can never drift apart.
 */

/*
 * Which roles each sender may address at all.
 *
 * Partial on purpose: a role absent from this map can compose to nobody, and
 * both readers already treat a missing entry as an empty list. Claiming
 * Record<Role, Role[]> would force an empty array for every role that has no
 * outbox, which reads as an oversight rather than a decision.
 */
const CAN_MESSAGE: Partial<Record<Role, Role[]>> = {
  [Role.ADMIN]: [Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH, Role.TEACHER, Role.STUDENT],
  [Role.SUPERVISOR]: [Role.TEACHER, Role.ACADEMIC_COACH, Role.ADMIN, Role.STUDENT],
  [Role.ACADEMIC_COACH]: [Role.STUDENT, Role.TEACHER, Role.ADMIN, Role.SUPERVISOR],
  [Role.TEACHER]: [Role.STUDENT, Role.ACADEMIC_COACH, Role.SUPERVISOR, Role.ADMIN],
  [Role.STUDENT]: [Role.TEACHER, Role.ACADEMIC_COACH, Role.ADMIN],
};

export interface RecipientOption {
  id: string;
  name: string;
  email: string;
  role: Role;
  /** Why this person is reachable — "Your coach", "Quran Recitation", … */
  context: string | null;
}

@Injectable()
export class NotificationComposeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: NotificationEngineService,
  ) {}

  /** Everyone this user may send to, with the reason each one is reachable. */
  async allowedRecipients(user: AuthUser): Promise<RecipientOption[]> {
    const allowedRoles = CAN_MESSAGE[user.role] ?? [];
    if (!allowedRoles.length) return [];

    const shape = (
      u: { id: string; firstName: string; lastName: string; email: string; role: Role },
      context: string | null,
    ): RecipientOption => ({
      id: u.id,
      name: `${u.firstName} ${u.lastName}`.trim(),
      email: u.email,
      role: u.role,
      context,
    });

    // Staff can address whole roles, so no per-relationship narrowing.
    if (user.role === Role.ADMIN || user.role === Role.SUPERVISOR) {
      const users = await this.prisma.user.findMany({
        where: { role: { in: allowedRoles }, status: 'ACTIVE', id: { not: user.id } },
        orderBy: [{ role: 'asc' }, { firstName: 'asc' }],
        select: { id: true, firstName: true, lastName: true, email: true, role: true },
      });
      return users.map((u) => shape(u, null));
    }

    if (user.role === Role.ACADEMIC_COACH) {
      const [roster, staff] = await Promise.all([
        this.prisma.studentProfile.findMany({
          where: { coachId: user.id },
          select: {
            studentCode: true,
            user: { select: { id: true, firstName: true, lastName: true, email: true, role: true } },
          },
        }),
        this.prisma.user.findMany({
          where: {
            role: { in: [Role.TEACHER, Role.ADMIN, Role.SUPERVISOR] },
            status: 'ACTIVE',
          },
          select: { id: true, firstName: true, lastName: true, email: true, role: true },
        }),
      ]);
      return [
        ...roster.map((s) => shape(s.user, `Your student · ${s.studentCode}`)),
        ...staff.map((u) => shape(u, null)),
      ];
    }

    if (user.role === Role.TEACHER) {
      const teacher = await this.prisma.teacherProfile.findUnique({
        where: { userId: user.id },
        select: { id: true },
      });
      if (!teacher) return [];

      const [enrolments, staff] = await Promise.all([
        this.prisma.enrollment.findMany({
          where: { teacherId: teacher.id, status: { in: ['ACTIVE', 'TRIAL'] } },
          select: {
            course: { select: { title: true } },
            student: {
              select: {
                studentCode: true,
                user: { select: { id: true, firstName: true, lastName: true, email: true, role: true } },
              },
            },
          },
        }),
        this.prisma.user.findMany({
          where: {
            role: { in: [Role.ACADEMIC_COACH, Role.SUPERVISOR, Role.ADMIN] },
            status: 'ACTIVE',
          },
          select: { id: true, firstName: true, lastName: true, email: true, role: true },
        }),
      ]);

      // A teacher may take the same student for two courses — list them once.
      const seen = new Set<string>();
      const students: RecipientOption[] = [];
      for (const e of enrolments) {
        if (seen.has(e.student.user.id)) continue;
        seen.add(e.student.user.id);
        students.push(shape(e.student.user, `Your student · ${e.course.title}`));
      }
      return [...students, ...staff.map((u) => shape(u, null))];
    }


    // STUDENT — their own teachers, their coach, and admins for support.
    const profile = await this.prisma.studentProfile.findUnique({
      where: { userId: user.id },
      select: {
        coachId: true,
        enrollments: {
          where: { status: { in: ['ACTIVE', 'TRIAL'] }, teacherId: { not: null } },
          select: {
            course: { select: { title: true } },
            teacher: {
              select: { user: { select: { id: true, firstName: true, lastName: true, email: true, role: true } } },
            },
          },
        },
      },
    });
    if (!profile) return [];

    const [coach, admins] = await Promise.all([
      profile.coachId
        ? this.prisma.user.findUnique({
            where: { id: profile.coachId },
            select: { id: true, firstName: true, lastName: true, email: true, role: true },
          })
        : Promise.resolve(null),
      this.prisma.user.findMany({
        where: { role: Role.ADMIN, status: 'ACTIVE' },
        select: { id: true, firstName: true, lastName: true, email: true, role: true },
      }),
    ]);

    const seen = new Set<string>();
    const teachers: RecipientOption[] = [];
    for (const e of profile.enrollments) {
      if (!e.teacher || seen.has(e.teacher.user.id)) continue;
      seen.add(e.teacher.user.id);
      teachers.push(shape(e.teacher.user, `Your teacher · ${e.course.title}`));
    }

    return [
      ...teachers,
      ...(coach ? [shape(coach, 'Your academic coach')] : []),
      ...admins.map((u) => shape(u, 'Support')),
    ];
  }

  async send(user: AuthUser & { name?: string }, dto: ComposeDto) {
    if (!CAN_MESSAGE[user.role]?.length) {
      throw new ForbiddenException('Your role cannot send notifications');
    }

    /*
     * Priority is checked first: it is a fact about the sender's authority, not
     * about who they picked, so it must not depend on recipient resolution —
     * and it costs no query. A CRITICAL message bypasses every recipient's mute
     * settings, so that power stays with an administrator.
     */
    if (dto.priority === Pri.CRITICAL && user.role !== Role.ADMIN) {
      throw new BadRequestException('Only an administrator may send a critical notification');
    }

    /*
     * Validate against the same list the picker was built from. Deriving the
     * rule twice is how a UI restriction quietly becomes not a restriction.
     */
    const allowed = new Set((await this.allowedRecipients(user)).map((r) => r.id));
    const rejected = dto.userIds.filter((id) => !allowed.has(id));
    if (rejected.length) {
      throw new ForbiddenException(
        `You cannot message ${rejected.length} of the selected recipient(s)`,
      );
    }

    const result = await this.engine.dispatch(dto.userIds, {
      type: 'DIRECT_MESSAGE',
      title: dto.title,
      body: dto.body,
      link: dto.link ?? '/notifications',
      priority: dto.priority,
      channels: dto.channels,
      actorId: user.id,
      actorName: user.name ?? user.email,
    });

    return { sent: result.created, suppressed: result.suppressed };
  }
}
