"use client";

/*
 * Teacher dashboard — the teacher's own working day.
 * The old version charted a hardcoded six-month array; every series here is
 * fetched per range from /dashboard/teacher.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ClipboardCheck,
  FilePlus2,
  GraduationCap,
  MessageSquarePlus,
  PlayCircle,
  Trophy,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  fetchTeacherRoleDashboard,
  type DashboardRange,
  type ResolvedWidget,
  type TeacherDashboard,
} from "@/lib/api";
import { WidgetCard, WidgetGrid, useMyWidgets } from "../widget-grid";
import { DashboardSkeleton, EmptyState, Kpi, KpiGrid, ListRow, RangePicker } from "../primitives";
import { BarChart, DonutChart, RateChart, TrendChart } from "../charts";
import { NotificationsWidget, AnnouncementsWidget, CalendarWidget, ScheduleTable, ActivityWidget } from "../common-widgets";

const QUICK_ACTIONS = [
  { label: "Start Class", href: "/teacher/classes", icon: PlayCircle },
  { label: "Create Assignment", href: "/teacher/assignments", icon: FilePlus2 },
  { label: "Create Assessment", href: "/teacher/assessments", icon: GraduationCap },
  { label: "Take Attendance", href: "/teacher/attendance", icon: ClipboardCheck },
  { label: "Add Feedback", href: "/teacher/progress", icon: MessageSquarePlus },
] as const;

export function TeacherPanel() {
  const { widgets, setWidgets, error: widgetError } = useMyWidgets();
  const [range, setRange] = useState<DashboardRange>("30d");
  const [data, setData] = useState<TeacherDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchTeacherRoleDashboard({ range })
      .then((d) => active && setData(d))
      .catch((e: Error) => active && setError(e.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [range]);

  const render = useCallback(
    (widget: ResolvedWidget) => {
      if (!data) return null;
      const { cards, schedule, pendingWork, students, charts } = data;

      switch (widget.key) {
        case "te.kpis":
          return (
            <WidgetCard title="My day" subtitle="Your classes and outstanding work">
              <KpiGrid className="lg:grid-cols-4 xl:grid-cols-7">
                <Kpi label="Today's Classes" value={cards.todayClasses} href="/teacher/classes" />
                <Kpi label="Upcoming Classes" value={cards.upcomingClasses} href="/teacher/classes" />
                <Kpi label="Students" value={cards.students} href="/teacher/students" />
                <Kpi
                  label="Assignments To Review"
                  value={cards.assignmentsPendingReview}
                  tone={cards.assignmentsPendingReview > 0 ? "warning" : "good"}
                  href="/teacher/assignments"
                />
                <Kpi
                  label="Tests To Evaluate"
                  value={cards.assessmentsPendingEvaluation}
                  tone={cards.assessmentsPendingEvaluation > 0 ? "warning" : "good"}
                  href="/teacher/assessments"
                />
                <Kpi
                  label="Attendance Pending"
                  value={cards.attendancePending}
                  tone={cards.attendancePending > 0 ? "critical" : "good"}
                  href="/teacher/attendance"
                />
                <Kpi label="Trial Classes" value={cards.trialClasses} />
              </KpiGrid>
            </WidgetCard>
          );

        case "te.schedule":
          return (
            <WidgetCard title="Today's schedule" subtitle="Join opens once a class goes live">
              <ScheduleTable
                rows={schedule}
                emptyLabel="No classes scheduled today"
                showTeacher={false}
                joinLabel="Start"
              />
            </WidgetCard>
          );

        case "te.pending":
          return (
            <WidgetCard title="Pending work">
              {!pendingWork.length ? (
                <EmptyState title="Nothing pending" detail="You are all caught up." />
              ) : (
                <ul className="space-y-2">
                  {pendingWork.map((t) => (
                    <li key={t.key}>
                      <ListRow
                        href={t.link}
                        title={t.label}
                        trailing={<Badge tone={t.count > 5 ? "warning" : "accent"}>{t.count}</Badge>}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </WidgetCard>
          );

        case "te.students":
          return (
            <WidgetCard title="Student summary" subtitle="Across your enrolled students">
              <div className="space-y-4">
                {students.highestPerformer ? (
                  <ListRow
                    leading={
                      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-2">
                        <Trophy className="size-4 text-ink-2" aria-hidden />
                      </span>
                    }
                    title={students.highestPerformer.name}
                    subtitle="Highest performer"
                    trailing={<Badge tone="good">{Math.round(students.highestPerformer.score)}%</Badge>}
                  />
                ) : null}

                <div>
                  <p className="mb-2 text-xs font-bold tracking-wide text-ink-3 uppercase">
                    Low attendance
                  </p>
                  {!students.lowAttendance.length ? (
                    <EmptyState title="Nobody below 75%" />
                  ) : (
                    <ul className="space-y-2">
                      {students.lowAttendance.map((s) => (
                        <li key={s.studentId}>
                          <ListRow
                            title={s.name}
                            subtitle={s.studentCode}
                            trailing={<Badge tone="critical">{s.attendance}%</Badge>}
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div>
                  <p className="mb-2 text-xs font-bold tracking-wide text-ink-3 uppercase">
                    Late submissions
                  </p>
                  {!students.lateSubmissions.length ? (
                    <EmptyState title="No late submissions" />
                  ) : (
                    <ul className="space-y-2">
                      {students.lateSubmissions.map((s) => (
                        <li key={s.studentId}>
                          <ListRow
                            title={s.name}
                            subtitle={s.studentCode}
                            trailing={<Badge tone="warning">{s.lateCount} late</Badge>}
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div>
                  <p className="mb-2 text-xs font-bold tracking-wide text-ink-3 uppercase">
                    Needs support
                  </p>
                  {!students.weakStudents.length ? (
                    <EmptyState title="Nobody is falling behind" />
                  ) : (
                    <ul className="space-y-2">
                      {students.weakStudents.map((s) => (
                        <li key={s.studentId}>
                          <ListRow
                            title={s.name}
                            subtitle={s.studentCode}
                            trailing={<Badge tone="warning">{Math.round(s.score)}%</Badge>}
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </WidgetCard>
          );

        case "te.chart.completion":
          return (
            <WidgetCard title="Class completion" subtitle="Scheduled against completed">
              <BarChart
                data={charts.classCompletion}
                series={[
                  { key: "scheduled", name: "Scheduled" },
                  { key: "completed", name: "Completed" },
                ]}
              />
            </WidgetCard>
          );

        case "te.chart.attendance":
          return (
            <WidgetCard title="Student attendance" subtitle="Across your classes">
              <RateChart data={charts.attendance} name="Attendance" />
            </WidgetCard>
          );

        case "te.chart.assignment":
          return (
            <WidgetCard title="Assignment status">
              <DonutChart data={charts.assignmentStatus} />
            </WidgetCard>
          );

        case "te.chart.assessment":
          return (
            <WidgetCard title="Assessment average" subtitle="Mean score of your assessments">
              <TrendChart
                data={charts.assessmentAverage}
                series={[{ key: "score", name: "Average", format: (v) => `${v}%` }]}
                area
              />
            </WidgetCard>
          );

        case "te.actions":
          return (
            <WidgetCard title="Quick actions">
              <ul className="grid grid-cols-2 gap-2">
                {QUICK_ACTIONS.map((a) => (
                  <li key={a.href}>
                    <Link
                      href={a.href}
                      className="flex items-center gap-2 rounded-lg border border-hairline px-3 py-2.5 text-xs font-semibold text-ink transition-colors hover:bg-surface-2"
                    >
                      <a.icon className="size-4 shrink-0 text-ink-3" aria-hidden />
                      <span className="truncate">{a.label}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </WidgetCard>
          );

        case "cm.activity":
          return <ActivityWidget />;
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
    [data],
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
      toolbar={<RangePicker value={range} onChange={setRange} disabled={loading} />}
    />
  );
}
