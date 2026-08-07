"use client";

import { useEffect, useState } from "react";
import { Loader2, Save, Plus, X, CalendarClock } from "lucide-react";
import Swal from "sweetalert2";

import Link from "next/link";

import { Topbar } from "@/components/layout/topbar";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  fetchMyAvailability, fetchMyLeaves, submitMyAvailability,
  type LeaveRequest, type TeacherAvailability,
} from "@/lib/api";

const swalBg = () => typeof document !== "undefined" && document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff";
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const HOURS = Array.from({ length: 49 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`);

export default function TeacherAvailabilityPage() {
  const [av, setAv] = useState<TeacherAvailability>({});
  const [approved, setApproved] = useState(false);
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  /*
   * §9.6 — "remove the unavailable dates from the teacher's availability
   * calendar".
   *
   * The stored pattern is weekly and dateless, so it cannot express "except
   * next Tuesday"; the block lives on the approved leave and every scheduler
   * consults it. That works server-side but left the teacher looking at a grid
   * claiming they teach Tuesdays while the system had already stopped booking
   * them — so the dated part is shown here explicitly.
   */
  const [away, setAway] = useState<LeaveRequest[]>([]);

  useEffect(() => {
    fetchMyAvailability().then((r) => { setAv(r.availability || {}); setApproved(r.availabilityApproved); setSubmittedAt(r.availabilitySubmittedAt); })
      .catch(() => undefined).finally(() => setLoading(false));
    // Current and future approved windows only — a leave that finished is not
    // an exception to the pattern any more.
    const todayStart = new Date(new Date().toDateString()).getTime();
    fetchMyLeaves()
      .then((r) => setAway(
        (r.items || [])
          .filter((l) => l.status === "APPROVED" && new Date(l.endDate).getTime() >= todayStart)
          .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()),
      ))
      .catch(() => setAway([]));
  }, []);

  const addRange = (day: string) => setAv((a) => ({ ...a, [day]: [...(a[day] || []), { from: "09:00", to: "13:00" }] }));
  const removeRange = (day: string, i: number) => setAv((a) => ({ ...a, [day]: (a[day] || []).filter((_, x) => x !== i) }));
  const setField = (day: string, i: number, k: "from" | "to", v: string) => setAv((a) => ({ ...a, [day]: (a[day] || []).map((r, x) => x === i ? { ...r, [k]: v } : r) }));

  const save = async () => {
    setBusy(true);
    try {
      await submitMyAvailability(av);
      setApproved(false);
      Swal.fire({ icon: "success", title: "Submitted for approval", text: "Your academic coach will approve the change.", background: swalBg() });
    } catch (e) { Swal.fire({ title: "Failed", text: e instanceof Error ? e.message : "Failed", icon: "error", background: swalBg() }); }
    finally { setBusy(false); }
  };

  return (
    <>
      <Topbar title="My Availability" subtitle="Set your weekly teaching availability (admin approval required)" />
      <div className="animate-fade-up space-y-5 p-4 sm:p-6">
        {loading ? (
          <div className="flex items-center gap-2 py-20 text-sm font-bold text-ink-3"><Loader2 className="size-5 animate-spin text-accent" /> Loading…</div>
        ) : (
          <Card className="border border-hairline bg-surface shadow-sm"><CardBody className="p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-ink">Weekly Availability</h3>
                <p className="text-[11px] text-ink-3">{submittedAt ? `Last submitted ${new Date(submittedAt).toLocaleString()}` : "Not set yet"}</p>
              </div>
              <Badge tone={approved ? "good" : "warning"}>{approved ? "Approved" : "Pending approval"}</Badge>
            </div>

            {away.length > 0 && (
              <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
                <div className="flex items-center gap-2">
                  <CalendarClock className="size-4 shrink-0 text-amber-500" />
                  <h4 className="text-xs font-bold text-ink">
                    Approved unavailability — the hours below do not apply on these dates
                  </h4>
                </div>
                <ul className="mt-2 space-y-1">
                  {away.map((l) => {
                    const from = new Date(l.startDate);
                    const to = new Date(l.endDate);
                    const live = Date.now() >= new Date(from.toDateString()).getTime();
                    return (
                      <li key={l.id} className="flex flex-wrap items-center gap-2 text-[11px] text-ink-2">
                        <span className="font-bold text-ink">
                          {from.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })}
                          {" – "}
                          {to.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })}
                        </span>
                        <Badge tone={live ? "warning" : "neutral"}>{live ? "In effect" : "Upcoming"}</Badge>
                        <span>{l.totalDays} day{l.totalDays === 1 ? "" : "s"}</span>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-2 text-[11px] text-ink-3">
                  You will not be offered new classes on these dates, and your weekly hours are
                  restored automatically when you return.{" "}
                  <Link href="/teacher/leave" className="font-bold text-accent hover:underline">
                    Manage my unavailability
                  </Link>
                </p>
              </div>
            )}

            <div className="space-y-2">
              {DAYS.map((day) => (
                <div key={day} className="flex flex-wrap items-start gap-2 rounded-xl border border-hairline bg-surface-2/30 p-3">
                  <span className="w-24 pt-1.5 text-xs font-bold text-ink">{day}</span>
                  <div className="flex flex-1 flex-wrap gap-2">
                    {(av[day] || []).map((r, i) => (
                      <div key={i} className="flex items-center gap-1 rounded-lg border border-hairline bg-surface px-2 py-1">
                        <select value={r.from} onChange={(e) => setField(day, i, "from", e.target.value)} className="bg-transparent text-[11px] font-bold text-ink focus:outline-none">{HOURS.map((h) => <option key={h}>{h}</option>)}</select>
                        <span className="text-ink-3">–</span>
                        <select value={r.to} onChange={(e) => setField(day, i, "to", e.target.value)} className="bg-transparent text-[11px] font-bold text-ink focus:outline-none">{HOURS.map((h) => <option key={h}>{h}</option>)}</select>
                        <button onClick={() => removeRange(day, i)} className="text-ink-3 hover:text-rose-500"><X className="size-3.5" /></button>
                      </div>
                    ))}
                    <button onClick={() => addRange(day)} className="inline-flex items-center gap-1 rounded-lg border border-dashed border-hairline px-2.5 py-1 text-[11px] font-bold text-ink-3 hover:text-accent"><Plus className="size-3.5" /> Slot</button>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={save} disabled={busy} className="mt-4 inline-flex h-11 items-center gap-2 rounded-xl bg-accent px-6 text-sm font-bold text-white hover:opacity-90 disabled:opacity-60">{busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Submit for Approval</button>
          </CardBody></Card>
        )}
      </div>
    </>
  );
}
