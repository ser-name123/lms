"use client";

import { Topbar } from "@/components/layout/topbar";
import { AnnouncementManager } from "@/components/admin/announcement-manager";

export default function AnnouncementsPage() {
  return (
    <>
      <Topbar
        title="Announcements"
        subtitle="Publish notices to any role's dashboard and notification bell"
      />
      <div className="p-4 sm:p-6">
        <AnnouncementManager />
      </div>
    </>
  );
}
