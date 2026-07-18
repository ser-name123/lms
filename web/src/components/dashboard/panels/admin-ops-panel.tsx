"use client";

/*
 * Admin dashboard (role SUPERVISOR) — day-to-day operations.
 * Answers "what needs doing today" rather than "how is the academy doing".
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  CalendarPlus,
  ClipboardCheck,
  FileText,
  Receipt,
  UserPlus,
  UserRoundCheck,
} from "lucide-react";

import { compact, currency } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  fetchAdminDashboard,
  type AdminDashboard,
  type DashboardRange,
  type ResolvedWidget,
} from "@/lib/api";
import { WidgetCard, WidgetGrid, useMyWidgets } from "../widget-grid";
import { DashboardSkeleton, EmptyState, Kpi, KpiGrid, ListRow, RangePicker } from "../primitives";
import { BarChart, DonutChart, RateChart } from "../charts";
import {
  ActivityWidget,
  AnnouncementsWidget,
  NotificationsWidget,
  CalendarWidget,
  ScheduleTable,
} from "../common-widgets";

const QUICK_ACTIONS = [
  { label: "Register Student", href: "/registrations", icon: UserPlus },
  { label: "Assign Teacher", href: "/students", icon: UserRoundCheck },
  { label: "Schedule Trial", href: "/leads", icon: CalendarPlus },
  { label: "Generate Invoice", href: "/invoices", icon: Receipt },
  { label: "Manage Attendance", href: "/attendance", icon: ClipboardCheck },
  { label: "Create Batch", href: "/attendance?tab=batches", icon: FileText },
] as const;

export function AdminOpsPanel() {
  const { widgets, setWidgets, error: widgetError } = useMyWidgets();
  const [range, setRange] = useState<DashboardRange>("30d");
  const [data, setData] = useState<AdminDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchAdminDashboard({ range })
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
      const { cards, charts, upcomingClasses, pendingTasks } = data;

      switch (widget.key) {
        case "ad.kpis":
          return (
            <WidgetCard title="Today" subtitle="Live operational counters">
              <KpiGrid className="lg:grid-cols-4 xl:grid-cols-4">
                <Kpi label="Today's Admissions" value={cards.todayAdmissions} href="/registrations" />
                <Kpi label="Today's Trials" value={cards.todayTrials} href="/leads" />
                <Kpi label="Today's Classes" value={cards.todayClasses} href="/classes" />
                <Kpi label="Today's Attendance" value={`${cards.todayAttendancePct}%`} href="/attendance" />
              </KpiGrid>
            </WidgetCard>
          );

        case "ad.pending":
          return (
            <WidgetCard title="Pending queue" subtitle="Everything waiting on an action">
              <KpiGrid className="lg:grid-cols-4 xl:grid-cols-4">
                <Kpi label="Pending Assignments" value={cards.pendingAssignments} href="/assignments" />
                <Kpi label="Pending Assessments" value={cards.pendingAssessments} href="/assessments" />
                <Kpi
                  label="Pending Fees"
                  value={currency(cards.pendingFees.amount)}
                  hint={`${cards.pendingFees.count} invoices`}
                  tone={cards.pendingFees.count > 0 ? "warning" : "neutral"}
                  href="/invoices"
                />
                <Kpi
                  label="Pending Approvals"
                  value={cards.pendingApprovals}
                  tone={cards.pendingApprovals > 0 ? "warning" : "good"}
                  hint={cards.pendingApprovals > 0 ? "Needs review" : "All clear"}
                />
              </KpiGrid>
            </WidgetCard>
          );

        case "ad.upcoming":
          return (
            <WidgetCard title="Upcoming classes" subtitle="Next 10 scheduled sessions">
              <ScheduleTable rows={upcomingClasses} emptyLabel="No upcoming classes" />
            </WidgetCard>
          );

        case "ad.tasks":
          return (
            <WidgetCard title="Pending tasks" subtitle="Each row opens the screen that clears it">
              {!pendingTasks.length ? (
                <EmptyState title="Nothing pending" detail="Every queue is clear." />
              ) : (
                <ul className="space-y-2">
                  {pendingTasks.map((t) => (
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

        case "ad.chart.admissions":
          return (
            <WidgetCard title="Admissions" subtitle="New students per period">
              <BarChart data={charts.admissions} series={[{ key: "admissions", name: "Admissions" }]} />
            </WidgetCard>
          );

        case "ad.chart.attendance":
          return (
            <WidgetCard title="Attendance" subtitle="Attendance rate per period">
              <RateChart data={charts.attendance} name="Attendance" />
            </WidgetCard>
          );

        case "ad.chart.assignment":
          return (
            <WidgetCard title="Assignment status" subtitle="Submissions by state">
              <DonutChart data={charts.assignmentStatus} />
            </WidgetCard>
          );

        case "ad.chart.fees":
          return (
            <WidgetCard title="Fees collection" subtitle="Collected against outstanding">
              <BarChart
                data={charts.fees}
                series={[
                  { key: "collected", name: "Collected", format: currency },
                  { key: "outstanding", name: "Outstanding", format: currency },
                ]}
                yFormat={(v) => `$${compact(v)}`}
              />
            </WidgetCard>
          );

        case "ad.actions":
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
        // No cm.reports here — the report endpoints are ADMIN/COACH scoped, so
        // the registry never grants the widget to SUPERVISOR.
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
