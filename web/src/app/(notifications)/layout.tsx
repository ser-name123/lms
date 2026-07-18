"use client";

/*
 * The notification centre is the one area every role shares, so it lives in its
 * own route group rather than being duplicated four times under /teacher,
 * /student and so on. The layout picks whichever shell matches the signed-in
 * role, so the sidebar a user sees here is the same one they had a click ago.
 */

import { useAuth } from "@/store/auth";
import { AuthGate } from "@/components/auth-gate";
import { AdminShell } from "@/components/layout/admin-shell";
import { TeacherShell } from "@/components/layout/teacher-shell";
import { StudentShell } from "@/components/layout/student-shell";
import { ParentShell } from "@/components/layout/parent-shell";

export default function NotificationsLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <RoleShell>{children}</RoleShell>
    </AuthGate>
  );
}

function RoleShell({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  // AuthGate has not resolved the session yet — render nothing rather than
  // flashing the wrong sidebar and then swapping it.
  if (!user) return null;

  switch (user.role) {
    case "TEACHER":
      return <TeacherShell>{children}</TeacherShell>;
    case "STUDENT":
      return <StudentShell>{children}</StudentShell>;
    case "PARENT":
      return <ParentShell>{children}</ParentShell>;
    default:
      // ADMIN, SUPERVISOR and ACADEMIC_COACH all use the admin console shell.
      return <AdminShell>{children}</AdminShell>;
  }
}
