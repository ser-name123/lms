"use client";

/*
 * Per-user notification settings.
 *
 * Everything here is stored in the database, not the browser — a user who signs
 * in on a second device gets the same settings. The one genuinely per-device
 * thing is the Web Push subscription, and that is labelled as such.
 */

import { useCallback, useEffect, useState } from "react";
import { Bell, Loader2, MailX, RotateCcw, ShieldAlert } from "lucide-react";
import Swal from "sweetalert2";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  fetchNotificationPreferences,
  resetNotificationPreferences,
  saveNotificationPreferences,
  type NotificationCategory,
  type NotificationPreferences,
} from "@/lib/api";
import { disablePush, enablePush, pushPermission, pushSubscribedHere, pushSupported } from "@/lib/push";

const swalBg = () =>
  typeof document !== "undefined" && document.documentElement.classList.contains("dark")
    ? "#18181b"
    : "#ffffff";

const CATEGORIES: { key: NotificationCategory; label: string; detail: string }[] = [
  { key: "ACADEMIC", label: "Academic", detail: "Classes, schedule changes, trials" },
  { key: "ATTENDANCE", label: "Attendance", detail: "Attendance records and alerts" },
  { key: "ASSIGNMENT", label: "Assignment", detail: "Published, due, reviewed" },
  { key: "ASSESSMENT", label: "Assessment", detail: "Tests and results" },
  { key: "FINANCE", label: "Finance", detail: "Invoices, payments, reminders" },
  { key: "PROGRESS", label: "Progress", detail: "Feedback, reviews, goals, badges" },
  { key: "SYSTEM", label: "System", detail: "Announcements and account activity" },
];

export function NotificationPreferencesPanel() {
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [saving, setSaving] = useState(false);
  const [pushHere, setPushHere] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);

  const load = useCallback(
    () =>
      fetchNotificationPreferences()
        .then(setPrefs)
        .catch(() => setPrefs(null)),
    [],
  );

  useEffect(() => {
    void load();
    void pushSubscribedHere().then(setPushHere);
  }, [load]);

  const patch = async (next: Partial<NotificationPreferences>) => {
    setSaving(true);
    // Optimistic so the switch does not lag behind the finger.
    setPrefs((cur) => (cur ? { ...cur, ...next } : cur));
    try {
      setPrefs(await saveNotificationPreferences(next));
    } catch (e) {
      await load();
      Swal.fire({
        title: "Could not save",
        text: e instanceof Error ? e.message : "Please try again.",
        icon: "error",
        background: swalBg(),
      });
    } finally {
      setSaving(false);
    }
  };

  const toggleCategory = (key: NotificationCategory) => {
    if (!prefs) return;
    const muted = prefs.mutedCategories.includes(key)
      ? prefs.mutedCategories.filter((c) => c !== key)
      : [...prefs.mutedCategories, key];
    void patch({ mutedCategories: muted });
  };

  const togglePush = async () => {
    setPushBusy(true);
    try {
      if (pushHere) {
        await disablePush();
        setPushHere(false);
      } else {
        const res = await enablePush();
        if (!res.ok) {
          Swal.fire({
            title: "Push not enabled",
            text: res.reason,
            icon: "info",
            background: swalBg(),
          });
        } else {
          setPushHere(true);
          // Turning it on here implies wanting it on at all.
          if (prefs && !prefs.push) await patch({ push: true });
        }
      }
      await load();
    } finally {
      setPushBusy(false);
    }
  };

  const reset = async () => {
    const ok = await Swal.fire({
      title: "Reset to the defaults?",
      text: "In-app, email and push on; nothing muted.",
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Reset",
      background: swalBg(),
    });
    if (!ok.isConfirmed) return;
    setPrefs(await resetNotificationPreferences());
  };

  if (!prefs) {
    return (
      <div className="grid place-items-center py-20">
        <Loader2 className="size-5 animate-spin text-ink-3" />
      </div>
    );
  }

  const permission = pushSupported() ? pushPermission() : "unsupported";

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="mb-1 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-extrabold text-ink">Channels</h2>
            <p className="text-xs text-ink-3">Where notifications reach you.</p>
          </div>
          {saving ? <Loader2 className="size-4 animate-spin text-ink-3" /> : null}
        </div>

        <ul className="mt-3 divide-y divide-hairline">
          <Row
            label="In-app"
            detail="The bell and the notification centre."
            checked={prefs.inApp}
            onChange={(v) => void patch({ inApp: v })}
          />
          <Row
            label="Email"
            detail="Sent to your registered address."
            checked={prefs.email}
            onChange={(v) => void patch({ email: v })}
          />
          <Row
            label="Browser push"
            detail={
              permission === "unsupported"
                ? "This browser does not support push."
                : prefs.pushSubscriptions > 0
                  ? `${prefs.pushSubscriptions} device(s) registered.`
                  : "No device registered yet."
            }
            checked={prefs.push}
            disabled={permission === "unsupported"}
            onChange={(v) => void patch({ push: v })}
          />
          <Row
            label="WhatsApp"
            detail="No provider is connected yet."
            checked={false}
            disabled
            onChange={() => undefined}
          />
          <Row
            label="SMS"
            detail="No provider is connected yet."
            checked={false}
            disabled
            onChange={() => undefined}
          />
        </ul>
      </Card>

      {permission !== "unsupported" ? (
        <Card className="flex flex-wrap items-center gap-3 p-4">
          <Bell className="size-4 shrink-0 text-ink-3" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-ink">This device</p>
            <p className="text-xs text-ink-3">
              {permission === "denied"
                ? "Notifications are blocked for this site in your browser settings."
                : pushHere
                  ? "This browser will show push notifications."
                  : "Register this browser to get notifications when the tab is closed."}
            </p>
          </div>
          {pushHere ? <Badge tone="good">Registered</Badge> : null}
          <Button
            variant={pushHere ? "ghost" : "primary"}
            size="sm"
            onClick={togglePush}
            disabled={pushBusy || permission === "denied"}
          >
            {pushBusy ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : null}
            {pushHere ? "Unregister" : "Register this browser"}
          </Button>
        </Card>
      ) : null}

      <Card className="p-4">
        <h2 className="text-sm font-extrabold text-ink">Categories</h2>
        <p className="text-xs text-ink-3">
          Muting a category stops those notifications entirely.
        </p>
        <ul className="mt-3 divide-y divide-hairline">
          {CATEGORIES.map((c) => (
            <Row
              key={c.key}
              label={c.label}
              detail={c.detail}
              checked={!prefs.mutedCategories.includes(c.key)}
              onChange={() => toggleCategory(c.key)}
            />
          ))}
        </ul>

        <div className="mt-4 flex items-start gap-2 rounded-lg border border-hairline bg-surface-2/50 p-3">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden />
          <p className="text-xs text-ink-2">
            Critical notifications — a failed payment, a security alert — are always delivered,
            whatever you mute here.
          </p>
        </div>
      </Card>

      <Card className="p-4">
        <ul className="divide-y divide-hairline">
          <Row
            label="Mute announcements"
            detail="General academy announcements and non-essential blasts."
            icon={MailX}
            checked={prefs.muteMarketing}
            onChange={(v) => void patch({ muteMarketing: v })}
          />
        </ul>
      </Card>

      <div className="flex items-center justify-between">
        <p className="text-xs text-ink-3">
          {prefs.customised ? "Using your own settings." : "Using the default settings."}
        </p>
        <Button variant="ghost" size="sm" onClick={reset} disabled={!prefs.customised}>
          <RotateCcw className="mr-1.5 size-3.5" /> Reset to defaults
        </Button>
      </div>
    </div>
  );
}

function Row({
  label,
  detail,
  checked,
  onChange,
  disabled = false,
  icon: Icon,
}: {
  label: string;
  detail: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <li className="flex items-center gap-3 py-3">
      {Icon ? <Icon className="size-4 shrink-0 text-ink-3" aria-hidden /> : null}
      <div className="min-w-0 flex-1">
        <p className={cn("text-sm font-semibold", disabled ? "text-ink-3" : "text-ink")}>{label}</p>
        <p className="text-xs text-ink-3">{detail}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-6 w-11 shrink-0 rounded-full transition-colors",
          checked ? "bg-accent" : "bg-surface-3",
          disabled && "cursor-not-allowed opacity-50",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 size-5 rounded-full bg-white shadow transition-all",
            checked ? "left-[22px]" : "left-0.5",
          )}
        />
      </button>
    </li>
  );
}
