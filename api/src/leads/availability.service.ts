import { BadRequestException, Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { LeadStatus } from '../generated/prisma/enums';

/*
 * Which 30-minute slots a visitor may book a trial in, for one date.
 *
 * Teachers publish a weekly availability blob ({ Monday: [{from,to}], … }) that
 * an admin approves. For the chosen date we take every approved teacher whose
 * availability covers that weekday, merge the overlapping windows into one set,
 * and cut the result into 30-minute starts. The visitor never sees which
 * teacher a slot came from — only that the academy can teach then.
 *
 * Slots already taken by a scheduled trial are removed, so the same 10:00 is
 * not handed to two visitors.
 */

/** Booking opens tomorrow and closes 30 days out. */
export const MIN_DAYS_AHEAD = 1;
export const MAX_DAYS_AHEAD = 30;

const SLOT_MINUTES = 30;

const WEEKDAYS = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
] as const;

/*
 * Shown when no approved teacher covers the chosen weekday. The academy would
 * rather take the booking and find a teacher than turn a visitor away, so the
 * slot list falls back to standard working hours. `fallback: true` travels with
 * the response, and the lead is flagged, so a coach knows this one still needs
 * a teacher found for it.
 */
const FALLBACK_WINDOW = { from: '10:00', to: '20:00' };

export interface SlotResponse {
  date: string;
  slots: string[];
  /** True when the list came from default hours, not real teacher availability. */
  fallback: boolean;
  timeZone: string;
}

interface Window {
  from: number; // minutes from midnight
  to: number;
}

@Injectable()
export class LeadAvailabilityService {
  constructor(private readonly prisma: PrismaService) {}

  /** "HH:mm" → minutes from midnight. Returns null on anything malformed. */
  private toMinutes(value: unknown): number | null {
    if (typeof value !== 'string') return null;
    const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
    if (!m) return null;
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (h > 23 || min > 59) return null;
    return h * 60 + min;
  }

  private toHHmm(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  /**
   * Validates the requested date against the booking window and returns it
   * pinned to UTC midnight, which is how `preferredDate` is stored.
   */
  parseBookableDate(raw: string): Date {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw ?? '')) {
      throw new BadRequestException('Date must look like YYYY-MM-DD');
    }
    const date = new Date(`${raw}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('That is not a real date');
    }

    const today = new Date();
    const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
    const daysAhead = Math.round((date.getTime() - todayUtc) / 86_400_000);

    if (daysAhead < MIN_DAYS_AHEAD) {
      throw new BadRequestException('Trials start from tomorrow — today cannot be booked');
    }
    if (daysAhead > MAX_DAYS_AHEAD) {
      throw new BadRequestException(`Please pick a date within ${MAX_DAYS_AHEAD} days`);
    }
    return date;
  }

  /** Merges overlapping/touching windows into the fewest possible. */
  private merge(windows: Window[]): Window[] {
    if (!windows.length) return [];
    const sorted = [...windows].sort((a, b) => a.from - b.from);
    const merged: Window[] = [sorted[0]];
    for (const w of sorted.slice(1)) {
      const last = merged[merged.length - 1];
      // `<=` so 09:00-13:00 and 13:00-17:00 become one 09:00-17:00 block
      // rather than two abutting ones that would produce the same slots twice.
      if (w.from <= last.to) last.to = Math.max(last.to, w.to);
      else merged.push({ ...w });
    }
    return merged;
  }

  /** Every 30-minute start that fits inside the merged windows. */
  private toSlots(windows: Window[]): string[] {
    const out: string[] = [];
    for (const w of windows) {
      // Start on the first :00/:30 boundary at or after the window opens, so
      // the list always reads 10:00, 10:30, … even if a teacher entered 09:10.
      const first = Math.ceil(w.from / SLOT_MINUTES) * SLOT_MINUTES;
      // A slot must *end* inside the window: a teacher free until 13:00 cannot
      // start a 30-minute trial at 12:45.
      for (let t = first; t + SLOT_MINUTES <= w.to; t += SLOT_MINUTES) {
        out.push(this.toHHmm(t));
      }
    }
    return [...new Set(out)].sort();
  }

  private readWindows(availability: unknown, weekday: string): Window[] {
    if (!availability || typeof availability !== 'object') return [];
    const day = (availability as Record<string, unknown>)[weekday];
    if (!Array.isArray(day)) return [];

    const windows: Window[] = [];
    for (const entry of day) {
      if (!entry || typeof entry !== 'object') continue;
      const from = this.toMinutes((entry as Record<string, unknown>).from);
      const to = this.toMinutes((entry as Record<string, unknown>).to);
      // A window that ends before it starts is bad data, not an overnight
      // shift — dropping it beats generating slots that run backwards.
      if (from === null || to === null || to <= from) continue;
      windows.push({ from, to });
    }
    return windows;
  }

  /** The bookable slots for one date. */
  async slotsFor(rawDate: string): Promise<SlotResponse> {
    const date = this.parseBookableDate(rawDate);
    const weekday = WEEKDAYS[date.getUTCDay()];

    // A null blob is filtered in `readWindows` rather than in the query — the
    // Json-null filter syntax is a common source of silent mismatches.
    const teachers = await this.prisma.teacherProfile.findMany({
      where: { availabilityApproved: true },
      select: { availability: true },
    });

    const windows = teachers.flatMap((t) => this.readWindows(t.availability, weekday));
    const merged = this.merge(windows);

    let slots = this.toSlots(merged);
    const fallback = slots.length === 0;
    if (fallback) {
      slots = this.toSlots([
        {
          from: this.toMinutes(FALLBACK_WINDOW.from)!,
          to: this.toMinutes(FALLBACK_WINDOW.to)!,
        },
      ]);
    }

    const taken = await this.takenSlots(date);
    return {
      date: rawDate,
      slots: slots.filter((s) => !taken.has(s)),
      fallback,
      timeZone: 'UTC',
    };
  }

  /**
   * Per-teacher availability for one date, for the coach's assignment screen.
   *
   * Unlike `slotsFor`, this does not merge: the coach needs to see *who* is
   * free when, and which of their slots are already committed, to pick the
   * right person. Teachers with no published availability for that weekday are
   * still listed, with an empty slot list, so the coach can see the roster is
   * incomplete rather than wondering where someone went.
   */
  async teacherAvailabilityFor(rawDate: string) {
    const date = this.parseBookableDate(rawDate);
    const weekday = WEEKDAYS[date.getUTCDay()];
    const dayEnd = new Date(date.getTime() + 86_400_000);

    const [teachers, booked] = await Promise.all([
      this.prisma.teacherProfile.findMany({
        where: { availabilityApproved: true },
        select: {
          id: true,
          availability: true,
          subjects: true,
          gender: true,
          user: { select: { firstName: true, lastName: true } },
        },
      }),
      this.prisma.leadTrial.findMany({
        where: {
          scheduledAt: { gte: date, lt: dayEnd },
          status: { in: ['SCHEDULED', 'RESCHEDULED'] },
          teacherId: { not: null },
        },
        select: { teacherId: true, scheduledAt: true, durationMins: true },
      }),
    ]);

    const busy = new Map<string, Set<string>>();
    for (const t of booked) {
      if (!t.teacherId) continue;
      /*
       * Every slot the booking covers, not just the one it starts in. A
       * 60-minute trial at 17:00 leaves the teacher unavailable at 17:30 too,
       * and marking only the start would offer that half hour to somebody else.
       */
      const start = t.scheduledAt.getUTCHours() * 60 + t.scheduledAt.getUTCMinutes();
      const spans = Math.max(1, Math.ceil((t.durationMins || SLOT_MINUTES) / SLOT_MINUTES));
      if (!busy.has(t.teacherId)) busy.set(t.teacherId, new Set());
      for (let i = 0; i < spans; i++) {
        busy.get(t.teacherId)!.add(this.toHHmm(start + i * SLOT_MINUTES));
      }
    }

    return {
      date: rawDate,
      timeZone: 'UTC',
      teachers: teachers
        .map((t) => {
          const slots = this.toSlots(this.merge(this.readWindows(t.availability, weekday)));
          const taken = busy.get(t.id) ?? new Set<string>();
          return {
            teacherId: t.id,
            name: `${t.user.firstName} ${t.user.lastName}`.trim(),
            gender: t.gender,
            subjects: t.subjects,
            freeSlots: slots.filter((s) => !taken.has(s)),
            busySlots: slots.filter((s) => taken.has(s)),
          };
        })
        .sort((a, b) => b.freeSlots.length - a.freeSlots.length),
    };
  }

  /**
   * The teacher to put on a trial at this exact time, or null if nobody fits.
   *
   * A website booking used to create the trial with no teacher at all: the
   * visitor picks from *merged* availability, so the slot does not belong to
   * anyone in particular and choosing was left to the coach. In practice
   * nothing chased it — the trial sat unassigned, appeared on no teacher's
   * screen, and the family still got their reminder for a class nobody was
   * going to run. Picking the obvious candidate up front is better than
   * leaving a hole that only a diligent coach closes; the coach can still
   * change it, and if nobody fits this returns null and the trial is flagged
   * rather than silently mis-assigned.
   *
   * Order of preference, all within "actually free for every slot this trial
   * spans": the gender the family asked for, then the subject they enquired
   * about, then the lightest upcoming workload. Ties break on teacherId so the
   * same inputs always give the same answer.
   */
  async pickTeacherFor(opts: {
    date: string;
    slot: string;
    durationMins?: number;
    subject?: string | null;
    preferredGender?: string | null;
  }): Promise<string | null> {
    const { teachers } = await this.teacherAvailabilityFor(opts.date);
    if (!teachers.length) return null;

    const startMins = this.toMinutes(opts.slot);
    if (startMins === null) return null;
    const spans = Math.max(
      1,
      Math.ceil((opts.durationMins || SLOT_MINUTES) / SLOT_MINUTES),
    );
    const needed: string[] = [];
    for (let i = 0; i < spans; i++) {
      needed.push(this.toHHmm(startMins + i * SLOT_MINUTES));
    }

    const free = teachers.filter((t) =>
      needed.every((s) => t.freeSlots.includes(s)),
    );
    if (!free.length) return null;

    const wantGender =
      opts.preferredGender && opts.preferredGender !== 'Either'
        ? opts.preferredGender.toLowerCase()
        : null;
    const wantSubject = (opts.subject ?? '').trim().toLowerCase();

    // Upcoming committed trials, as the workload tie-break. Counted here rather
    // than reusing freeSlots.length: a teacher who published one hour and is
    // free all of it is not "less busy" than one who published eight.
    const load = await this.prisma.leadTrial.groupBy({
      by: ['teacherId'],
      where: {
        teacherId: { in: free.map((t) => t.teacherId) },
        scheduledAt: { gte: new Date() },
        status: { in: ['SCHEDULED', 'RESCHEDULED'] },
      },
      _count: { _all: true },
    });
    const loadById = new Map(
      load.map((l) => [l.teacherId as string, l._count._all]),
    );

    const scored = free.map((t) => ({
      teacherId: t.teacherId,
      genderMatch: wantGender && (t.gender ?? '').toLowerCase() === wantGender ? 1 : 0,
      subjectMatch:
        wantSubject &&
        (t.subjects ?? []).some((s) => s.toLowerCase().includes(wantSubject))
          ? 1
          : 0,
      load: loadById.get(t.teacherId) ?? 0,
    }));

    scored.sort(
      (a, b) =>
        b.genderMatch - a.genderMatch ||
        b.subjectMatch - a.subjectMatch ||
        a.load - b.load ||
        a.teacherId.localeCompare(b.teacherId),
    );

    return scored[0].teacherId;
  }

  /** Slots on this date already held by a live trial or an unprocessed lead. */
  private async takenSlots(date: Date): Promise<Set<string>> {
    const dayEnd = new Date(date.getTime() + 86_400_000);

    const [trials, leads] = await Promise.all([
      this.prisma.leadTrial.findMany({
        where: {
          scheduledAt: { gte: date, lt: dayEnd },
          status: { in: ['SCHEDULED', 'RESCHEDULED'] },
        },
        select: { scheduledAt: true, durationMins: true },
      }),
      /*
       * A lead's requested slot only holds the room while it is still waiting
       * for a trial. Once a trial exists the trial itself is the booking, and
       * a coach who cancels or moves it is deliberately freeing that time —
       * without this the lead's original request went on blocking the slot for
       * everyone, forever, with nothing in the UI to explain why.
       */
      this.prisma.lead.findMany({
        where: {
          preferredDate: date,
          preferredSlot: { not: null },
          trials: { none: {} },
          status: { notIn: [LeadStatus.REJECTED, LeadStatus.CLOSED, LeadStatus.CONVERTED] },
        },
        select: { preferredSlot: true },
      }),
    ]);

    const taken = new Set<string>();
    for (const t of trials) {
      // Same as teacherAvailabilityFor: a longer trial occupies every slot it
      // runs through, not only the one it begins in.
      const start = t.scheduledAt.getUTCHours() * 60 + t.scheduledAt.getUTCMinutes();
      const spans = Math.max(1, Math.ceil((t.durationMins || SLOT_MINUTES) / SLOT_MINUTES));
      for (let i = 0; i < spans; i++) taken.add(this.toHHmm(start + i * SLOT_MINUTES));
    }
    for (const l of leads) if (l.preferredSlot) taken.add(l.preferredSlot);
    return taken;
  }
}
