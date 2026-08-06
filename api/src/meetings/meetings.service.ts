import {
  BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ZoomService } from '../leads/zoom.service';
import { Role } from '../generated/prisma/enums';
import { sanitizeHtml } from '../common/sanitize-html';
import {
  DEFAULT_MEETING_CONFIG, MEETING_CONFIG_KEY, MeetingConfig,
  attendanceStatusFor, jitsiRoomFor,
} from './meetings.config';
import type {
  ActionItemDto, AddAttachmentDto, CancelMeetingDto, CreateMeetingDto, ListMeetingsQuery,
  MarkAttendanceDto, ParticipantSelectionDto, RescheduleMeetingDto, SaveMeetingConfigDto,
  SaveMinutesDto, UpdateActionItemDto, UpdateMeetingDto,
} from './dto';

export interface Actor {
  id: string;
  email: string;
  role: string;
}

/** Roles that may see and organise anything. */
const STAFF_ROLES: string[] = [Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH];
/** Roles that may schedule a meeting at all (8.4). */
const ORGANISER_ROLES: string[] = [Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH, Role.TEACHER];
/** Only these two may put a STUDENT in a meeting — the spec's addendum. */
const MAY_INVITE_STUDENTS: string[] = [Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH];

/*
 * Module 8 — Staff Meeting & Collaboration Management.
 *
 * One service for the meeting's whole life: scheduling, the invitee list,
 * attendance, minutes and action items. They are split across four screens but
 * they are one row and one set of rules, and separating them would mean four
 * services all loading the same meeting to check the same permissions.
 *
 * Recurrence generation and the reminder sweeps live in `MeetingSeriesService`,
 * and the reports in `MeetingReportsService`, because those run on a timer and
 * read across meetings rather than acting on one.
 */
@Injectable()
export class MeetingsService {
  private readonly logger = new Logger(MeetingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly zoom: ZoomService,
  ) {}

  // ══ Config ═════════════════════════════════════════════════════════════════

  async config(): Promise<MeetingConfig> {
    const row = await this.prisma.systemSetting.findUnique({ where: { key: MEETING_CONFIG_KEY } });
    if (!row) return { ...DEFAULT_MEETING_CONFIG };
    try {
      const parsed = JSON.parse(row.value) as Partial<MeetingConfig>;
      return { ...DEFAULT_MEETING_CONFIG, ...parsed };
    } catch {
      return { ...DEFAULT_MEETING_CONFIG };
    }
  }

  async saveConfig(dto: SaveMeetingConfigDto): Promise<MeetingConfig> {
    const next: MeetingConfig = { ...(await this.config()), ...dto };
    await this.prisma.systemSetting.upsert({
      where: { key: MEETING_CONFIG_KEY },
      update: { value: JSON.stringify(next) },
      create: { key: MEETING_CONFIG_KEY, value: JSON.stringify(next) },
    });
    return next;
  }

  // ══ Participants ═══════════════════════════════════════════════════════════

  /**
   * Turn a selection into a concrete list of users.
   *
   * Groups are expanded HERE and not in the browser: "All Teachers" chosen on
   * Monday must mean the teachers who exist when the meeting is saved, and a
   * list frozen at page-load silently omits anyone hired in between. Only
   * ACTIVE users are invited — a deactivated account cannot attend and would
   * otherwise sit in every attendance report as permanently absent.
   */
  async resolveParticipants(
    selection: ParticipantSelectionDto | undefined,
    organizerId: string,
    actor: Actor,
  ): Promise<{ userId: string; role: Role; isOptional: boolean }[]> {
    const ids = new Set<string>();

    for (const id of selection?.userIds ?? []) if (id) ids.add(id);
    /*
     * An optional attendee is still an attendee — §8.2's "Optional: Academic
     * Coach and Admin may attend". Marking someone optional invites them; it
     * only means their absence does not count against the meeting.
     */
    for (const id of selection?.optionalUserIds ?? []) if (id) ids.add(id);

    const roles = (selection?.roles ?? []).filter((r) =>
      (Object.values(Role) as string[]).includes(r),
    ) as Role[];
    if (roles.length) {
      const byRole = await this.prisma.user.findMany({
        where: { role: { in: roles }, status: 'ACTIVE' },
        select: { id: true },
      });
      for (const u of byRole) ids.add(u.id);
    }

    /*
     * The spec's "Departments". This academy has no department table — a
     * teacher's grouping IS the course they teach — so a department selection
     * resolves to the teachers enrolled students are assigned to on that course.
     */
    if (selection?.courseIds?.length) {
      const teachers = await this.prisma.teacherProfile.findMany({
        where: {
          OR: [
            { courseId: { in: selection.courseIds } },
            { enrollments: { some: { courseId: { in: selection.courseIds }, status: 'ACTIVE' } } },
          ],
        },
        select: { userId: true },
      });
      for (const t of teachers) if (t.userId) ids.add(t.userId);
    }

    if (selection?.studentIds?.length) {
      if (!MAY_INVITE_STUDENTS.includes(actor.role)) {
        throw new ForbiddenException('Only an academic coach, supervisor or admin may invite a student to a meeting.');
      }
      const students = await this.prisma.studentProfile.findMany({
        where: { id: { in: selection.studentIds } },
        select: { userId: true },
      });
      for (const s of students) if (s.userId) ids.add(s.userId);
    }

    // The organiser is always in their own meeting.
    ids.add(organizerId);

    const users = await this.prisma.user.findMany({
      where: { id: { in: [...ids] }, status: 'ACTIVE' },
      select: { id: true, role: true },
    });

    const optional = new Set(selection?.optionalUserIds ?? []);
    return users.map((u) => ({
      userId: u.id,
      role: u.role,
      // The organiser is never optional, whatever the client sent.
      isOptional: u.id !== organizerId && optional.has(u.id),
    }));
  }

  private async userName(userId: string | null | undefined): Promise<string | null> {
    if (!userId) return null;
    const u = await this.prisma.user
      .findUnique({ where: { id: userId }, select: { firstName: true, lastName: true, email: true } })
      .catch(() => null);
    if (!u) return null;
    return `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email;
  }

  // ══ Create / update ════════════════════════════════════════════════════════

  async create(dto: CreateMeetingDto, actor: Actor) {
    if (!ORGANISER_ROLES.includes(actor.role)) {
      throw new ForbiddenException('Your role cannot schedule meetings.');
    }

    const startsAt = new Date(dto.startsAt);
    if (isNaN(startsAt.getTime())) throw new BadRequestException('That start time is not a valid date.');

    const { endsAt, durationMins } = this.resolveWindow(startsAt, dto.endsAt, dto.durationMins);

    /*
     * Only staff may organise on someone else's behalf. A teacher naming
     * another teacher as organiser would let them create a meeting nobody
     * agreed to host and then walk away from the minutes.
     */
    let organizerId = actor.id;
    if (dto.organizerId && dto.organizerId !== actor.id) {
      if (!STAFF_ROLES.includes(actor.role)) {
        throw new ForbiddenException('Only staff may schedule a meeting on behalf of someone else.');
      }
      organizerId = dto.organizerId;
    }

    const participants = await this.resolveParticipants(dto.participants, organizerId, actor);
    if (participants.length < 2) {
      throw new BadRequestException('A meeting needs at least one participant besides the organiser.');
    }

    const organizerName = await this.userName(organizerId);
    const platform = (dto.platform ?? 'JITSI') as 'JITSI' | 'ZOOM' | 'TEAMS' | 'OTHER';

    const meeting = await this.prisma.staffMeeting.create({
      data: {
        title: dto.title.trim(),
        type: dto.type as never,
        description: dto.description ? sanitizeHtml(dto.description) : null,
        startsAt,
        endsAt,
        durationMins,
        timeZone: dto.timeZone ?? null,
        platform: platform as never,
        meetingLink: platform === 'JITSI' ? null : dto.meetingLink?.trim() || null,
        organizerId,
        organizerName,
        participants: {
          create: participants.map((p) => ({
            userId: p.userId,
            role: p.role,
            isOrganizer: p.userId === organizerId,
            isOptional: p.isOptional,
          })),
        },
      },
      select: { id: true },
    });

    const link = await this.provisionLink(meeting.id, platform, dto.meetingLink);
    if (link.meetingLink || link.externalId) {
      await this.prisma.staffMeeting.update({
        where: { id: meeting.id },
        data: { meetingLink: link.meetingLink, externalId: link.externalId },
      });
    }

    await this.audit(meeting.id, actor, 'CREATED', `${dto.title.trim()} scheduled`, {
      participants: participants.length,
      platform,
    });
    await this.notifyParticipants(meeting.id, 'MEETING_SCHEDULED', 'Meeting scheduled', (m) =>
      `${m.title} — ${fmt(m.startsAt)} (${m.durationMins} min).`,
    ).catch(() => undefined);

    return this.getOne(meeting.id, actor);
  }

  /**
   * The room a meeting is held in.
   *
   * Jitsi rooms are free and need no API, so they are generated from the id.
   * Zoom is created through the same service the trial booking uses; if that
   * call fails the meeting is NOT rolled back — a meeting with no link is a
   * problem an organiser can fix in ten seconds, whereas losing the invitation
   * everybody was just notified about is not.
   */
  private async provisionLink(
    meetingId: string,
    platform: string,
    manualLink?: string,
  ): Promise<{ meetingLink: string | null; externalId: string | null }> {
    if (platform === 'JITSI') {
      const cfg = await this.config();
      return { meetingLink: jitsiRoomFor(meetingId, cfg.jitsiBaseUrl), externalId: null };
    }
    if (platform === 'ZOOM') {
      const m = await this.prisma.staffMeeting.findUnique({
        where: { id: meetingId },
        select: { title: true, startsAt: true, durationMins: true, timeZone: true, description: true },
      });
      if (!m) return { meetingLink: manualLink?.trim() || null, externalId: null };
      const res = await this.zoom
        .createTrialMeeting({
          topic: m.title,
          startAt: m.startsAt,
          durationMins: m.durationMins,
          timeZone: m.timeZone,
          agenda: m.description ?? '',
        })
        .catch((e) => ({ ok: false, reason: (e as Error).message }) as const);
      if (res.ok && 'meeting' in res && res.meeting) {
        return { meetingLink: res.meeting.joinUrl, externalId: res.meeting.meetingId };
      }
      this.logger.warn(
        `Zoom room not created for meeting ${meetingId}: ${'reason' in res ? res.reason : 'unknown'}`,
      );
      return { meetingLink: manualLink?.trim() || null, externalId: null };
    }
    // TEAMS / OTHER: the organiser pastes their own link.
    return { meetingLink: manualLink?.trim() || null, externalId: null };
  }

  private resolveWindow(startsAt: Date, endsAtIso?: string, durationMins?: number) {
    if (endsAtIso) {
      const endsAt = new Date(endsAtIso);
      if (isNaN(endsAt.getTime())) throw new BadRequestException('That end time is not a valid date.');
      if (endsAt <= startsAt) throw new BadRequestException('A meeting has to end after it starts.');
      return { endsAt, durationMins: Math.round((endsAt.getTime() - startsAt.getTime()) / 60_000) };
    }
    const mins = durationMins && durationMins > 0 ? durationMins : 60;
    return { endsAt: new Date(startsAt.getTime() + mins * 60_000), durationMins: mins };
  }

  async update(id: string, dto: UpdateMeetingDto, actor: Actor) {
    const m = await this.loadOr404(id);
    await this.assertMayManage(m, actor);
    if (m.status === 'CANCELLED') throw new BadRequestException('A cancelled meeting cannot be edited.');
    if (m.status === 'COMPLETED') throw new BadRequestException('A completed meeting cannot be edited.');

    const data: Record<string, unknown> = {};
    if (dto.title !== undefined) data.title = dto.title.trim();
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.description !== undefined) data.description = dto.description ? sanitizeHtml(dto.description) : null;
    if (dto.meetingLink !== undefined && m.platform !== 'JITSI') data.meetingLink = dto.meetingLink.trim() || null;

    if (dto.platform !== undefined && dto.platform !== m.platform) {
      data.platform = dto.platform;
      const link = await this.provisionLink(id, dto.platform, dto.meetingLink);
      data.meetingLink = link.meetingLink;
      data.externalId = link.externalId;
    }

    await this.prisma.staffMeeting.update({ where: { id }, data });

    if (dto.participants) {
      await this.syncParticipants(id, dto.participants, m.organizerId, actor);
    }

    await this.audit(id, actor, 'UPDATED', 'Meeting details updated', { fields: Object.keys(data) });
    return this.getOne(id, actor);
  }

  /**
   * Bring the invitee list in line with a new selection.
   *
   * Participants who are no longer selected are removed ONLY if they have not
   * already joined — dropping someone who attended would erase them from the
   * attendance record, which is the one thing this module exists to keep.
   */
  private async syncParticipants(
    meetingId: string,
    selection: ParticipantSelectionDto,
    organizerId: string,
    actor: Actor,
  ) {
    const wanted = await this.resolveParticipants(selection, organizerId, actor);
    const wantedIds = new Set(wanted.map((w) => w.userId));

    const existing = await this.prisma.staffMeetingParticipant.findMany({
      where: { meetingId },
      select: { id: true, userId: true, joinedAt: true, status: true, isOptional: true },
    });
    const existingIds = new Set(existing.map((e) => e.userId));

    /*
     * Someone already invited can be moved between required and optional. That
     * has to be applied to the existing row — creating is not the only way the
     * flag changes, and a supervisor who downgrades an attendee to optional
     * expects the attendance figures to follow.
     */
    for (const e of existing) {
      const want = wanted.find((w) => w.userId === e.userId);
      if (want && want.isOptional !== e.isOptional) {
        await this.prisma.staffMeetingParticipant.update({
          where: { id: e.id },
          data: { isOptional: want.isOptional },
        });
      }
    }

    const added = wanted.filter((w) => !existingIds.has(w.userId));
    if (added.length) {
      await this.prisma.staffMeetingParticipant.createMany({
        data: added.map((a) => ({
          meetingId,
          userId: a.userId,
          role: a.role,
          isOrganizer: a.userId === organizerId,
          isOptional: a.isOptional,
        })),
      });
    }

    const removable = existing.filter(
      (e) => !wantedIds.has(e.userId) && !e.joinedAt && e.status === 'INVITED' && e.userId !== organizerId,
    );
    if (removable.length) {
      await this.prisma.staffMeetingParticipant.deleteMany({
        where: { id: { in: removable.map((r) => r.id) } },
      });
    }

    if (added.length) {
      await this.notifyUsers(
        meetingId,
        added.map((a) => a.userId),
        'MEETING_SCHEDULED',
        'You have been added to a meeting',
        (m) => `${m.title} — ${fmt(m.startsAt)}.`,
      ).catch(() => undefined);
    }
  }

  // ══ Reschedule / cancel (8.3) ══════════════════════════════════════════════

  async reschedule(id: string, dto: RescheduleMeetingDto, actor: Actor) {
    const m = await this.loadOr404(id);
    await this.assertMayManage(m, actor);
    if (m.status === 'CANCELLED') throw new BadRequestException('A cancelled meeting cannot be rescheduled.');
    if (m.status === 'COMPLETED') throw new BadRequestException('A completed meeting cannot be rescheduled.');

    const startsAt = new Date(dto.startsAt);
    if (isNaN(startsAt.getTime())) throw new BadRequestException('That start time is not a valid date.');
    const { endsAt, durationMins } = this.resolveWindow(startsAt, undefined, dto.durationMins ?? m.durationMins);

    await this.prisma.staffMeeting.update({
      where: { id },
      data: {
        startsAt,
        endsAt,
        durationMins,
        rescheduledFrom: m.startsAt,
        rescheduleNote: dto.note?.trim() || null,
        // The old meeting's reminders were for the old time; clear them so the
        // sweep re-sends against the new one.
        reminder24SentAt: null,
        reminder1SentAt: null,
        startedNotifiedAt: null,
        absenceMarkedAt: null,
      },
    });

    if (m.platform === 'ZOOM' && m.externalId) {
      await this.zoom.rescheduleMeeting(m.externalId, startsAt, durationMins).catch((e) =>
        this.logger.warn(`Zoom reschedule failed for ${id}: ${(e as Error).message}`),
      );
    }

    await this.audit(id, actor, 'RESCHEDULED', `Moved from ${fmt(m.startsAt)} to ${fmt(startsAt)}`, {
      from: m.startsAt,
      to: startsAt,
    });
    await this.notifyParticipants(id, 'MEETING_RESCHEDULED', 'Meeting rescheduled', (mm) =>
      `${mm.title} has moved to ${fmt(mm.startsAt)}${dto.note?.trim() ? ` — ${dto.note.trim()}` : ''}.`,
    ).catch(() => undefined);

    return this.getOne(id, actor);
  }

  async cancel(id: string, dto: CancelMeetingDto, actor: Actor) {
    const m = await this.loadOr404(id);
    await this.assertMayManage(m, actor);
    if (m.status === 'CANCELLED') throw new BadRequestException('Already cancelled.');
    if (m.status === 'COMPLETED') throw new BadRequestException('A completed meeting cannot be cancelled.');

    await this.prisma.staffMeeting.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelledByName: await this.userName(actor.id),
        cancelReason: dto.reason?.trim() || null,
      },
    });

    if (m.platform === 'ZOOM' && m.externalId) {
      await this.zoom.cancelMeeting(m.externalId).catch((e) =>
        this.logger.warn(`Zoom cancel failed for ${id}: ${(e as Error).message}`),
      );
    }

    await this.audit(id, actor, 'CANCELLED', dto.reason?.trim() || 'Meeting cancelled', {});
    await this.notifyParticipants(id, 'MEETING_CANCELLED', 'Meeting cancelled', (mm) =>
      `${mm.title} on ${fmt(mm.startsAt)} has been cancelled${dto.reason?.trim() ? ` — ${dto.reason.trim()}` : ''}.`,
    ).catch(() => undefined);

    return this.getOne(id, actor);
  }

  // ══ Lifecycle: start / end ═════════════════════════════════════════════════

  async start(id: string, actor: Actor) {
    const m = await this.loadOr404(id);
    await this.assertMayManage(m, actor);
    if (m.status === 'CANCELLED') throw new BadRequestException('A cancelled meeting cannot be started.');
    if (m.status === 'COMPLETED') throw new BadRequestException('That meeting has already finished.');

    const claimed = await this.prisma.staffMeeting.updateMany({
      where: { id, status: 'SCHEDULED' },
      data: { status: 'LIVE', startedAt: new Date() },
    });
    // Starting twice is a double-click, not an error worth showing.
    if (claimed.count > 0) {
      await this.audit(id, actor, 'STARTED', 'Meeting started', {});
      const cfg = await this.config();
      if (cfg.notifyOnStart) {
        await this.notifyParticipants(id, 'MEETING_STARTED', 'Meeting started', (mm) =>
          `${mm.title} has started. Join now.`,
        ).catch(() => undefined);
        await this.prisma.staffMeeting.update({ where: { id }, data: { startedNotifiedAt: new Date() } });
      }
    }
    return this.getOne(id, actor);
  }

  /**
   * End the meeting and settle everybody's attendance.
   *
   * Anyone still shown as joined is closed out at the end time, and anyone who
   * never joined becomes ABSENT — the spec's "attendance shall be generated
   * automatically". EXCUSED is left alone: a human set it and the clock must
   * not overrule them.
   */
  async end(id: string, actor: Actor) {
    const m = await this.loadOr404(id);
    await this.assertMayManage(m, actor);
    if (m.status === 'CANCELLED') throw new BadRequestException('A cancelled meeting cannot be completed.');

    const cfg = await this.config();
    if (cfg.requireMinutesToComplete && m.minutesStatus !== 'PUBLISHED') {
      throw new BadRequestException(
        'Publish the meeting minutes before completing the meeting — minutes are mandatory for a completed meeting.',
      );
    }

    await this.settleAttendance(id, cfg);
    await this.prisma.staffMeeting.update({
      where: { id },
      data: { status: 'COMPLETED', endedAt: new Date() },
    });
    await this.audit(id, actor, 'ENDED', 'Meeting completed', {});
    return this.getOne(id, actor);
  }

  /** Shared by `end()` and the absence sweep. Idempotent. */
  async settleAttendance(meetingId: string, cfg: MeetingConfig) {
    const m = await this.prisma.staffMeeting.findUnique({
      where: { id: meetingId },
      select: {
        id: true, startsAt: true, endsAt: true, durationMins: true, title: true,
        participants: {
          select: { id: true, userId: true, status: true, joinedAt: true, leftAt: true, isOptional: true },
        },
      },
    });
    if (!m) return { marked: 0 };

    let marked = 0;
    const newlyAbsent: string[] = [];
    for (const p of m.participants) {
      if (p.status === 'EXCUSED') continue;
      const computed = attendanceStatusFor(p.joinedAt, p.leftAt, m, cfg);
      const leftAt = p.joinedAt ? (p.leftAt ?? m.endsAt) : null;
      if (p.status === computed.status && p.leftAt) continue;
      await this.prisma.staffMeetingParticipant.update({
        where: { id: p.id },
        data: {
          status: computed.status as never,
          leftAt,
          durationMins: computed.durationMins,
          lateMinutes: computed.lateMinutes,
        },
      });
      marked += 1;
      // Their status is still recorded as ABSENT — the record should say what
      // happened — but an optional invitee is not chased for not attending.
      if (computed.status === 'ABSENT' && p.status !== 'ABSENT' && !p.isOptional) {
        newlyAbsent.push(p.userId);
      }
    }

    if (newlyAbsent.length && cfg.notifyOnAbsence) {
      await this.notifyUsers(meetingId, newlyAbsent, 'MEETING_ABSENCE', 'You missed a meeting', (mm) =>
        `You were not recorded as attending ${mm.title} on ${fmt(mm.startsAt)}.`,
      ).catch(() => undefined);
      // Per the spec's matrix, absence also goes to supervisors and admins —
      // the coach is deliberately left off.
      await this.notifications
        .createForRoles([Role.SUPERVISOR, Role.ADMIN], {
          type: 'MEETING_ABSENCE',
          title: 'Meeting absence recorded',
          body: `${newlyAbsent.length} participant(s) missed ${m.title}.`,
          link: `/meetings/${meetingId}`,
        })
        .catch(() => undefined);
    }

    return { marked };
  }

  // ══ Attendance (8.5) ═══════════════════════════════════════════════════════

  /** A participant opening the meeting from their portal. */
  async join(id: string, actor: Actor) {
    const m = await this.loadOr404(id);
    if (m.status === 'CANCELLED') throw new BadRequestException('That meeting was cancelled.');

    const p = await this.prisma.staffMeetingParticipant.findUnique({
      where: { meetingId_userId: { meetingId: id, userId: actor.id } },
      select: { id: true, joinedAt: true },
    });
    if (!p) throw new ForbiddenException('You are not a participant in this meeting.');

    const now = new Date();
    const updated = await this.prisma.staffMeetingParticipant.update({
      where: { id: p.id },
      // Re-joining after a drop keeps the ORIGINAL join time: lateness is
      // measured from when they first arrived, not from a reconnect.
      data: { joinedAt: p.joinedAt ?? now, leftAt: null },
      select: { joinedAt: true },
    });

    // The first join starts the meeting if the organiser has not.
    if (m.status === 'SCHEDULED') {
      await this.prisma.staffMeeting
        .updateMany({ where: { id, status: 'SCHEDULED' }, data: { status: 'LIVE', startedAt: now } })
        .catch(() => undefined);
    }

    await this.audit(id, actor, 'JOINED', null, { at: now });
    return { joinedAt: updated.joinedAt, meetingLink: m.meetingLink, meetingId: id };
  }

  async leave(id: string, actor: Actor) {
    const m = await this.loadOr404(id);
    const p = await this.prisma.staffMeetingParticipant.findUnique({
      where: { meetingId_userId: { meetingId: id, userId: actor.id } },
      select: { id: true, joinedAt: true, status: true },
    });
    if (!p) throw new ForbiddenException('You are not a participant in this meeting.');
    if (!p.joinedAt) throw new BadRequestException('You have not joined this meeting.');

    const cfg = await this.config();
    const now = new Date();
    const computed = attendanceStatusFor(p.joinedAt, now, m, cfg);
    const updated = await this.prisma.staffMeetingParticipant.update({
      where: { id: p.id },
      data: {
        leftAt: now,
        durationMins: computed.durationMins,
        lateMinutes: computed.lateMinutes,
        // An excused participant who turns up anyway keeps their excuse — the
        // point of EXCUSED is that somebody decided it.
        ...(p.status === 'EXCUSED' ? {} : { status: computed.status as never }),
      },
      select: { leftAt: true, durationMins: true, status: true },
    });
    await this.audit(id, actor, 'LEFT', null, { at: now, durationMins: updated.durationMins });
    return updated;
  }

  /** Manual correction — the only way to set EXCUSED (8.5). */
  async markAttendance(id: string, dto: MarkAttendanceDto, actor: Actor) {
    const m = await this.loadOr404(id);
    await this.assertMayManage(m, actor);

    const p = await this.prisma.staffMeetingParticipant.findUnique({
      where: { meetingId_userId: { meetingId: id, userId: dto.userId } },
      select: { id: true },
    });
    if (!p) throw new NotFoundException('That person is not a participant in this meeting.');

    await this.prisma.staffMeetingParticipant.update({
      where: { id: p.id },
      data: {
        status: dto.status as never,
        excuseReason: dto.status === 'EXCUSED' ? dto.reason?.trim() || null : null,
        markedById: actor.id,
        markedByName: await this.userName(actor.id),
      },
    });
    await this.audit(id, actor, 'ATTENDANCE_MARKED', `${dto.status} for a participant`, {
      userId: dto.userId,
      status: dto.status,
    });
    return this.getOne(id, actor);
  }

  // ══ Minutes (8.6) ══════════════════════════════════════════════════════════

  async saveMinutes(id: string, dto: SaveMinutesDto, actor: Actor) {
    const m = await this.loadOr404(id);
    await this.assertMayManage(m, actor);
    if (m.minutesStatus === 'PUBLISHED') {
      throw new BadRequestException('These minutes are published and can no longer be edited.');
    }
    if (m.status === 'CANCELLED') throw new BadRequestException('A cancelled meeting has no minutes.');

    await this.prisma.staffMeeting.update({
      where: { id },
      data: {
        summary: dto.summary !== undefined ? sanitizeHtml(dto.summary) : undefined,
        discussionPoints: dto.discussionPoints !== undefined ? sanitizeHtml(dto.discussionPoints) : undefined,
        decisions: dto.decisions !== undefined ? sanitizeHtml(dto.decisions) : undefined,
        remarks: dto.remarks !== undefined ? sanitizeHtml(dto.remarks) : undefined,
        minutesStatus: 'DRAFT',
        minutesById: actor.id,
        minutesByName: await this.userName(actor.id),
      },
    });
    await this.audit(id, actor, 'MINUTES_SAVED', 'Minutes saved as draft', {});
    return this.getOne(id, actor);
  }

  async publishMinutes(id: string, actor: Actor) {
    const m = await this.loadOr404(id);
    await this.assertMayManage(m, actor);
    if (m.minutesStatus === 'PUBLISHED') throw new BadRequestException('Already published.');
    if (!m.summary?.trim()) {
      throw new BadRequestException('Write a meeting summary before publishing the minutes.');
    }

    const claimed = await this.prisma.staffMeeting.updateMany({
      where: { id, minutesStatus: { in: ['NOT_STARTED', 'DRAFT'] } },
      data: {
        minutesStatus: 'PUBLISHED',
        minutesPublishedAt: new Date(),
        minutesById: actor.id,
        minutesByName: await this.userName(actor.id),
      },
    });
    if (claimed.count === 0) throw new BadRequestException('These minutes were just published by someone else.');

    await this.audit(id, actor, 'MINUTES_PUBLISHED', 'Minutes published', {});
    await this.notifyParticipants(id, 'MEETING_MINUTES_PUBLISHED', 'Meeting minutes published', (mm) =>
      `The minutes for ${mm.title} (${fmt(mm.startsAt)}) are now available.`,
    ).catch(() => undefined);
    return this.getOne(id, actor);
  }

  /** Reopen published minutes for correction — staff only. */
  async reopenMinutes(id: string, actor: Actor) {
    if (!STAFF_ROLES.includes(actor.role)) {
      throw new ForbiddenException('Only an admin, supervisor or coach may reopen published minutes.');
    }
    const m = await this.loadOr404(id);
    if (m.minutesStatus !== 'PUBLISHED') throw new BadRequestException('These minutes are not published.');
    await this.prisma.staffMeeting.update({
      where: { id },
      data: { minutesStatus: 'DRAFT', minutesPublishedAt: null },
    });
    await this.audit(id, actor, 'MINUTES_REOPENED', 'Minutes reopened for correction', {});
    return this.getOne(id, actor);
  }

  // ══ Action items (8.7) ═════════════════════════════════════════════════════

  async addActionItem(meetingId: string, dto: ActionItemDto, actor: Actor) {
    const m = await this.loadOr404(meetingId);
    await this.assertMayManage(m, actor);

    const item = await this.prisma.meetingActionItem.create({
      data: {
        meetingId,
        description: dto.description.trim(),
        assignedToId: dto.assignedToId ?? null,
        assignedToName: await this.userName(dto.assignedToId),
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        priority: (dto.priority ?? 'MEDIUM') as never,
        status: (dto.status ?? 'PENDING') as never,
        createdById: actor.id,
        createdByName: await this.userName(actor.id),
      },
    });

    await this.audit(meetingId, actor, 'ACTION_ASSIGNED', dto.description.trim(), {
      actionItemId: item.id,
      assignedToId: dto.assignedToId ?? null,
    });
    if (item.assignedToId) {
      await this.notifyUsers(meetingId, [item.assignedToId], 'MEETING_ACTION_ASSIGNED', 'Action item assigned', (mm) =>
        `${item.description}${item.dueDate ? ` — due ${fmt(item.dueDate)}` : ''} (from ${mm.title}).`,
      ).catch(() => undefined);
    }
    return item;
  }

  /**
   * Update an action item.
   *
   * The organiser may change anything; the ASSIGNEE may move it along their own
   * status track but not reassign it or move its due date — otherwise "assigned
   * to you by Friday" is a suggestion.
   */
  async updateActionItem(itemId: string, dto: UpdateActionItemDto, actor: Actor) {
    const item = await this.prisma.meetingActionItem.findUnique({
      where: { id: itemId },
      include: { meeting: { select: { id: true, organizerId: true, title: true } } },
    });
    if (!item) throw new NotFoundException('Action item not found.');

    const isManager = STAFF_ROLES.includes(actor.role) || item.meeting.organizerId === actor.id;
    const isAssignee = item.assignedToId === actor.id;
    if (!isManager && !isAssignee) throw new ForbiddenException('That action item is not yours.');

    const data: Record<string, unknown> = {};
    if (isManager) {
      if (dto.description !== undefined) data.description = dto.description.trim();
      if (dto.assignedToId !== undefined) {
        data.assignedToId = dto.assignedToId || null;
        data.assignedToName = await this.userName(dto.assignedToId);
      }
      if (dto.dueDate !== undefined) data.dueDate = dto.dueDate ? new Date(dto.dueDate) : null;
      if (dto.priority !== undefined) data.priority = dto.priority;
    }
    if (dto.status !== undefined) {
      data.status = dto.status;
      data.completedAt = dto.status === 'COMPLETED' ? new Date() : null;
    }
    if (dto.completionNote !== undefined) data.completionNote = dto.completionNote.trim() || null;

    const updated = await this.prisma.meetingActionItem.update({ where: { id: itemId }, data });

    await this.audit(item.meeting.id, actor, 'ACTION_UPDATED', updated.description, {
      actionItemId: itemId,
      status: updated.status,
    });

    // Reassignment tells the new owner; a status change tells the organiser.
    if (isManager && dto.assignedToId && dto.assignedToId !== item.assignedToId) {
      await this.notifyUsers(item.meeting.id, [dto.assignedToId], 'MEETING_ACTION_ASSIGNED', 'Action item assigned', () =>
        `${updated.description} (from ${item.meeting.title}).`,
      ).catch(() => undefined);
    }
    if (isAssignee && !isManager && dto.status) {
      await this.notifications
        .createFor(item.meeting.organizerId, {
          type: 'MEETING_ACTION_ASSIGNED',
          title: 'Action item updated',
          body: `${await this.userName(actor.id)} moved "${updated.description}" to ${updated.status}.`,
          link: `/meetings/${item.meeting.id}`,
        })
        .catch(() => undefined);
    }
    return updated;
  }

  async deleteActionItem(itemId: string, actor: Actor) {
    const item = await this.prisma.meetingActionItem.findUnique({
      where: { id: itemId },
      include: { meeting: { select: { id: true, organizerId: true } } },
    });
    if (!item) throw new NotFoundException('Action item not found.');
    if (!STAFF_ROLES.includes(actor.role) && item.meeting.organizerId !== actor.id) {
      throw new ForbiddenException('Only the organiser may remove an action item.');
    }
    await this.prisma.meetingActionItem.delete({ where: { id: itemId } });
    await this.audit(item.meeting.id, actor, 'ACTION_UPDATED', `Removed: ${item.description}`, { actionItemId: itemId });
    return { deleted: true };
  }

  /** Every action item assigned to the caller, across meetings. */
  async myActionItems(actor: Actor, status?: string) {
    const rows = await this.prisma.meetingActionItem.findMany({
      where: {
        assignedToId: actor.id,
        ...(status ? { status: status as never } : { status: { in: ['PENDING', 'IN_PROGRESS'] } }),
      },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
      include: { meeting: { select: { id: true, title: true, startsAt: true, type: true } } },
    });
    const now = new Date();
    return rows.map((r) => ({
      id: r.id,
      description: r.description,
      dueDate: r.dueDate,
      priority: r.priority,
      status: r.status,
      completedAt: r.completedAt,
      completionNote: r.completionNote,
      overdue: !!r.dueDate && r.dueDate < now && r.status !== 'COMPLETED' && r.status !== 'CANCELLED',
      meeting: r.meeting,
    }));
  }

  // ══ Attachments (8.8) ══════════════════════════════════════════════════════

  async addAttachment(meetingId: string, dto: AddAttachmentDto, actor: Actor) {
    const m = await this.loadOr404(meetingId);
    await this.assertMayManage(m, actor);
    const row = await this.prisma.meetingAttachment.create({
      data: {
        meetingId,
        kind: dto.kind ?? 'DOCUMENT',
        title: dto.title.trim(),
        url: dto.url.trim(),
        uploadedById: actor.id,
        uploadedByName: await this.userName(actor.id),
      },
    });
    await this.audit(meetingId, actor, 'ATTACHMENT_ADDED', dto.title.trim(), { attachmentId: row.id });
    return row;
  }

  async deleteAttachment(attachmentId: string, actor: Actor) {
    const row = await this.prisma.meetingAttachment.findUnique({
      where: { id: attachmentId },
      include: { meeting: { select: { id: true, organizerId: true } } },
    });
    if (!row) throw new NotFoundException('Attachment not found.');
    if (!STAFF_ROLES.includes(actor.role) && row.meeting.organizerId !== actor.id) {
      throw new ForbiddenException('Only the organiser may remove an attachment.');
    }
    await this.prisma.meetingAttachment.delete({ where: { id: attachmentId } });
    await this.audit(row.meeting.id, actor, 'ATTACHMENT_REMOVED', row.title, {});
    return { deleted: true };
  }

  // ══ Reading ════════════════════════════════════════════════════════════════

  async list(q: ListMeetingsQuery, actor: Actor) {
    const where: Record<string, unknown> = {};
    if (q.status) where.status = q.status;
    if (q.type) where.type = q.type;
    if (q.organizerId) where.organizerId = q.organizerId;
    if (q.from || q.to) {
      where.startsAt = {
        ...(q.from ? { gte: new Date(q.from) } : {}),
        ...(q.to ? { lte: new Date(q.to) } : {}),
      };
    }
    if (q.search?.trim()) {
      where.OR = [
        { title: { contains: q.search.trim(), mode: 'insensitive' } },
        { description: { contains: q.search.trim(), mode: 'insensitive' } },
      ];
    }

    /*
     * A non-staff caller only ever sees meetings they are in. Enforced with a
     * `participants: { some: … }` clause rather than by filtering the result,
     * so a teacher cannot page past their own invitations.
     */
    if (!STAFF_ROLES.includes(actor.role)) {
      where.participants = { some: { userId: actor.id } };
    } else if (q.participantId) {
      where.participants = { some: { userId: q.participantId } };
    }

    const pageSize = Math.min(Math.max(q.pageSize ?? 50, 1), 200);
    const page = Math.max(q.page ?? 1, 1);

    const [total, rows] = await Promise.all([
      this.prisma.staffMeeting.count({ where }),
      this.prisma.staffMeeting.findMany({
        where,
        /*
         * `id` is the tiebreaker, and it is not decoration. Two meetings at the
         * same start time — routine, since the series generates them on the
         * hour — leave Postgres free to order the tied rows differently between
         * two queries, so OFFSET 1 can hand back the row OFFSET 0 just showed.
         * A unique second key makes the sequence total and the paging stable.
         */
        orderBy: [{ startsAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          participants: { select: { id: true, status: true, userId: true } },
          _count: { select: { actionItems: true, attachments: true } },
        },
      }),
    ]);

    return {
      rows: rows.map((m) => this.shapeRow(m, actor)),
      total,
      page,
      pageSize,
      hasMore: page * pageSize < total,
    };
  }

  /** The caller's own upcoming and recent meetings — every portal's landing list. */
  async mine(actor: Actor) {
    const now = new Date();
    /*
     * Everything still to come, plus a year of history. Unbounded was fine on
     * day one and would not be after three years of biweeklies — and nobody
     * scrolls a personal list back past last year. `list()` with a date range
     * is where older history is looked up.
     */
    const historyFrom = new Date(now);
    historyFrom.setUTCFullYear(historyFrom.getUTCFullYear() - 1);

    const rows = await this.prisma.staffMeeting.findMany({
      where: {
        participants: { some: { userId: actor.id } },
        OR: [{ startsAt: { gte: historyFrom } }, { status: { in: ['SCHEDULED', 'LIVE'] } }],
      },
      orderBy: { startsAt: 'asc' },
      take: 500,
      include: {
        participants: { select: { id: true, status: true, userId: true } },
        _count: { select: { actionItems: true, attachments: true } },
      },
    });
    const shaped = rows.map((m) => this.shapeRow(m, actor));
    return {
      upcoming: shaped.filter((m) => m.status !== 'CANCELLED' && m.status !== 'COMPLETED' && new Date(m.endsAt) >= now),
      past: shaped
        .filter((m) => m.status === 'COMPLETED' || new Date(m.endsAt) < now)
        .sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime()),
      cancelled: shaped.filter((m) => m.status === 'CANCELLED'),
    };
  }

  private shapeRow(m: any, actor: Actor) {
    const mine = m.participants.find((p: any) => p.userId === actor.id);
    return {
      id: m.id,
      title: m.title,
      type: m.type,
      description: m.description,
      startsAt: m.startsAt,
      endsAt: m.endsAt,
      durationMins: m.durationMins,
      platform: m.platform,
      meetingLink: m.meetingLink,
      status: m.status,
      organizerId: m.organizerId,
      organizerName: m.organizerName,
      minutesStatus: m.minutesStatus,
      seriesId: m.seriesId,
      cancelReason: m.cancelReason,
      rescheduledFrom: m.rescheduledFrom,
      participantCount: m.participants.length,
      attendedCount: m.participants.filter((p: any) => p.status === 'PRESENT' || p.status === 'LATE').length,
      actionItemCount: m._count?.actionItems ?? 0,
      attachmentCount: m._count?.attachments ?? 0,
      myStatus: mine?.status ?? null,
      isOrganizer: m.organizerId === actor.id,
    };
  }

  async getOne(id: string, actor: Actor) {
    const m = await this.prisma.staffMeeting.findUnique({
      where: { id },
      include: {
        participants: {
          orderBy: [{ isOrganizer: 'desc' }, { createdAt: 'asc' }],
          include: {
            user: { select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true } },
          },
        },
        actionItems: { orderBy: [{ status: 'asc' }, { dueDate: 'asc' }] },
        attachments: { orderBy: { createdAt: 'desc' } },
        series: { select: { id: true, name: true, intervalWeeks: true } },
      },
    });
    if (!m) throw new NotFoundException('Meeting not found.');

    const isParticipant = m.participants.some((p) => p.userId === actor.id);
    if (!STAFF_ROLES.includes(actor.role) && !isParticipant) {
      // 404, not 403: a non-participant should not learn the meeting exists.
      throw new NotFoundException('Meeting not found.');
    }

    /*
     * Minutes are only visible once published — except to whoever may edit
     * them. A draft is a work in progress and the spec makes publication the
     * moment everybody is told.
     */
    const mayManage = STAFF_ROLES.includes(actor.role) || m.organizerId === actor.id;
    const minutesVisible = m.minutesStatus === 'PUBLISHED' || mayManage;

    const now = new Date();
    return {
      id: m.id,
      title: m.title,
      type: m.type,
      description: m.description,
      startsAt: m.startsAt,
      endsAt: m.endsAt,
      durationMins: m.durationMins,
      timeZone: m.timeZone,
      platform: m.platform,
      meetingLink: m.meetingLink,
      status: m.status,
      organizerId: m.organizerId,
      organizerName: m.organizerName,
      series: m.series,
      startedAt: m.startedAt,
      endedAt: m.endedAt,
      cancelledAt: m.cancelledAt,
      cancelledByName: m.cancelledByName,
      cancelReason: m.cancelReason,
      rescheduledFrom: m.rescheduledFrom,
      rescheduleNote: m.rescheduleNote,

      minutesStatus: m.minutesStatus,
      minutes: minutesVisible
        ? {
            summary: m.summary,
            discussionPoints: m.discussionPoints,
            decisions: m.decisions,
            remarks: m.remarks,
            publishedAt: m.minutesPublishedAt,
            byName: m.minutesByName,
          }
        : null,

      participants: m.participants.map((p) => ({
        id: p.id,
        userId: p.userId,
        name: `${p.user.firstName ?? ''} ${p.user.lastName ?? ''}`.trim() || p.user.email,
        email: p.user.email,
        avatarUrl: p.user.avatarUrl,
        role: p.role,
        isOrganizer: p.isOrganizer,
        isOptional: p.isOptional,
        status: p.status,
        joinedAt: p.joinedAt,
        leftAt: p.leftAt,
        durationMins: p.durationMins,
        lateMinutes: p.lateMinutes,
        excuseReason: p.excuseReason,
        markedByName: p.markedByName,
      })),
      actionItems: m.actionItems.map((a) => ({
        id: a.id,
        description: a.description,
        assignedToId: a.assignedToId,
        assignedToName: a.assignedToName,
        dueDate: a.dueDate,
        priority: a.priority,
        status: a.status,
        completedAt: a.completedAt,
        completionNote: a.completionNote,
        overdue: !!a.dueDate && a.dueDate < now && a.status !== 'COMPLETED' && a.status !== 'CANCELLED',
      })),
      attachments: m.attachments,

      canManage: mayManage,
      canJoin: isParticipant && m.status !== 'CANCELLED' && m.status !== 'COMPLETED',
      myStatus: m.participants.find((p) => p.userId === actor.id)?.status ?? null,
      /*
       * The caller's own id, so the panel can tell which action items are
       * theirs. Without it the UI offered every status button to every viewer
       * and the server answered "that action item is not yours" — the rule was
       * right, the screen was lying about it.
       */
      myUserId: actor.id,
    };
  }

  async auditTrail(id: string, actor: Actor) {
    const m = await this.loadOr404(id);
    if (!STAFF_ROLES.includes(actor.role) && m.organizerId !== actor.id) {
      throw new ForbiddenException('Only staff or the organiser may read the audit trail.');
    }
    return this.prisma.meetingAuditLog.findMany({
      where: { meetingId: id },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  /** Everyone who can be invited, for the participant picker. */
  async invitableUsers(actor: Actor) {
    const roles: Role[] = [Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH, Role.TEACHER];
    const staff = await this.prisma.user.findMany({
      where: { role: { in: roles }, status: 'ACTIVE' },
      orderBy: [{ role: 'asc' }, { firstName: 'asc' }],
      select: { id: true, firstName: true, lastName: true, email: true, role: true, avatarUrl: true },
    });

    // Students are only offered to the roles allowed to invite them, so the
    // picker cannot show a teacher an option the server would then refuse.
    const students = MAY_INVITE_STUDENTS.includes(actor.role)
      ? await this.prisma.studentProfile.findMany({
          where: { user: { status: 'ACTIVE' } },
          orderBy: { studentCode: 'asc' },
          take: 500,
          select: {
            id: true, studentCode: true,
            user: { select: { id: true, firstName: true, lastName: true, email: true } },
          },
        })
      : [];

    const courses = await this.prisma.course.findMany({
      where: { status: { not: 'ARCHIVED' } },
      orderBy: { title: 'asc' },
      select: { id: true, title: true },
    });

    return {
      staff: staff.map((u) => ({
        id: u.id,
        name: `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email,
        email: u.email,
        role: u.role,
        avatarUrl: u.avatarUrl,
      })),
      students: students.map((s) => ({
        id: s.id,
        userId: s.user.id,
        code: s.studentCode,
        name: `${s.user.firstName ?? ''} ${s.user.lastName ?? ''}`.trim() || s.user.email,
      })),
      courses,
      canInviteStudents: MAY_INVITE_STUDENTS.includes(actor.role),
    };
  }

  // ══ Guards + plumbing ══════════════════════════════════════════════════════

  private async loadOr404(id: string) {
    const m = await this.prisma.staffMeeting.findUnique({ where: { id } });
    if (!m) throw new NotFoundException('Meeting not found.');
    return m;
  }

  /** Staff, or the meeting's own organiser. */
  private async assertMayManage(m: { organizerId: string }, actor: Actor) {
    if (STAFF_ROLES.includes(actor.role)) return;
    if (m.organizerId === actor.id) return;
    throw new ForbiddenException('Only the organiser or academy staff may change this meeting.');
  }

  async audit(
    meetingId: string,
    actor: Actor | null,
    action: string,
    description?: string | null,
    meta?: Record<string, unknown>,
  ) {
    await this.prisma.meetingAuditLog
      .create({
        data: {
          meetingId,
          action,
          description: description ?? null,
          meta: (meta ?? {}) as never,
          actorId: actor?.id ?? null,
          actorName: actor ? await this.userName(actor.id) : 'System',
        },
      })
      .catch(() => undefined);
  }

  // ══ Notifications (8.10) ═══════════════════════════════════════════════════

  private async notifySummary(meetingId: string) {
    return this.prisma.staffMeeting.findUnique({
      where: { id: meetingId },
      select: {
        id: true, title: true, startsAt: true, durationMins: true, type: true,
        participants: { select: { userId: true } },
      },
    });
  }

  /** Everyone invited. The matrix sends every meeting event to every role. */
  async notifyParticipants(
    meetingId: string,
    type: string,
    title: string,
    body: (m: { title: string; startsAt: Date; durationMins: number }) => string,
  ) {
    const m = await this.notifySummary(meetingId);
    if (!m) return;
    const userIds = m.participants.map((p) => p.userId);
    if (!userIds.length) return;
    await Promise.all(
      userIds.map((uid) =>
        this.notifications
          .createFor(uid, { type, title, body: body(m), link: `/meetings/${meetingId}` })
          .catch(() => undefined),
      ),
    );
  }

  async notifyUsers(
    meetingId: string,
    userIds: string[],
    type: string,
    title: string,
    body: (m: { title: string; startsAt: Date; durationMins: number }) => string,
  ) {
    const m = await this.notifySummary(meetingId);
    if (!m || !userIds.length) return;
    await Promise.all(
      [...new Set(userIds)].map((uid) =>
        this.notifications
          .createFor(uid, { type, title, body: body(m), link: `/meetings/${meetingId}` })
          .catch(() => undefined),
      ),
    );
  }
}

/** A date a person can read in a notification body. */
function fmt(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleString('en-GB', {
    weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    timeZone: 'UTC',
  });
}
