"use client";

/*
 * The notification inbox every role shares.
 *
 * Filters, search and pagination are all server-side — the client never holds
 * the full history, so a user with thousands of notifications pages through
 * them rather than downloading them.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Archive,
  BellOff,
  CheckCheck,
  Loader2,
  Search,
  Send,
  Settings2,
} from "lucide-react";
import Swal from "sweetalert2";

import { Card } from "@/components/ui/card";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/store/auth";
import { useNotificationStream } from "@/lib/notification-stream";
import { EmptyState, relativeTime } from "@/components/dashboard/primitives";
import {
  archiveNotification,
  archiveReadNotifications,
  fetchNotificationFeed,
  fetchNotificationSummary,
  markAllNotificationsRead,
  markNotificationRead,
  type AppNotification,
  type NotificationCategory,
  type NotificationPriority,
} from "@/lib/api";
import { ComposeDialog } from "./compose-dialog";

const swalBg = () =>
  typeof document !== "undefined" && document.documentElement.classList.contains("dark")
    ? "#18181b"
    : "#ffffff";

const PRIORITY_TONE: Record<NotificationPriority, Tone> = {
  CRITICAL: "critical",
  HIGH: "warning",
  MEDIUM: "accent",
  LOW: "neutral",
};

const CATEGORY_LABEL: Record<NotificationCategory, string> = {
  ACADEMIC: "Academic",
  ATTENDANCE: "Attendance",
  ASSIGNMENT: "Assignment",
  ASSESSMENT: "Assessment",
  FINANCE: "Finance",
  PROGRESS: "Progress",
  SYSTEM: "System",
};

/*
 * Roles the API gives an outbox. This only decides whether the button is drawn —
 * the API re-derives the same rule per recipient, so a student still cannot reach
 * a teacher who does not teach them.
 */
const CAN_COMPOSE = ["ADMIN", "SUPERVISOR", "ACADEMIC_COACH", "TEACHER", "STUDENT"];

export function NotificationInbox() {
  const { user } = useAuth();
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [summary, setSummary] = useState<
    { category: NotificationCategory; total: number; unread: number }[]
  >([]);

  const [category, setCategory] = useState<NotificationCategory | "">("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [composeOpen, setComposeOpen] = useState(false);

  // Debounce the search box so typing does not fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setSearch(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    const res = await fetchNotificationFeed({
      limit: 25,
      category: category || undefined,
      unreadOnly: unreadOnly || undefined,
      includeArchived: includeArchived || undefined,
      q: search || undefined,
    }).catch(() => ({ items: [], nextCursor: null }));
    setItems(res.items);
    setCursor(res.nextCursor);
  }, [category, unreadOnly, includeArchived, search]);

  const loadSummary = useCallback(
    () =>
      fetchNotificationSummary()
        .then(setSummary)
        .catch(() => setSummary([])),
    [],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  // A new notification lands in the list without a refresh.
  useNotificationStream(
    useCallback(
      (kind) => {
        if (kind === "ping") return;
        void load();
        void loadSummary();
      },
      [load, loadSummary],
    ),
  );

  const more = async () => {
    if (!cursor) return;
    setLoadingMore(true);
    const res = await fetchNotificationFeed({
      limit: 25,
      cursor,
      category: category || undefined,
      unreadOnly: unreadOnly || undefined,
      includeArchived: includeArchived || undefined,
      q: search || undefined,
    }).catch(() => ({ items: [], nextCursor: null }));
    setItems((cur) => [...(cur ?? []), ...res.items]);
    setCursor(res.nextCursor);
    setLoadingMore(false);
  };

  const openOne = async (n: AppNotification) => {
    if (!n.read) {
      // Optimistic, then reconciled by the reload the stream triggers.
      setItems((cur) => cur?.map((x) => (x.id === n.id ? { ...x, read: true } : x)) ?? null);
      await markNotificationRead(n.id).catch(() => undefined);
      void loadSummary();
    }
  };

  const readAll = async () => {
    await markAllNotificationsRead().catch(() => undefined);
    await Promise.all([load(), loadSummary()]);
  };

  const archiveOne = async (id: string) => {
    setItems((cur) => cur?.filter((x) => x.id !== id) ?? null);
    await archiveNotification(id).catch(() => undefined);
    void loadSummary();
  };

  const archiveRead = async () => {
    const ok = await Swal.fire({
      title: "Archive everything already read?",
      text: "They stay in your history and can be shown again with the Archived filter.",
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Archive",
      background: swalBg(),
    });
    if (!ok.isConfirmed) return;
    const res = await archiveReadNotifications().catch(() => ({ count: 0 }));
    await Promise.all([load(), loadSummary()]);
    Swal.fire({
      toast: true,
      position: "top-end",
      icon: "success",
      title: `${res.count} archived`,
      showConfirmButton: false,
      timer: 1600,
    });
  };

  const totalUnread = summary.reduce((sum, s) => sum + s.unread, 0);

  return (
    <div className="space-y-4">
      {/* Category chips, counts straight from the server */}
      <div className="flex flex-wrap items-center gap-2">
        <Chip active={category === ""} onClick={() => setCategory("")}>
          All{totalUnread > 0 ? ` · ${totalUnread}` : ""}
        </Chip>
        {summary
          .filter((s) => s.total > 0)
          .map((s) => (
            <Chip
              key={s.category}
              active={category === s.category}
              onClick={() => setCategory(category === s.category ? "" : s.category)}
            >
              {CATEGORY_LABEL[s.category]}
              {s.unread > 0 ? ` · ${s.unread}` : ""}
            </Chip>
          ))}
      </div>

      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-[200px] flex-1">
            <span className="sr-only">Search notifications</span>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search notifications…"
              className="h-9 w-full rounded-lg border border-hairline bg-surface-2 pr-3 pl-9 text-sm text-ink placeholder:text-ink-3 focus:outline-none"
            />
          </label>

          <Toggle active={unreadOnly} onClick={() => setUnreadOnly((v) => !v)}>
            Unread only
          </Toggle>
          <Toggle active={includeArchived} onClick={() => setIncludeArchived((v) => !v)}>
            Archived
          </Toggle>

          <div className="ml-auto flex items-center gap-2">
            {CAN_COMPOSE.includes(user?.role ?? "") ? (
              <Button variant="primary" size="sm" onClick={() => setComposeOpen(true)}>
                <Send className="mr-1.5 size-3.5" /> Send
              </Button>
            ) : null}
            <Button variant="ghost" size="sm" onClick={readAll} disabled={totalUnread === 0}>
              <CheckCheck className="mr-1.5 size-3.5" /> Mark all read
            </Button>
            <Button variant="ghost" size="sm" onClick={archiveRead}>
              <Archive className="mr-1.5 size-3.5" /> Archive read
            </Button>
            <Link
              href="/notifications/settings"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-ink-3 hover:bg-surface-2 hover:text-ink"
            >
              <Settings2 className="size-3.5" /> Settings
            </Link>
          </div>
        </div>
      </Card>

      <Card className="p-0">
        {items === null ? (
          <div className="grid place-items-center py-20">
            <Loader2 className="size-5 animate-spin text-ink-3" />
          </div>
        ) : !items.length ? (
          <div className="py-16">
            <EmptyState
              title={
                search || category || unreadOnly
                  ? "Nothing matches these filters"
                  : "No notifications yet"
              }
              icon={BellOff}
            />
          </div>
        ) : (
          <ul className="divide-y divide-hairline">
            {items.map((n) => {
              const Row = (
                <>
                  <span
                    className={cn(
                      "mt-1.5 size-2 shrink-0 rounded-full",
                      n.read ? "bg-transparent" : "bg-accent",
                      !n.read && n.priority === "CRITICAL" && "bg-critical",
                    )}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          "text-sm text-ink",
                          n.read ? "font-medium" : "font-extrabold",
                        )}
                      >
                        {n.title}
                      </span>
                      {n.priority === "CRITICAL" || n.priority === "HIGH" ? (
                        <Badge tone={PRIORITY_TONE[n.priority]}>
                          {n.priority === "CRITICAL" ? (
                            <AlertTriangle className="mr-1 inline size-3" aria-hidden />
                          ) : null}
                          {n.priority}
                        </Badge>
                      ) : null}
                      <Badge tone="neutral">{CATEGORY_LABEL[n.category]}</Badge>
                      {n.archivedAt ? <Badge tone="neutral">Archived</Badge> : null}
                    </span>
                    {n.body ? (
                      <span className="mt-1 block text-xs text-ink-2">{n.body}</span>
                    ) : null}
                    <span className="mt-1 block text-[11px] text-ink-3">
                      {relativeTime(n.createdAt)}
                      {n.actorName ? ` · ${n.actorName}` : ""}
                    </span>
                  </span>
                </>
              );

              return (
                <li
                  key={n.id}
                  className={cn(
                    "group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-surface-2/50",
                    !n.read && "bg-accent/5",
                  )}
                >
                  {n.link ? (
                    <Link
                      href={n.link}
                      onClick={() => void openOne(n)}
                      className="flex min-w-0 flex-1 items-start gap-3"
                    >
                      {Row}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void openOne(n)}
                      className="flex min-w-0 flex-1 items-start gap-3 text-left"
                    >
                      {Row}
                    </button>
                  )}
                  {!n.archivedAt ? (
                    <button
                      type="button"
                      onClick={() => void archiveOne(n.id)}
                      aria-label={`Archive ${n.title}`}
                      className="mt-0.5 shrink-0 rounded-lg p-1.5 text-ink-3 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-surface-3 hover:text-ink focus:opacity-100"
                    >
                      <Archive className="size-4" />
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}

        {cursor ? (
          <div className="border-t border-hairline p-3 text-center">
            <Button variant="ghost" size="sm" onClick={more} disabled={loadingMore}>
              {loadingMore ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : null}
              Load more
            </Button>
          </div>
        ) : null}
      </Card>

      {composeOpen ? (
        <ComposeDialog
          onClose={() => setComposeOpen(false)}
          onSent={() => {
            setComposeOpen(false);
            void load();
          }}
        />
      ) : null}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
        active
          ? "border-transparent bg-accent text-accent-ink"
          : "border-hairline text-ink-2 hover:bg-surface-2",
      )}
    >
      {children}
    </button>
  );
}

function Toggle({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "h-9 rounded-lg border px-3 text-xs font-semibold transition-colors",
        active
          ? "border-accent bg-accent-soft text-ink"
          : "border-hairline text-ink-3 hover:bg-surface-2",
      )}
    >
      {children}
    </button>
  );
}
