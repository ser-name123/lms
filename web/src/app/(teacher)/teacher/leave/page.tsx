"use client";

import { Topbar } from "@/components/layout/topbar";
import { MyLeavePanel } from "@/components/leaves/my-leave";

/**
 * §9.1 — the teacher's own portal.
 *
 * Before Module 9 the leave API carried a class-level role guard of
 * ADMIN/SUPERVISOR/ACADEMIC_COACH, so a teacher had no way to request leave at
 * all: the spec obliged them to and there was no endpoint behind it.
 */
export default function TeacherLeavePage() {
  return (
    <>
      <Topbar
        title="My Unavailability"
        subtitle="Request time off — your coach arranges cover for the students already booked with you"
      />
      <MyLeavePanel isTeacher />
    </>
  );
}
