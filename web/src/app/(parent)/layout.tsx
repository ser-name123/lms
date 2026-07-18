"use client";

import { notFound } from "next/navigation";

import { useAuth } from "@/store/auth";
import { AuthGate } from "@/components/auth-gate";
import { ParentShell } from "@/components/layout/parent-shell";

export default function ParentLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <ParentLayoutGuard>{children}</ParentLayoutGuard>
    </AuthGate>
  );
}

function ParentLayoutGuard({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  if (user && user.role !== "PARENT") {
    notFound();
  }

  return <ParentShell>{children}</ParentShell>;
}
