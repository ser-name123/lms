import type { Tone } from "@/components/ui/badge";
import type { LeadStatus, LeadPriority } from "@/lib/api";

// The lead pipeline in order (drives the funnel + "next stage" logic).
export const LEAD_PIPELINE: LeadStatus[] = [
  "NEW",
  "CONTACT_PENDING",
  "CONTACTED",
  "EVALUATION_SCHEDULED",
  "EVALUATION_COMPLETED",
  "TEACHER_ASSIGNED",
  "TRIAL_SCHEDULED",
  "TRIAL_COMPLETED",
  "WAITING_PARENT_DECISION",
  "CONVERTED",
];

export const ALL_LEAD_STATUSES: LeadStatus[] = [
  ...LEAD_PIPELINE,
  "REJECTED",
  "CLOSED",
];

export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  NEW: "New",
  CONTACT_PENDING: "Contact Pending",
  CONTACTED: "Contacted",
  EVALUATION_SCHEDULED: "Evaluation Scheduled",
  EVALUATION_COMPLETED: "Evaluation Completed",
  TEACHER_ASSIGNED: "Teacher Assigned",
  TRIAL_SCHEDULED: "Trial Scheduled",
  TRIAL_COMPLETED: "Trial Completed",
  WAITING_PARENT_DECISION: "Waiting Parent Decision",
  CONVERTED: "Converted",
  REJECTED: "Rejected",
  CLOSED: "Closed",
};

export const LEAD_STATUS_TONE: Record<LeadStatus, Tone> = {
  NEW: "accent",
  CONTACT_PENDING: "warning",
  CONTACTED: "accent",
  EVALUATION_SCHEDULED: "warning",
  EVALUATION_COMPLETED: "accent",
  TEACHER_ASSIGNED: "accent",
  TRIAL_SCHEDULED: "warning",
  TRIAL_COMPLETED: "accent",
  WAITING_PARENT_DECISION: "warning",
  CONVERTED: "good",
  REJECTED: "critical",
  CLOSED: "neutral",
};

/*
 * Has this trial been closed out?
 *
 * One definition, because the coach's page and the teacher's page each had
 * their own and they disagreed on a no-show: the teacher saw a finished class,
 * the coach was still offered Present / No-show / Reschedule, and pressing
 * Present quietly turned the teacher's no-show into a completed class.
 */
export function isTrialClosed(trial: { status: string }) {
  return trial.status === "COMPLETED" || trial.status === "NO_SHOW";
}

export const LEAD_PRIORITIES: LeadPriority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];

export const LEAD_PRIORITY_TONE: Record<LeadPriority, Tone> = {
  LOW: "neutral",
  MEDIUM: "accent",
  HIGH: "warning",
  URGENT: "critical",
};

// The evaluation skills the coach scores (Step 6).
export const EVALUATION_SKILLS = [
  "English",
  "Math",
  "Science",
  "Reading",
  "Listening",
  "Speaking",
  "Writing",
  "Confidence",
  "Learning Speed",
  "Homework",
  "Concentration",
];
