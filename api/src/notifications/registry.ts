import {
  NotificationCategory as Cat,
  NotificationChannel as Ch,
  NotificationPriority as Pri,
} from '../generated/prisma/enums';

/*
 * The notification type registry.
 *
 * 34 type strings were already being emitted from 16 services as bare literals
 * before this module existed. Rather than edit ~49 call sites, every type is
 * classified here once: the engine looks the type up and derives its category,
 * priority and default channels. Existing emitters therefore gained categories,
 * priorities and preference-checking without changing a line.
 *
 * An unregistered type still delivers — it falls back to SYSTEM / MEDIUM /
 * in-app only. That is deliberate: a typo must never silently drop a message.
 *
 * `marketing: true` marks a type that "Mute marketing notifications" switches
 * off. CRITICAL types ignore every mute, including category mutes — a failed
 * payment or a security alert must always land.
 */

export interface NotificationTypeDef {
  category: Cat;
  priority: Pri;
  /** Channels attempted when the user has not opted out of them. */
  channels: Ch[];
  /** Human label for the admin filters and reports. */
  label: string;
  marketing?: boolean;
}

const IN_APP: Ch[] = [Ch.IN_APP];
const IN_APP_EMAIL: Ch[] = [Ch.IN_APP, Ch.EMAIL];
const IN_APP_PUSH: Ch[] = [Ch.IN_APP, Ch.PUSH];
const ALL_THREE: Ch[] = [Ch.IN_APP, Ch.EMAIL, Ch.PUSH];

export const NOTIFICATION_TYPES: Record<string, NotificationTypeDef> = {
  // ── Academic ──────────────────────────────────────────────────────────────
  CLASS_REMINDER: { category: Cat.ACADEMIC, priority: Pri.HIGH, channels: IN_APP_PUSH, label: 'Class reminder' },
  CLASS_CANCELLED: { category: Cat.ACADEMIC, priority: Pri.HIGH, channels: ALL_THREE, label: 'Class cancelled' },
  CLASS_SCHEDULED: { category: Cat.ACADEMIC, priority: Pri.MEDIUM, channels: IN_APP_EMAIL, label: 'Class scheduled' },
  SCHEDULE_CHANGED: { category: Cat.ACADEMIC, priority: Pri.HIGH, channels: ALL_THREE, label: 'Schedule changed' },
  SCHEDULE_CONFLICT: { category: Cat.ACADEMIC, priority: Pri.HIGH, channels: IN_APP_EMAIL, label: 'Schedule conflict' },
  TEACHER_TRANSFER: { category: Cat.ACADEMIC, priority: Pri.HIGH, channels: IN_APP_EMAIL, label: 'Teacher changed' },
  TRANSFER_REQUEST: { category: Cat.ACADEMIC, priority: Pri.MEDIUM, channels: IN_APP, label: 'Transfer requested' },
  BATCH_CHANGED: { category: Cat.ACADEMIC, priority: Pri.MEDIUM, channels: IN_APP_EMAIL, label: 'Batch changed' },
  TRIAL_SCHEDULED: { category: Cat.ACADEMIC, priority: Pri.MEDIUM, channels: IN_APP_EMAIL, label: 'Trial scheduled' },
  TRIAL_ASSIGNED: { category: Cat.ACADEMIC, priority: Pri.MEDIUM, channels: IN_APP_EMAIL, label: 'Trial assigned' },
  AVAILABILITY_SUBMITTED: { category: Cat.ACADEMIC, priority: Pri.LOW, channels: IN_APP, label: 'Availability submitted' },
  // A student asking to change their package or schedule, and the two answers.
  // The decision reaches them by email as well as in-app: it is the reply to
  // something they asked for and may be days later, so the bell alone is not
  // enough. SUBSCRIPTION_APPLIED is the one that says it has actually taken
  // effect — approval only queues it for the next cycle.
  SUBSCRIPTION_REQUEST: { category: Cat.ACADEMIC, priority: Pri.MEDIUM, channels: IN_APP, label: 'Subscription change requested' },
  SUBSCRIPTION_REQUEST_SUBMITTED: { category: Cat.ACADEMIC, priority: Pri.LOW, channels: IN_APP, label: 'Your request was submitted' },
  SUBSCRIPTION_DECIDED: { category: Cat.ACADEMIC, priority: Pri.HIGH, channels: IN_APP_EMAIL, label: 'Subscription request decided' },
  SUBSCRIPTION_APPLIED: { category: Cat.ACADEMIC, priority: Pri.HIGH, channels: IN_APP_EMAIL, label: 'Subscription change applied' },
  // A 28-day cycle turned over: new schedule + invoice created. Goes to the
  // student, their teacher and their coach.
  CYCLE_RENEWED: { category: Cat.ACADEMIC, priority: Pri.MEDIUM, channels: IN_APP_EMAIL, label: 'New billing cycle' },
  // ── Break / pause ────────────────────────────────────────────────────────
  // A break was requested (staff alert), decided (to the student), and then the
  // two lifecycle transitions the cron drives: the break starting and the
  // subscription resuming. START/RESUMED reach student + teacher + coach +
  // supervisor, per the spec's break-notification list.
  BREAK_REQUESTED: { category: Cat.ACADEMIC, priority: Pri.MEDIUM, channels: IN_APP, label: 'Break requested' },
  BREAK_DECIDED: { category: Cat.ACADEMIC, priority: Pri.HIGH, channels: IN_APP_EMAIL, label: 'Break request decided' },
  BREAK_STARTED: { category: Cat.ACADEMIC, priority: Pri.HIGH, channels: IN_APP_EMAIL, label: 'Break started' },
  BREAK_RESUMED: { category: Cat.ACADEMIC, priority: Pri.HIGH, channels: IN_APP_EMAIL, label: 'Subscription resumed' },
  // ── Class rescheduling ─────────────────────────────────────────────────────
  // A class was moved (student self-service, or an approved teacher request);
  // and the teacher-request lifecycle (submitted → decided). CLASS_RESCHEDULED
  // was previously unregistered and fell back to in-app only — now it carries
  // in-app + email so all parties actually hear about a moved class.
  CLASS_RESCHEDULED: { category: Cat.ACADEMIC, priority: Pri.HIGH, channels: IN_APP_EMAIL, label: 'Class rescheduled' },
  TEACHER_RESCHEDULE_REQUEST: { category: Cat.ACADEMIC, priority: Pri.MEDIUM, channels: IN_APP, label: 'Teacher reschedule requested' },
  TEACHER_RESCHEDULE_DECIDED: { category: Cat.ACADEMIC, priority: Pri.HIGH, channels: IN_APP_EMAIL, label: 'Teacher reschedule decided' },

  // ── Attendance ────────────────────────────────────────────────────────────
  ATTENDANCE_RESULT: { category: Cat.ATTENDANCE, priority: Pri.MEDIUM, channels: IN_APP_EMAIL, label: 'Attendance recorded' },
  ATTENDANCE_CORRECTION: { category: Cat.ATTENDANCE, priority: Pri.MEDIUM, channels: IN_APP, label: 'Attendance correction' },
  ATTENDANCE_NOT_SUBMITTED: { category: Cat.ATTENDANCE, priority: Pri.HIGH, channels: IN_APP_PUSH, label: 'Attendance not submitted' },
  LOW_ATTENDANCE: { category: Cat.ATTENDANCE, priority: Pri.HIGH, channels: ALL_THREE, label: 'Low attendance alert' },
  TEACHER_LATE: { category: Cat.ATTENDANCE, priority: Pri.HIGH, channels: IN_APP_PUSH, label: 'Teacher late' },

  // ── Assignment ────────────────────────────────────────────────────────────
  ASSIGNMENT_PUBLISHED: { category: Cat.ASSIGNMENT, priority: Pri.MEDIUM, channels: ALL_THREE, label: 'Assignment published' },
  ASSIGNMENT_REMINDER: { category: Cat.ASSIGNMENT, priority: Pri.HIGH, channels: ALL_THREE, label: 'Assignment due' },
  ASSIGNMENT_SUBMITTED: { category: Cat.ASSIGNMENT, priority: Pri.MEDIUM, channels: IN_APP, label: 'Assignment submitted' },
  ASSIGNMENT_CHECKED: { category: Cat.ASSIGNMENT, priority: Pri.MEDIUM, channels: IN_APP_EMAIL, label: 'Assignment reviewed' },

  // ── Assessment ────────────────────────────────────────────────────────────
  ASSESSMENT_PUBLISHED: { category: Cat.ASSESSMENT, priority: Pri.MEDIUM, channels: ALL_THREE, label: 'Assessment published' },
  ASSESSMENT_REMINDER: { category: Cat.ASSESSMENT, priority: Pri.HIGH, channels: ALL_THREE, label: 'Assessment reminder' },
  // Spec lists "Assessment Started" as critical — a running timer cannot wait.
  ASSESSMENT_STARTED: { category: Cat.ASSESSMENT, priority: Pri.CRITICAL, channels: ALL_THREE, label: 'Assessment started' },
  ASSESSMENT_SUBMITTED: { category: Cat.ASSESSMENT, priority: Pri.MEDIUM, channels: IN_APP, label: 'Assessment submitted' },
  ASSESSMENT_RESULT: { category: Cat.ASSESSMENT, priority: Pri.HIGH, channels: IN_APP_EMAIL, label: 'Result published' },

  // ── Finance ───────────────────────────────────────────────────────────────
  INVOICE_ISSUED: { category: Cat.FINANCE, priority: Pri.MEDIUM, channels: IN_APP_EMAIL, label: 'Invoice generated' },
  INVOICE_DUE_SOON: { category: Cat.FINANCE, priority: Pri.HIGH, channels: ALL_THREE, label: 'Fee due reminder' },
  INVOICE_OVERDUE: { category: Cat.FINANCE, priority: Pri.HIGH, channels: ALL_THREE, label: 'Invoice overdue' },
  INVOICES_OVERDUE: { category: Cat.FINANCE, priority: Pri.MEDIUM, channels: IN_APP, label: 'Overdue invoices digest' },
  PAYMENT_RECEIVED: { category: Cat.FINANCE, priority: Pri.MEDIUM, channels: IN_APP_EMAIL, label: 'Payment success' },
  PAYMENT_FAILED: { category: Cat.FINANCE, priority: Pri.CRITICAL, channels: ALL_THREE, label: 'Payment failed' },
  REFUND_REQUESTED: { category: Cat.FINANCE, priority: Pri.MEDIUM, channels: IN_APP, label: 'Refund requested' },
  SCHOLARSHIP_REVIEWED: { category: Cat.FINANCE, priority: Pri.MEDIUM, channels: IN_APP_EMAIL, label: 'Scholarship reviewed' },
  PAYSLIP_ISSUED: { category: Cat.FINANCE, priority: Pri.MEDIUM, channels: IN_APP_EMAIL, label: 'Payslip issued' },
  PAYROLL_GENERATED: { category: Cat.FINANCE, priority: Pri.MEDIUM, channels: IN_APP, label: 'Payroll generated' },
  // ── Teacher earnings & salary (Modules 6A/6B/6C) ──
  // A teacher was absent: the coach must reschedule (student + supervisor told).
  TEACHER_ABSENT: { category: Cat.ATTENDANCE, priority: Pri.HIGH, channels: IN_APP_EMAIL, label: 'Teacher absent' },
  SALARY_APPROVED: { category: Cat.FINANCE, priority: Pri.MEDIUM, channels: IN_APP, label: 'Salary approved' },
  SALARY_PAID: { category: Cat.FINANCE, priority: Pri.HIGH, channels: IN_APP_EMAIL, label: 'Salary paid' },
  SALARY_PAYMENT_FAILED: { category: Cat.FINANCE, priority: Pri.CRITICAL, channels: ALL_THREE, label: 'Salary payment failed' },
  // ── Monthly progress report (Module 6D) ──
  MONTHLY_REPORT_SUBMITTED: { category: Cat.PROGRESS, priority: Pri.MEDIUM, channels: IN_APP, label: 'Monthly report submitted' },
  MONTHLY_REPORT_DECIDED: { category: Cat.PROGRESS, priority: Pri.MEDIUM, channels: IN_APP_EMAIL, label: 'Monthly report reviewed' },

  // ── Progress ──────────────────────────────────────────────────────────────
  PROGRESS_FEEDBACK: { category: Cat.PROGRESS, priority: Pri.MEDIUM, channels: IN_APP_EMAIL, label: 'Teacher feedback' },
  PROGRESS_REVIEW: { category: Cat.PROGRESS, priority: Pri.MEDIUM, channels: IN_APP_EMAIL, label: 'Monthly review' },
  PROGRESS_GOAL: { category: Cat.PROGRESS, priority: Pri.LOW, channels: IN_APP, label: 'Goal set' },
  GOAL_COMPLETED: { category: Cat.PROGRESS, priority: Pri.MEDIUM, channels: IN_APP_PUSH, label: 'Goal achieved' },
  PROGRESS_BADGE: { category: Cat.PROGRESS, priority: Pri.LOW, channels: IN_APP_PUSH, label: 'Badge earned' },
  PROGRESS_RISK: { category: Cat.PROGRESS, priority: Pri.HIGH, channels: IN_APP_EMAIL, label: 'Student at risk' },
  PROGRESS_ESCALATION: { category: Cat.PROGRESS, priority: Pri.HIGH, channels: IN_APP_EMAIL, label: 'Progress escalation' },
  CERTIFICATE_AVAILABLE: { category: Cat.PROGRESS, priority: Pri.MEDIUM, channels: IN_APP_EMAIL, label: 'Certificate available' },

  // ── System ────────────────────────────────────────────────────────────────
  // Announcements are the one thing "mute marketing" is meant to silence.
  ANNOUNCEMENT: { category: Cat.SYSTEM, priority: Pri.MEDIUM, channels: ALL_THREE, label: 'Announcement', marketing: true },
  ADMIN_MESSAGE: { category: Cat.SYSTEM, priority: Pri.MEDIUM, channels: IN_APP_EMAIL, label: 'Message from staff' },
  DIRECT_MESSAGE: { category: Cat.SYSTEM, priority: Pri.MEDIUM, channels: IN_APP_EMAIL, label: 'Direct message' },
  PASSWORD_CHANGED: { category: Cat.SYSTEM, priority: Pri.CRITICAL, channels: IN_APP_EMAIL, label: 'Password changed' },
  LOGIN_ALERT: { category: Cat.SYSTEM, priority: Pri.CRITICAL, channels: IN_APP_EMAIL, label: 'Login alert' },
  PROFILE_UPDATED: { category: Cat.SYSTEM, priority: Pri.LOW, channels: IN_APP, label: 'Profile updated' },
  STUDENT_UPDATE: { category: Cat.SYSTEM, priority: Pri.MEDIUM, channels: IN_APP_EMAIL, label: 'Student update' },
  LEAVE_REQUESTED: { category: Cat.SYSTEM, priority: Pri.MEDIUM, channels: IN_APP, label: 'Leave requested' },
  LEAVE_DECISION: { category: Cat.SYSTEM, priority: Pri.HIGH, channels: IN_APP_EMAIL, label: 'Leave decision' },
  LEAD_NEW: { category: Cat.SYSTEM, priority: Pri.MEDIUM, channels: IN_APP, label: 'New lead' },
  LEAD_ASSIGNED: { category: Cat.SYSTEM, priority: Pri.MEDIUM, channels: IN_APP_EMAIL, label: 'Lead assigned' },
  LEAD_CONVERTED: { category: Cat.SYSTEM, priority: Pri.MEDIUM, channels: IN_APP, label: 'Lead converted' },
  TRIAL_REPORT_SUBMITTED: { category: Cat.SYSTEM, priority: Pri.HIGH, channels: IN_APP_EMAIL, label: 'Trial report submitted' },
  TRIAL_INFO_RECEIVED: { category: Cat.SYSTEM, priority: Pri.MEDIUM, channels: IN_APP, label: 'Trial details completed' },
};

/** Fallback for a type nobody registered — delivers, but only in-app. */
export const FALLBACK_TYPE: NotificationTypeDef = {
  category: Cat.SYSTEM,
  priority: Pri.MEDIUM,
  channels: IN_APP,
  label: 'Notification',
};

export function describeType(type: string): NotificationTypeDef {
  return NOTIFICATION_TYPES[type] ?? FALLBACK_TYPE;
}

/** Every registered type, for the admin filter dropdowns. */
export function listTypes() {
  return Object.entries(NOTIFICATION_TYPES)
    .map(([type, def]) => ({ type, ...def }))
    .sort((a, b) => a.category.localeCompare(b.category) || a.label.localeCompare(b.label));
}
