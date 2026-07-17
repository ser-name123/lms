import type { Tone } from "@/components/ui/badge";
import type { StudentAttendanceStatus, AttendanceClassStatus } from "@/lib/api";

export const STUDENT_STATUSES: StudentAttendanceStatus[] = [
  "PRESENT", "LATE", "ABSENT", "EXCUSED", "LEAVE_APPROVED", "NO_SHOW",
];

export const STUDENT_STATUS_TONE: Record<StudentAttendanceStatus, Tone> = {
  PRESENT: "good",
  LATE: "warning",
  ABSENT: "critical",
  EXCUSED: "neutral",
  LEAVE_APPROVED: "accent",
  NO_SHOW: "critical",
};

export const CLASS_STATUS_TONE: Record<AttendanceClassStatus, Tone> = {
  SCHEDULED: "accent",
  LIVE: "good",
  COMPLETED: "neutral",
  CANCELLED: "critical",
};
