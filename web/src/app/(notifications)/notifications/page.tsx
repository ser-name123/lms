"use client";

import { Topbar } from "@/components/layout/topbar";
import { NotificationInbox } from "@/components/notifications/inbox";

export default function NotificationsPage() {
  return (
    <>
      <Topbar title="Notifications" subtitle="Everything the academy has sent you" />
      <div className="p-4 sm:p-6">
        <NotificationInbox />
      </div>
    </>
  );
}
