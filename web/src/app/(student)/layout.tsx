"use client";

import { notFound } from "next/navigation";
import { useAuth } from "@/store/auth";
import { AuthGate } from "@/components/auth-gate";
import { StudentShell } from "@/components/layout/student-shell";

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <StudentLayoutGuard>{children}</StudentLayoutGuard>
    </AuthGate>
  );
}

function StudentLayoutGuard({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  if (user && user.role !== "STUDENT") {
    notFound();
  }

  return <StudentShell>{children}</StudentShell>;
}
