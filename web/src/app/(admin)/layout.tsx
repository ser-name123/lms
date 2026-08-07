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

/*
 * Routes no non-admin reaches, whatever prefix would otherwise let them.
 *
 * "/finance" is granted whole to coaches and supervisors, and payroll lives
 * under it — so /finance/payroll opened for both while the API answers a coach
 * 403 outright and refuses a supervisor every write on the page. A page that
 * loads and then cannot do anything is worse than one that is not there.
 *
 * Staff pay stays with the admin: it is compensation, and the API already says
 * so (@Roles(ADMIN) on every payroll write, ADMIN-only on /payouts).
 */
const ADMIN_ONLY_PREFIXES = ["/finance/payroll", "/payouts"];

/*
 * Coaches monitor monthly assessments and read the rankings, but they do not
 * configure the rubric, the grade ladder or the ranking weightage — the API
 * gives them read-only on /assessment-config and refuses every write.
 *
 * A prefix allowlist cannot express that on its own: granting
 * "/monthly-assessments" grants "/monthly-assessments/settings" with it. So the
 * setup page is carved back out here, for the same reason /finance/payroll is
 * carved out of /finance above — a page that loads and then cannot save is
 * worse than one that is not there.
 */
/*
 * Module 8 adds a second case of the same shape: a coach schedules and runs
 * meetings and reads every report, but the recurring schedules and the
 * academy-wide meeting rules belong to the admin and supervisor — the API
 * refuses PATCH /meetings/settings and POST /meetings/series from a coach.
 */
const COACH_BLOCKED_PREFIXES = [
  "/monthly-assessments/settings",
  "/meetings/settings",
  // Module 9 §9.11 — which leave types exist and how unpaid days are deducted
  // is an academy-wide payroll rule, and the API refuses a coach there anyway.
  "/leaves/settings",
];

function AdminLayoutGuard({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const pathname = usePathname();

  if (user && !["ADMIN", "SUPERVISOR", "ACADEMIC_COACH"].includes(user.role)) {
    notFound();
  }

  if (
    user &&
    user.role !== "ADMIN" &&
    ADMIN_ONLY_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
  ) {
    notFound();
  }

  if (user && user.role === "ACADEMIC_COACH") {
    const allowedCoachPrefixes = [
      "/dashboard",
      "/leads",
      // Coaches are the ones who decide these, so the guard has to let them in
      // as well as the sidebar showing the link.
      "/subscription-requests",
      "/reschedule-requests",
      // Teacher-absent classes the coach reschedules, and the monthly reports
      // they can see for their students.
      "/teacher-absences",
      "/monthly-reports",
      // Module 7: the coach monitors assessments for their students and is one
      // of the roles rankings are published to. Setup is carved out below.
      "/monthly-assessments",
      "/rankings",
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
      // Module 9 §9.5: the coach decides what happens to the classes an absent
      // teacher leaves behind, so they need the queue. /leaves is the admin's
      // approval console, but the coach sits on the §9.8 notification rows for
      // it and follows those links — deciding stays @Roles-guarded to the admin.
      "/leave-impacts",
      "/leaves",
      "/my-leave",
      "/attendance",
      "/finance",
      "/chat",
      "/support",
      "/profile",
    ];
    const isAllowed = allowedCoachPrefixes.some(
      (path) => pathname === path || pathname.startsWith(`${path}/`),
    );
    const isBlocked = COACH_BLOCKED_PREFIXES.some(
      (path) => pathname === path || pathname.startsWith(`${path}/`),
    );
    if (!isAllowed || isBlocked) {
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
      // Read-only monitoring of subscription/break requests. Supervisors are
      // notified of these (§8.4) and the notification links here; the API grants
      // them list/detail but not review, so the page hides approve/reject.
      "/subscription-requests",
      // Same read-only monitoring for teacher reschedule requests — supervisors
      // are notified and can view; approve/reject stays with coach/admin.
      "/reschedule-requests",
      // Supervisors review + approve monthly reports; they monitor salaries
      // (approve/pay stays admin-only, enforced by @Roles on the API).
      "/monthly-reports",
      // Module 7: the supervisor is the approver — review, approve, publish,
      // reopen and the whole setup surface are theirs alongside the admin.
      "/monthly-assessments",
      "/rankings",
      "/salary",
      "/meetings",
      // Module 9 §9.8 puts the supervisor on the Request Submitted and Request
      // Approved rows, so the notification links have to lead somewhere. The
      // API grants them list/detail only — approve/reject is admin-only, and
      // the page hides those buttons for them.
      "/leaves",
      "/leave-impacts",
      "/my-leave",
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
