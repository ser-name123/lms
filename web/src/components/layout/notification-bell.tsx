"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, Loader2, Settings2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useNotificationStream } from "@/lib/notification-stream";
import {
  fetchNotifications,
  fetchUnreadCount,
  markAllNotificationsRead,
  markNotificationRead,
  type AppNotification,
} from "@/lib/api";

/** Critical notifications get a red dot and sort to the top of the panel. */
const PRIORITY_DOT: Record<string, string> = {
  CRITICAL: "bg-critical",
  HIGH: "bg-warning",
  MEDIUM: "bg-accent",
  LOW: "bg-accent",
};

export function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [critical, setCritical] = useState(0);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(false);
  // Read inside the stream handler without making it a dependency.
  const openRef = useRef(open);
  openRef.current = open;

  const loadCount = useCallback(
    () =>
      fetchUnreadCount()
        .then((r) => {
          setCount(r.count);
          setCritical(r.critical);
        })
        .catch(() => undefined),
    [],
  );

  const loadItems = useCallback(
    () =>
      fetchNotifications(20)
        .then(setItems)
        .catch(() => undefined),
    [],
  );

  useEffect(() => {
    loadCount();
    /*
     * The stream below is the fast path, but it is in-process on the server —
     * a second API instance would not see another instance's events. This poll
     * stays as the safety net, at a slow cadence and paused when hidden.
     */
    const t = setInterval(() => {
      if (document.visibilityState === "visible") loadCount();
    }, 60_000);
    const onVisible = () => document.visibilityState === "visible" && loadCount();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [loadCount]);

  // Real-time: a pushed notification updates the badge without a refresh, and
  // refreshes the list too if the panel happens to be open.
  useNotificationStream(
    useCallback(
      (kind) => {
        if (kind === "ping") return;
        void loadCount();
        if (openRef.current) void loadItems();
      },
      [loadCount, loadItems],
    ),
  );

  const openPanel = () => {
    setOpen((o) => !o);
    if (!open) {
      setLoading(true);
      loadItems().finally(() => setLoading(false));
    }
  };

  const onClickItem = async (n: AppNotification) => {
    if (!n.read) {
      await markNotificationRead(n.id).catch(() => undefined);
      setItems((cur) => cur.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      setCount((c) => Math.max(0, c - 1));
    }
    setOpen(false);
    if (n.link) router.push(n.link);
  };

  const markAll = async () => {
    await markAllNotificationsRead().catch(() => undefined);
    setItems((cur) => cur.map((x) => ({ ...x, read: true })));
    setCount(0);
  };

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="icon"
        aria-label="Notifications"
        onClick={openPanel}
        className="relative rounded-xl hover:bg-surface-2 transition-all duration-200"
      >
        <Bell className={`size-4.5 ${critical > 0 ? "text-critical" : "text-ink-2"}`} />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 grid min-w-[16px] h-4 place-items-center rounded-full bg-critical px-1 text-[9px] font-black text-white ring-2 ring-surface">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </Button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-2xl border border-hairline bg-surface shadow-2xl animate-fade-in">
            <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
              <span className="text-sm font-bold text-ink">Notifications</span>
              {items.some((i) => !i.read) && (
                <button onClick={markAll} className="inline-flex items-center gap-1 text-[11px] font-bold text-accent hover:underline">
                  <CheckCheck className="size-3.5" /> Mark all read
                </button>
              )}
            </div>
            <div className="max-h-96 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center py-10 text-xs font-bold text-ink-3">
                  <Loader2 className="mr-2 size-4 animate-spin text-accent" /> Loading…
                </div>
              ) : items.length === 0 ? (
                <div className="py-10 text-center text-xs text-ink-3">No notifications yet.</div>
              ) : (
                items.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => onClickItem(n)}
                    className={`flex w-full items-start gap-2.5 border-b border-hairline/60 px-4 py-3 text-left transition-colors hover:bg-surface-2 ${
                      n.read ? "" : "bg-accent/5"
                    }`}
                  >
                    <span
                      className={`mt-1 size-2 shrink-0 rounded-full ${
                        n.read ? "bg-transparent" : (PRIORITY_DOT[n.priority] ?? "bg-accent")
                      }`}
                    />
                    <span className="min-w-0">
                      <span className="block text-xs font-bold text-ink">{n.title}</span>
                      {n.body && <span className="mt-0.5 block text-[11px] text-ink-3">{n.body}</span>}
                      <span className="mt-0.5 block text-[10px] text-ink-3">{new Date(n.createdAt).toLocaleString()}</span>
                    </span>
                  </button>
                ))
              )}
            </div>
            <div className="flex items-center justify-between border-t border-hairline px-4 py-2.5">
              <Link
                href="/notifications"
                onClick={() => setOpen(false)}
                className="text-[11px] font-bold text-accent hover:underline"
              >
                View all
              </Link>
              <Link
                href="/notifications/settings"
                onClick={() => setOpen(false)}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-ink-3 hover:text-ink"
              >
                <Settings2 className="size-3.5" /> Settings
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
