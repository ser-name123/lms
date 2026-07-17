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
      "/evaluation",
      "/students",
      "/teachers",
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
      "/teachers",
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
