"use client";

import { Topbar } from "@/components/layout/topbar";
import { MyLeavePanel } from "@/components/leaves/my-leave";

/**
 * §9.1 lists Academic Coach, Supervisor and Admin (optional) as applicable
 * staff. They all sit in the (admin) route group, so one page serves all three;
 * `isTeacher` is false because their absence is staff leave, not teacher
 * unavailability, and carries no consequences for student classes.
 */
export default function MyLeavePage() {
  return (
    <>
      <Topbar title="My Leave" subtitle="Request time off and track your own requests" />
      <MyLeavePanel isTeacher={false} />
    </>
  );
}
