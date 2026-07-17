"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  fetchNotifications,
  fetchUnreadCount,
  markAllNotificationsRead,
  markNotificationRead,
  type AppNotification,
} from "@/lib/api";

export function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(false);

  const loadCount = () => fetchUnreadCount().then((r) => setCount(r.count)).catch(() => undefined);

  useEffect(() => {
    loadCount();
    const t = setInterval(loadCount, 60_000); // light poll
    return () => clearInterval(t);
  }, []);

  const openPanel = () => {
    setOpen((o) => !o);
    if (!open) {
      setLoading(true);
      fetchNotifications(20).then(setItems).catch(() => undefined).finally(() => setLoading(false));
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
        <Bell className="size-4.5 text-ink-2" />
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
                    <span className={`mt-1 size-2 shrink-0 rounded-full ${n.read ? "bg-transparent" : "bg-accent"}`} />
                    <span className="min-w-0">
                      <span className="block text-xs font-bold text-ink">{n.title}</span>
                      {n.body && <span className="mt-0.5 block text-[11px] text-ink-3">{n.body}</span>}
                      <span className="mt-0.5 block text-[10px] text-ink-3">{new Date(n.createdAt).toLocaleString()}</span>
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
