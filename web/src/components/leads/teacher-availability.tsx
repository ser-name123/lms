"use client";

/*
 * Who is free on a given date, teacher by teacher.
 *
 * The public booking form shows *merged* availability — the visitor only needs
 * to know the academy can teach at 10:30. The coach needs the opposite: which
 * particular teacher is free then, and which of their slots are already taken,
 * so the assignment is an informed choice rather than a guess.
 *
 * Read live from the server every time the date changes. Caching it would mean
 * assigning a teacher to a slot somebody else filled a minute ago.
 */

import { useCallback, useEffect, useState } from "react";
import { CalendarSearch, Loader2, UserCheck } from "lucide-react";

import { ApiError, fetchTeacherAvailability, type TrialDayAvailability } from "@/lib/api";

/** Booking window mirrors the public form: tomorrow to +30 days. */
function window30() {
  const day = 86_400_000;
  const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
  const todayUtc = Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
  return { min: iso(todayUtc + day), max: iso(todayUtc + 30 * day) };
}

export function TeacherAvailabilityPanel({
  defaultDate,
  onPick,
}: {
  defaultDate?: string | null;
  /** Called when the coach clicks a free slot, so the parent can prefill a form. */
  onPick?: (teacherId: string, date: string, slot: string) => void;
}) {
  const { min, max } = window30();
  const [date, setDate] = useState(defaultDate ?? min);
  const [data, setData] = useState<TrialDayAvailability | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (forDate: string) => {
    setLoading(true);
    setError("");
    setData(null);
    try {
      setData(await fetchTeacherAvailability(forDate));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load availability.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (date) void load(date);
  }, [date, load]);

  return (
    <div className="rounded-2xl border border-hairline bg-surface p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <CalendarSearch className="size-4 text-accent" aria-hidden />
        <h3 className="text-sm font-bold text-ink">Teacher availability</h3>
        <input
          type="date"
          value={date}
          min={min}
          max={max}
          onChange={(e) => setDate(e.target.value)}
          aria-label="Availability date"
          className="ml-auto h-9 rounded-xl border border-hairline bg-surface px-3 text-xs font-bold text-ink focus:border-accent focus:outline-none"
        />
      </div>

      {error && (
        <p className="rounded-xl bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-500">
          {error}
        </p>
      )}

      {loading ? (
        <div className="grid place-items-center py-8">
          <Loader2 className="size-5 animate-spin text-ink-3" />
        </div>
      ) : data && data.teachers.length === 0 ? (
        <p className="rounded-xl border border-dashed border-hairline px-3 py-6 text-center text-xs text-ink-3">
          No teacher has published approved availability yet, so nobody can be shown as free.
        </p>
      ) : (
        <ul className="space-y-2.5">
          {data?.teachers.map((t) => (
            <li key={t.teacherId} className="rounded-xl border border-hairline p-3">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <UserCheck className="size-3.5 text-ink-3" aria-hidden />
                <span className="text-xs font-bold text-ink">{t.name}</span>
                {t.gender && <span className="text-[11px] text-ink-3">· {t.gender}</span>}
                {t.subjects?.length > 0 && (
                  <span className="text-[11px] text-ink-3">· {t.subjects.join(", ")}</span>
                )}
                <span className="ml-auto text-[11px] font-bold text-ink-3">
                  {t.freeSlots.length} free
                </span>
              </div>

              {t.freeSlots.length === 0 && t.busySlots.length === 0 ? (
                <p className="text-[11px] text-ink-3">Not available on this day.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {t.freeSlots.map((s) => (
                    <button
                      key={`free-${s}`}
                      type="button"
                      onClick={() => onPick?.(t.teacherId, data.date, s)}
                      className="h-7 rounded-lg border border-hairline px-2 text-[11px] font-bold text-ink-2 hover:border-accent hover:text-accent"
                    >
                      {s}
                    </button>
                  ))}
                  {/* Shown, not hidden: a coach needs to see a teacher is busy
                      at 11:00 rather than assume they never work then. */}
                  {t.busySlots.map((s) => (
                    <span
                      key={`busy-${s}`}
                      title="Already booked"
                      className="h-7 rounded-lg border border-hairline px-2 text-[11px] font-bold leading-7 text-ink-3/50 line-through"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {data && (
        <p className="mt-3 text-[11px] text-ink-3">
          Times in {data.timeZone}. Struck-through slots are already booked.
        </p>
      )}
    </div>
  );
}
