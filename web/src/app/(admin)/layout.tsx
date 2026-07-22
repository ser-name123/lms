"use client";

import { notFound, usePathname } from "next/navigation";
import { useAuth } from "@/store/auth";
import { AuthGate } from "@/components/auth-gate";
import { AdminShell } from "@/components/layout/admin-shell";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <AdminLayoutGuard>{children}</AdminLayoutGuard>
    </AuthGate>
  );
}

function AdminLayoutGuard({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const pathname = usePathname();

  if (user && !["ADMIN", "SUPERVISOR", "ACADEMIC_COACH"].includes(user.role)) {
    notFound();
  }

  if (user && user.role === "ACADEMIC_COACH") {
    const allowedCoachPrefixes = [
      "/dashboard",
      "/leads",
      // Coaches are the ones who decide these, so the guard has to let them in
      // as well as the sidebar showing the link.
      "/subscription-requests",
      "/evaluation",
      "/students",
      "/teachers",
      // The catalogue behind the decisions above: which course a student is
      // enrolled on and which package they are moved to. The sidebar shows
      // both to coaches, so this list has to let them through.
      "/courses",
      "/packages",
      "/classes",
      "/meetings",
      "/attendance",
      "/finance",
      "/chat",
      "/support",
      "/profile",
    ];
    const isAllowed = allowedCoachPrefixes.some(
      (path) => pathname === path || pathname.startsWith(`${path}/`),
    );
    if (!isAllowed) {
      notFound();
    }
  }

  if (user && user.role === "SUPERVISOR") {
    const allowedSupervisorPrefixes = [
      "/dashboard",
      // Supervisors publish announcements too; /dashboard-widgets stays ADMIN-only.
      "/announcements",
      // Supervisors broadcast and read the notification centre and analytics.
      // Templates, the failure queue and retries stay ADMIN-only, enforced by
      // @Roles on the API rather than by hiding tabs.
      "/notification-management",
      "/teachers",
      // The sidebar has always offered Recruitment to supervisors but this
      // list omitted it, so the link 404'd. /recruitment renders the same
      // TeachersWorkspace as /teachers (different locked tab), which they
      // already have, so this grants no data they could not already reach.
      "/recruitment",
      "/meetings",
      "/finance",
      "/chat",
      "/support",
      "/profile",
    ];
    const isAllowed = allowedSupervisorPrefixes.some(
      (path) => pathname === path || pathname.startsWith(`${path}/`),
    );
    if (!isAllowed) {
      notFound();
    }
  }

  return <AdminShell>{children}</AdminShell>;
}
