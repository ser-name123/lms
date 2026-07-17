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
