"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, BookUser, CalendarRange, Loader2, Scale, UserX, Users,
} from "lucide-react";

import { Topbar } from "@/components/layout/topbar";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { IMPACT_OPTION_LABELS, LEAVE_TYPE_LABELS, Stat, fmtDay, fmtWindow } from "@/components/leaves/shared";
import {
  fetchLeaveRegister, fetchLeaveSummaryReport, fetchPaidUnpaidReport,
  fetchUnavailabilityImpactReport, fetchUnavailabilityReport,
} from "@/lib/api";

const input =
  "h-9 rounded-xl border border-hairline bg-surface px-3 text-sm text-ink outline-none focus:border-accent";

type Tab = "summary" | "paid" | "unavailability" | "impact" | "register";

/** §9.10 — the five reports the spec names, one tab each. */
const TABS: { key: Tab; label: string; icon: typeof Users }[] = [
  { key: "summary", label: "Staff leave summary", icon: Users },
  { key: "paid", label: "Paid vs unpaid", icon: Scale },
  { key: "unavailability", label: "Teacher unavailability", icon: UserX },
  { key: "impact", label: "Unavailability impact", icon: CalendarRange },
  { key: "register", label: "Monthly register", icon: BookUser },
];

const Table = ({ head, children }: { head: string[]; children: React.ReactNode }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-left text-xs">
      <thead className="border-b border-hairline bg-surface-2/40">
        <tr>
          {head.map((h) => (
            <th key={h} className="px-3 py-2 text-[10px] font-extrabold uppercase tracking-wider text-ink-3">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  </div>
);

const Row = ({ children }: { children: React.ReactNode }) => (
  <tr className="border-b border-hairline/60 last:border-0">{children}</tr>
);

export default function LeaveReportsPage() {
  const [tab, setTab] = useState<Tab>("summary");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [month, setMonth] = useState("");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<unknown>(null);

  const load = useCallback(() => {
    setLoading(true);
    const f = from ? new Date(from).toISOString() : undefined;
    const t = to ? new Date(`${to}T23:59:59`).toISOString() : undefined;
    const call =
      tab === "summary" ? fetchLeaveSummaryReport(f, t)
      : tab === "paid" ? fetchPaidUnpaidReport(f, t)
      : tab === "unavailability" ? fetchUnavailabilityReport(f, t)
      : tab === "impact" ? fetchUnavailabilityImpactReport(f, t)
      : fetchLeaveRegister(month || undefined);
    call
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [tab, from, to, month]);

  useEffect(() => load(), [load]);

  return (
    <>
      <Topbar title="Leave Reports" subtitle="Who was away, what it cost, and what it did to classes" />

      <div className="animate-fade-up space-y-5 p-4 lg:p-6">
        <Link href="/leaves" className="flex w-fit items-center gap-1 text-[11px] font-bold text-ink-3 hover:text-ink">
          <ArrowLeft className="size-3.5" /> Back to leave requests
        </Link>

        <div className="flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition ${
                tab === t.key ? "bg-accent text-accent-ink" : "border border-hairline bg-surface text-ink-2 hover:text-ink"
              }`}
            >
              <t.icon className="size-3.5" /> {t.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {tab === "register" ? (
            <input type="month" className={input} value={month} onChange={(e) => setMonth(e.target.value)} />
          ) : (
            <>
              <input type="date" className={input} value={from} onChange={(e) => setFrom(e.target.value)} title="From" />
              <input type="date" className={input} value={to} onChange={(e) => setTo(e.target.value)} title="To" />
              <span className="text-[11px] text-ink-3">Defaults to the last 12 months.</span>
            </>
          )}
        </div>

        {loading ? (
          <div className="flex items-center gap-2 p-8 text-xs font-bold text-ink-3">
            <Loader2 className="size-4 animate-spin text-accent" /> Loading…
          </div>
        ) : !data ? (
          <Card className="border border-hairline bg-surface">
            <CardBody className="p-8 text-center text-xs text-ink-3">Could not load that report.</CardBody>
          </Card>
        ) : (
          <>
            {tab === "summary" ? <Summary d={data as never} /> : null}
            {tab === "paid" ? <PaidUnpaid d={data as never} /> : null}
            {tab === "unavailability" ? <Unavailability d={data as never} /> : null}
            {tab === "impact" ? <Impact d={data as never} /> : null}
            {tab === "register" ? <Register d={data as never} /> : null}
          </>
        )}
      </div>
    </>
  );
}

type SummaryData = Awaited<ReturnType<typeof fetchLeaveSummaryReport>>;
function Summary({ d }: { d: SummaryData }) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Staff who took leave" value={d.totals.people} />
        <Stat label="Requests" value={d.totals.requests} />
        <Stat label="Total days" value={d.totals.days} />
        <Stat label="Paid days" value={d.totals.paidDays} />
        <Stat label="Unpaid days" value={d.totals.unpaidDays} tone={d.totals.unpaidDays ? "text-red-600 dark:text-red-400" : undefined} />
      </div>
      <Card className="border border-hairline bg-surface">
        <CardBody className="p-0">
          <Table head={["Staff", "Role", "Requests", "Days", "Paid", "Unpaid", "Most used"]}>
            {d.staff.map((s) => {
              const top = Object.entries(s.byType).sort((a, b) => b[1] - a[1])[0];
              return (
                <Row key={s.userId}>
                  <td className="px-3 py-2 font-bold text-ink">{s.name}</td>
                  <td className="px-3 py-2 text-ink-3">{s.role.replace(/_/g, " ")}</td>
                  <td className="px-3 py-2">{s.requests}</td>
                  <td className="px-3 py-2 font-semibold">{s.totalDays}</td>
                  <td className="px-3 py-2">{s.paidDays}</td>
                  <td className="px-3 py-2 text-red-600 dark:text-red-400">{s.unpaidDays || "—"}</td>
                  <td className="px-3 py-2 text-ink-3">
                    {top ? `${LEAVE_TYPE_LABELS[top[0]] ?? top[0]} (${top[1]}d)` : "—"}
                  </td>
                </Row>
              );
            })}
          </Table>
        </CardBody>
      </Card>
    </>
  );
}

type PaidData = Awaited<ReturnType<typeof fetchPaidUnpaidReport>>;
function PaidUnpaid({ d }: { d: PaidData }) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Paid days" value={d.paid.days} />
        <Stat label="Unpaid days" value={d.unpaid.days} />
        <Stat label="Deducted" value={d.unpaid.deductionTotal} />
        <Stat
          label="Not yet charged"
          value={d.unpaid.pendingDeduction}
          tone={d.unpaid.pendingDeduction ? "text-amber-600 dark:text-amber-400" : undefined}
        />
        <Stat label="Not recorded" value={d.unclassified.days} />
      </div>
      {d.unclassified.requests > 0 ? (
        <Card className="border border-hairline bg-surface">
          <CardBody className="p-3 text-[11px] text-ink-3">
            {d.unclassified.requests} approved request(s) predate paid/unpaid tracking, so they are counted in the totals
            but in neither column.
          </CardBody>
        </Card>
      ) : null}
      <Card className="border border-hairline bg-surface">
        <CardBody className="p-0">
          <Table head={["Staff", "Role", "Type", "Window", "Days", "Deduction", "Charged"]}>
            {d.rows.map((r) => (
              <Row key={r.id}>
                <td className="px-3 py-2 font-bold text-ink">{r.name}</td>
                <td className="px-3 py-2 text-ink-3">{r.role.replace(/_/g, " ")}</td>
                <td className="px-3 py-2">{LEAVE_TYPE_LABELS[r.leaveType] ?? r.leaveType}</td>
                <td className="px-3 py-2 text-ink-3">{fmtWindow(r.from, r.to)}</td>
                <td className="px-3 py-2">{r.days}</td>
                <td className="px-3 py-2 font-semibold">{r.deduction}</td>
                <td className="px-3 py-2">
                  <Badge tone={r.charged ? "good" : "warning"}>{r.charged ? "Yes" : "Pending"}</Badge>
                </td>
              </Row>
            ))}
          </Table>
        </CardBody>
      </Card>
    </>
  );
}

type UnavailData = Awaited<ReturnType<typeof fetchUnavailabilityReport>>;
function Unavailability({ d }: { d: UnavailData }) {
  const STATE_TONE: Record<string, "good" | "warning" | "accent" | "neutral"> = {
    AWAY_NOW: "warning",
    UPCOMING: "accent",
    RETURNED: "good",
    ENDED_PENDING_RETURN: "neutral",
  };
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Spells of absence" value={d.totals.spells} />
        <Stat label="Days lost" value={d.totals.days} />
        <Stat label="Away right now" value={d.totals.awayNow} tone={d.totals.awayNow ? "text-amber-600 dark:text-amber-400" : undefined} />
      </div>
      <Card className="border border-hairline bg-surface">
        <CardBody className="p-0">
          <Table head={["Teacher", "Type", "Window", "Days", "Students hit", "State"]}>
            {d.rows.map((r) => (
              <Row key={r.id}>
                <td className="px-3 py-2 font-bold text-ink">{r.teacher}</td>
                <td className="px-3 py-2">{LEAVE_TYPE_LABELS[r.type] ?? r.type}</td>
                <td className="px-3 py-2 text-ink-3">{fmtWindow(r.from, r.to)}</td>
                <td className="px-3 py-2">{r.days}</td>
                <td className="px-3 py-2">{r.studentsAffected}</td>
                <td className="px-3 py-2">
                  <Badge tone={STATE_TONE[r.state] ?? "neutral"}>{r.state.replace(/_/g, " ").toLowerCase()}</Badge>
                </td>
              </Row>
            ))}
          </Table>
        </CardBody>
      </Card>
    </>
  );
}

type ImpactData = Awaited<ReturnType<typeof fetchUnavailabilityImpactReport>>;
function Impact({ d }: { d: ImpactData }) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Students affected" value={d.totals.studentsAffected} />
        <Stat label="Classes disrupted" value={d.totals.classesDisrupted} />
        <Stat
          label="Still undecided"
          value={d.totals.awaitingDecision}
          tone={d.totals.awaitingDecision ? "text-amber-600 dark:text-amber-400" : undefined}
        />
        <Stat label="Cycle days given back" value={d.totals.cycleDaysGiven} />
        <Stat label="Arranged" value={`${d.totals.resolvedPct}%`} />
      </div>
      <Card className="border border-hairline bg-surface">
        <CardBody className="p-4">
          <p className="mb-2 text-[10px] font-extrabold uppercase tracking-wider text-ink-3">What families chose</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(d.byOption).map(([k, v]) => (
              <Badge key={k} tone={k === "PENDING_REVIEW" && v > 0 ? "warning" : "neutral"}>
                {IMPACT_OPTION_LABELS[k as keyof typeof IMPACT_OPTION_LABELS] ?? k}: {v}
              </Badge>
            ))}
          </div>
        </CardBody>
      </Card>
      <Card className="border border-hairline bg-surface">
        <CardBody className="p-0">
          <Table head={["Student", "Course", "Teacher", "Window", "Classes", "Outcome", "Decided"]}>
            {d.rows.map((r) => (
              <Row key={r.id}>
                <td className="px-3 py-2 font-bold text-ink">{r.student}</td>
                <td className="px-3 py-2 text-ink-3">{r.course ?? "—"}</td>
                <td className="px-3 py-2">{r.teacher}</td>
                <td className="px-3 py-2 text-ink-3">{fmtWindow(r.from, r.to)}</td>
                <td className="px-3 py-2">{r.classes}</td>
                <td className="px-3 py-2">
                  {IMPACT_OPTION_LABELS[r.option as keyof typeof IMPACT_OPTION_LABELS] ?? r.option}
                  {r.temporaryTeacher ? ` · ${r.temporaryTeacher}` : ""}
                  {r.cycleExtendedDays ? ` · +${r.cycleExtendedDays}d` : ""}
                </td>
                <td className="px-3 py-2 text-ink-3">{r.decidedBy ? `${r.decidedBy}, ${fmtDay(r.decidedAt)}` : "—"}</td>
              </Row>
            ))}
          </Table>
        </CardBody>
      </Card>
    </>
  );
}

type RegisterData = Awaited<ReturnType<typeof fetchLeaveRegister>>;
function Register({ d }: { d: RegisterData }) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Month" value={d.monthLabel} />
        <Stat label="Requests" value={d.totals.requests} />
        <Stat label="Days in month" value={d.totals.days} />
        <Stat label="Unpaid days" value={d.totals.unpaidDays} />
        <Stat label="Deducted" value={d.totals.deduction} />
      </div>
      <Card className="border border-hairline bg-surface">
        <CardBody className="p-0">
          {/* §9.9's field list, in the order the spec gives it. */}
          <Table head={["Staff", "Type", "From", "To", "Total", "In month", "Paid", "Approved by", "Reason", "Doc"]}>
            {d.rows.map((r) => (
              <Row key={r.id}>
                <td className="px-3 py-2 font-bold text-ink">
                  {r.name}
                  <span className="ml-1 text-[10px] text-ink-3">{r.role.replace(/_/g, " ")}</span>
                </td>
                <td className="px-3 py-2">
                  {LEAVE_TYPE_LABELS[r.type] ?? r.type}
                  {r.datesModified ? <span className="ml-1 text-[10px] text-amber-600">(dates changed)</span> : null}
                </td>
                <td className="px-3 py-2 text-ink-3">{fmtDay(r.from)}</td>
                <td className="px-3 py-2 text-ink-3">{fmtDay(r.to)}</td>
                <td className="px-3 py-2">{r.totalDays}</td>
                <td className="px-3 py-2 font-semibold">{r.daysInMonth}</td>
                <td className="px-3 py-2">
                  {r.paid === null ? "—" : r.paid ? "Paid" : `Unpaid (${r.deduction})`}
                </td>
                <td className="px-3 py-2 text-ink-3">
                  {r.approvedBy ?? "—"}
                  {r.approvedAt ? <span className="block text-[10px]">{fmtDay(r.approvedAt)}</span> : null}
                </td>
                <td className="max-w-[220px] px-3 py-2 text-ink-3">{r.reason}</td>
                <td className="px-3 py-2">{r.hasDocument ? "Yes" : "—"}</td>
              </Row>
            ))}
          </Table>
        </CardBody>
      </Card>
    </>
  );
}
