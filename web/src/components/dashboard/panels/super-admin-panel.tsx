"use client";

/*
 * Super Admin dashboard (role ADMIN) — whole-academy monitoring.
 *
 * Which widgets render, and in what order, comes from the widget service; this
 * file only maps a widget key to its content. Every number is straight from
 * /dashboard/super-admin — nothing is derived from a fixture.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  BookPlus,
  CalendarPlus,
  FilePlus2,
  GraduationCap,
  Radio,
  Receipt,
  UserPlus,
  Users,
} from "lucide-react";

import { compact, currency } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  fetchSuperAdminDashboard,
  type DashboardRange,
  type ResolvedWidget,
  type SuperAdminDashboard,
} from "@/lib/api";
import { WidgetCard, WidgetGrid, useMyWidgets } from "../widget-grid";
import {
  DashboardSkeleton,
  EmptyState,
  Kpi,
  KpiGrid,
  RangePicker,
} from "../primitives";
import { BarChart, DonutChart, RateChart, TrendChart } from "../charts";
import { ActivityWidget, AnnouncementsWidget, NotificationsWidget, CalendarWidget, ReportsWidget } from "../common-widgets";

const QUICK_ACTIONS = [
  { label: "Add Student", href: "/students?new=1", icon: UserPlus },
  { label: "Add Teacher", href: "/teachers?new=1", icon: Users },
  { label: "Create Course", href: "/courses", icon: BookPlus },
  { label: "Create Batch", href: "/attendance?tab=batches", icon: CalendarPlus },
  { label: "Create Assignment", href: "/assignments", icon: FilePlus2 },
  { label: "Create Assessment", href: "/assessments", icon: GraduationCap },
  { label: "Collect Fee", href: "/invoices", icon: Receipt },
  { label: "Generate Report", href: "/students/analytics", icon: FilePlus2 },
] as const;

export function SuperAdminPanel() {
  const { widgets, setWidgets, error: widgetError } = useMyWidgets();
  const [range, setRange] = useState<DashboardRange>("30d");
  const [data, setData] = useState<SuperAdminDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchSuperAdminDashboard({ range })
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
      const { kpis, live, charts } = data;

      switch (widget.key) {
        case "sa.kpis":
          return (
            <WidgetCard title="Academy overview" subtitle={`Window: ${data.range}`}>
              <KpiGrid>
                <Kpi label="Total Students" value={kpis.totalStudents.value} delta={kpis.totalStudents.delta} href="/students" />
                <Kpi label="Active Students" value={kpis.activeStudents.value} href="/students" />
                <Kpi label="Total Teachers" value={kpis.totalTeachers.value} href="/teachers" />
                <Kpi label="Academic Coaches" value={kpis.academicCoaches.value} href="/employees" />
                <Kpi label="Courses" value={kpis.courses.value} href="/courses" />
                <Kpi label="Active Batches" value={kpis.activeBatches.value} href="/attendance?tab=batches" />
                <Kpi label="Today's Classes" value={kpis.todayClasses.value} href="/classes" />
                <Kpi label="Running Classes" value={kpis.runningClasses.value} tone="good" href="/classes" />
                <Kpi label="Completed Today" value={kpis.completedClasses.value} href="/classes" />
                <Kpi label="Assignments Pending" value={kpis.assignmentsPending.value} href="/assignments" />
                <Kpi label="Assessments Live" value={kpis.assessmentsLive.value} href="/assessments" />
                <Kpi
                  label="Revenue This Month"
                  value={currency(kpis.revenueThisMonth.value)}
                  delta={kpis.revenueThisMonth.delta}
                  href="/finance"
                />
                <Kpi label="Outstanding Fees" value={currency(kpis.outstandingFees.value)} href="/invoices" />
                <Kpi label="Expenses" value={currency(kpis.expenses.value)} href="/expenses" />
                <Kpi
                  label="Net Profit"
                  value={currency(kpis.netProfit.value)}
                  hint={kpis.netProfit.value >= 0 ? "In profit" : "In loss"}
                  tone={kpis.netProfit.value >= 0 ? "good" : "critical"}
                  href="/finance"
                />
              </KpiGrid>
            </WidgetCard>
          );

        case "sa.live":
          return (
            <WidgetCard
              title="Live right now"
              subtitle="Refreshes when you change the range"
              action={
                live.activeLiveClasses > 0 ? (
                  <Badge tone="good">
                    <Radio className="size-3" aria-hidden />
                    {live.activeLiveClasses} live
                  </Badge>
                ) : null
              }
            >
              <KpiGrid className="lg:grid-cols-6 xl:grid-cols-6">
                <Kpi label="Online Students" value={live.onlineStudents} />
                <Kpi label="Teachers Teaching" value={live.teachersTeachingNow} />
                <Kpi label="Live Classes" value={live.activeLiveClasses} />
                <Kpi label="Today Attendance" value={`${live.todayAttendancePct}%`} />
                <Kpi label="Today Submissions" value={`${live.todayAssignmentSubmissionPct}%`} />
                <Kpi label="Today Assessments" value={`${live.todayAssessmentCompletionPct}%`} />
              </KpiGrid>
            </WidgetCard>
          );

        case "sa.chart.growth":
          return (
            <WidgetCard title="Student growth" subtitle="Cumulative students">
              <TrendChart
                data={charts.studentGrowth}
                series={[{ key: "students", name: "Students" }]}
                area
              />
            </WidgetCard>
          );

        case "sa.chart.revenue":
          return (
            <WidgetCard title="Revenue trend" subtitle="Revenue, expenses and profit — all in currency">
              <TrendChart
                data={charts.revenueTrend}
                series={[
                  { key: "revenue", name: "Revenue", format: currency },
                  { key: "expenses", name: "Expenses", format: currency },
                  { key: "profit", name: "Profit", format: currency },
                ]}
                yFormat={(v) => `$${compact(v)}`}
              />
            </WidgetCard>
          );

        case "sa.chart.admissions":
          return (
            <WidgetCard title="Admissions" subtitle="New students per period">
              <BarChart data={charts.admissions} series={[{ key: "admissions", name: "Admissions" }]} />
            </WidgetCard>
          );

        case "sa.chart.attendance":
          return (
            <WidgetCard title="Attendance trend" subtitle="Academy-wide attendance rate">
              <RateChart data={charts.attendanceTrend} name="Attendance" />
            </WidgetCard>
          );

        case "sa.chart.assessment":
          return (
            <WidgetCard title="Assessment performance" subtitle="Average score per period">
              <TrendChart
                data={charts.assessmentTrend}
                series={[{ key: "avgScore", name: "Average score", format: (v) => `${v}%` }]}
              />
            </WidgetCard>
          );

        case "sa.chart.assignment":
          return (
            <WidgetCard title="Assignment completion" subtitle="Assigned vs submitted">
              <BarChart
                data={charts.assignmentTrend}
                series={[
                  { key: "assigned", name: "Assigned" },
                  { key: "submitted", name: "Submitted" },
                ]}
              />
            </WidgetCard>
          );

        case "sa.chart.teacher":
          return (
            <WidgetCard title="Teacher performance" subtitle="System rating out of 5">
              <BarChart
                data={charts.teacherPerformance.map((t) => ({ label: t.name, rating: t.rating }))}
                series={[{ key: "rating", name: "Rating" }]}
                layout="horizontal"
                height={260}
              />
            </WidgetCard>
          );

        case "sa.chart.batch":
          return (
            <WidgetCard title="Batch utilisation" subtitle="Seats filled against capacity">
              <BarChart
                data={charts.batchUtilization.map((b) => ({
                  label: b.name,
                  utilization: b.utilization,
                }))}
                series={[{ key: "utilization", name: "Utilisation", format: (v) => `${v}%` }]}
                layout="horizontal"
                height={260}
              />
            </WidgetCard>
          );

        case "sa.chart.country":
          return (
            <WidgetCard title="Students by country">
              <DonutChart data={charts.countryMix} />
            </WidgetCard>
          );

        case "sa.chart.course":
          return (
            <WidgetCard title="Students by course">
              <DonutChart data={charts.courseMix} />
            </WidgetCard>
          );

        case "sa.actions":
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
        case "cm.reports":
          return <ReportsWidget />;
        default:
          return null;
      }
    },
    [data],
  );

  if (error || widgetError) {
    return (
      <EmptyState
        title="Could not load the dashboard"
        detail={error ?? widgetError ?? undefined}
      />
    );
  }

  if (loading && !data) return <DashboardSkeleton />;
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
