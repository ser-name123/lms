import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { Role } from '../generated/prisma/enums';
import { AuthUser } from '../auth/decorators';
import { CreateAnnouncementDto, UpdateAnnouncementDto } from './dto';

/*
 * Announcements. Admin publishes; every role reads its own audience slice.
 * Publishing also fans out an in-app notification so the bell reflects it
 * immediately rather than waiting for the next dashboard load.
 */

@Injectable()
export class AnnouncementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Admin listing — everything, including drafts and expired items. */
  async listAll() {
    const rows = await this.prisma.announcement.findMany({
      orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
      include: { _count: { select: { reads: true } } },
    });
    return rows.map((a) => ({
      id: a.id,
      title: a.title,
      body: a.body,
      type: a.type,
      audience: a.audience,
      pinned: a.pinned,
      active: a.active,
      link: a.link,
      publishedAt: a.publishedAt?.toISOString() ?? null,
      expiresAt: a.expiresAt?.toISOString() ?? null,
      createdByName: a.createdByName,
      createdAt: a.createdAt.toISOString(),
      readCount: a._count.reads,
    }));
  }

  /** What a given user should see on their dashboard right now. */
  async feed(userId: string, role: Role, limit = 10) {
    const now = new Date();
    const rows = await this.prisma.announcement.findMany({
      where: {
        active: true,
        publishedAt: { not: null, lte: now },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        // An empty audience means everyone.
        AND: [{ OR: [{ audience: { isEmpty: true } }, { audience: { has: role } }] }],
      },
      orderBy: [{ pinned: 'desc' }, { publishedAt: 'desc' }],
      take: limit,
      include: { reads: { where: { userId }, select: { id: true } } },
    });

    return rows.map((a) => ({
      id: a.id,
      title: a.title,
      body: a.body,
      type: a.type,
      pinned: a.pinned,
      link: a.link,
      publishedAt: a.publishedAt?.toISOString() ?? null,
      read: a.reads.length > 0,
    }));
  }

  async create(actor: AuthUser, dto: CreateAnnouncementDto) {
    const publishedAt = dto.publishAt ? new Date(dto.publishAt) : new Date();
    const created = await this.prisma.announcement.create({
      data: {
        title: dto.title,
        body: dto.body,
        type: dto.type ?? 'GENERAL',
        audience: dto.audience ?? [],
        pinned: dto.pinned ?? false,
        link: dto.link ?? null,
        publishedAt,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        createdById: actor.id,
        createdByName: actor.email,
      },
    });

    // Only notify for something already live; a future-dated post notifies via
    // the announcement feed when it becomes visible.
    if (publishedAt <= new Date()) await this.fanOut(created.id);

    return created;
  }

  async update(id: string, dto: UpdateAnnouncementDto) {
    const existing = await this.prisma.announcement.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Announcement not found');

    return this.prisma.announcement.update({
      where: { id },
      data: {
        ...(dto.title === undefined ? {} : { title: dto.title }),
        ...(dto.body === undefined ? {} : { body: dto.body }),
        ...(dto.type === undefined ? {} : { type: dto.type }),
        ...(dto.audience === undefined ? {} : { audience: dto.audience }),
        ...(dto.pinned === undefined ? {} : { pinned: dto.pinned }),
        ...(dto.active === undefined ? {} : { active: dto.active }),
        ...(dto.link === undefined ? {} : { link: dto.link }),
        ...(dto.publishAt === undefined ? {} : { publishedAt: new Date(dto.publishAt) }),
        ...(dto.expiresAt === undefined
          ? {}
          : { expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null }),
      },
    });
  }

  async remove(id: string) {
    const existing = await this.prisma.announcement.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Announcement not found');
    await this.prisma.announcement.delete({ where: { id } });
    return { success: true };
  }

  async markRead(id: string, userId: string) {
    // Upsert keeps a repeat click a no-op instead of a unique-constraint error.
    await this.prisma.announcementRead.upsert({
      where: { announcementId_userId: { announcementId: id, userId } },
      create: { announcementId: id, userId },
      update: {},
    });
    return { success: true };
  }

  private async fanOut(id: string) {
    const announcement = await this.prisma.announcement.findUnique({ where: { id } });
    if (!announcement) return;

    const roles = announcement.audience.length
      ? (announcement.audience as Role[])
      : (Object.values(Role) as Role[]);

    // Fire-and-forget, matching the convention everywhere else: a notification
    // failure must not roll back the announcement itself.
    await this.notifications
      .createForRoles(roles, {
        type: 'ANNOUNCEMENT',
        title: announcement.title,
        body: announcement.body.slice(0, 200),
        link: announcement.link ?? '/dashboard',
      })
      .catch(() => undefined);
  }
}
