"use client";

import { Topbar } from "@/components/layout/topbar";
import { NotificationManager } from "@/components/admin/notification-manager";

export default function NotificationManagementPage() {
  return (
    <>
      <Topbar
        title="Notification Centre"
        subtitle="Delivery, broadcasts, templates and engagement"
      />
      <div className="p-4 sm:p-6">
        <NotificationManager />
      </div>
    </>
  );
}
