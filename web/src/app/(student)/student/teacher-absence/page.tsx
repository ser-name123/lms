"use client";

import { useEffect, useState } from "react";
import { CalendarClock, Loader2, PauseCircle, UserCheck } from "lucide-react";

import { Topbar } from "@/components/layout/topbar";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyLeaves, fmtWindow } from "@/components/leaves/shared";
import { fetchMyLeaveImpacts } from "@/lib/api";

type Row = Awaited<ReturnType<typeof fetchMyLeaveImpacts>>[number];

/**
 * §9.8 — the student is on three rows of the notification matrix, so they need
 * somewhere to go when one arrives.
 *
 * It shows WHAT was arranged and never WHY the teacher is away: the reason and
 * the leave type are the teacher's private business, and the student's own
 * portal is exactly where that leaks if nobody decides otherwise.
 */
export default function TeacherAbsencePage() {
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    fetchMyLeaveImpacts()
      .then(setRows)
      .catch(() => setRows([]));
  }, []);

  if (!rows) {
    return (
      <>
        <Topbar title="Teacher Absence" subtitle="When your teacher is away" />
        <div className="flex items-center gap-2 p-8 text-xs font-bold text-ink-3">
          <Loader2 className="size-4 animate-spin text-accent" /> Loading…
        </div>
      </>
    );
  }

  return (
    <>
      <Topbar title="Teacher Absence" subtitle="What happens to your classes when your teacher is away" />
      <div className="animate-fade-up space-y-4 p-4 sm:p-6">
        {!rows.length ? (
          <EmptyLeaves text="None of your teachers have been away. You will find the arrangements here if that changes." />
        ) : (
          rows.map((r) => (
            <Card key={r.id} className="border border-hairline bg-surface">
              <CardBody className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-ink">
                      {r.teacherName} is away {fmtWindow(r.from, r.to)}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-3">
                      {r.courseTitle ?? "Your course"} · {r.affectedClassCount} class
                      {r.affectedClassCount === 1 ? "" : "es"} affected
                    </p>
                  </div>
                  <Badge tone={r.status === "OPEN" ? "warning" : "good"}>
                    {r.status === "OPEN" ? "Being arranged" : r.status === "REVERTED" ? "Back to normal" : "Arranged"}
                  </Badge>
                </div>

                <div className="mt-3 rounded-xl border border-hairline bg-surface-2/30 p-3 text-xs text-ink-2">
                  {r.option === "PENDING_REVIEW" ? (
                    <>Your academic coach will contact you shortly to agree what happens to these classes.</>
                  ) : r.option === "WAIT_FOR_TEACHER" ? (
                    <>
                      <PauseCircle className="mr-1 inline size-3.5 text-accent" />
                      Your classes are paused until they return, and your billing has been pushed back by{" "}
                      <b>{r.cycleExtendedDays ?? 0} day(s)</b> — you are not charged for the time you missed, and your
                      usual slot is held for you.
                    </>
                  ) : r.option === "TEMPORARY_TEACHER" ? (
                    <>
                      <UserCheck className="mr-1 inline size-3.5 text-emerald-500" />
                      <b>{r.temporaryTeacherName}</b> is taking your classes while your regular teacher is away. Your own
                      teacher stays assigned to you and comes back afterwards.
                    </>
                  ) : (
                    <>
                      <CalendarClock className="mr-1 inline size-3.5 text-accent" />
                      Your classes have been moved to new times. Check your schedule for the details.
                    </>
                  )}
                </div>
              </CardBody>
            </Card>
          ))
        )}
      </div>
    </>
  );
}
