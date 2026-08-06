/*
 * The pure logic of Module 8: when a recurring meeting falls, and what a join
 * time makes somebody.
 *
 * Both decide something a person will argue about — "the meeting was on the
 * wrong Saturday", "I was there and it says I was absent" — so the boundaries
 * are pinned here rather than discovered in production. Every date is explicit;
 * nothing reads the clock.
 */

import {
  DEFAULT_MEETING_CONFIG, DEFAULT_SERIES, attendanceStatusFor, jitsiRoomFor,
  nextWeekdayAt, occurrencesBetween, parseTime, round2,
} from './meetings.config';

const utc = (s: string) => new Date(`${s}Z`);
const day = (d: Date) => d.toISOString().slice(0, 10);
const stamp = (d: Date) => d.toISOString().slice(0, 16).replace('T', ' ');

describe('parseTime', () => {
  it('reads a 24-hour time', () => {
    expect(parseTime('18:00')).toEqual([18, 0]);
    expect(parseTime('09:30')).toEqual([9, 30]);
    expect(parseTime('00:00')).toEqual([0, 0]);
    expect(parseTime('23:59')).toEqual([23, 59]);
  });

  /*
   * A bad value falls back to 18:00 rather than throwing. This runs inside a
   * background sweep: throwing would stop the academy's standing meeting being
   * generated at all, which is far worse than one at the wrong hour.
   */
  it('falls back to 18:00 rather than throwing', () => {
    expect(parseTime('nonsense')).toEqual([18, 0]);
    expect(parseTime('25:00')).toEqual([18, 0]);
    expect(parseTime('12:60')).toEqual([18, 0]);
    expect(parseTime('')).toEqual([18, 0]);
    expect(parseTime(null)).toEqual([18, 0]);
    expect(parseTime(undefined)).toEqual([18, 0]);
  });

  it('tolerates a single-digit hour and surrounding space', () => {
    expect(parseTime(' 9:05 ')).toEqual([9, 5]);
  });
});

describe('occurrencesBetween', () => {
  // "Every alternate Saturday at 6pm", the spec's example.
  const biweekly = { anchorDate: utc('2026-01-03T00:00:00'), intervalWeeks: 2, startTime: '18:00' };

  it('steps in whole interval blocks from the anchor', () => {
    const dates = occurrencesBetween(biweekly, utc('2026-01-01T00:00:00'), utc('2026-02-28T23:59:00'));
    expect(dates.map(day)).toEqual(['2026-01-03', '2026-01-17', '2026-01-31', '2026-02-14', '2026-02-28']);
  });

  /*
   * The window bound is a moment, not a date. A meeting at 18:00 on the last
   * day is outside a window that closes at that day's midnight — asserted so
   * nobody "fixes" this into an off-by-one-day generator later.
   */
  it('excludes an occurrence that falls after the window closes', () => {
    const dates = occurrencesBetween(biweekly, utc('2026-01-01T00:00:00'), utc('2026-02-28T00:00:00'));
    expect(dates.map(day)).toEqual(['2026-01-03', '2026-01-17', '2026-01-31', '2026-02-14']);
  });

  it('puts every occurrence at the configured time', () => {
    const dates = occurrencesBetween(biweekly, utc('2026-01-01T00:00:00'), utc('2026-01-20T00:00:00'));
    expect(dates.map(stamp)).toEqual(['2026-01-03 18:00', '2026-01-17 18:00']);
  });

  it('keeps every occurrence on the anchor weekday', () => {
    const dates = occurrencesBetween(biweekly, utc('2026-01-01T00:00:00'), utc('2026-06-01T00:00:00'));
    for (const d of dates) expect(d.getUTCDay()).toBe(6);
  });

  /*
   * THE property that matters. If a sweep is missed for a month, the next run
   * must land on the same alternation — computing "two weeks from today"
   * instead of "from the anchor" silently shifts a biweekly meeting onto the
   * wrong Saturdays for ever.
   */
  it('does not drift when the generator misses a run', () => {
    const early = occurrencesBetween(biweekly, utc('2026-01-01T00:00:00'), utc('2026-06-01T00:00:00'));
    const late = occurrencesBetween(biweekly, utc('2026-03-20T00:00:00'), utc('2026-06-01T00:00:00'));
    // Every date the late run produces was already in the early run's list.
    for (const d of late) expect(early.map(stamp)).toContain(stamp(d));
  });

  it('skips forward efficiently from an anchor years in the past', () => {
    const old = { anchorDate: utc('2020-01-04T00:00:00'), intervalWeeks: 2, startTime: '18:00' };
    const dates = occurrencesBetween(old, utc('2026-01-01T00:00:00'), utc('2026-02-01T00:00:00'));
    expect(dates.length).toBeGreaterThan(0);
    for (const d of dates) expect(d.getUTCDay()).toBe(6);
  });

  it('is empty when the window closes before the anchor', () => {
    expect(occurrencesBetween(biweekly, utc('2025-01-01T00:00:00'), utc('2025-06-01T00:00:00'))).toEqual([]);
  });

  it('handles weekly and monthly-ish intervals too', () => {
    const weekly = { anchorDate: utc('2026-01-03T00:00:00'), intervalWeeks: 1, startTime: '10:00' };
    expect(occurrencesBetween(weekly, utc('2026-01-01T00:00:00'), utc('2026-01-25T00:00:00')).map(day))
      .toEqual(['2026-01-03', '2026-01-10', '2026-01-17', '2026-01-24']);
    const fourWeekly = { anchorDate: utc('2026-01-03T00:00:00'), intervalWeeks: 4, startTime: '10:00' };
    expect(occurrencesBetween(fourWeekly, utc('2026-01-01T00:00:00'), utc('2026-03-01T00:00:00')).map(day))
      .toEqual(['2026-01-03', '2026-01-31', '2026-02-28']);
  });

  // A corrupt interval must not spin the sweep for ever.
  it('respects the limit', () => {
    const weekly = { anchorDate: utc('2026-01-03T00:00:00'), intervalWeeks: 1, startTime: '10:00' };
    expect(occurrencesBetween(weekly, utc('2026-01-01T00:00:00'), utc('2030-01-01T00:00:00'), 5)).toHaveLength(5);
  });
});

describe('nextWeekdayAt', () => {
  it('finds the next given weekday', () => {
    // 2026-01-01 is a Thursday; the next Saturday is the 3rd.
    expect(day(nextWeekdayAt(utc('2026-01-01T00:00:00'), 6, '18:00'))).toBe('2026-01-03');
    expect(day(nextWeekdayAt(utc('2026-01-01T00:00:00'), 1, '09:00'))).toBe('2026-01-05');
  });

  it('sets the configured time', () => {
    expect(stamp(nextWeekdayAt(utc('2026-01-01T00:00:00'), 6, '18:30'))).toBe('2026-01-03 18:30');
  });

  /*
   * Asking on the day itself, after the hour has passed, must give NEXT week —
   * otherwise seeding a series on Saturday evening creates an occurrence that
   * is already in the past and immediately reads as missed.
   */
  it('skips to next week when today’s time has already gone', () => {
    expect(day(nextWeekdayAt(utc('2026-01-03T20:00:00'), 6, '18:00'))).toBe('2026-01-10');
  });

  it('takes today when the time is still ahead', () => {
    expect(day(nextWeekdayAt(utc('2026-01-03T09:00:00'), 6, '18:00'))).toBe('2026-01-03');
  });
});

describe('attendanceStatusFor', () => {
  const meeting = {
    startsAt: utc('2026-03-07T18:00:00'),
    endsAt: utc('2026-03-07T19:00:00'),
    durationMins: 60,
  };
  const cfg = { lateAfterMins: 10, minAttendancePct: 50 };

  it('is ABSENT when they never joined', () => {
    expect(attendanceStatusFor(null, null, meeting, cfg)).toEqual({
      status: 'ABSENT', durationMins: 0, lateMinutes: 0,
    });
    expect(attendanceStatusFor(undefined, undefined, meeting, cfg).status).toBe('ABSENT');
  });

  it('is PRESENT for someone on time who stays', () => {
    const r = attendanceStatusFor(utc('2026-03-07T18:00:00'), utc('2026-03-07T19:00:00'), meeting, cfg);
    expect(r).toEqual({ status: 'PRESENT', durationMins: 60, lateMinutes: 0 });
  });

  it('is PRESENT for someone slightly late but inside the grace', () => {
    const r = attendanceStatusFor(utc('2026-03-07T18:09:00'), utc('2026-03-07T19:00:00'), meeting, cfg);
    expect(r.status).toBe('PRESENT');
    expect(r.lateMinutes).toBe(9);
  });

  it('places the lateness boundary exactly where the setting says', () => {
    expect(attendanceStatusFor(utc('2026-03-07T18:10:00'), utc('2026-03-07T19:00:00'), meeting, cfg).status).toBe('PRESENT');
    expect(attendanceStatusFor(utc('2026-03-07T18:11:00'), utc('2026-03-07T19:00:00'), meeting, cfg).status).toBe('LATE');
  });

  /*
   * Turning up for ninety seconds of an hour is not attendance. It is LATE and
   * not ABSENT on purpose: ABSENT should mean "never came", and someone who
   * appeared briefly did come.
   */
  it('is LATE when they were barely there, even if they arrived on time', () => {
    const r = attendanceStatusFor(utc('2026-03-07T18:00:00'), utc('2026-03-07T18:05:00'), meeting, cfg);
    expect(r.status).toBe('LATE');
    expect(r.durationMins).toBe(5);
    expect(r.lateMinutes).toBe(0);
  });

  it('places the minimum-attendance boundary where the setting says', () => {
    // 30 of 60 minutes is exactly 50% — enough.
    expect(attendanceStatusFor(utc('2026-03-07T18:00:00'), utc('2026-03-07T18:30:00'), meeting, cfg).status).toBe('PRESENT');
    expect(attendanceStatusFor(utc('2026-03-07T18:00:00'), utc('2026-03-07T18:29:00'), meeting, cfg).status).toBe('LATE');
  });

  it('counts someone still joined as staying to the end', () => {
    const r = attendanceStatusFor(utc('2026-03-07T18:00:00'), null, meeting, cfg);
    expect(r.status).toBe('PRESENT');
    expect(r.durationMins).toBe(60);
  });

  it('never reports a negative duration for a clock that ran backwards', () => {
    const r = attendanceStatusFor(utc('2026-03-07T18:30:00'), utc('2026-03-07T18:00:00'), meeting, cfg);
    expect(r.durationMins).toBe(0);
    expect(r.status).toBe('LATE');
  });

  it('never reports negative lateness for an early joiner', () => {
    const r = attendanceStatusFor(utc('2026-03-07T17:45:00'), utc('2026-03-07T19:00:00'), meeting, cfg);
    expect(r.lateMinutes).toBe(0);
    expect(r.status).toBe('PRESENT');
  });

  it('survives a zero-length meeting without dividing by zero', () => {
    const zero = { startsAt: utc('2026-03-07T18:00:00'), endsAt: utc('2026-03-07T18:00:00'), durationMins: 0 };
    const r = attendanceStatusFor(utc('2026-03-07T18:00:00'), utc('2026-03-07T18:00:00'), zero, cfg);
    expect(Number.isFinite(r.durationMins)).toBe(true);
    expect(['PRESENT', 'LATE']).toContain(r.status);
  });

  // EXCUSED is a human decision and is never derived from the clock.
  it('never returns EXCUSED', () => {
    const cases: [Date | null, Date | null][] = [
      [null, null],
      [utc('2026-03-07T18:00:00'), utc('2026-03-07T19:00:00')],
      [utc('2026-03-07T18:59:00'), null],
    ];
    for (const [j, l] of cases) {
      expect(attendanceStatusFor(j, l, meeting, cfg).status).not.toBe('EXCUSED');
    }
  });

  it('honours a stricter configuration', () => {
    const strict = { lateAfterMins: 0, minAttendancePct: 90 };
    expect(attendanceStatusFor(utc('2026-03-07T18:01:00'), utc('2026-03-07T19:00:00'), meeting, strict).status).toBe('LATE');
    expect(attendanceStatusFor(utc('2026-03-07T18:00:00'), utc('2026-03-07T18:50:00'), meeting, strict).status).toBe('LATE');
    expect(attendanceStatusFor(utc('2026-03-07T18:00:00'), utc('2026-03-07T19:00:00'), meeting, strict).status).toBe('PRESENT');
  });
});

describe('jitsiRoomFor', () => {
  const id = '3f2b1c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d';

  /*
   * The room name comes from the id, not the title. A room called
   * "Biweekly Teacher Meeting" on a public Jitsi instance is guessable, and
   * anyone who guesses it walks into the academy's staff meeting.
   */
  it('derives the room from the id, not anything guessable', () => {
    const url = jitsiRoomFor(id, 'https://meet.jit.si');
    expect(url).toBe('https://meet.jit.si/alfurqan-3f2b1c4d5e6f7a8b9c0d1e2f3a4b5c6d');
    expect(url).not.toMatch(/meeting|staff|biweekly/i);
  });

  it('is stable for the same meeting and different for another', () => {
    expect(jitsiRoomFor(id, 'https://meet.jit.si')).toBe(jitsiRoomFor(id, 'https://meet.jit.si'));
    expect(jitsiRoomFor(id, 'https://meet.jit.si')).not.toBe(
      jitsiRoomFor('00000000-0000-0000-0000-000000000000', 'https://meet.jit.si'),
    );
  });

  it('does not double the slash on a base URL with a trailing one', () => {
    expect(jitsiRoomFor(id, 'https://meet.example.com/')).not.toContain('//alfurqan');
    expect(jitsiRoomFor(id, 'https://meet.example.com///')).toBe(
      'https://meet.example.com/alfurqan-3f2b1c4d5e6f7a8b9c0d1e2f3a4b5c6d',
    );
  });
});

describe('the shipped defaults', () => {
  it('match the spec: alternate Saturdays, 6pm, 60 minutes', () => {
    expect(DEFAULT_SERIES.intervalWeeks).toBe(2);
    expect(DEFAULT_SERIES.weekday).toBe(6);
    expect(DEFAULT_SERIES.startTime).toBe('18:00');
    expect(DEFAULT_SERIES.durationMins).toBe(60);
    expect([...DEFAULT_SERIES.inviteRoles]).toEqual(['TEACHER', 'SUPERVISOR']);
  });

  it('send both reminders the spec asks for', () => {
    expect(DEFAULT_MEETING_CONFIG.reminderHoursBefore).toBe(24);
    expect(DEFAULT_MEETING_CONFIG.finalReminderMins).toBe(60);
  });

  it('make minutes mandatory for a completed meeting', () => {
    expect(DEFAULT_MEETING_CONFIG.requireMinutesToComplete).toBe(true);
  });

  it('seed an anchor that is in the future, not in the past', () => {
    const anchor = nextWeekdayAt(new Date(), DEFAULT_SERIES.weekday, DEFAULT_SERIES.startTime);
    expect(anchor.getTime()).toBeGreaterThan(Date.now());
    expect(anchor.getUTCDay()).toBe(DEFAULT_SERIES.weekday);
  });
});

describe('round2', () => {
  it('rounds report percentages to two places', () => {
    expect(round2(66.666)).toBe(66.67);
    expect(round2(0.1 * 3)).toBe(0.3);
    expect(round2(100)).toBe(100);
  });
});
