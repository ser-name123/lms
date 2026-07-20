import { BadRequestException, Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

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
        select: { teacherId: true, scheduledAt: true },
      }),
    ]);

    const busy = new Map<string, Set<string>>();
    for (const t of booked) {
      if (!t.teacherId) continue;
      const at = this.toHHmm(t.scheduledAt.getUTCHours() * 60 + t.scheduledAt.getUTCMinutes());
      if (!busy.has(t.teacherId)) busy.set(t.teacherId, new Set());
      busy.get(t.teacherId)!.add(at);
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

  /** Slots on this date already held by a live trial or an unprocessed lead. */
  private async takenSlots(date: Date): Promise<Set<string>> {
    const dayEnd = new Date(date.getTime() + 86_400_000);

    const [trials, leads] = await Promise.all([
      this.prisma.leadTrial.findMany({
        where: {
          scheduledAt: { gte: date, lt: dayEnd },
          status: { in: ['SCHEDULED', 'RESCHEDULED'] },
        },
        select: { scheduledAt: true },
      }),
      this.prisma.lead.findMany({
        where: { preferredDate: date, preferredSlot: { not: null } },
        select: { preferredSlot: true },
      }),
    ]);

    const taken = new Set<string>();
    for (const t of trials) {
      taken.add(this.toHHmm(t.scheduledAt.getUTCHours() * 60 + t.scheduledAt.getUTCMinutes()));
    }
    for (const l of leads) if (l.preferredSlot) taken.add(l.preferredSlot);
    return taken;
  }
}
