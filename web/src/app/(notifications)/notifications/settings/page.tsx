"use client";

import { Topbar } from "@/components/layout/topbar";
import { NotificationPreferencesPanel } from "@/components/notifications/preferences";

export default function NotificationSettingsPage() {
  return (
    <>
      <Topbar
        title="Notification settings"
        subtitle="Choose what reaches you, and where"
      />
      <div className="mx-auto max-w-3xl p-4 sm:p-6">
        <NotificationPreferencesPanel />
      </div>
    </>
  );
}
