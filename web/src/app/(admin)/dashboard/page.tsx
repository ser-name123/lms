"use client";

/*
 * The admin route group is shared by three roles, so this page dispatches:
 *   ADMIN          → Super Admin console (whole-academy monitoring)
 *   SUPERVISOR     → Admin console (day-to-day operations)
 *   ACADEMIC_COACH → Coach console (their own roster)
 *
 * Each panel owns its own fetching and its own widget layout.
 */

import { Topbar } from "@/components/layout/topbar";
import { useAuth } from "@/store/auth";
import { SuperAdminPanel } from "@/components/dashboard/panels/super-admin-panel";
import { AdminOpsPanel } from "@/components/dashboard/panels/admin-ops-panel";
import { CoachPanel } from "@/components/dashboard/panels/coach-panel";
import { DashboardSkeleton } from "@/components/dashboard/primitives";

const SUBTITLE: Record<string, string> = {
  ADMIN: "Academy overview",
  SUPERVISOR: "Daily operations",
  ACADEMIC_COACH: "My students",
};

export default function DashboardPage() {
  const { user } = useAuth();

  // Rendered live — the previous page shipped a hardcoded "Tuesday, 14 July 2026".
  const today = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const subtitle = user ? `${SUBTITLE[user.role] ?? ""} · ${today}` : today;

  return (
    <>
      <Topbar title="Dashboard" subtitle={subtitle} />
      <div className="p-4 sm:p-6">
        {!user ? (
          <DashboardSkeleton />
        ) : user.role === "ADMIN" ? (
          <SuperAdminPanel />
        ) : user.role === "SUPERVISOR" ? (
          <AdminOpsPanel />
        ) : (
          <CoachPanel />
        )}
      </div>
    </>
  );
}
