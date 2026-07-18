import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import {
  BroadcastAudience as Aud,
  NotificationChannel as Ch,
  NotificationStatus as St,
  Role,
} from '../generated/prisma/enums';
import { AuthUser } from '../auth/decorators';
import { NotificationEngineService } from './engine.service';
import { NotificationTemplatesService, renderTemplate } from './templates.service';
import { BroadcastDto } from './dto';

/*
 * Admin broadcasts: one composed message to a resolved audience, sent now or
 * scheduled for later.
 *
 * The recipient set is resolved at SEND time, never at compose time. A
 * broadcast scheduled for tomorrow morning that targets "all students" must
 * include the student who enrols tonight, and must not include the one who
 * left — freezing the list at compose time would quietly do both wrong.
 */

@Injectable()
export class NotificationBroadcastService {
  private readonly logger = new Logger(NotificationBroadcastService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: NotificationEngineService,
    private readonly templates: NotificationTemplatesService,
  ) {}

  // ── Audience resolution ────────────────────────────────────────────────────

  /** Every user id this broadcast should reach, resolved fresh. */
  private async resolveRecipients(spec: {
    audience: Aud;
    roles: Role[];
    courseId: string | null;
    batchId: string | null;
    studentIds: string[];
  }): Promise<string[]> {
    switch (spec.audience) {
      case Aud.ALL: {
        const users = await this.prisma.user.findMany({
          where: { status: 'ACTIVE' },
          select: { id: true },
        });
        return users.map((u) => u.id);
      }

      case Aud.ROLE: {
        if (!spec.roles.length) throw new BadRequestException('Pick at least one role');
        const users = await this.prisma.user.findMany({
          where: { role: { in: spec.roles }, status: 'ACTIVE' },
          select: { id: true },
        });
        return users.map((u) => u.id);
      }

      case Aud.COURSE: {
        if (!spec.courseId) throw new BadRequestException('Pick a course');
        const enrolments = await this.prisma.enrollment.findMany({
          where: { courseId: spec.courseId, status: { in: ['ACTIVE', 'TRIAL'] } },
          select: { student: { select: { userId: true } } },
        });
        return enrolments.map((e) => e.student.userId);
      }

      case Aud.BATCH: {
        if (!spec.batchId) throw new BadRequestException('Pick a batch');
        const members = await this.prisma.batchStudent.findMany({
          where: { batchId: spec.batchId },
          select: { student: { select: { userId: true } } },
        });
        return members.map((m) => m.student.userId);
      }

      case Aud.STUDENTS:
      default: {
        if (!spec.studentIds.length) throw new BadRequestException('Pick at least one student');
        const students = await this.prisma.studentProfile.findMany({
          where: { id: { in: spec.studentIds } },
          select: { userId: true },
        });
        return students.map((s) => s.userId);
      }
    }
  }

  /** Recipient count without sending — powers the "will reach N people" hint. */
  async preview(dto: BroadcastDto) {
    const ids = await this.resolveRecipients({
      audience: dto.audience,
      roles: dto.roles ?? [],
      courseId: dto.courseId ?? null,
      batchId: dto.batchId ?? null,
      studentIds: dto.studentIds ?? [],
    });
    return { recipientCount: new Set(ids).size };
  }

  // ── Compose ────────────────────────────────────────────────────────────────

  async create(dto: BroadcastDto, actor: AuthUser & { name?: string }) {
    let { title, body } = dto;
    let link = dto.link ?? null;
    let channels = dto.channels ?? [Ch.IN_APP];
    let category = dto.category;
    let priority = dto.priority;

    // A template supplies defaults; anything typed in the form still wins.
    if (dto.templateCode) {
      const t = await this.templates.get(dto.templateCode);
      if (!t.active) throw new BadRequestException(`Template ${t.code} is deactivated`);
      title = dto.title || renderTemplate(t.subject, {});
      body = dto.body || renderTemplate(t.bodyText, {});
      link = link ?? t.link;
      channels = dto.channels ?? (t.channels.length ? t.channels : [Ch.IN_APP]);
      category = category ?? t.category;
      priority = priority ?? t.priority;
    }

    const scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : null;
    /*
     * A draft may hold a past date — it is not going anywhere until someone
     * sends it, and rejecting the date would make yesterday's draft un-savable.
     */
    if (!dto.draft && scheduledAt && scheduledAt.getTime() < Date.now() - 60_000) {
      throw new BadRequestException('Scheduled time is in the past');
    }

    // Count now purely so the admin sees a number immediately; the real
    // recipient set is resolved again when it actually goes out.
    const { recipientCount } = await this.preview(dto);

    const broadcast = await this.prisma.notificationBroadcast.create({
      data: {
        title,
        body,
        link,
        templateCode: dto.templateCode ?? null,
        category: category ?? 'SYSTEM',
        priority: priority ?? 'MEDIUM',
        channels,
        audience: dto.audience,
        roles: dto.roles ?? [],
        courseId: dto.courseId ?? null,
        batchId: dto.batchId ?? null,
        studentIds: dto.studentIds ?? [],
        scheduledAt,
        status: dto.draft ? St.DRAFT : scheduledAt ? St.SCHEDULED : St.QUEUED,
        recipientCount,
        createdById: actor.id,
        createdByName: actor.name ?? actor.email,
      },
    });

    if (dto.draft || scheduledAt) return broadcast;
    return this.run(broadcast.id);
  }

  /**
   * Edit a draft. Only drafts — once something is scheduled or sent its content
   * is a record of what recipients were promised, not a working copy.
   */
  async update(id: string, dto: BroadcastDto, actor: AuthUser & { name?: string }) {
    const existing = await this.prisma.notificationBroadcast.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Broadcast not found');
    if (existing.status !== St.DRAFT) {
      throw new BadRequestException('Only a draft can be edited');
    }

    const scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : null;
    if (!dto.draft && scheduledAt && scheduledAt.getTime() < Date.now() - 60_000) {
      throw new BadRequestException('Scheduled time is in the past');
    }

    const { recipientCount } = await this.preview(dto);

    const broadcast = await this.prisma.notificationBroadcast.update({
      where: { id },
      data: {
        title: dto.title,
        body: dto.body,
        link: dto.link ?? null,
        templateCode: dto.templateCode ?? null,
        category: dto.category ?? 'SYSTEM',
        priority: dto.priority ?? 'MEDIUM',
        channels: dto.channels ?? [Ch.IN_APP],
        audience: dto.audience,
        roles: dto.roles ?? [],
        courseId: dto.courseId ?? null,
        batchId: dto.batchId ?? null,
        studentIds: dto.studentIds ?? [],
        scheduledAt,
        status: dto.draft ? St.DRAFT : scheduledAt ? St.SCHEDULED : St.QUEUED,
        recipientCount,
        createdById: actor.id,
        createdByName: actor.name ?? actor.email,
      },
    });

    // Leaving draft mode with no schedule means "send it now".
    if (!dto.draft && !scheduledAt) return this.run(broadcast.id);
    return broadcast;
  }

  /** Send a queued or scheduled broadcast. Also called by the sweep. */
  async run(id: string) {
    const b = await this.prisma.notificationBroadcast.findUnique({ where: { id } });
    if (!b) throw new NotFoundException('Broadcast not found');
    if (b.status === St.SENT) return b;
    if (b.cancelledAt) throw new BadRequestException('This broadcast was cancelled');

    const recipients = await this.resolveRecipients({
      audience: b.audience,
      roles: b.roles,
      courseId: b.courseId,
      batchId: b.batchId,
      studentIds: b.studentIds,
    });

    const result = await this.engine.dispatch(recipients, {
      type: b.templateCode ?? 'ANNOUNCEMENT',
      title: b.title,
      body: b.body,
      link: b.link,
      category: b.category,
      priority: b.priority,
      channels: b.channels,
      broadcastId: b.id,
      templateCode: b.templateCode,
      actorId: b.createdById,
      actorName: b.createdByName,
    });

    /*
     * `suppressed` is deliberately not counted here — those are users who muted
     * this category or turned the channel off, and calling that a failure would
     * make the report look broken every time somebody exercises a preference.
     * `failed` is the real thing: a channel the engine tried and could not send.
     */
    return this.prisma.notificationBroadcast.update({
      where: { id },
      data: {
        status: St.SENT,
        sentAt: new Date(),
        recipientCount: new Set(recipients).size,
        sentCount: result.created,
        failedCount: result.failed,
      },
    });
  }

  async cancel(id: string) {
    const b = await this.prisma.notificationBroadcast.findUnique({ where: { id } });
    if (!b) throw new NotFoundException('Broadcast not found');
    if (b.status === St.SENT) {
      throw new BadRequestException('This broadcast has already gone out and cannot be cancelled');
    }
    return this.prisma.notificationBroadcast.update({
      where: { id },
      data: { status: St.ARCHIVED, cancelledAt: new Date() },
    });
  }

  async list(limit = 50) {
    return this.prisma.notificationBroadcast.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 200),
    });
  }

  async get(id: string) {
    const b = await this.prisma.notificationBroadcast.findUnique({
      where: { id },
      include: { _count: { select: { notifications: true } } },
    });
    if (!b) throw new NotFoundException('Broadcast not found');

    const read = await this.prisma.notification.count({
      where: { broadcastId: id, read: true },
    });
    return { ...b, deliveredCount: b._count.notifications, readCount: read };
  }

  /** Scheduled broadcasts whose time has come. Driven by the sweep. */
  async due() {
    return this.prisma.notificationBroadcast.findMany({
      where: { status: St.SCHEDULED, scheduledAt: { lte: new Date() }, cancelledAt: null },
      select: { id: true },
      take: 20,
    });
  }
}
