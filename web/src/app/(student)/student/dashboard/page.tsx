"use client";

/*
 * Student dashboard. The greeting now uses the signed-in student's own name
 * (it was previously the literal string "Student").
 */

import { Topbar } from "@/components/layout/topbar";
import { useAuth } from "@/store/auth";
import { StudentPanel } from "@/components/dashboard/panels/student-panel";

export default function StudentDashboardPage() {
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
        <StudentPanel />
      </div>
    </>
  );
}
