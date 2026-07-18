"use client";

/*
 * Admin notification management.
 *
 * Six tabs matching the module spec: overview cards + channel health, the
 * notification centre table, broadcasts, templates, the failure queue and
 * analytics. Every number comes from the API — nothing is derived client-side,
 * so a card and a chart can never disagree.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Ban,
  Pencil,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  Loader2,
  Megaphone,
  RefreshCw,
  Send,
  Radio,
} from "lucide-react";
import Swal from "sweetalert2";

import { Card } from "@/components/ui/card";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Kpi, KpiGrid, EmptyState, relativeTime } from "@/components/dashboard/primitives";
import { BarChart, DonutChart, RateChart, TrendChart } from "@/components/dashboard/charts";
import {
  cancelBroadcast,
  fetchBroadcasts,
  fetchNotificationAdminDashboard,
  fetchNotificationAnalytics,
  fetchNotificationCentre,
  fetchNotificationFailures,
  fetchNotificationMeta,
  retryAllDeliveries,
  retryDelivery,
  runScheduledBroadcasts,
  sendBroadcastNow,
  NOTIFICATION_REPORTS,
  type BroadcastRow,
  type CentreQuery,
  type CentreRow,
  type DashboardRange,
  type DeliveryFailure,
  type NotificationAdminDashboard,
  type NotificationAnalytics,
  type NotificationMeta,
  type NotificationStatus,
} from "@/lib/api";
import { BroadcastComposer } from "./broadcast-composer";
import { TemplateManager } from "./template-manager";
import { downloadNotificationReport } from "./notification-report";

const swalBg = () =>
  typeof document !== "undefined" && document.documentElement.classList.contains("dark")
    ? "#18181b"
    : "#ffffff";

const TABS = [
  { key: "overview", label: "Overview", icon: Activity },
  { key: "centre", label: "Notification Centre", icon: Radio },
  { key: "broadcast", label: "Broadcast", icon: Megaphone },
  { key: "templates", label: "Templates", icon: FileText },
  { key: "failures", label: "Failures", icon: AlertTriangle },
  { key: "analytics", label: "Analytics", icon: BarChart3 },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const STATUS_TONE: Record<NotificationStatus, Tone> = {
  DRAFT: "neutral",
  SCHEDULED: "accent",
  QUEUED: "accent",
  SENT: "good",
  DELIVERED: "good",
  READ: "good",
  FAILED: "critical",
  ARCHIVED: "neutral",
};

export function NotificationManager() {
  const [tab, setTab] = useState<TabKey>("overview");
  const [meta, setMeta] = useState<NotificationMeta | null>(null);

  useEffect(() => {
    fetchNotificationMeta()
      .then(setMeta)
      .catch(() => setMeta(null));
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5 border-b border-hairline pb-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            aria-current={tab === t.key}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition-colors",
              tab === t.key ? "bg-accent text-accent-ink" : "text-ink-3 hover:bg-surface-2",
            )}
          >
            <t.icon className="size-3.5" aria-hidden />
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" ? <Overview /> : null}
      {tab === "centre" ? <Centre meta={meta} /> : null}
      {tab === "broadcast" ? <BroadcastTab /> : null}
      {tab === "templates" ? <TemplateManager /> : null}
      {tab === "failures" ? <Failures /> : null}
      {tab === "analytics" ? <Analytics /> : null}
    </div>
  );
}

// ─── Overview ────────────────────────────────────────────────────────────────

function Overview() {
  const [data, setData] = useState<NotificationAdminDashboard | null>(null);

  const load = useCallback(
    () =>
      fetchNotificationAdminDashboard()
        .then(setData)
        .catch(() => setData(null)),
    [],
  );

  useEffect(() => {
    void load();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 30_000);
    return () => clearInterval(t);
  }, [load]);

  if (!data) {
    return (
      <div className="grid place-items-center py-20">
        <Loader2 className="size-5 animate-spin text-ink-3" />
      </div>
    );
  }

  const c = data.cards;
  return (
    <div className="space-y-4">
      <KpiGrid className="lg:grid-cols-4 xl:grid-cols-4">
        <Kpi label="Today" value={c.todayNotifications} hint="notifications created" />
        <Kpi
          label="Failed"
          value={c.failed}
          tone={c.failed > 0 ? "critical" : "good"}
          hint="channel deliveries"
        />
        <Kpi label="Unread" value={c.unread} />
        <Kpi label="Queued" value={c.queued} tone={c.queued > 0 ? "warning" : "neutral"} />
        <Kpi label="Delivered" value={c.delivered} hint="channel attempts that left" />
        <Kpi
          label="Read Rate"
          value={`${c.readRate}%`}
          tone={c.readRate >= 50 ? "good" : "warning"}
        />
        <Kpi
          label="Delivery Rate"
          value={`${c.deliveryRate}%`}
          tone={c.deliveryRate >= 90 ? "good" : "warning"}
        />
        <Kpi label="Scheduled" value={c.scheduledBroadcasts} hint="broadcasts waiting" />
      </KpiGrid>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h2 className="mb-3 text-sm font-extrabold text-ink">Channel health</h2>
          <ul className="divide-y divide-hairline">
            {data.channels.map((ch) => (
              <li key={ch.channel} className="flex items-center gap-3 py-2.5">
                {ch.configured ? (
                  <CheckCircle2 className="size-4 shrink-0 text-good" aria-hidden />
                ) : (
                  <Ban className="size-4 shrink-0 text-ink-3" aria-hidden />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink">
                    {ch.channel.replace(/_/g, "-")}
                  </p>
                  <p className="text-xs text-ink-3">{ch.detail}</p>
                </div>
                <Badge tone={ch.configured ? "good" : "neutral"}>
                  {ch.configured ? "Ready" : "Not configured"}
                </Badge>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-4">
          <h2 className="mb-3 text-sm font-extrabold text-ink">Real-time</h2>
          <div className="grid grid-cols-2 gap-3">
            <Kpi label="Connected users" value={data.realtime.connectedUsers} />
            <Kpi label="Open streams" value={data.realtime.connections} />
          </div>
          <p className="mt-3 text-xs text-ink-3">
            Live server-sent connections on this API instance. Clients also poll every 60s as a
            fallback, so a user with no stream still receives notifications.
          </p>
          <div className="mt-3 flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => void load()}>
              <RefreshCw className="mr-1.5 size-3.5" /> Refresh
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                const r = await runScheduledBroadcasts().catch(() => null);
                Swal.fire({
                  toast: true,
                  position: "top-end",
                  icon: "success",
                  title: r ? `${r.dispatched} of ${r.due} dispatched` : "Sweep failed",
                  showConfirmButton: false,
                  timer: 1800,
                });
                void load();
              }}
            >
              <Clock className="mr-1.5 size-3.5" /> Run scheduled now
            </Button>
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <h2 className="mb-1 text-sm font-extrabold text-ink">Quick reports</h2>
        <p className="mb-3 text-xs text-ink-3">Downloads as CSV.</p>
        <div className="flex flex-wrap gap-2">
          {NOTIFICATION_REPORTS.map((r) => (
            <Button
              key={r.kind}
              variant="outline"
              size="sm"
              onClick={() => void downloadNotificationReport(r.kind, r.label)}
            >
              <Download className="mr-1.5 size-3.5" /> {r.label}
            </Button>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ─── Notification centre ─────────────────────────────────────────────────────

function Centre({ meta }: { meta: NotificationMeta | null }) {
  const [rows, setRows] = useState<CentreRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [filters, setFilters] = useState<CentreQuery>({});
  const [q, setQ] = useState("");
  const limit = 25;

  useEffect(() => {
    const t = setTimeout(() => setFilters((f) => ({ ...f, q: q.trim() || undefined })), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    setRows(null);
    fetchNotificationCentre({ ...filters, limit, offset })
      .then((r) => {
        setRows(r.items);
        setTotal(r.total);
      })
      .catch(() => setRows([]));
  }, [filters, offset]);

  const set = (patch: CentreQuery) => {
    setOffset(0);
    setFilters((f) => ({ ...f, ...patch }));
  };

  return (
    <div className="space-y-3">
      <Card className="flex flex-wrap items-center gap-2 p-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search title, body or recipient email…"
          className="h-9 min-w-[220px] flex-1 rounded-lg border border-hairline bg-surface-2 px-3 text-sm text-ink placeholder:text-ink-3 focus:outline-none"
        />
        <Select
          label="Category"
          value={filters.category ?? ""}
          options={meta?.categories ?? []}
          onChange={(v) => set({ category: (v || undefined) as CentreQuery["category"] })}
        />
        <Select
          label="Priority"
          value={filters.priority ?? ""}
          options={meta?.priorities ?? []}
          onChange={(v) => set({ priority: (v || undefined) as CentreQuery["priority"] })}
        />
        <Select
          label="Channel"
          value={filters.channel ?? ""}
          options={meta?.channels ?? []}
          onChange={(v) => set({ channel: (v || undefined) as CentreQuery["channel"] })}
        />
        <Select
          label="Status"
          value={filters.status ?? ""}
          options={meta?.statuses ?? []}
          onChange={(v) => set({ status: (v || undefined) as CentreQuery["status"] })}
        />
        <Select
          label="Role"
          value={filters.role ?? ""}
          options={meta?.roles ?? []}
          onChange={(v) => set({ role: (v || undefined) as CentreQuery["role"] })}
        />
      </Card>

      <Card className="p-0">
        {rows === null ? (
          <div className="grid place-items-center py-20">
            <Loader2 className="size-5 animate-spin text-ink-3" />
          </div>
        ) : !rows.length ? (
          <div className="py-16">
            <EmptyState title="Nothing matches these filters" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-xs">
              <thead>
                <tr className="border-b border-hairline bg-surface-2/45 text-[10px] font-extrabold tracking-wider text-ink-3 uppercase">
                  <th className="px-4 py-3">Time</th>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Title</th>
                  <th className="px-4 py-3">Channel</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {rows.map((r) => (
                  <tr key={r.id} className="align-top">
                    <td className="px-4 py-3 whitespace-nowrap text-ink-2">
                      {relativeTime(r.time)}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-bold text-ink">{r.user.name}</p>
                      <p className="text-[11px] text-ink-3">{r.user.email}</p>
                      <p className="text-[10px] text-ink-3">{r.user.role.replace(/_/g, " ")}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-ink">{r.title}</p>
                      <p className="mt-0.5 flex flex-wrap gap-1">
                        <Badge tone="neutral">{r.category}</Badge>
                        {r.priority === "CRITICAL" || r.priority === "HIGH" ? (
                          <Badge tone={r.priority === "CRITICAL" ? "critical" : "warning"}>
                            {r.priority}
                          </Badge>
                        ) : null}
                        <Badge tone="neutral">{r.type}</Badge>
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <ul className="space-y-1">
                        {r.channels.map((c) => (
                          <li key={c.channel} className="flex items-center gap-1.5">
                            <Badge
                              tone={
                                c.status === "FAILED"
                                  ? "critical"
                                  : c.skipped
                                    ? "neutral"
                                    : "good"
                              }
                            >
                              {c.channel.replace(/_/g, "-")}
                            </Badge>
                            {c.error ? (
                              <span className="truncate text-[10px] text-critical" title={c.error}>
                                {c.error}
                              </span>
                            ) : c.skipped ? (
                              <span className="truncate text-[10px] text-ink-3" title={c.skipped}>
                                skipped
                              </span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={STATUS_TONE[r.status] ?? "neutral"}>{r.status}</Badge>
                      {r.readAt ? (
                        <p className="mt-1 text-[10px] text-ink-3">read {relativeTime(r.readAt)}</p>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between border-t border-hairline px-4 py-2.5 text-xs text-ink-3">
          <span>
            {total === 0 ? "No rows" : `${offset + 1}–${Math.min(offset + limit, total)} of ${total}`}
          </span>
          <span className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={offset === 0}
              onClick={() => setOffset((o) => Math.max(0, o - limit))}
            >
              Previous
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={offset + limit >= total}
              onClick={() => setOffset((o) => o + limit)}
            >
              Next
            </Button>
          </span>
        </div>
      </Card>
    </div>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="text-xs">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 rounded-lg border border-hairline bg-surface-2 px-2 text-xs font-semibold text-ink focus:outline-none"
      >
        <option value="">{label}: all</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o.replace(/_/g, " ")}
          </option>
        ))}
      </select>
    </label>
  );
}

// ─── Broadcast ───────────────────────────────────────────────────────────────

function BroadcastTab() {
  const [rows, setRows] = useState<BroadcastRow[] | null>(null);
  /** The draft currently loaded into the composer, if any. */
  const [draft, setDraft] = useState<BroadcastRow | null>(null);

  const load = useCallback(
    () =>
      fetchBroadcasts()
        .then(setRows)
        .catch(() => setRows([])),
    [],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const cancel = async (b: BroadcastRow) => {
    const isDraft = b.status === "DRAFT";
    const ok = await Swal.fire({
      title: isDraft ? "Discard this draft?" : "Cancel this scheduled broadcast?",
      text: `"${b.title}" will not be sent.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: isDraft ? "Discard" : "Cancel it",
      confirmButtonColor: "#e11d48",
      background: swalBg(),
    });
    if (!ok.isConfirmed) return;
    await cancelBroadcast(b.id).catch((e: Error) =>
      Swal.fire({ title: "Failed", text: e.message, icon: "error", background: swalBg() }),
    );
    void load();
  };

  const sendNow = async (b: BroadcastRow) => {
    const ok = await Swal.fire({
      title: "Send this now?",
      text: `"${b.title}" will go out immediately.`,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Send now",
      background: swalBg(),
    });
    if (!ok.isConfirmed) return;
    await sendBroadcastNow(b.id).catch((e: Error) =>
      Swal.fire({ title: "Failed", text: e.message, icon: "error", background: swalBg() }),
    );
    void load();
  };

  const editDraft = (b: BroadcastRow) => {
    setDraft(b);
    // The composer sits above the list; without this the form silently changes
    // off-screen and the click looks like it did nothing.
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="space-y-4">
      <BroadcastComposer
        onSent={() => {
          setDraft(null);
          void load();
        }}
        editDraft={draft}
      />

      <Card className="p-0">
        <div className="border-b border-hairline px-4 py-3">
          <h2 className="text-sm font-extrabold text-ink">Broadcast history</h2>
        </div>
        {rows === null ? (
          <div className="grid place-items-center py-16">
            <Loader2 className="size-5 animate-spin text-ink-3" />
          </div>
        ) : !rows.length ? (
          <div className="py-14">
            <EmptyState title="No broadcasts sent yet" icon={Megaphone} />
          </div>
        ) : (
          <ul className="divide-y divide-hairline">
            {rows.map((b) => (
              <li key={b.id} className="flex flex-wrap items-start gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-ink">{b.title}</span>
                    <Badge tone={STATUS_TONE[b.status] ?? "neutral"}>{b.status}</Badge>
                    <Badge tone="neutral">{b.audience}</Badge>
                    {b.roles.length ? (
                      <Badge tone="neutral">{b.roles.join(", ").replace(/_/g, " ")}</Badge>
                    ) : null}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-ink-2">{b.body}</p>
                  <p className="mt-1 text-[11px] text-ink-3">
                    {b.sentAt
                      ? `Sent ${relativeTime(b.sentAt)} · ${b.sentCount} of ${b.recipientCount}` +
                        (b.failedCount ? ` · ${b.failedCount} failed` : "")
                      : b.status === "DRAFT"
                        ? "Draft — not scheduled"
                        : b.scheduledAt
                          ? `Scheduled for ${new Date(b.scheduledAt).toLocaleString()}`
                          : "Not sent"}
                    {b.createdByName ? ` · by ${b.createdByName}` : ""}
                  </p>
                </div>
                {b.status === "SCHEDULED" || b.status === "DRAFT" ? (
                  <div className="flex gap-2">
                    {b.status === "DRAFT" ? (
                      <Button variant="ghost" size="sm" onClick={() => editDraft(b)}>
                        <Pencil className="mr-1.5 size-3.5" /> Edit
                      </Button>
                    ) : (
                      <Button variant="ghost" size="sm" onClick={() => void sendNow(b)}>
                        <Send className="mr-1.5 size-3.5" /> Send now
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => void cancel(b)}>
                      <Ban className="mr-1.5 size-3.5" />
                      {b.status === "DRAFT" ? "Discard" : "Cancel"}
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

// ─── Failures ────────────────────────────────────────────────────────────────

function Failures() {
  const [rows, setRows] = useState<DeliveryFailure[] | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    () =>
      fetchNotificationFailures()
        .then(setRows)
        .catch(() => setRows([])),
    [],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const retryOne = async (id: string) => {
    const r = await retryDelivery(id).catch(() => ({ success: false, reason: "Request failed" }));
    Swal.fire({
      toast: true,
      position: "top-end",
      icon: r.success ? "success" : "error",
      title: r.success ? "Delivered" : (r.reason ?? "Still failing"),
      showConfirmButton: false,
      timer: 1800,
    });
    void load();
  };

  const retryAll = async () => {
    setBusy(true);
    const r = await retryAllDeliveries().catch(() => null);
    setBusy(false);
    Swal.fire({
      toast: true,
      position: "top-end",
      icon: "success",
      title: r ? `${r.retried} retried · ${r.recovered} recovered` : "Sweep failed",
      showConfirmButton: false,
      timer: 2200,
    });
    void load();
  };

  return (
    <Card className="p-0">
      <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
        <div>
          <h2 className="text-sm font-extrabold text-ink">Failed deliveries</h2>
          <p className="text-xs text-ink-3">
            Retried automatically with a widening backoff, up to four attempts.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={retryAll} disabled={busy}>
          {busy ? (
            <Loader2 className="mr-1.5 size-3.5 animate-spin" />
          ) : (
            <RefreshCw className="mr-1.5 size-3.5" />
          )}
          Retry all
        </Button>
      </div>

      {rows === null ? (
        <div className="grid place-items-center py-16">
          <Loader2 className="size-5 animate-spin text-ink-3" />
        </div>
      ) : !rows.length ? (
        <div className="py-14">
          <EmptyState title="Nothing has failed" icon={CheckCircle2} />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead>
              <tr className="border-b border-hairline bg-surface-2/45 text-[10px] font-extrabold tracking-wider text-ink-3 uppercase">
                <th className="px-4 py-3">Failed</th>
                <th className="px-4 py-3">Channel</th>
                <th className="px-4 py-3">Recipient</th>
                <th className="px-4 py-3">Notification</th>
                <th className="px-4 py-3">Error</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {rows.map((f) => (
                <tr key={f.deliveryId}>
                  <td className="px-4 py-3 whitespace-nowrap text-ink-2">
                    {f.failedAt ? relativeTime(f.failedAt) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone="critical">{f.channel.replace(/_/g, "-")}</Badge>
                    <span className="ml-1.5 text-[10px] text-ink-3">×{f.attempts}</span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-bold text-ink">{f.recipient.name}</p>
                    <p className="text-[11px] text-ink-3">{f.target ?? f.recipient.email}</p>
                  </td>
                  <td className="px-4 py-3 text-ink-2">{f.title}</td>
                  <td className="px-4 py-3 text-critical">{f.error ?? "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="ghost" size="sm" onClick={() => void retryOne(f.deliveryId)}>
                      Retry
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ─── Analytics ───────────────────────────────────────────────────────────────

const RANGES: DashboardRange[] = ["7d", "30d", "90d", "12m"];

function Analytics() {
  const [range, setRange] = useState<DashboardRange>("30d");
  const [data, setData] = useState<NotificationAnalytics | null>(null);

  useEffect(() => {
    setData(null);
    fetchNotificationAnalytics(range)
      .then(setData)
      .catch(() => setData(null));
  }, [range]);

  const avgRead = useMemo(() => {
    if (!data) return "—";
    const m = data.cards.avgReadMinutes;
    if (m <= 0) return "—";
    if (m < 60) return `${m}m`;
    if (m < 1440) return `${Math.round(m / 60)}h`;
    return `${Math.round(m / 1440)}d`;
  }, [data]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {RANGES.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRange(r)}
            aria-pressed={range === r}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
              range === r
                ? "border-transparent bg-accent text-accent-ink"
                : "border-hairline text-ink-2 hover:bg-surface-2",
            )}
          >
            {r}
          </button>
        ))}
      </div>

      {!data ? (
        <div className="grid place-items-center py-20">
          <Loader2 className="size-5 animate-spin text-ink-3" />
        </div>
      ) : (
        <>
          <KpiGrid className="lg:grid-cols-5 xl:grid-cols-5">
            <Kpi label="Total" value={data.cards.total} />
            <Kpi
              label="Delivery %"
              value={`${data.cards.deliveryRate}%`}
              tone={data.cards.deliveryRate >= 90 ? "good" : "warning"}
            />
            <Kpi
              label="Read %"
              value={`${data.cards.readRate}%`}
              tone={data.cards.readRate >= 50 ? "good" : "warning"}
            />
            <Kpi
              label="Failure %"
              value={`${data.cards.failureRate}%`}
              tone={data.cards.failureRate > 5 ? "critical" : "good"}
            />
            <Kpi label="Avg read time" value={avgRead} hint="from send to open" />
          </KpiGrid>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-4">
              <h3 className="mb-2 text-sm font-extrabold text-ink">Daily notifications</h3>
              <TrendChart
                data={data.charts.daily}
                series={[{ key: "count", name: "Notifications" }]}
                area
              />
            </Card>
            <Card className="p-4">
              <h3 className="mb-2 text-sm font-extrabold text-ink">Channel usage</h3>
              <DonutChart data={data.charts.channelUsage} />
            </Card>
            <Card className="p-4">
              <h3 className="mb-2 text-sm font-extrabold text-ink">Role-wise notifications</h3>
              <BarChart
                data={data.charts.byRole.map((r) => ({ label: r.name, value: r.value }))}
                series={[{ key: "value", name: "Notifications" }]}
                layout="horizontal"
              />
            </Card>
            <Card className="p-4">
              <h3 className="mb-2 text-sm font-extrabold text-ink">Read trend</h3>
              <RateChart data={data.charts.readTrend} name="Read rate" />
            </Card>
            <Card className="p-4">
              <h3 className="mb-2 text-sm font-extrabold text-ink">Failure trend</h3>
              <RateChart data={data.charts.failureTrend} name="Failure rate" />
            </Card>
            <Card className="p-4">
              <h3 className="mb-2 text-sm font-extrabold text-ink">By category</h3>
              <DonutChart data={data.charts.byCategory} />
            </Card>
            <Card className="p-4">
              <h3 className="mb-2 text-sm font-extrabold text-ink">By priority</h3>
              <BarChart
                data={data.charts.byPriority.map((p) => ({ label: p.name, value: p.value }))}
                series={[{ key: "value", name: "Notifications" }]}
                layout="horizontal"
              />
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
