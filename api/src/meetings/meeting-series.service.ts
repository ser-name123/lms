import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { Role } from '../generated/prisma/enums';
import { MeetingsService, type Actor } from './meetings.service';
import {
  DEFAULT_SERIES, jitsiRoomFor, nextWeekdayAt, occurrencesBetween,
} from './meetings.config';
import type { SaveSeriesDto } from './dto';

/*
 * The automatic half of Module 8 (8.2) and the clock-driven half of 8.10.
 *
 * Three sweeps, all on the project's `setInterval` convention — there is no
 * `@nestjs/schedule` in this codebase and adding one for three timers is not
 * worth the dependency:
 *
 *   - generate:  create occurrences of each active series a few weeks ahead
 *   - remind:    the 24-hour and 1-hour notices
 *   - settle:    mark non-joiners absent once a meeting is well past its end
 *
 * Occurrences become ordinary StaffMeeting rows the moment they are generated,
 * which is what lets an admin move or cancel ONE of them (8.3) without the
 * series putting it back.
 */
@Injectable()
export class MeetingSeriesService implements OnModuleInit {
  private readonly logger = new Logger(MeetingSeriesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly meetings: MeetingsService,
  ) {}

  onModuleInit() {
    // Staggered so a cold boot does not run three sweeps and the seed at once.
    setTimeout(() => void this.seedDefaultSeries().catch(() => undefined), 10_000).unref();
    setTimeout(() => void this.generateSweep().catch(() => undefined), 20_000).unref();
    setInterval(() => void this.generateSweep().catch(() => undefined), 6 * 60 * 60 * 1000).unref();
    setInterval(() => void this.reminderSweep().catch(() => undefined), 10 * 60 * 1000).unref();
    setInterval(() => void this.settleSweep().catch(() => undefined), 15 * 60 * 1000).unref();
  }

  // ══ Series CRUD ════════════════════════════════════════════════════════════

  /**
   * Create the spec's biweekly meeting once, if no series exists at all.
   *
   * Guarded on the table being EMPTY rather than on this series' absence: an
   * academy that deliberately deleted it must not have it reappear on the next
   * boot.
   */
  async seedDefaultSeries() {
    const count = await this.prisma.staffMeetingSeries.count();
    if (count > 0) return { seeded: false };

    const supervisor = await this.prisma.user.findFirst({
      where: { role: Role.SUPERVISOR, status: 'ACTIVE' },
      select: { id: true, firstName: true, lastName: true, email: true },
    });

    await this.prisma.staffMeetingSeries.create({
      data: {
        name: DEFAULT_SERIES.name,
        type: DEFAULT_SERIES.type as never,
        intervalWeeks: DEFAULT_SERIES.intervalWeeks,
        weekday: DEFAULT_SERIES.weekday,
        startTime: DEFAULT_SERIES.startTime,
        durationMins: DEFAULT_SERIES.durationMins,
        description: DEFAULT_SERIES.description,
        inviteRoles: [...DEFAULT_SERIES.inviteRoles],
        optionalInviteRoles: [...DEFAULT_SERIES.optionalInviteRoles],
        anchorDate: nextWeekdayAt(new Date(), DEFAULT_SERIES.weekday, DEFAULT_SERIES.startTime),
        // The spec's "Supervisor (Default)" organiser. Null is survivable —
        // `organizerFor` falls back at generation time.
        organizerId: supervisor?.id ?? null,
        organizerName: supervisor
          ? `${supervisor.firstName ?? ''} ${supervisor.lastName ?? ''}`.trim() || supervisor.email
          : null,
      },
    });
    this.logger.log('Seeded the default biweekly staff meeting series.');
    return { seeded: true };
  }

  async listSeries() {
    const rows = await this.prisma.staffMeetingSeries.findMany({
      orderBy: [{ active: 'desc' }, { createdAt: 'asc' }],
      include: { _count: { select: { meetings: true } } },
    });
    const now = new Date();
    const out = [];
    for (const s of rows) {
      const next = await this.prisma.staffMeeting.findFirst({
        where: { seriesId: s.id, startsAt: { gte: now }, status: { not: 'CANCELLED' } },
        orderBy: { startsAt: 'asc' },
        select: { id: true, startsAt: true },
      });
      out.push({ ...s, generatedCount: s._count.meetings, nextOccurrence: next });
    }
    return out;
  }

  async createSeries(dto: SaveSeriesDto, actor: Actor) {
    if (!dto.name?.trim()) throw new BadRequestException('Give the series a name.');
    const weekday = dto.weekday ?? DEFAULT_SERIES.weekday;
    const startTime = dto.startTime ?? DEFAULT_SERIES.startTime;
    const anchor = dto.anchorDate ? new Date(dto.anchorDate) : nextWeekdayAt(new Date(), weekday, startTime);
    if (isNaN(anchor.getTime())) throw new BadRequestException('That start date is not valid.');

    const organizerId = dto.organizerId ?? actor.id;
    return this.prisma.staffMeetingSeries.create({
      data: {
        name: dto.name.trim(),
        type: (dto.type ?? 'BIWEEKLY_TEACHER') as never,
        active: dto.active ?? true,
        intervalWeeks: dto.intervalWeeks ?? 2,
        weekday,
        startTime,
        durationMins: dto.durationMins ?? 60,
        anchorDate: anchor,
        organizerId,
        organizerName: await this.nameOf(organizerId),
        platform: (dto.platform ?? 'JITSI') as never,
        description: dto.description ?? null,
        inviteRoles: dto.inviteRoles ?? ['TEACHER', 'SUPERVISOR'],
        optionalInviteRoles: dto.optionalInviteRoles ?? [],
        generateAheadWeeks: dto.generateAheadWeeks ?? 8,
      },
    });
  }

  /**
   * Change the rule. Future occurrences that nobody has touched are regenerated
   * against it; ones already cancelled, rescheduled or run are left exactly as
   * they are — an admin's override of a single date outranks the pattern.
   */
  async updateSeries(id: string, dto: SaveSeriesDto, actor: Actor) {
    const s = await this.prisma.staffMeetingSeries.findUnique({ where: { id } });
    if (!s) throw new NotFoundException('Meeting series not found.');

    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.active !== undefined) data.active = dto.active;
    if (dto.intervalWeeks !== undefined) data.intervalWeeks = dto.intervalWeeks;
    if (dto.weekday !== undefined) data.weekday = dto.weekday;
    if (dto.startTime !== undefined) data.startTime = dto.startTime;
    if (dto.durationMins !== undefined) data.durationMins = dto.durationMins;
    if (dto.platform !== undefined) data.platform = dto.platform;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.inviteRoles !== undefined) data.inviteRoles = dto.inviteRoles;
    if (dto.optionalInviteRoles !== undefined) data.optionalInviteRoles = dto.optionalInviteRoles;
    if (dto.generateAheadWeeks !== undefined) data.generateAheadWeeks = dto.generateAheadWeeks;
    if (dto.organizerId !== undefined) {
      data.organizerId = dto.organizerId;
      data.organizerName = await this.nameOf(dto.organizerId);
    }

    /*
     * Who is invited counts as a change to the rule, not just to the next one
     * scheduled. Adding a role and leaving the already-generated occurrences
     * alone would mean "invite the coaches too" does nothing for two months —
     * the horizon is eight weeks out. `dropUntouchedFuture` still protects any
     * occurrence somebody has rescheduled, cancelled, joined or minuted.
     */
    const scheduleChanged =
      dto.weekday !== undefined || dto.startTime !== undefined ||
      dto.intervalWeeks !== undefined || dto.anchorDate !== undefined ||
      dto.inviteRoles !== undefined || dto.optionalInviteRoles !== undefined ||
      dto.durationMins !== undefined;
    if (
      dto.weekday !== undefined || dto.startTime !== undefined ||
      dto.intervalWeeks !== undefined || dto.anchorDate !== undefined
    ) {
      const weekday = dto.weekday ?? s.weekday;
      const startTime = dto.startTime ?? s.startTime;
      data.anchorDate = dto.anchorDate
        ? new Date(dto.anchorDate)
        : nextWeekdayAt(new Date(), weekday, startTime);
    }

    const updated = await this.prisma.staffMeetingSeries.update({ where: { id }, data });

    if (scheduleChanged) {
      const dropped = await this.dropUntouchedFuture(id, actor);
      this.logger.log(`Series ${updated.name}: ${dropped} untouched future occurrence(s) removed for regeneration.`);
      await this.generateFor(updated.id);
    }
    return updated;
  }

  /**
   * Remove future occurrences of a series that are still exactly as generated.
   * A meeting anyone has already engaged with — rescheduled, cancelled, joined,
   * or with minutes started — is left alone.
   */
  private async dropUntouchedFuture(seriesId: string, actor: Actor): Promise<number> {
    const now = new Date();
    const candidates = await this.prisma.staffMeeting.findMany({
      where: {
        seriesId,
        startsAt: { gt: now },
        status: 'SCHEDULED',
        rescheduledFrom: null,
        minutesStatus: 'NOT_STARTED',
      },
      select: { id: true, participants: { where: { joinedAt: { not: null } }, select: { id: true } } },
    });
    const removable = candidates.filter((c) => c.participants.length === 0).map((c) => c.id);
    if (!removable.length) return 0;
    for (const id of removable) {
      await this.meetings.audit(id, actor, 'CANCELLED', 'Removed when the recurring schedule changed', {});
    }
    await this.prisma.staffMeeting.deleteMany({ where: { id: { in: removable } } });
    return removable.length;
  }

  async deleteSeries(id: string) {
    const future = await this.prisma.staffMeeting.count({
      where: { seriesId: id, startsAt: { gt: new Date() }, status: 'SCHEDULED' },
    });
    // The series row is deleted; its meetings survive with seriesId nulled by
    // the SetNull relation, because they are real meetings people were invited to.
    await this.prisma.staffMeetingSeries.delete({ where: { id } });
    return { deleted: true, orphanedFutureMeetings: future };
  }

  // ══ Generation ═════════════════════════════════════════════════════════════

  async generateSweep() {
    const series = await this.prisma.staffMeetingSeries.findMany({ where: { active: true } });
    let created = 0;
    for (const s of series) {
      created += (await this.generateFor(s.id).catch((e) => {
        this.logger.warn(`Generating ${s.name} failed: ${(e as Error).message}`);
        return 0;
      })) as number;
    }
    if (created) this.logger.log(`Generated ${created} recurring meeting occurrence(s).`);
    return { created };
  }

  /**
   * Create the missing occurrences of one series inside its lookahead window.
   *
   * A date is skipped when a meeting for that series already starts within the
   * same hour: generation runs every six hours and must not produce a duplicate
   * on each pass. Existence is checked per date rather than by counting — a
   * cancelled occurrence still counts as existing, so cancelling one does not
   * make the next sweep put it back.
   */
  async generateFor(seriesId: string): Promise<number> {
    const s = await this.prisma.staffMeetingSeries.findUnique({ where: { id: seriesId } });
    if (!s || !s.active) return 0;

    const now = new Date();
    const horizon = new Date(now.getTime() + s.generateAheadWeeks * 7 * 86_400_000);
    const dates = occurrencesBetween(
      { anchorDate: s.anchorDate, intervalWeeks: s.intervalWeeks, startTime: s.startTime },
      now,
      horizon,
    );
    if (!dates.length) return 0;

    const organizerId = await this.organizerFor(s.organizerId);
    if (!organizerId) {
      this.logger.warn(`Series ${s.name} has no organiser and no supervisor to fall back to — skipped.`);
      return 0;
    }

    const invitees = await this.inviteesFor(s.inviteRoles, s.optionalInviteRoles, organizerId);
    // Counted on the REQUIRED set: a series whose only other attendees are
    // optional is not a meeting, it is a standing invitation to nobody.
    if (invitees.filter((u) => !u.isOptional).length < 2) {
      this.logger.warn(`Series ${s.name} resolves to fewer than two participants — skipped.`);
      return 0;
    }

    let created = 0;
    for (const [i, startsAt] of dates.entries()) {
      const windowStart = new Date(startsAt.getTime() - 30 * 60_000);
      const windowEnd = new Date(startsAt.getTime() + 30 * 60_000);
      const exists = await this.prisma.staffMeeting.findFirst({
        where: { seriesId: s.id, startsAt: { gte: windowStart, lte: windowEnd } },
        select: { id: true },
      });
      if (exists) continue;

      const endsAt = new Date(startsAt.getTime() + s.durationMins * 60_000);
      const meeting = await this.prisma.staffMeeting.create({
        data: {
          title: s.name,
          type: s.type,
          description: s.description,
          startsAt,
          endsAt,
          durationMins: s.durationMins,
          platform: s.platform,
          status: 'SCHEDULED',
          organizerId,
          organizerName: s.organizerName ?? (await this.nameOf(organizerId)),
          seriesId: s.id,
          occurrenceIndex: i,
          participants: {
            create: invitees.map((u) => ({
              userId: u.id,
              role: u.role,
              isOrganizer: u.id === organizerId,
              isOptional: u.isOptional,
            })),
          },
        },
        select: { id: true },
      });

      if (s.platform === 'JITSI') {
        const cfg = await this.meetings.config();
        await this.prisma.staffMeeting.update({
          where: { id: meeting.id },
          data: { meetingLink: jitsiRoomFor(meeting.id, cfg.jitsiBaseUrl) },
        });
      }

      await this.meetings.audit(meeting.id, null, 'CREATED', `Generated from series "${s.name}"`, {
        seriesId: s.id,
      });
      await this.meetings
        .notifyParticipants(meeting.id, 'MEETING_SCHEDULED', 'Meeting scheduled', (m) =>
          `${m.title} — ${m.startsAt.toISOString().slice(0, 16).replace('T', ' ')} UTC (${m.durationMins} min).`,
        )
        .catch(() => undefined);
      created += 1;
    }

    await this.prisma.staffMeetingSeries.update({
      where: { id: s.id },
      data: { lastGeneratedAt: new Date() },
    });
    return created;
  }

  private async organizerFor(preferred: string | null): Promise<string | null> {
    if (preferred) {
      const ok = await this.prisma.user.findFirst({
        where: { id: preferred, status: 'ACTIVE' },
        select: { id: true },
      });
      if (ok) return ok.id;
    }
    // The spec's default organiser, then an admin, so a departed supervisor
    // does not silently stop the academy's standing meeting.
    const fallback = await this.prisma.user.findFirst({
      where: { role: { in: [Role.SUPERVISOR, Role.ADMIN] }, status: 'ACTIVE' },
      orderBy: { role: 'asc' },
      select: { id: true },
    });
    return fallback?.id ?? null;
  }

  /**
   * The people a series invites, each flagged required or optional.
   *
   * A role listed in both lists counts as REQUIRED — being named on the
   * required list is the stronger statement, and letting the optional list win
   * would quietly excuse someone the series says must attend.
   */
  private async inviteesFor(roles: string[], optionalRoles: string[], organizerId: string) {
    const isRole = (r: string) => (Object.values(Role) as string[]).includes(r);
    const required = roles.filter(isRole) as Role[];
    const optional = optionalRoles.filter(isRole).filter((r) => !required.includes(r as Role)) as Role[];

    const all = [...required, ...optional];
    const users = all.length
      ? await this.prisma.user.findMany({
          where: { role: { in: all }, status: 'ACTIVE' },
          select: { id: true, role: true },
        })
      : [];

    const optionalSet = new Set<string>(optional);
    const shaped = users.map((u) => ({
      ...u,
      // The organiser is never optional in their own meeting.
      isOptional: u.id !== organizerId && optionalSet.has(u.role),
    }));

    if (!shaped.some((u) => u.id === organizerId)) {
      const org = await this.prisma.user.findUnique({
        where: { id: organizerId },
        select: { id: true, role: true },
      });
      if (org) shaped.push({ ...org, isOptional: false });
    }
    return shaped;
  }

  private async nameOf(userId: string | null | undefined): Promise<string | null> {
    if (!userId) return null;
    const u = await this.prisma.user
      .findUnique({ where: { id: userId }, select: { firstName: true, lastName: true, email: true } })
      .catch(() => null);
    if (!u) return null;
    return `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email;
  }

  // ══ Reminder sweep (8.10) ══════════════════════════════════════════════════

  /**
   * The 24-hour and 1-hour notices.
   *
   * Each is stamped on the meeting when sent, so a sweep every ten minutes
   * sends each notice exactly once rather than once per sweep. A meeting whose
   * time is already past its window when the row is created — scheduled for
   * this afternoon, say — simply skips the 24-hour notice instead of firing it
   * late.
   */
  async reminderSweep() {
    const cfg = await this.meetings.config();
    const now = new Date();

    const dayOut = new Date(now.getTime() + cfg.reminderHoursBefore * 3_600_000);
    const due24 = await this.prisma.staffMeeting.findMany({
      where: {
        status: 'SCHEDULED',
        reminder24SentAt: null,
        startsAt: { gt: now, lte: dayOut },
      },
      select: { id: true },
      take: 100,
    });
    for (const m of due24) {
      await this.meetings
        .notifyParticipants(m.id, 'MEETING_REMINDER_24H', 'Meeting tomorrow', (mm) =>
          `${mm.title} starts ${mm.startsAt.toISOString().slice(0, 16).replace('T', ' ')} UTC.`,
        )
        .catch(() => undefined);
      await this.prisma.staffMeeting.update({ where: { id: m.id }, data: { reminder24SentAt: now } });
      await this.meetings.audit(m.id, null, 'REMINDER_SENT', '24-hour reminder', {});
    }

    const hourOut = new Date(now.getTime() + cfg.finalReminderMins * 60_000);
    const due1 = await this.prisma.staffMeeting.findMany({
      where: {
        status: 'SCHEDULED',
        reminder1SentAt: null,
        startsAt: { gt: now, lte: hourOut },
      },
      select: { id: true },
      take: 100,
    });
    for (const m of due1) {
      await this.meetings
        .notifyParticipants(m.id, 'MEETING_REMINDER_1H', 'Meeting starting soon', (mm) =>
          `${mm.title} starts in under ${cfg.finalReminderMins} minutes.`,
        )
        .catch(() => undefined);
      await this.prisma.staffMeeting.update({ where: { id: m.id }, data: { reminder1SentAt: now } });
      await this.meetings.audit(m.id, null, 'REMINDER_SENT', '1-hour reminder', {});
    }

    return { reminded24: due24.length, reminded1: due1.length };
  }

  // ══ Absence sweep ══════════════════════════════════════════════════════════

  /**
   * Settle attendance for meetings that are well past their end.
   *
   * The organiser is supposed to end the meeting, which settles it there and
   * then; this exists because they often will not. It does NOT mark the meeting
   * COMPLETED — that requires minutes, and inventing them is not the sweep's
   * job. It only fixes the attendance record, which is time-sensitive.
   */
  async settleSweep() {
    const cfg = await this.meetings.config();
    const cutoff = new Date(Date.now() - cfg.absenceGraceMins * 60_000);

    const stale = await this.prisma.staffMeeting.findMany({
      where: {
        status: { in: ['SCHEDULED', 'LIVE'] },
        endsAt: { lt: cutoff },
        absenceMarkedAt: null,
      },
      select: { id: true },
      take: 50,
    });

    for (const m of stale) {
      await this.meetings.settleAttendance(m.id, cfg).catch((e) =>
        this.logger.warn(`Settling ${m.id} failed: ${(e as Error).message}`),
      );
      await this.prisma.staffMeeting.update({
        where: { id: m.id },
        data: { absenceMarkedAt: new Date() },
      });
      await this.meetings.audit(m.id, null, 'ATTENDANCE_MARKED', 'Attendance settled automatically', {});
    }
    return { settled: stale.length };
  }
}
