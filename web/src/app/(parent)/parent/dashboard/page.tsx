"use client";

/*
 * Parent dashboard. Parents are provisioned by an admin from the guardian
 * details already on the student profile — there is no self-registration.
 */

import { Topbar } from "@/components/layout/topbar";
import { useAuth } from "@/store/auth";
import { ParentPanel } from "@/components/dashboard/panels/parent-panel";

export default function ParentDashboardPage() {
  const { user } = useAuth();

  const today = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <>
      <Topbar
        title={user ? `Assalamu Alaikum, ${user.firstName}` : "Dashboard"}
        subtitle={today}
      />
      <div className="p-4 sm:p-6">
        <ParentPanel />
      </div>
    </>
  );
}
