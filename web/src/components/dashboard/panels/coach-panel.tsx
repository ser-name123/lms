"use client";

/*
 * Academic Coach dashboard — the coach's own roster only.
 * A coach owns a student via StudentProfile.coachId; the API scopes on that, so
 * nothing here can show another coach's students.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  CalendarPlus,
  ClipboardList,
  Target,
  TriangleAlert,
  UserRoundCheck,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  fetchCoachDashboard,
  type CoachDashboard,
  type CoachStudentRow,
  type DashboardRange,
  type ResolvedWidget,
} from "@/lib/api";
import { WidgetCard, WidgetGrid, useMyWidgets } from "../widget-grid";
import {
  DashboardSkeleton,
  EmptyState,
  Kpi,
  KpiGrid,
  ListRow,
  RangePicker,
  dayLabel,
} from "../primitives";
import { RateChart, TrendChart } from "../charts";
import { NotificationsWidget, AnnouncementsWidget, CalendarWidget, ReportsWidget, ActivityWidget } from "../common-widgets";

const QUICK_ACTIONS = [
  { label: "Add Review", href: "/students/progress", icon: ClipboardList },
  { label: "Schedule Meeting", href: "/students/progress", icon: CalendarPlus },
  { label: "Update Goal", href: "/students/progress", icon: Target },
  { label: "Teacher Transfers", href: "/students", icon: UserRoundCheck },
] as const;

function StudentList({
  rows,
  emptyLabel,
  metric,
}: {
  rows: CoachStudentRow[];
  emptyLabel: string;
  metric: (r: CoachStudentRow) => React.ReactNode;
}) {
  if (!rows.length) return <EmptyState title={emptyLabel} />;
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.studentId}>
          <ListRow
            href={`/students/${r.studentId}`}
            title={r.name}
            subtitle={r.studentCode}
            trailing={metric(r)}
          />
        </li>
      ))}
    </ul>
  );
}

export function CoachPanel() {
  const { widgets, setWidgets, error: widgetError } = useMyWidgets();
  const [range, setRange] = useState<DashboardRange>("30d");
  const [data, setData] = useState<CoachDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchCoachDashboard({ range })
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
      const { cards, performance, charts, upcomingTasks } = data;

      switch (widget.key) {
        case "co.kpis":
          return (
            <WidgetCard title="My roster" subtitle="Students assigned to you">
              <KpiGrid className="lg:grid-cols-4 xl:grid-cols-7">
                <Kpi label="Students Assigned" value={cards.studentsAssigned} />
                <Kpi
                  label="Students At Risk"
                  value={cards.studentsAtRisk}
                  tone={cards.studentsAtRisk > 0 ? "critical" : "good"}
                  hint={cards.studentsAtRisk > 0 ? "Needs attention" : "All stable"}
                />
                <Kpi label="Pending Reviews" value={cards.pendingReviews} />
                <Kpi label="Monthly Reviews" value={cards.monthlyReviews} />
                <Kpi label="Parent Meetings" value={cards.parentMeetings} />
                <Kpi label="Improvement Plans" value={cards.improvementPlans} />
                <Kpi label="Goals Achieved" value={cards.goalsAchieved} tone="good" />
              </KpiGrid>
            </WidgetCard>
          );

        case "co.performance":
          return (
            <WidgetCard title="Student performance" subtitle="Ranked on the latest progress snapshot">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="mb-2 text-xs font-bold tracking-wide text-ink-3 uppercase">
                    Top performers
                  </p>
                  <StudentList
                    rows={performance.topPerformers}
                    emptyLabel="No snapshots yet"
                    metric={(r) => <Badge tone="good">{Math.round(r.overallScore ?? 0)}%</Badge>}
                  />
                </div>
                <div>
                  <p className="mb-2 text-xs font-bold tracking-wide text-ink-3 uppercase">
                    Need attention
                  </p>
                  <StudentList
                    rows={performance.needAttention}
                    emptyLabel="Nobody flagged"
                    metric={(r) => (
                      <Badge tone={r.risk?.level === "CRITICAL" ? "critical" : "warning"}>
                        <TriangleAlert className="size-3" aria-hidden />
                        {r.risk?.level ?? "AT_RISK"}
                      </Badge>
                    )}
                  />
                </div>
                <div>
                  <p className="mb-2 text-xs font-bold tracking-wide text-ink-3 uppercase">
                    Weak students
                  </p>
                  <StudentList
                    rows={performance.weakStudents}
                    emptyLabel="No snapshots yet"
                    metric={(r) => <Badge tone="warning">{Math.round(r.overallScore ?? 0)}%</Badge>}
                  />
                </div>
                <div>
                  <p className="mb-2 text-xs font-bold tracking-wide text-ink-3 uppercase">
                    New admissions
                  </p>
                  <StudentList
                    rows={performance.newAdmissions}
                    emptyLabel="No new admissions"
                    metric={(r) => (
                      <span className="text-xs text-ink-3">
                        {r.joinedAt ? dayLabel(r.joinedAt) : ""}
                      </span>
                    )}
                  />
                </div>
              </div>
            </WidgetCard>
          );

        case "co.chart.progress":
          return (
            <WidgetCard title="Progress trend" subtitle="Average overall score">
              <TrendChart
                data={charts.progress}
                series={[{ key: "score", name: "Progress", format: (v) => `${v}%` }]}
                area
              />
            </WidgetCard>
          );

        case "co.chart.assessment":
          return (
            <WidgetCard title="Assessment trend" subtitle="Average assessment score">
              <TrendChart
                data={charts.assessment}
                series={[{ key: "score", name: "Score", format: (v) => `${v}%` }]}
              />
            </WidgetCard>
          );

        case "co.chart.assignment":
          return (
            <WidgetCard title="Assignment completion">
              <RateChart
                data={charts.assignment.map((p) => ({ label: p.label, rate: p.completion }))}
                name="Completion"
              />
            </WidgetCard>
          );

        case "co.chart.attendance":
          return (
            <WidgetCard title="Attendance trend">
              <RateChart data={charts.attendance} name="Attendance" />
            </WidgetCard>
          );

        // Not all of these are future-dated — trial decisions and open risk
        // flags carry the date they were raised.
        case "co.tasks":
          return (
            <WidgetCard title="Upcoming tasks" subtitle="Teacher assignment, meetings, reviews, evaluations, counseling">
              {!upcomingTasks.length ? (
                <EmptyState title="Nothing scheduled" />
              ) : (
                <ul className="space-y-2">
                  {upcomingTasks.map((t) => (
                    <li key={`${t.kind}-${t.id}`}>
                      <ListRow
                        href={t.link}
                        title={t.title}
                        subtitle={t.detail ?? undefined}
                        meta={dayLabel(t.at)}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </WidgetCard>
          );

        case "co.actions":
          return (
            <WidgetCard title="Quick actions">
              <ul className="grid grid-cols-2 gap-2">
                {QUICK_ACTIONS.map((a) => (
                  <li key={a.label}>
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
        case "cm.reports":
          return <ReportsWidget />;
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
