"use client";

/*
 * Student dashboard — learning information only.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Award,
  BookOpen,
  ClipboardList,
  GraduationCap,
  MessageSquare,
  PlayCircle,
  Target,
  Upload,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  fetchStudentRoleDashboard,
  type DashboardRange,
  type ResolvedWidget,
  type StudentDashboard,
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
import { MeterList, RateChart, TrendChart } from "../charts";
import { NotificationsWidget, AnnouncementsWidget, CalendarWidget, ScheduleTable } from "../common-widgets";

const QUICK_ACTIONS = [
  { label: "Join Class", href: "/student/classes", icon: PlayCircle },
  { label: "Submit Assignment", href: "/student/assignments", icon: Upload },
  { label: "Start Assessment", href: "/student/assessments", icon: GraduationCap },
  { label: "View Feedback", href: "/student/progress", icon: MessageSquare },
] as const;

const PENDING_ICON = {
  ASSIGNMENT_DUE: ClipboardList,
  ASSESSMENT_UPCOMING: GraduationCap,
  TEACHER_FEEDBACK: MessageSquare,
} as const;

export function StudentPanel() {
  const { widgets, setWidgets, error: widgetError } = useMyWidgets();
  const [range, setRange] = useState<DashboardRange>("30d");
  const [data, setData] = useState<StudentDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchStudentRoleDashboard({ range })
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
      const { cards, schedule, pendingWork, progress, achievements } = data;

      switch (widget.key) {
        case "st.kpis":
          return (
            <WidgetCard title="My overview">
              <KpiGrid className="lg:grid-cols-4 xl:grid-cols-6">
                <Kpi label="Today's Classes" value={cards.todayClasses} href="/student/classes" />
                <Kpi
                  label="Attendance"
                  value={`${cards.attendancePct}%`}
                  tone={cards.attendancePct >= 75 ? "good" : "warning"}
                  hint={cards.attendancePct >= 75 ? "On track" : "Below 75%"}
                  href="/student/attendance"
                />
                <Kpi
                  label="Assignments"
                  value={`${cards.assignments.submitted}/${cards.assignments.total}`}
                  hint={`${cards.assignments.pending} pending`}
                  href="/student/assignments"
                />
                <Kpi label="Upcoming Tests" value={cards.upcomingTests} href="/student/assessments" />
                <Kpi label="Progress" value={`${cards.overallProgress}%`} href="/student/progress" />
                <Kpi label="Certificates" value={cards.certificates} />
              </KpiGrid>

              {cards.learningGoal ? (
                <div className="mt-4 rounded-lg border border-hairline p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                      <Target className="size-4 text-ink-3" aria-hidden />
                      {cards.learningGoal.title}
                    </p>
                    <span className="tnum text-xs font-bold text-ink">
                      {cards.learningGoal.currentPct}% / {cards.learningGoal.targetPct}%
                    </span>
                  </div>
                  <div
                    className="h-1.5 overflow-hidden rounded-full bg-surface-2"
                    role="progressbar"
                    aria-valuenow={cards.learningGoal.currentPct}
                    aria-valuemin={0}
                    aria-valuemax={cards.learningGoal.targetPct}
                    aria-label="Learning goal progress"
                  >
                    <div
                      className="h-full rounded-full bg-[var(--series-1)]"
                      style={{
                        width: `${Math.min(100, (cards.learningGoal.currentPct / (cards.learningGoal.targetPct || 100)) * 100)}%`,
                      }}
                    />
                  </div>
                  {cards.learningGoal.deadline ? (
                    <p className="mt-1.5 text-xs text-ink-3">
                      Target date {dayLabel(cards.learningGoal.deadline)}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </WidgetCard>
          );

        case "st.schedule":
          return (
            <WidgetCard title="Today's schedule" subtitle="Join opens once your class goes live">
              <ScheduleTable rows={schedule} emptyLabel="No classes today" />
            </WidgetCard>
          );

        case "st.pending":
          return (
            <WidgetCard title="Pending work">
              {!pendingWork.length ? (
                <EmptyState title="Nothing due" detail="You are all caught up." />
              ) : (
                <ul className="space-y-2">
                  {pendingWork.map((p) => {
                    const Icon = PENDING_ICON[p.kind] ?? ClipboardList;
                    return (
                      <li key={`${p.kind}-${p.id}`}>
                        <ListRow
                          href={p.link}
                          leading={
                            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-2">
                              <Icon className="size-4 text-ink-2" aria-hidden />
                            </span>
                          }
                          title={p.title}
                          subtitle={p.kind.replace(/_/g, " ").toLowerCase()}
                          meta={p.at ? dayLabel(p.at) : undefined}
                        />
                      </li>
                    );
                  })}
                </ul>
              )}
            </WidgetCard>
          );

        case "st.progress":
          return (
            <WidgetCard title="My progress" subtitle={`Overall ${progress.overall}%`}>
              <div className="space-y-4">
                <div>
                  <p className="mb-2 text-xs font-bold tracking-wide text-ink-3 uppercase">
                    Attendance
                  </p>
                  <RateChart data={progress.attendance} name="Attendance" height={160} />
                </div>
                <div>
                  <p className="mb-2 text-xs font-bold tracking-wide text-ink-3 uppercase">
                    Assignment completion
                  </p>
                  <RateChart
                    data={progress.assignments.map((a) => ({ label: a.label, rate: a.completion }))}
                    name="Assignments"
                    height={160}
                  />
                </div>
                <div>
                  <p className="mb-2 text-xs font-bold tracking-wide text-ink-3 uppercase">
                    Assessment scores
                  </p>
                  <TrendChart
                    data={progress.assessment}
                    series={[{ key: "score", name: "Score", format: (v) => `${v}%` }]}
                    height={160}
                  />
                </div>
                {progress.skills.length ? (
                  <div>
                    <p className="mb-2 text-xs font-bold tracking-wide text-ink-3 uppercase">
                      Skills
                    </p>
                    <MeterList
                      items={progress.skills.map((s) => ({ name: s.name, value: s.percentage }))}
                    />
                  </div>
                ) : null}
              </div>
            </WidgetCard>
          );

        case "st.achievements":
          return (
            <WidgetCard title="Achievements">
              <div className="space-y-4">
                <div>
                  <p className="mb-2 text-xs font-bold tracking-wide text-ink-3 uppercase">
                    Certificates
                  </p>
                  {!achievements.certificates.length ? (
                    <EmptyState title="No certificates yet" icon={Award} />
                  ) : (
                    <ul className="space-y-2">
                      {achievements.certificates.map((c) => (
                        <li key={c.id}>
                          <ListRow
                            title={c.title}
                            subtitle={c.certificateNo ?? undefined}
                            // The row only becomes a link once a certificate
                            // file actually exists — otherwise it is inert.
                            href={c.url ?? undefined}
                            trailing={<Badge tone="good">{Math.round(c.score)}%</Badge>}
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div>
                  <p className="mb-2 text-xs font-bold tracking-wide text-ink-3 uppercase">
                    Completed courses
                  </p>
                  {!achievements.completedCourses.length ? (
                    <EmptyState title="No completed courses yet" icon={BookOpen} />
                  ) : (
                    <ul className="space-y-2">
                      {achievements.completedCourses.map((c) => (
                        <li key={c.id}>
                          <ListRow
                            title={c.title}
                            meta={c.completedAt ? dayLabel(c.completedAt) : undefined}
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {achievements.badges.length ? (
                  <div>
                    <p className="mb-2 text-xs font-bold tracking-wide text-ink-3 uppercase">
                      Badges
                    </p>
                    <ul className="flex flex-wrap gap-2">
                      {achievements.badges.map((b) => (
                        <li key={b.id}>
                          <Badge
                            tone={
                              b.tone === "good" || b.tone === "warning" || b.tone === "accent"
                                ? b.tone
                                : "neutral"
                            }
                          >
                            {b.name}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </WidgetCard>
          );

        case "st.actions":
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
