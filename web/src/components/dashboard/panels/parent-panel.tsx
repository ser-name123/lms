"use client";

/*
 * Parent dashboard — read-only monitoring of a linked child.
 *
 * A parent reaches a child only through ParentLink; the API rejects any
 * childId that is not linked, so the switcher below can only ever offer
 * children this account owns.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  ClipboardList,
  MessageSquare,
  Download,
  CreditCard,
  GraduationCap,
  UserRound,
  FileText,
} from "lucide-react";
import Swal from "sweetalert2";

import { cn, currency } from "@/lib/utils";
import { Badge, type Tone } from "@/components/ui/badge";
import {
  fetchParentContacts,
  fetchParentDashboard,
  fetchParentReceipt,
  fetchParentReportCard,
  type DashboardRange,
  type ParentDashboard,
  type ResolvedWidget,
} from "@/lib/api";
import { printReceipt, printReportCard } from "../parent-print";
import { WidgetCard, WidgetGrid, useMyWidgets } from "../widget-grid";
import {
  DashboardSkeleton,
  EmptyState,
  Kpi,
  KpiGrid,
  ListRow,
  RangePicker,
  clockTime,
  dayLabel,
} from "../primitives";
import { RateChart, TrendChart } from "../charts";
import { NotificationsWidget, AnnouncementsWidget, CalendarWidget } from "../common-widgets";


const ATTENDANCE_TONE: Record<string, Tone> = {
  PRESENT: "good",
  LATE: "warning",
  ABSENT: "critical",
  NO_SHOW: "critical",
  EXCUSED: "neutral",
  LEAVE_APPROVED: "neutral",
};

export function ParentPanel() {
  const { widgets, setWidgets, error: widgetError } = useMyWidgets();
  const [range, setRange] = useState<DashboardRange>("30d");
  const [childId, setChildId] = useState<string | undefined>(undefined);
  const [data, setData] = useState<ParentDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchParentDashboard({ range, childId })
      .then((d) => active && setData(d))
      .catch((e: Error) => active && setError(e.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [range, childId]);

  const fail = (e: unknown) =>
    Swal.fire({
      icon: "error",
      title: "Could not open the document",
      text: e instanceof Error ? e.message : "Please try again.",
      confirmButtonColor: "#386FA4",
    });

  /*
   * There is no parent messaging module, so "contact" resolves the real
   * teacher/coach on the child's record and hands off to the mail client
   * rather than pretending an inbox exists.
   */
  const contact = async (who: "teacher" | "coach") => {
    try {
      const c = await fetchParentContacts(childId);
      const targets =
        who === "teacher"
          ? c.teachers.map((t) => ({ name: t.name, email: t.email, note: t.courses.join(", ") }))
          : c.coach
            ? [{ name: c.coach.name, email: c.coach.email, note: "Academic coach" }]
            : [];

      if (!targets.length) {
        await Swal.fire({
          icon: "info",
          title: who === "teacher" ? "No teacher assigned yet" : "No coach assigned yet",
          text: "Please contact the academy office.",
          confirmButtonColor: "#386FA4",
        });
        return;
      }

      // One match goes straight to the mail client; several need a choice.
      if (targets.length === 1) {
        window.location.href = `mailto:${targets[0].email}`;
        return;
      }
      const { value } = await Swal.fire({
        title: "Contact teacher",
        input: "select",
        inputOptions: Object.fromEntries(
          targets.map((t) => [t.email, `${t.name}${t.note ? ` — ${t.note}` : ""}`]),
        ),
        showCancelButton: true,
        confirmButtonColor: "#386FA4",
      });
      if (value) window.location.href = `mailto:${value}`;
    } catch (e) {
      await fail(e);
    }
  };

  const downloadReportCard = async () => {
    try {
      printReportCard(await fetchParentReportCard({ range, childId }));
    } catch (e) {
      await fail(e);
    }
  };

  const downloadReceipt = async (receiptId: string) => {
    try {
      printReceipt(await fetchParentReceipt(receiptId, childId));
    } catch (e) {
      await fail(e);
    }
  };

  const render = useCallback(
    (widget: ResolvedWidget) => {
      if (!data) return null;
      const { cards, timeline, charts, fees, child } = data;

      switch (widget.key) {
        case "pa.kpis":
          return (
            <WidgetCard
              title={child.name}
              subtitle={[child.studentCode, child.course, child.teacher]
                .filter(Boolean)
                .join(" · ")}
            >
              <KpiGrid className="lg:grid-cols-3 xl:grid-cols-6">
                <Kpi
                  label="Attendance"
                  value={`${cards.attendancePct}%`}
                  tone={cards.attendancePct >= 75 ? "good" : "warning"}
                  hint={cards.attendancePct >= 75 ? "On track" : "Below 75%"}
                />
                <Kpi
                  label="Assignments"
                  value={`${cards.assignments.submitted}/${cards.assignments.total}`}
                  hint={`${cards.assignments.pending} pending`}
                />
                <Kpi
                  label="Last Result"
                  value={cards.lastResult ? `${Math.round(cards.lastResult.percentage)}%` : "—"}
                  hint={cards.lastResult?.title}
                  tone={cards.lastResult?.passed ? "good" : cards.lastResult ? "critical" : "neutral"}
                />
                <Kpi
                  label="Fee Due"
                  value={currency(cards.feeDue.amount)}
                  hint={`${cards.feeDue.invoices} invoice(s)`}
                  tone={cards.feeDue.amount > 0 ? "warning" : "good"}
                />
                <Kpi label="Overall Progress" value={`${cards.overallProgress}%`} hint={cards.progressStatus ?? undefined} />
                <Kpi
                  label="Teacher Feedback"
                  value={cards.lastFeedback ? "New" : "—"}
                  hint={cards.lastFeedback ? dayLabel(cards.lastFeedback.at) : "None yet"}
                />
              </KpiGrid>
            </WidgetCard>
          );

        case "pa.timeline":
          return (
            <WidgetCard title="Child timeline" subtitle="Today and what is coming up">
              <div className="space-y-4">
                <div>
                  <p className="mb-2 text-xs font-bold tracking-wide text-ink-3 uppercase">
                    Today's classes
                  </p>
                  {!timeline.todayClasses.length ? (
                    <EmptyState title="No classes today" icon={CalendarDays} />
                  ) : (
                    <ul className="space-y-2">
                      {timeline.todayClasses.map((c) => (
                        <li key={c.id}>
                          <ListRow
                            title={c.subject}
                            subtitle={`${c.teacher} · ${clockTime(c.time)}`}
                            trailing={
                              c.attendance ? (
                                <Badge tone={ATTENDANCE_TONE[c.attendance] ?? "neutral"}>
                                  {c.attendance}
                                </Badge>
                              ) : (
                                <Badge tone="accent">{c.classStatus}</Badge>
                              )
                            }
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div>
                  <p className="mb-2 text-xs font-bold tracking-wide text-ink-3 uppercase">
                    Homework
                  </p>
                  {!timeline.homework.length ? (
                    <EmptyState title="No pending homework" icon={ClipboardList} />
                  ) : (
                    <ul className="space-y-2">
                      {timeline.homework.map((h) => (
                        <li key={h.id}>
                          <ListRow
                            title={h.title}
                            meta={h.dueAt ? `Due ${dayLabel(h.dueAt)}` : undefined}
                            trailing={<Badge tone="warning">{h.status}</Badge>}
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div>
                  <p className="mb-2 text-xs font-bold tracking-wide text-ink-3 uppercase">
                    Upcoming tests
                  </p>
                  {!timeline.upcomingTests.length ? (
                    <EmptyState title="No tests scheduled" />
                  ) : (
                    <ul className="space-y-2">
                      {timeline.upcomingTests.map((t) => (
                        <li key={t.id}>
                          <ListRow
                            title={t.title}
                            meta={t.at ? dayLabel(t.at) : undefined}
                            trailing={<Badge tone="critical">{t.totalMarks} marks</Badge>}
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div>
                  <p className="mb-2 text-xs font-bold tracking-wide text-ink-3 uppercase">
                    Recent attendance
                  </p>
                  {!timeline.recentAttendance.length ? (
                    <EmptyState title="No attendance recorded yet" icon={CalendarDays} />
                  ) : (
                    <ul className="space-y-2">
                      {timeline.recentAttendance.map((a) => (
                        <li key={a.id}>
                          <ListRow
                            title={a.title}
                            subtitle={
                              a.lateMinutes ? `${a.lateMinutes} min late` : undefined
                            }
                            meta={dayLabel(a.at)}
                            trailing={
                              <Badge tone={ATTENDANCE_TONE[a.status ?? ""] ?? "neutral"}>
                                {(a.status ?? "—").replace(/_/g, " ").toLowerCase()}
                              </Badge>
                            }
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div>
                  <p className="mb-2 text-xs font-bold tracking-wide text-ink-3 uppercase">
                    Teacher remarks
                  </p>
                  {!timeline.teacherRemarks.length ? (
                    <EmptyState title="No remarks yet" icon={MessageSquare} />
                  ) : (
                    <ul className="space-y-2">
                      {timeline.teacherRemarks.map((r) => (
                        <li key={r.id} className="rounded-lg border border-hairline p-3">
                          <p className="text-sm text-ink">{r.remarks ?? "—"}</p>
                          {r.suggestions ? (
                            <p className="mt-1 text-xs text-ink-2">
                              <span className="font-semibold">Suggestion: </span>
                              {r.suggestions}
                            </p>
                          ) : null}
                          {(() => {
                            // Teachers rate each area out of 5; only show the
                            // ones this particular remark actually scored.
                            const scored = (
                              [
                                ["Participation", r.ratings.participation],
                                ["Understanding", r.ratings.understanding],
                                ["Behaviour", r.ratings.behavior],
                              ] as const
                            ).filter(([, v]) => v !== null);
                            return scored.length ? (
                              <ul className="mt-2 flex flex-wrap gap-1.5">
                                {scored.map(([label, value]) => (
                                  <li key={label}>
                                    <Badge tone={value! >= 4 ? "good" : value! >= 3 ? "neutral" : "warning"}>
                                      {label} {value}/5
                                    </Badge>
                                  </li>
                                ))}
                              </ul>
                            ) : null;
                          })()}
                          <p className="mt-1.5 text-xs text-ink-3">{dayLabel(r.at)}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </WidgetCard>
          );

        case "pa.chart.attendance":
          return (
            <WidgetCard title="Attendance trend">
              <RateChart data={charts.attendance} name="Attendance" />
            </WidgetCard>
          );

        case "pa.chart.marks":
          return (
            <WidgetCard title="Marks trend" subtitle="Average assessment score">
              <TrendChart
                data={charts.marks}
                series={[{ key: "score", name: "Marks", format: (v) => `${v}%` }]}
                area
              />
            </WidgetCard>
          );

        case "pa.chart.progress":
          return (
            <WidgetCard title="Progress trend">
              <TrendChart
                data={charts.progress}
                series={[{ key: "score", name: "Progress", format: (v) => `${v}%` }]}
              />
            </WidgetCard>
          );

        case "pa.fees":
          return (
            <WidgetCard title="Fee summary">
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Kpi
                    label="Outstanding"
                    value={currency(fees.outstanding)}
                    tone={fees.outstanding > 0 ? "warning" : "good"}
                    hint={`${fees.unpaidInvoices} unpaid`}
                  />
                  <Kpi
                    label="Next Due"
                    value={fees.nextDue?.dueAt ? dayLabel(fees.nextDue.dueAt) : "—"}
                    hint={fees.nextDue ? currency(fees.nextDue.amount) : undefined}
                  />
                </div>

                {fees.lastPayment ? (
                  <ListRow
                    title={`Last payment ${currency(fees.lastPayment.amount)}`}
                    subtitle={`${fees.lastPayment.invoiceNumber}${fees.lastPayment.method ? ` · ${fees.lastPayment.method}` : ""}`}
                    meta={fees.lastPayment.at ? dayLabel(fees.lastPayment.at) : undefined}
                  />
                ) : null}

                <div>
                  <p className="mb-2 text-xs font-bold tracking-wide text-ink-3 uppercase">
                    Receipts
                  </p>
                  {!fees.receipts.length ? (
                    <EmptyState title="No receipts yet" />
                  ) : (
                    <ul className="space-y-2">
                      {fees.receipts.map((r) => (
                        <li key={r.id}>
                          <button
                            type="button"
                            onClick={() => downloadReceipt(r.id)}
                            className="w-full text-left"
                          >
                            <ListRow
                              title={r.number}
                              subtitle={`${currency(r.amount)}${r.method ? ` · ${r.method}` : ""}`}
                              meta={dayLabel(r.issuedAt)}
                              trailing={
                                <Download className="size-4 shrink-0 text-ink-3" aria-hidden />
                              }
                            />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </WidgetCard>
          );

        case "pa.actions":
          return (
            <WidgetCard title="Quick actions">
              <ul className="grid grid-cols-2 gap-2">
                <li>
                  <Link
                    href="/parent/fees"
                    className="flex items-center gap-2 rounded-lg border border-hairline px-3 py-2.5 text-xs font-semibold text-ink transition-colors hover:bg-surface-2"
                  >
                    <CreditCard className="size-4 shrink-0 text-ink-3" aria-hidden />
                    <span className="truncate">Pay Fee</span>
                  </Link>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => contact("teacher")}
                    className="flex w-full items-center gap-2 rounded-lg border border-hairline px-3 py-2.5 text-xs font-semibold text-ink transition-colors hover:bg-surface-2"
                  >
                    <GraduationCap className="size-4 shrink-0 text-ink-3" aria-hidden />
                    <span className="truncate">Contact Teacher</span>
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => contact("coach")}
                    className="flex w-full items-center gap-2 rounded-lg border border-hairline px-3 py-2.5 text-xs font-semibold text-ink transition-colors hover:bg-surface-2"
                  >
                    <UserRound className="size-4 shrink-0 text-ink-3" aria-hidden />
                    <span className="truncate">Contact Coach</span>
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={downloadReportCard}
                    className="flex w-full items-center gap-2 rounded-lg border border-hairline px-3 py-2.5 text-xs font-semibold text-ink transition-colors hover:bg-surface-2"
                  >
                    <FileText className="size-4 shrink-0 text-ink-3" aria-hidden />
                    <span className="truncate">Report Card</span>
                  </button>
                </li>
              </ul>
            </WidgetCard>
          );

        case "cm.notifications":
          return <NotificationsWidget />;


        case "cm.announcements":
          return <AnnouncementsWidget />;
        case "cm.calendar":
          return <CalendarWidget />;
        default:
          return null;
      }
    },
    // The action handlers close over the selected child and range, so they must
    // invalidate with them or a switched child would download the old one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, childId, range],
  );

  if (error || widgetError) {
    return <EmptyState title="Could not load the dashboard" detail={error ?? widgetError ?? undefined} />;
  }
  if (!widgets || !data) return <DashboardSkeleton />;

  return (
    <WidgetGrid
      widgets={widgets}
      onWidgetsChange={setWidgets}
      render={render}
      toolbar={
        <>
          {/* Only shown when this account actually has more than one child. */}
          {data.children.length > 1 ? (
            <div
              role="group"
              aria-label="Choose child"
              className="inline-flex rounded-lg border border-hairline bg-surface p-0.5"
            >
              {data.children.map((c) => (
                <button
                  key={c.studentId}
                  type="button"
                  aria-pressed={data.child.studentId === c.studentId}
                  onClick={() => setChildId(c.studentId)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
                    data.child.studentId === c.studentId
                      ? "bg-accent text-accent-ink"
                      : "text-ink-3 hover:bg-surface-2 hover:text-ink",
                  )}
                >
                  {c.name}
                </button>
              ))}
            </div>
          ) : null}
          <RangePicker value={range} onChange={setRange} disabled={loading} />
        </>
      }
    />
  );
}
