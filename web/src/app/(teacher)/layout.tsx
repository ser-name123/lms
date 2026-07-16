"use client";

import { notFound } from "next/navigation";
import { useAuth } from "@/store/auth";
import { AuthGate } from "@/components/auth-gate";
import { TeacherShell } from "@/components/layout/teacher-shell";

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <TeacherLayoutGuard>{children}</TeacherLayoutGuard>
    </AuthGate>
  );
}

function TeacherLayoutGuard({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  if (user && user.role !== "TEACHER") {
    notFound();
  }

  return <TeacherShell>{children}</TeacherShell>;
}
