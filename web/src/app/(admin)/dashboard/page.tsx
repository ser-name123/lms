import { ArrowUpRight, CircleAlert, GraduationCap, Receipt, Video } from "lucide-react";

import { CourseMixChart } from "@/components/charts/course-mix-chart";
import { EnrollmentChart } from "@/components/charts/enrollment-chart";
import { RevenueChart } from "@/components/charts/revenue-chart";
import { StatTile } from "@/components/dashboard/stat-tile";
import { Topbar } from "@/components/layout/topbar";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { activity, kpis, recentEnrollments, upcomingClasses } from "@/lib/mock-data";
import { cn, initials } from "@/lib/utils";

const RANGES = ["7d", "30d", "90d", "12m"] as const;

const statusTone: Record<string, Tone> = {
  Active: "good",
  Trial: "accent",
  Pending: "warning",
  Paused: "neutral",
  Live: "critical",
  Upcoming: "accent",
  Done: "neutral",
};

const activityIcon = {
  payment: Receipt,
  enroll: GraduationCap,
  class: Video,
  alert: CircleAlert,
};

export default function DashboardPage() {
  return (
    <>
      <Topbar title="Dashboard" subtitle="Tuesday, 14 July 2026" />

      <div className="animate-fade-up space-y-5 p-4 sm:p-6">
        {/* Filters sit in one row above the charts. */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-lg border border-hairline bg-surface p-0.5">
            {RANGES.map((range) => (
              <button
                key={range}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  range === "12m"
                    ? "bg-surface-2 text-ink shadow-[var(--shadow-card)]"
                    : "text-ink-3 hover:text-ink",
                )}
              >
                {range}
              </button>
            ))}
          </div>

          <Button variant="primary" size="sm">
            Export report
            <ArrowUpRight className="size-3.5" />
          </Button>
        </div>

        {/* KPI row */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {kpis.map((kpi) => (
            <StatTile key={kpi.id} kpi={kpi} />
          ))}
        </div>

        {/* Revenue + course mix */}
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader
              title="Revenue vs target"
              subtitle="Both series are in dollars, so they share one axis"
            />
            <CardBody>
              <RevenueChart />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Students by course" subtitle="Current enrolment mix" />
            <CardBody>
              <CourseMixChart />
            </CardBody>
          </Card>
        </div>

        {/* Enrollment + activity */}
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader title="Enrolment movement" subtitle="New vs churned, last 6 months" />
            <CardBody>
              <EnrollmentChart />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Recent activity" action={<Button size="sm" variant="ghost">View all</Button>} />
            <CardBody>
              <ul className="space-y-4">
                {activity.map((item) => {
                  const Icon = activityIcon[item.kind];
                  return (
                    <li key={item.id} className="flex gap-3">
                      <span
                        className={cn(
                          "mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg",
                          item.kind === "alert"
                            ? "bg-surface-2 text-critical"
                            : "bg-surface-2 text-ink-2",
                        )}
                      >
                        <Icon className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm leading-snug text-ink-2">
                          <span className="font-medium text-ink">{item.who}</span> {item.action}{" "}
                          <span className="font-medium text-ink">{item.target}</span>
                        </p>
                        <p className="mt-0.5 text-xs text-ink-3">{item.at}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </CardBody>
          </Card>
        </div>

        {/* Enrollments table + today's classes */}
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="overflow-hidden lg:col-span-2">
            <CardHeader
              title="Recent enrolments"
              subtitle="Latest 6 students across all courses"
              action={<Button size="sm" variant="outline">View all</Button>}
            />
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-y border-hairline bg-surface-2/60 text-left">
                    <th className="px-5 py-2.5 font-medium text-ink-3">Student</th>
                    <th className="px-5 py-2.5 font-medium text-ink-3">Course</th>
                    <th className="px-5 py-2.5 font-medium text-ink-3">Progress</th>
                    <th className="px-5 py-2.5 font-medium text-ink-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentEnrollments.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-hairline last:border-0 hover:bg-surface-2/50"
                    >
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2.5">
                          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent-soft text-[11px] font-semibold text-accent">
                            {initials(row.student)}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate font-medium text-ink">{row.student}</p>
                            <p className="truncate text-xs text-ink-3">{row.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <p className="text-ink-2">{row.course}</p>
                        <p className="text-xs text-ink-3">{row.teacher}</p>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-surface-3">
                            <div
                              className="h-full rounded-full bg-accent"
                              style={{ width: `${row.progress}%` }}
                            />
                          </div>
                          <span className="tnum text-xs text-ink-3">{row.progress}%</span>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <Badge tone={statusTone[row.status]}>{row.status}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <CardHeader title="Today's classes" subtitle="14 July 2026" />
            <CardBody>
              <ul className="space-y-2.5">
                {upcomingClasses.map((row) => (
                  <li
                    key={row.id}
                    className="flex items-center gap-3 rounded-lg border border-hairline p-3 transition-colors hover:bg-surface-2/60"
                  >
                    <span className="tnum w-11 shrink-0 text-xs font-medium text-ink-2">
                      {row.time}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{row.course}</p>
                      <p className="truncate text-xs text-ink-3">
                        {row.teacher} · {row.students} students
                      </p>
                    </div>
                    <Badge tone={statusTone[row.status]}>{row.status}</Badge>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
