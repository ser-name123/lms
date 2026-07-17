"use client";

import { authSnapshot, type User } from "@/store/auth";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000/api";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Authorization header for raw `fetch` calls that don't go through `api()`
 * (e.g. the lms-data pages and multipart uploads). Spread into a headers object:
 *   headers: { "Content-Type": "application/json", ...authHeader() }
 */
export const authHeader = (): Record<string, string> => {
  const token = authSnapshot().accessToken;
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export type Tokens = { accessToken: string; refreshToken: string };

/* Refresh tokens are single-use on the server: two concurrent 401s that each
   refreshed would rotate twice, and the second would be rejected as a replay —
   logging the user out. So refreshes are single-flight: everyone waits on the
   same in-flight promise. */
let inFlightRefresh: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const { refreshToken, setTokens, clear } = authSnapshot();
  if (!refreshToken) return null;

  const res = await fetch(`${BASE}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });

  if (!res.ok) {
    clear();
    if (typeof window !== "undefined") {
      window.location.href = "/signin";
    }
    return null;
  }

  const tokens = (await res.json()) as Tokens;
  setTokens(tokens);
  return tokens.accessToken;
}

async function errorMessage(res: Response) {
  try {
    const body = (await res.json()) as { message?: string | string[] };
    const raw = body.message;
    if (Array.isArray(raw)) return raw.join(", ");
    if (raw) return raw;
  } catch {
    /* body was not JSON */
  }
  return res.statusText || `Request failed (${res.status})`;
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const send = (token: string | null) =>
    fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    });

  let res = await send(authSnapshot().accessToken);

  if (res.status === 401 && authSnapshot().refreshToken) {
    inFlightRefresh ??= refreshAccessToken().finally(() => {
      inFlightRefresh = null;
    });

    const fresh = await inFlightRefresh;
    if (fresh) res = await send(fresh);
  }

  if (!res.ok) throw new ApiError(res.status, await errorMessage(res));
  if (res.status === 204) return undefined as T;

  return (await res.json()) as T;
}

// ─── Auth calls ───────────────────────────────────────────────────────────────

export const login = (email: string, password: string) =>
  api<Tokens | { otpRequired: boolean; email: string }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });

export const verifyOtp = (email: string, otp: string) =>
  api<Tokens>("/auth/verify-otp", {
    method: "POST",
    body: JSON.stringify({ email, otp }),
  });

export const fetchMe = () => api<User>("/auth/me");

export const updateProfile = (dto: { firstName?: string; lastName?: string; email?: string; password?: string; avatarUrl?: string }) =>
  api<User>("/auth/profile", {
    method: "PATCH",
    body: JSON.stringify(dto),
  });

export const fetchSessions = () => 
  api<{ id: string; userAgent: string | null; ipAddress: string | null; createdAt: string; isCurrent: boolean }[]>("/auth/sessions");

export const deleteSession = (sessionId: string) => 
  api<{ success: boolean }>(`/auth/sessions/${sessionId}`, { method: "DELETE" });

export const fetchAdmins = () => 
  api<{ id: string; email: string; firstName: string; lastName: string; status: string; createdAt: string }[]>("/auth/admins");

export const createAdmin = (dto: { firstName: string; lastName: string; email: string; password: string }) =>
  api<{ id: string; email: string; firstName: string; lastName: string; status: string; createdAt: string }>("/auth/admins", {
    method: "POST",
    body: JSON.stringify(dto),
  });

export const deleteAdmin = (id: string) =>
  api<{ success: boolean }>(`/auth/admins/${id}`, { method: "DELETE" });

export const fetchSmtpConfig = () => 
  api<{ host: string; port: number; user: string; pass?: string; from: string; secure: boolean }>("/emails/smtp-config");

export const saveSmtpConfig = (config: { host: string; port: number; user: string; pass: string; from: string; secure: boolean }) =>
  api<{ success: boolean }>("/emails/smtp-config", {
    method: "POST",
    body: JSON.stringify(config),
  });

export type SystemSettings = {
  logo: string | null;
  logoDark: string | null;
  adminConsoleTitle: string | null;
  favicon: string | null;
  websiteName: string;
  defaultTheme: string;
  googleTags: string;
  loaderEnabled: string;
  loaderUrl: string | null;

  // Light Mode Colors
  primaryColor: string;
  accentTextLight: string;
  pageBgLight: string;
  surfaceBgLight: string;
  textPrimaryLight: string;
  textSecondaryLight: string;
  textMutedLight: string;
  sidebarBgLight: string;
  sidebarTextLight: string;
  sidebarActiveBgLight: string;
  sidebarActiveTextLight: string;
  topbarBgLight: string;
  topbarBorderLight: string;

  // Dark Mode Colors
  secondaryColor: string;
  accentTextDark: string;
  pageBgDark: string;
  surfaceBgDark: string;
  textPrimaryDark: string;
  textSecondaryDark: string;
  textMutedDark: string;
  sidebarBgDark: string;
  sidebarTextDark: string;
  sidebarActiveBgDark: string;
  sidebarActiveTextDark: string;
  topbarBgDark: string;
  topbarBorderDark: string;

  // Typography settings
  primaryFontFamily?: string;
  secondaryFontFamily?: string;
  h1FontSize?: string;
  h1FontWeight?: string;
  h1FontFamily?: string;
  h2FontSize?: string;
  h2FontWeight?: string;
  h2FontFamily?: string;
  h3FontSize?: string;
  h3FontWeight?: string;
  h3FontFamily?: string;
  h4FontSize?: string;
  h4FontWeight?: string;
  h4FontFamily?: string;
  h5FontSize?: string;
  h5FontWeight?: string;
  h5FontFamily?: string;
  pFontSize?: string;
  pFontWeight?: string;
  pFontFamily?: string;
};

export const fetchSystemSettings = () => api<SystemSettings>("/settings");

export const saveSystemSettings = (settings: SystemSettings) => api<{ success: boolean }>("/settings", {
  method: "POST",
  body: JSON.stringify(settings),
});

export type StudentProfile = {
  id: string;
  studentCode: string;
  phone: string | null;
  gender: string | null;
  guardianName: string | null;
  profession: string | null;
  fees: number | null;
  joiningDate: string | null;
  lastPaymentDate: string | null;
  nextPaymentDate: string | null;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    country: string | null;
    status: string;
    avatarUrl: string | null;
    createdAt: string;
  };
  enrollments: {
    id: string;
    status: string;
    progress: number;
    course: { id: string; title: string };
    teacher: { id: string; user: { firstName: string; lastName: string } } | null;
    package?: { id: string; name: string; price: number; classesPerMonth: number } | null;
  }[];
  // Enriched by the list endpoint:
  parentName?: string | null;
  coachId?: string | null;
  coachName?: string | null;
  batchCode?: string | null;
  attendanceRate?: number | null;
};

export const fetchStudents = (params: {
  page: number;
  limit: number;
  search?: string;
  status?: string;
  courseId?: string;
  teacherId?: string;
  batchId?: string;
  coachId?: string;
  trialConverted?: string;
  country?: string;
  joiningDateStart?: string;
  joiningDateEnd?: string;
  nextPaymentDateStart?: string;
  nextPaymentDateEnd?: string;
}) => {
  const queryObj: Record<string, string> = {
    page: String(params.page),
    limit: String(params.limit),
  };

  if (params.search) queryObj.search = params.search;
  if (params.batchId) queryObj.batchId = params.batchId;
  if (params.coachId) queryObj.coachId = params.coachId;
  if (params.trialConverted) queryObj.trialConverted = params.trialConverted;
  if (params.status && params.status !== "All") queryObj.status = params.status;
  if (params.courseId) queryObj.courseId = params.courseId;
  if (params.teacherId) queryObj.teacherId = params.teacherId;
  if (params.country) queryObj.country = params.country;
  if (params.joiningDateStart) queryObj.joiningDateStart = params.joiningDateStart;
  if (params.joiningDateEnd) queryObj.joiningDateEnd = params.joiningDateEnd;
  if (params.nextPaymentDateStart) queryObj.nextPaymentDateStart = params.nextPaymentDateStart;
  if (params.nextPaymentDateEnd) queryObj.nextPaymentDateEnd = params.nextPaymentDateEnd;

  const q = new URLSearchParams(queryObj);
  return api<{ items: StudentProfile[]; meta: { page: number; limit: number; total: number; pages: number } }>(`/students?${q.toString()}`);
};

export const fetchStudentsCourses = () => api<{ id: string; title: string }[]>("/students/courses");

// The course catalogue admins actually manage (LmsCourse), used to enrol a
// student on creation. Public GET.
export const fetchLmsCourses = () =>
  api<{ id: string; code: string; title: string; category: string; level: string; status: string }[]>("/lms-data/courses");
// NOTE: LmsAssignment CRUD (/lms-data/assignments) was retired — assignments now
// run through the unified AssignmentsModule (createAssignment/listAssignments/… below).
export const fetchStudentsTeachers = () => api<{ id: string; user: { firstName: string; lastName: string; email: string } }[]>("/students/teachers");

export const createStudent = (dto: any) => api<StudentProfile>("/students", {
  method: "POST",
  body: JSON.stringify(dto),
});

export const updateStudent = (id: string, dto: any) => api<StudentProfile>(`/students/${id}`, {
  method: "PATCH",
  body: JSON.stringify(dto),
});

export const deleteStudent = (id: string) => api<{ success: boolean }>(`/students/${id}`, {
  method: "DELETE",
});

export type StudentStats = {
  total: number;
  active: number;
  inactive: number;
  pending: number;
  trial: number;
  paused: number;
  male: number;
  female: number;
  countries: { country: string; count: number }[];
};

export const fetchStudentStats = () => api<StudentStats>("/students/stats");

export type StudentSession = {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
};

export const fetchStudentSessions = (studentId: string) =>
  api<StudentSession[]>(`/students/${studentId}/sessions`);

export const revokeStudentSession = (studentId: string, sessionId: string) =>
  api<void>(`/students/${studentId}/sessions/${sessionId}`, {
    method: "DELETE",
  });

/* Best-effort: the refresh token is revoked server-side, but a failure here
   must not block the client from clearing its own session. */
export const revokeSession = async (refreshToken: string) => {
  try {
    await fetch(`${BASE}/auth/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
  } catch {
    /* offline, or the API is down — sign out locally regardless */
  }
};

// ─── Teacher calls & types ───────────────────────────────────────────────────

export type TeacherProfile = {
  id: string;
  teacherCode: string;
  specialisation: string | null;
  subjects?: string[];
  archived?: boolean;
  hourlyRate: number | null;
  bio: string | null;
  courseId?: string | null;
  course?: {
    id: string;
    title: string;
  } | null;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    country: string | null;
    timezone: string | null;
    status: string;
    avatarUrl: string | null;
    createdAt: string;
    lastLoginAt: string | null;
  };
  _count?: {
    enrollments: number;
    classes: number;
  };
};

export type TeacherStats = {
  total: number;
  active: number;
  inactive: number;
  onLeave: number;
  countries: { country: string; count: number }[];
  specialisations: { specialisation: string; count: number }[];
};

export const fetchTeachers = (params: { 
  page: number; 
  limit: number; 
  search?: string; 
  status?: string;
  specialisation?: string;
  sortBy?: string;
}) => {
  const queryObj: Record<string, string> = {
    page: String(params.page),
    limit: String(params.limit),
  };

  if (params.search) queryObj.search = params.search;
  if (params.status && params.status !== "All") queryObj.status = params.status;
  if (params.specialisation && params.specialisation !== "All") queryObj.specialisation = params.specialisation;
  if (params.sortBy) queryObj.sortBy = params.sortBy;

  const q = new URLSearchParams(queryObj);
  return api<{ items: TeacherProfile[]; meta: { page: number; limit: number; total: number; pages: number } }>(`/teachers?${q.toString()}`);
};

export const createTeacher = (dto: any) => api<TeacherProfile>("/teachers", {
  method: "POST",
  body: JSON.stringify(dto),
});

export const updateTeacher = (id: string, dto: any) => api<TeacherProfile>(`/teachers/${id}`, {
  method: "PATCH",
  body: JSON.stringify(dto),
});

export const deleteTeacher = (id: string) => api<{ success: boolean }>(`/teachers/${id}`, {
  method: "DELETE",
});

export const fetchTeacherStats = () => api<TeacherStats>("/teachers/stats");

export const fetchTeacherSessions = (teacherId: string) =>
  api<{ id: string; userAgent: string | null; ipAddress: string | null; createdAt: string }[]>(`/teachers/${teacherId}/sessions`);

export const revokeTeacherSession = (teacherId: string, sessionId: string) =>
  api<void>(`/teachers/${teacherId}/sessions/${sessionId}`, {
    method: "DELETE",
  });

// ─── Employee calls & types ───────────────────────────────────────────────────

export type EmployeeProfile = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  status: string;
  country: string | null;
  timezone: string | null;
  avatarUrl: string | null;
  phone: string | null;
  gender: string | null;
  joiningDate: string | null;
  salary: number | null;
  createdAt: string;
  updatedAt: string;
};

export type EmployeeStats = {
  total: number;
  active: number;
  inactive: number;
  pending: number;
  totalSalary: number;
  adminsCount: number;
  supervisorsCount: number;
  coachesCount: number;
  countries: { country: string; count: number }[];
};

export const fetchEmployees = (params: {
  page: number;
  limit: number;
  search?: string;
  role?: string;
  status?: string;
  sortBy?: string;
}) => {
  const queryObj: Record<string, string> = {
    page: String(params.page),
    limit: String(params.limit),
  };

  if (params.search) queryObj.search = params.search;
  if (params.role && params.role !== "All") queryObj.role = params.role;
  if (params.status && params.status !== "All") queryObj.status = params.status;
  if (params.sortBy) queryObj.sortBy = params.sortBy;

  const q = new URLSearchParams(queryObj);
  return api<{ items: EmployeeProfile[]; meta: { page: number; limit: number; total: number; pages: number } }>(`/employees?${q.toString()}`);
};

export const createEmployee = (dto: any) => api<EmployeeProfile>("/employees", {
  method: "POST",
  body: JSON.stringify(dto),
});

export const updateEmployee = (id: string, dto: any) => api<EmployeeProfile>(`/employees/${id}`, {
  method: "PATCH",
  body: JSON.stringify(dto),
});

export const deleteEmployee = (id: string) => api<{ success: boolean }>(`/employees/${id}`, {
  method: "DELETE",
});

export const fetchEmployeeStats = () => api<EmployeeStats>("/employees/stats");

export const fetchEmployeeSessions = (id: string) =>
  api<{ id: string; userAgent: string | null; ipAddress: string | null; createdAt: string }[]>(`/employees/${id}/sessions`);

export const revokeEmployeeSession = (id: string, sessionId: string) =>
  api<void>(`/employees/${id}/sessions/${sessionId}`, {
    method: "DELETE",
  });

// ─── Candidates calls & types ───────────────────────────────────────────────────

export type CandidateStatus = "NEW" | "SHORTLISTED" | "REJECTED" | "WAITING" | "APPROVED";

export type Candidate = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  position: string;
  resumeUrl: string | null;
  status: CandidateStatus;
  notes: string | null;
  appliedAt: string;
  updatedAt: string;
};

export type CandidateStats = {
  total: number;
  new: number;
  shortlisted: number;
  rejected: number;
  waiting: number;
  approved: number;
};

export const fetchCandidates = (params: {
  page: number;
  limit: number;
  search?: string;
  status?: string;
  sortBy?: string;
}) => {
  const queryObj: Record<string, string> = {
    page: String(params.page),
    limit: String(params.limit),
  };

  if (params.search) queryObj.search = params.search;
  if (params.status && params.status !== "All") {
    // Standardise category names to CandidateStatus enum strings
    let cleanStatus = params.status.toUpperCase().trim();
    if (cleanStatus.startsWith("NEW")) cleanStatus = "NEW";
    queryObj.status = cleanStatus;
  }
  if (params.sortBy) queryObj.sortBy = params.sortBy;

  const q = new URLSearchParams(queryObj);
  return api<{ items: Candidate[]; meta: { page: number; limit: number; total: number; pages: number } }>(`/candidates?${q.toString()}`);
};

export const createCandidate = (dto: any) => api<Candidate>("/candidates", {
  method: "POST",
  body: JSON.stringify(dto),
});

export const updateCandidate = (id: string, dto: any) => api<Candidate>(`/candidates/${id}`, {
  method: "PATCH",
  body: JSON.stringify(dto),
});

export const deleteCandidate = (id: string) => api<{ success: boolean }>(`/candidates/${id}`, {
  method: "DELETE",
});

export const fetchCandidateStats = () => api<CandidateStats>("/candidates/stats");

export const seedCandidates = () => api<{ count: number }>("/candidates/seed", {
  method: "POST",
});

// Leave Request APIs
export type LeaveType = "SICK" | "CASUAL" | "ANNUAL" | "UNPAID" | "OTHER";
export type LeaveRequestStatus = "PENDING" | "APPROVED" | "DECLINED";

export interface LeaveRequest {
  id: string;
  userId: string;
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  reason: string;
  status: LeaveRequestStatus;
  adminNotes: string | null;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    role: string;
  };
}

export interface LeaveStats {
  total: number;
  approved: number;
  declined: number;
  pending: number;
}

export interface ListLeavesParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  sortBy?: string;
}

export const fetchLeaves = (params: ListLeavesParams) => {
  const queryObj: Record<string, string> = {};
  if (params.page) queryObj.page = String(params.page);
  if (params.limit) queryObj.limit = String(params.limit);
  if (params.search) queryObj.search = params.search;
  if (params.status && params.status !== "All") {
    queryObj.status = params.status.toUpperCase();
  }
  if (params.sortBy) queryObj.sortBy = params.sortBy;

  const q = new URLSearchParams(queryObj);
  return api<{ items: LeaveRequest[]; meta: { page: number; limit: number; total: number; pages: number } }>(`/leaves?${q.toString()}`);
};

export const createLeave = (dto: any) => api<LeaveRequest>("/leaves", {
  method: "POST",
  body: JSON.stringify(dto),
});

export const updateLeave = (id: string, dto: any) => api<LeaveRequest>(`/leaves/${id}`, {
  method: "PATCH",
  body: JSON.stringify(dto),
});

export const deleteLeave = (id: string) => api<{ success: boolean }>(`/leaves/${id}`, {
  method: "DELETE",
});

export const fetchLeaveStats = () => api<LeaveStats>("/leaves/stats");

export const seedLeaves = () => api<{ seededCount: number }>("/leaves/seed", {
  method: "POST",
});

// ─── Invoice calls & types ────────────────────────────────────────────────────

export type InvoiceItem = {
  id: string;
  number: string;
  studentId: string;
  amount: number;
  status: string; // DRAFT, SENT, PAID, OVERDUE, VOID
  issuedAt: string;
  dueAt: string | null;
  student: {
    id: string;
    user: {
      firstName: string;
      lastName: string;
      email: string;
    };
  };
};

export type ListInvoicesParams = {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  sortBy?: string;
};

export const fetchInvoices = (params: ListInvoicesParams = {}) => {
  const queryObj: Record<string, string> = {
    page: String(params.page ?? 1),
    limit: String(params.limit ?? 20),
  };

  if (params.search) queryObj.search = params.search;
  if (params.status && params.status !== "All") {
    // Map Paid -> PAID, Pending -> SENT, Overdue -> OVERDUE, Refunded -> VOID
    const mappedStatus = 
      params.status === "Paid" ? "PAID" :
      params.status === "Pending" ? "SENT" :
      params.status === "Overdue" ? "OVERDUE" :
      params.status === "Refunded" ? "VOID" : params.status;
    queryObj.status = mappedStatus;
  }
  if (params.sortBy) queryObj.sortBy = params.sortBy;

  const q = new URLSearchParams(queryObj);
  return api<{ items: InvoiceItem[]; meta: { page: number; limit: number; total: number; totalPages: number } }>(`/invoices?${q.toString()}`);
};

export const createInvoice = (dto: any) => api<InvoiceItem>("/invoices", {
  method: "POST",
  body: JSON.stringify(dto),
});

export const updateInvoice = (id: string, dto: any) => api<InvoiceItem>(`/invoices/${id}`, {
  method: "PUT",
  body: JSON.stringify(dto),
});

export const deleteInvoice = (id: string) => api<void>(`/invoices/${id}`, {
  method: "DELETE",
});

// NOTE: the legacy /trials (TrialClass) client was retired — trial classes now
// run through the Leads module (LeadTrial: scheduleLeadTrial/fetchMyTrials/…).

// ─── Dashboard calls & types ──────────────────────────────────────────────────

export type Trend = { label: string; value: number };

export type Kpi = {
  id: string;
  label: string;
  value: string;
  raw: number;
  delta: number; // percent vs previous period
  hint: string;
  spark: Trend[];
};

export type NewStudentEntry = {
  no: string;
  name: string;
  professor: string;
  date: string; // ISO — formatted client-side
  status: "Checkin" | "Pending" | "Canceled";
  subject: string;
  fees: string;
};

export type ActivityItem = {
  id: string;
  who: string;
  action: string;
  target: string;
  at: string; // ISO — rendered as relative time client-side
  kind: "payment" | "enroll" | "class" | "alert";
};

export type EducationCourse = {
  id: string;
  title: string;
  cover: string;
  date: string;
  likes: number;
  duration: string;
  professor: string;
  students: string;
};

export type DashboardOverview = {
  kpis: Kpi[];
  newStudentList: NewStudentEntry[];
  activity: ActivityItem[];
  educationCourses: EducationCourse[];
  courseMix: { name: string; value: number }[];
  enrollmentSeries: { month: string; new: number; churned: number }[];
  revenueSeries: { month: string; revenue: number; target: number }[];
};

export const fetchDashboard = () => api<DashboardOverview>("/dashboard/overview");

// ─── Payout Calls & Types ──────────────────────────────────────────────────────

export type PayoutStatus = "PENDING" | "PROCESSING" | "PAID" | "FAILED";
export type PayoutMethod = "BANK_TRANSFER" | "WISE" | "PAYPAL" | "CASH" | "STRIPE";

export interface Payout {
  id: string;
  userId: string;
  amount: number;
  deductions: number;
  bonus: number;
  netAmount: number;
  paymentMethod: PayoutMethod;
  status: PayoutStatus;
  paymentDate: string | null;
  referenceNumber: string | null;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    role: string;
    status: string;
    phone: string | null;
    gender: string | null;
    avatarUrl: string | null;
  };
}

export interface PayoutStats {
  totalPaid: number;
  pendingSalary: number;
  balance: number;
  paidIncreasePct: number;
  pendingIncreasePct: number;
  balanceIncreasePct: number;
  trend: { month: string; paid: number; pending: number }[];
}

export const fetchPayouts = (params: {
  page: number;
  limit: number;
  search?: string;
  status?: string;
  role?: string;
  method?: string;
  sortBy?: string;
}) => {
  const queryObj: Record<string, string> = {
    page: String(params.page),
    limit: String(params.limit),
  };
  if (params.search) queryObj.search = params.search;
  if (params.status && params.status !== "All") queryObj.status = params.status;
  if (params.role && params.role !== "All") queryObj.role = params.role.toUpperCase();
  if (params.method && params.method !== "All") queryObj.method = params.method;
  if (params.sortBy) queryObj.sortBy = params.sortBy;

  const q = new URLSearchParams(queryObj);
  return api<{ items: Payout[]; meta: { page: number; limit: number; total: number; totalPages: number } }>(`/payouts?${q.toString()}`);
};

export const fetchPayoutStats = () => api<PayoutStats>("/payouts/stats");

export const createPayout = (dto: any) => api<Payout>("/payouts", {
  method: "POST",
  body: JSON.stringify(dto),
});

export const bulkGeneratePayouts = (dto: { billingPeriodStart: string; billingPeriodEnd: string }) => 
  api<{ generatedCount: number }>("/payouts/bulk-generate", {
    method: "POST",
    body: JSON.stringify(dto),
  });

export const updatePayout = (id: string, dto: any) => api<Payout>(`/payouts/${id}`, {
  method: "PATCH",
  body: JSON.stringify(dto),
});

export const processPayoutPayment = (id: string, dto: { referenceNumber: string; notes?: string; paymentMethod?: PayoutMethod }) => 
  api<Payout>(`/payouts/${id}/pay`, {
    method: "POST",
    body: JSON.stringify(dto),
  });

export const deletePayout = (id: string) => api<void>(`/payouts/${id}`, {
  method: "DELETE",
});

export const seedPayouts = () => api<{ seededCount: number }>("/payouts/seed", {
  method: "POST",
});

// ─── Expense Calls & Types ──────────────────────────────────────────────────────

export interface ExpenseCategory {
  id: string;
  name: string;
  createdAt?: string;
}

export type ExpenseStatus = "APPROVED" | "PENDING" | "REJECTED";
export type ExpensePaymentMethod = "BANK_TRANSFER" | "CREDIT_CARD" | "PAYPAL" | "CASH" | "WISE";

export interface Expense {
  id: string;
  title: string;
  amount: number;
  categoryId: string;
  category: ExpenseCategory;
  paymentMethod: ExpensePaymentMethod;
  status: ExpenseStatus;
  paymentDate: string;
  merchant: string | null;
  referenceNo: string | null;
  receiptUrl: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExpenseStats {
  totalExpense: number;
  pendingExpense: number;
  revenue: number;
  balance: number;
  // Real month-over-month change %; null when there is no prior-month baseline.
  expenseChangePct: number | null;
  pendingChangePct: number | null;
  revenueChangePct: number | null;
  balanceChangePct: number | null;
  categoryBreakdown: { id: string; name: string; value: number; count: number }[];
  trend: { month: string; revenue: number; expenses: number }[];
}

export const fetchExpenses = (params: {
  page: number;
  limit: number;
  search?: string;
  categoryId?: string;
  status?: string;
  paymentMethod?: string;
  sortBy?: string;
}) => {
  const queryObj: Record<string, string> = {
    page: String(params.page),
    limit: String(params.limit),
  };
  if (params.search) queryObj.search = params.search;
  if (params.categoryId && params.categoryId !== "All") queryObj.categoryId = params.categoryId;
  if (params.status && params.status !== "All") queryObj.status = params.status.toUpperCase();
  if (params.paymentMethod && params.paymentMethod !== "All") {
    queryObj.paymentMethod = params.paymentMethod.toUpperCase().replace(" ", "_");
  }
  if (params.sortBy) queryObj.sortBy = params.sortBy;

  const q = new URLSearchParams(queryObj);
  return api<{ items: Expense[]; meta: { page: number; limit: number; total: number; totalPages: number } }>(`/expenses?${q.toString()}`);
};

export const fetchExpenseStats = () => api<ExpenseStats>("/expenses/stats");

export const fetchExpenseCategories = () => api<ExpenseCategory[]>("/expenses/categories");

export const createExpenseCategory = (name: string) => api<ExpenseCategory>("/expenses/categories", {
  method: "POST",
  body: JSON.stringify({ name }),
});

export const createExpense = (dto: any) => api<Expense>("/expenses", {
  method: "POST",
  body: JSON.stringify(dto),
});

export const updateExpense = (id: string, dto: any) => api<Expense>(`/expenses/${id}`, {
  method: "PATCH",
  body: JSON.stringify(dto),
});

export const deleteExpense = (id: string) => api<void>(`/expenses/${id}`, {
  method: "DELETE",
});

/** Upload a receipt file (image/pdf). Returns a served, inline-viewable URL. */
export const uploadExpenseReceipt = async (file: File): Promise<{ url: string; fileName: string }> => {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${BASE}/expenses/receipt-upload`, {
    method: "POST",
    headers: { ...authHeader() }, // no Content-Type: browser sets the multipart boundary
    body: form,
  });
  if (!res.ok) throw new ApiError(res.status, await errorMessage(res));
  return res.json() as Promise<{ url: string; fileName: string }>;
};

/** Resolve a stored file reference to a full URL the browser can load. */
export const resolveFileUrl = (ref: string | null | undefined): string => {
  if (!ref) return "";
  if (/^(https?:|data:)/i.test(ref)) return ref; // already absolute / external
  return `${BASE}/${ref.replace(/^\/+/, "")}`;
};

/**
 * Fetch an auth-protected file (e.g. an expense receipt) with the caller's token
 * and return an object URL usable as an <img>/<iframe> `src`. Browsers cannot
 * attach an Authorization header to a bare tag load, so protected files must be
 * fetched here and handed over as a blob URL. Remember to URL.revokeObjectURL it.
 */
export const fetchProtectedFileUrl = async (path: string): Promise<string> => {
  const res = await fetch(`${BASE}${path}`, { headers: { ...authHeader() } });
  if (!res.ok) throw new ApiError(res.status, await errorMessage(res));
  return URL.createObjectURL(await res.blob());
};

/**
 * Resolve a receipt reference for rendering. Inline (`data:`) and external
 * (`http(s):`) refs pass straight through; a stored `uploads/receipts/<file>`
 * ref is fetched through the authenticated `/expenses/receipt/:filename`
 * endpoint (receipts are no longer served as open static files).
 */
export const resolveReceiptSrc = async (
  ref: string | null | undefined,
): Promise<string> => {
  if (!ref) return "";
  if (/^(https?:|data:)/i.test(ref)) return ref;
  const filename = ref.split("/").pop() ?? "";
  return fetchProtectedFileUrl(`/expenses/receipt/${encodeURIComponent(filename)}`);
};

// ─── Student Portal calls ──────────────────────────────────────────────────────

export const fetchStudentDashboard = () => api<any>("/student-portal/dashboard");
export const fetchStudentEnrollments = () => api<any[]>("/student-portal/enrollments");
export const fetchStudentClasses = () => api<any[]>("/student-portal/classes");
export const attendStudentClass = (classId: string) => api<any>(`/student-portal/classes/${classId}/attend`, {
  method: "POST",
});
export const fetchStudentAssignments = () => api<any[]>("/student-portal/assignments");
export const submitStudentAssignment = (assignmentId: string, content: string, fileUrl?: string) => api<any>(`/student-portal/assignments/${assignmentId}/submit`, {
  method: "POST",
  body: JSON.stringify({ content, fileUrl }),
});
export const fetchStudentInvoices = () => api<any[]>("/student-portal/invoices");
export const payStudentInvoice = (invoiceId: string) => api<any>(`/student-portal/invoices/${invoiceId}/pay`, {
  method: "POST",
});
export const fetchStudentProfile = () => api<any>("/student-portal/profile");
export const updateStudentProfile = (payload: any) => api<any>("/student-portal/profile", {
  method: "PATCH",
  body: JSON.stringify(payload),
});
export const fetchStudentMeetings = () => api<any[]>("/student-portal/meetings");
export const fetchStudentKnowledgebase = () => api<any[]>("/student-portal/knowledgebase");

export const uploadStudentAvatar = async (file: File): Promise<{ url: string; fileName: string }> => {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${BASE}/student-portal/profile/avatar-upload`, {
    method: "POST",
    headers: { ...authHeader() },
    body: form,
  });
  if (!res.ok) throw new ApiError(res.status, await errorMessage(res));
  return res.json() as Promise<{ url: string; fileName: string }>;
};

// ─── Live Chat Calls ───────────────────────────────────────────────────────────

export const fetchStudentChatMessages = () => api<any[]>("/chat/student");
export const sendStudentChatMessage = (content: string) => api<any>("/chat/student", {
  method: "POST",
  body: JSON.stringify({ content }),
});

export const fetchAdminChatThreads = () => api<any[]>("/chat/admin/threads");
export const fetchAdminThreadMessages = (studentId: string) => api<any[]>(`/chat/admin/threads/${studentId}`);
export const sendAdminChatMessage = (studentId: string, content: string) => api<any>(`/chat/admin/threads/${studentId}`, {
  method: "POST",
  body: JSON.stringify({ content }),
});

// ─── Teacher Portal Calls ───────────────────────────────────────────────────────

export const fetchTeacherDashboard = () => api<any>("/teacher-portal/dashboard");
export const fetchTeacherClasses = () => api<any[]>("/teacher-portal/classes");
export const fetchTeacherStudents = () => api<any[]>("/teacher-portal/students");
export const fetchTeacherAssignments = () => api<any[]>("/teacher-portal/assignments");
export const gradeStudentSubmission = (submissionId: string, grade: number, feedback: string) => api<any>(`/teacher-portal/assignments/${submissionId}/grade`, {
  method: "POST",
  body: JSON.stringify({ grade, feedback }),
});
export const fetchTeacherPayouts = () => api<any[]>("/teacher-portal/payouts");
export const fetchTeacherProfile = () => api<any>("/teacher-portal/profile");
export const fetchTeacherMeetings = () => api<any[]>("/teacher-portal/meetings");
export const updateTeacherProfile = (payload: any) => api<any>("/teacher-portal/profile", {
  method: "PATCH",
  body: JSON.stringify(payload),
});
export const uploadTeacherAvatar = async (file: File): Promise<{ url: string; fileName: string }> => {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${BASE}/teacher-portal/profile/avatar-upload`, {
    method: "POST",
    headers: { ...authHeader() },
    body: form,
  });
  if (!res.ok) throw new ApiError(res.status, await errorMessage(res));
  return res.json() as Promise<{ url: string; fileName: string }>;
};




// ─── Student registration (public self-signup + admin approval) ─────────────

export type RegistrationStatus = "PENDING" | "APPROVED" | "REJECTED" | "NEEDS_INFO";

export interface StudentRegistration {
  id: string;
  registrantType: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  gender: string | null;
  dateOfBirth: string | null;
  nationality: string | null;
  country: string | null;
  state: string | null;
  city: string | null;
  address: string | null;
  studentEmail: string;
  studentMobile: string | null;
  parentEmail: string | null;
  parentMobile: string | null;
  emergencyContact: string | null;
  whatsappNumber: string | null;
  currentSchool: string | null;
  board: string | null;
  className: string | null;
  grade: string | null;
  subjects: string | null;
  language: string | null;
  courseCode: string | null;
  courseTitle: string | null;
  batch: string | null;
  preferredTiming: string | null;
  learningMode: string | null;
  fatherName: string | null;
  motherName: string | null;
  occupation: string | null;
  guardianRelation: string | null;
  guardianAddress: string | null;
  guardianEmail: string | null;
  guardianPhone: string | null;
  username: string | null;
  status: RegistrationStatus;
  reviewNotes: string | null;
  reviewedAt: string | null;
  studentProfileId: string | null;
  admissionNumber: string | null;
  rollNumber: string | null;
  approvedStudentCode: string | null;
  createdAt: string;
  updatedAt: string;
  // Present only on a review response: the update dispatched to the applicant.
  notification?: { to: string; subject: string; message: string } | null;
}

export interface RegistrationStats {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  needsInfo: number;
}

export interface OtpChallenge {
  otpRequired: boolean;
  email: string;
  otp?: string; // present in dev; will move to email-only later
  message: string;
}

// Public — no auth token required (the endpoint is @Public on the API).
// Step 1: submit the application → returns an OTP challenge (record not yet created).
export const createRegistration = (dto: Record<string, unknown>) =>
  api<OtpChallenge>("/registrations", {
    method: "POST",
    body: JSON.stringify(dto),
  });

// Step 2: verify the OTP → creates the application record.
export const verifyRegistrationOtp = (email: string, otp: string) =>
  api<{ id: string; status: RegistrationStatus; message: string }>("/registrations/verify-otp", {
    method: "POST",
    body: JSON.stringify({ email, otp }),
  });

export const fetchRegistrations = (params: {
  page: number;
  limit: number;
  search?: string;
  status?: string;
}) => {
  const q: Record<string, string> = { page: String(params.page), limit: String(params.limit) };
  if (params.search) q.search = params.search;
  if (params.status && params.status !== "All") q.status = params.status;
  return api<{ items: StudentRegistration[]; meta: { page: number; limit: number; total: number; totalPages: number } }>(
    `/registrations?${new URLSearchParams(q).toString()}`,
  );
};

export const fetchRegistrationStats = () => api<RegistrationStats>("/registrations/stats");

// The full application linked to an approved student (null if admin-created).
export const fetchStudentRegistration = (profileId: string) =>
  api<StudentRegistration | null>(`/registrations/by-student/${profileId}`);

export const updateStudentRegistration = (profileId: string, dto: Record<string, unknown>) =>
  api<StudentRegistration>(`/registrations/by-student/${profileId}`, {
    method: "PATCH",
    body: JSON.stringify(dto),
  });

export const reviewRegistration = (
  id: string,
  dto: { status: "APPROVED" | "REJECTED" | "NEEDS_INFO"; notes?: string },
) =>
  api<StudentRegistration>(`/registrations/${id}/review`, {
    method: "PATCH",
    body: JSON.stringify(dto),
  });

// ─── Teacher registration (public application + admin hiring pipeline) ───────

export type TeacherRegistrationStatus =
  | "APPLIED"
  | "SCREENING"
  | "INTERVIEW"
  | "DEMO_CLASS"
  | "APPROVAL"
  | "TRAINING"
  | "ACTIVATED"
  | "REJECTED"
  | "NEEDS_INFO";

export interface TeacherRegistration {
  id: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  gender: string | null;
  dateOfBirth: string | null;
  nationality: string | null;
  country: string | null;
  state: string | null;
  city: string | null;
  address: string | null;
  email: string;
  mobile: string | null;
  whatsappNumber: string | null;
  highestQualification: string | null;
  university: string | null;
  passingYear: string | null;
  experienceYears: string | null;
  currentEmployer: string | null;
  expectedSalary: string | null;
  subjects: string | null;
  languages: string | null;
  teachingMode: string | null;
  availabilityDays: string[];
  availabilitySlots: string[];
  technicalSkills: string[];
  accountNumber: string | null;
  ifsc: string | null;
  bankName: string | null;
  upi: string | null;
  taxNumber: string | null;
  resumeUrl: string | null;
  degreeUrl: string | null;
  certificatesUrl: string | null;
  govIdUrl: string | null;
  photoUrl: string | null;
  experienceLetterUrl: string | null;
  policeVerificationUrl: string | null;
  username: string | null;
  status: TeacherRegistrationStatus;
  reviewNotes: string | null;
  interviewDate: string | null;
  interviewNotes: string | null;
  demoDate: string | null;
  demoNotes: string | null;
  reviewedAt: string | null;
  teacherProfileId: string | null;
  approvedTeacherCode: string | null;
  createdAt: string;
  updatedAt: string;
  // Present only on a review response: the update dispatched to the applicant.
  notification?: { to: string; subject: string; message: string } | null;
}

export interface TeacherRegistrationStats {
  total: number;
  applied: number;
  screening: number;
  interview: number;
  demoClass: number;
  approval: number;
  training: number;
  activated: number;
  rejected: number;
  needsInfo: number;
  inPipeline: number;
}

// Public — no auth token required (the endpoint is @Public on the API).
// Step 1: submit the application → returns an OTP challenge (record not yet created).
export const createTeacherRegistration = (dto: Record<string, unknown>) =>
  api<OtpChallenge>("/teacher-registrations", {
    method: "POST",
    body: JSON.stringify(dto),
  });

// Step 2: verify the OTP → creates the teacher application record.
export const verifyTeacherRegistrationOtp = (email: string, otp: string) =>
  api<{ id: string; status: TeacherRegistrationStatus; message: string }>(
    "/teacher-registrations/verify-otp",
    { method: "POST", body: JSON.stringify({ email, otp }) },
  );

/** Public: upload a teacher document (resume/degree/id/photo). Returns a stored reference. */
export const uploadTeacherDocument = async (file: File): Promise<{ url: string; fileName: string }> => {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${BASE}/teacher-registrations/document-upload`, {
    method: "POST",
    headers: { ...authHeader() }, // browser sets the multipart boundary
    body: form,
  });
  if (!res.ok) throw new ApiError(res.status, await errorMessage(res));
  return res.json() as Promise<{ url: string; fileName: string }>;
};

/** Resolve a teacher document reference to an authenticated blob URL (admin only). */
export const resolveTeacherDocSrc = async (
  ref: string | null | undefined,
): Promise<string> => {
  if (!ref) return "";
  if (/^(https?:|data:)/i.test(ref)) return ref;
  const filename = ref.split("/").pop() ?? "";
  return fetchProtectedFileUrl(`/teacher-registrations/document/${encodeURIComponent(filename)}`);
};

export const fetchTeacherRegistrations = (params: {
  page: number;
  limit: number;
  search?: string;
  status?: string;
}) => {
  const q: Record<string, string> = { page: String(params.page), limit: String(params.limit) };
  if (params.search) q.search = params.search;
  if (params.status && params.status !== "All") q.status = params.status;
  return api<{ items: TeacherRegistration[]; meta: { page: number; limit: number; total: number; totalPages: number } }>(
    `/teacher-registrations?${new URLSearchParams(q).toString()}`,
  );
};

export const fetchTeacherRegistrationStats = () =>
  api<TeacherRegistrationStats>("/teacher-registrations/stats");

// The full application linked to an activated teacher (null if admin-created).
export const fetchTeacherRegistrationByProfile = (profileId: string) =>
  api<TeacherRegistration | null>(`/teacher-registrations/by-teacher/${profileId}`);

export const updateTeacherRegistrationByProfile = (profileId: string, dto: Record<string, unknown>) =>
  api<TeacherRegistration>(`/teacher-registrations/by-teacher/${profileId}`, {
    method: "PATCH",
    body: JSON.stringify(dto),
  });

export const reviewTeacherRegistration = (
  id: string,
  dto: {
    status: Exclude<TeacherRegistrationStatus, "APPLIED">;
    notes?: string;
    interviewDate?: string;
    demoDate?: string;
  },
) =>
  api<TeacherRegistration>(`/teacher-registrations/${id}/review`, {
    method: "PATCH",
    body: JSON.stringify(dto),
  });

// ─── Leads (website inquiry → evaluation → trial → conversion CRM) ────────────

export type LeadStatus =
  | "NEW"
  | "CONTACT_PENDING"
  | "CONTACTED"
  | "EVALUATION_SCHEDULED"
  | "EVALUATION_COMPLETED"
  | "TEACHER_ASSIGNED"
  | "TRIAL_SCHEDULED"
  | "TRIAL_COMPLETED"
  | "WAITING_PARENT_DECISION"
  | "CONVERTED"
  | "REJECTED"
  | "CLOSED";

export type LeadPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

export interface Lead {
  id: string;
  leadNumber: string;
  studentFirstName: string;
  studentLastName: string;
  gender: string | null;
  dateOfBirth: string | null;
  currentGrade: string | null;
  currentSchool: string | null;
  country: string | null;
  timeZone: string | null;
  parentName: string | null;
  relationship: string | null;
  email: string;
  mobile: string;
  whatsappNumber: string | null;
  interestedSubject: string | null;
  currentLevel: string | null;
  preferredLanguage: string | null;
  preferredTeacherGender: string | null;
  preferredDays: string[];
  preferredTimeSlots: string[];
  learningGoal: string | null;
  previousCoaching: string | null;
  specialRequirements: string | null;
  medicalDisability: string | null;
  acceptPrivacy: boolean;
  acceptTerms: boolean;
  leadSource: string;
  ipAddress: string | null;
  browser: string | null;
  device: string | null;
  referralUrl: string | null;
  utmSource: string | null;
  utmCampaign: string | null;
  utmMedium: string | null;
  status: LeadStatus;
  priority: LeadPriority;
  assignedCoachId: string | null;
  assignedCoachName?: string | null;
  evaluationScores: Record<string, number> | null;
  overallScore: number | null;
  evaluationNotes: string | null;
  evaluatedAt: string | null;
  recommendedLevel: string | null;
  recommendedBatch: string | null;
  recommendedTeacherId: string | null;
  recommendedTeacherName?: string | null;
  assignedTeacherId: string | null;
  assignedTeacherName?: string | null;
  assignedTeacherAt: string | null;
  coachDecision: string | null;
  coachDecisionNotes: string | null;
  coachDecisionAt: string | null;
  convertedStudentId: string | null;
  convertedStudentCode: string | null;
  convertedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LeadActivity {
  id: string;
  leadId: string;
  type: string;
  message: string;
  actorId: string | null;
  actorName: string | null;
  createdAt: string;
}

export interface LeadStats {
  total: number;
  converted: number;
  rejected: number;
  newLeads: number;
  inPipeline: number;
  conversionRate: number;
  avgScore: number;
  statusCounts: Record<string, number>;
  bySubject: { subject: string; count: number }[];
  byCountry: { country: string; count: number }[];
}

export interface LeadRecommendation {
  recommendedLevel: string;
  recommendedBatch: string;
  teacher: { id: string; name: string; specialisation: string | null; workload: number } | null;
}

// Public — no auth (endpoint is @Public).
// Step 1: submit → returns an OTP challenge (lead not yet created).
export const createLead = (dto: Record<string, unknown>) =>
  api<OtpChallenge>("/leads", {
    method: "POST",
    body: JSON.stringify(dto),
  });

// Step 2: verify the OTP → the lead is created.
export const verifyLeadOtp = (email: string, otp: string) =>
  api<{ id: string; leadNumber: string; message: string }>("/leads/verify-otp", {
    method: "POST",
    body: JSON.stringify({ email, otp }),
  });

export const checkLeadDuplicate = (email?: string, mobile?: string) =>
  api<{ exists: boolean; lead?: { id: string; leadNumber: string; status: LeadStatus; createdAt: string } }>(
    "/leads/check-duplicate",
    { method: "POST", body: JSON.stringify({ email, mobile }) },
  );

export const fetchLeads = (params: {
  page: number;
  limit: number;
  search?: string;
  status?: string;
  priority?: string;
  country?: string;
  subject?: string;
  coachId?: string;
}) => {
  const q: Record<string, string> = { page: String(params.page), limit: String(params.limit) };
  (["search", "status", "priority", "country", "subject", "coachId"] as const).forEach((k) => {
    const v = params[k];
    if (v && v !== "All") q[k] = String(v);
  });
  return api<{ items: Lead[]; meta: { page: number; limit: number; total: number; totalPages: number } }>(
    `/leads?${new URLSearchParams(q).toString()}`,
  );
};

export const fetchLeadStats = () => api<LeadStats>("/leads/stats");
export const fetchLead = (id: string) => api<Lead>(`/leads/${id}`);
export const fetchLeadActivities = (id: string) => api<LeadActivity[]>(`/leads/${id}/activities`);
export const fetchLeadRecommendation = (id: string) => api<LeadRecommendation>(`/leads/${id}/recommendation`);

export const updateLead = (id: string, dto: Record<string, unknown>) =>
  api<Lead>(`/leads/${id}`, { method: "PATCH", body: JSON.stringify(dto) });

export const evaluateLead = (id: string, scores: Record<string, number>, notes?: string) =>
  api<Lead>(`/leads/${id}/evaluate`, { method: "POST", body: JSON.stringify({ scores, notes }) });

export const assignLeadTeacher = (id: string, opts: { teacherId?: string; auto?: boolean }) =>
  api<Lead>(`/leads/${id}/assign-teacher`, { method: "POST", body: JSON.stringify(opts) });

// ─── Lead trials · feedback · conversion · funnel (Phase 3 + 4) ──────────────

export type LeadTrialStatus =
  | "SCHEDULED"
  | "RESCHEDULED"
  | "COMPLETED"
  | "NO_SHOW"
  | "CANCELLED";

export interface LeadTrial {
  id: string;
  leadId: string;
  teacherId: string | null;
  teacherName?: string | null;
  scheduledAt: string;
  durationMins: number;
  timeZone: string | null;
  meetingProvider: string | null;
  meetingLink: string | null;
  status: LeadTrialStatus;
  reminder24hSentAt: string | null;
  reminder1hSentAt: string | null;
  attendance: string | null;
  attendedAt: string | null;
  teacherRating: number | null;
  teacherFeedback: string | null;
  teacherRecommendsEnroll: boolean | null;
  parentRating: number | null;
  parentFeedback: string | null;
  parentInterested: boolean | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  // Present only on the teacher "my trials" view.
  lead?: {
    id: string;
    leadNumber: string;
    studentFirstName: string;
    studentLastName: string;
    interestedSubject: string | null;
    email: string;
    mobile: string;
    timeZone: string | null;
  } | null;
}

export interface LeadFunnel {
  total: number;
  converted: number;
  rejected: number;
  conversionRate: number;
  funnel: { stage: string; reached: number }[];
  trials: {
    scheduled: number;
    attended: number;
    noShow: number;
    attendanceRate: number;
    avgTeacherRating: number;
    avgParentRating: number;
  };
}

export const fetchLeadTrials = (id: string) => api<LeadTrial[]>(`/leads/${id}/trials`);

export const scheduleLeadTrial = (
  id: string,
  dto: {
    scheduledAt: string;
    teacherId?: string;
    durationMins?: number;
    timeZone?: string;
    meetingProvider?: string;
    meetingLink?: string;
    notes?: string;
  },
) => api<LeadTrial>(`/leads/${id}/trials`, { method: "POST", body: JSON.stringify(dto) });

export const updateLeadTrial = (trialId: string, dto: Record<string, unknown>) =>
  api<LeadTrial>(`/leads/trials/${trialId}`, { method: "PATCH", body: JSON.stringify(dto) });

export const markLeadTrialAttendance = (trialId: string, attendance: "PRESENT" | "ABSENT") =>
  api<LeadTrial>(`/leads/trials/${trialId}/attendance`, {
    method: "POST",
    body: JSON.stringify({ attendance }),
  });

export const submitLeadTrialFeedback = (
  trialId: string,
  dto: { side: "teacher" | "parent"; rating?: number; feedback?: string; positive?: boolean },
) =>
  api<LeadTrial>(`/leads/trials/${trialId}/feedback`, {
    method: "POST",
    body: JSON.stringify(dto),
  });

export const sendLeadTrialReminder = (trialId: string) =>
  api<{ sent: boolean }>(`/leads/trials/${trialId}/reminder`, { method: "POST" });

export const fetchMyTrials = (scope: "today" | "upcoming" | "all" = "upcoming") =>
  api<LeadTrial[]>(`/leads/trials/mine?scope=${scope}`);

export const leadCoachDecision = (
  id: string,
  dto: { decision: "ENROLL" | "REJECT" | "FOLLOW_UP"; notes?: string; courseCode?: string },
) => api<Lead>(`/leads/${id}/decision`, { method: "POST", body: JSON.stringify(dto) });

export const fetchLeadFunnel = () => api<LeadFunnel>("/leads/funnel");

// ─── In-app notifications (topbar bell) ──────────────────────────────────────

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  createdAt: string;
}

export const fetchNotifications = (limit = 30) =>
  api<AppNotification[]>(`/notifications?limit=${limit}`);
export const fetchUnreadCount = () => api<{ count: number }>("/notifications/unread-count");
export const markNotificationRead = (id: string) =>
  api<{ success: boolean }>(`/notifications/${id}/read`, { method: "PATCH" });
export const markAllNotificationsRead = () =>
  api<{ success: boolean }>("/notifications/read-all", { method: "PATCH" });

// ─── Online Attendance Management (batches → classes → attendance) ────────────

export type StudentAttendanceStatus =
  | "PRESENT" | "LATE" | "ABSENT" | "EXCUSED" | "LEAVE_APPROVED" | "NO_SHOW";
export type TeacherAttendanceStatus = "PRESENT" | "LATE" | "ABSENT" | "CLASS_CANCELLED";
export type BatchStatus = "ACTIVE" | "PAUSED" | "COMPLETED" | "CANCELLED";
export type AttendanceClassStatus = "SCHEDULED" | "LIVE" | "COMPLETED" | "CANCELLED";

export interface AttendanceConfig {
  presentThreshold: number;
  lateThreshold: number;
  autoLockMinutes: number;
  lateGraceMinutes: number;
  allowManualCorrection: boolean;
}

export interface Batch {
  id: string;
  code: string;
  name: string;
  courseId: string;
  courseName?: string | null;
  teacherId: string | null;
  teacherName?: string | null;
  level: string | null;
  status: BatchStatus;
  startDate: string | null;
  endDate: string | null;
  daysOfWeek: string[];
  startTime: string | null;
  endTime: string | null;
  timeZone: string | null;
  capacity: number | null;
  studentCount?: number;
  classCount?: number;
  students?: { id: string; studentCode: string; name: string; email: string; addedAt: string }[];
  createdAt: string;
}

export interface AttendanceClass {
  id: string;
  title: string;
  courseName: string | null;
  teacherName: string | null;
  batchName: string | null;
  batchCode: string | null;
  startsAt: string;
  endsAt: string;
  status: AttendanceClassStatus;
  meetingUrl: string | null;
  actualStartAt: string | null;
  actualEndAt: string | null;
  teacherStatus: TeacherAttendanceStatus | null;
  teacherLateMinutes: number | null;
  attendanceLocked: boolean;
  lockedAt: string | null;
  studentCount?: number;
}

export interface AttendeeRow {
  id: string;
  studentId: string;
  studentCode: string;
  name: string;
  joinedAt: string | null;
  leftAt: string | null;
  durationMins: number | null;
  status: StudentAttendanceStatus | null;
  lateMinutes: number | null;
  device: string | null;
  browser: string | null;
  ipAddress: string | null;
  remarks: string | null;
}

export interface ClassAttendanceSheet extends AttendanceClass {
  attendees: AttendeeRow[];
}

export interface AttendanceCorrection {
  id: string;
  classId: string;
  targetType: string;
  studentId: string | null;
  fromStatus: string | null;
  toStatus: string;
  reason: string;
  requestedByName: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  reviewedByName: string | null;
  reviewNotes: string | null;
  reviewedAt: string | null;
  createdAt: string;
  class?: { title: string; startsAt: string; batchId: string | null };
}

// Config
export const fetchAttendanceConfig = () => api<AttendanceConfig>("/attendance/config");
export const updateAttendanceConfig = (dto: Partial<AttendanceConfig>) =>
  api<AttendanceConfig>("/attendance/config", { method: "PATCH", body: JSON.stringify(dto) });

// Batches
export const createBatch = (dto: Record<string, unknown>) =>
  api<Batch>("/attendance/batches", { method: "POST", body: JSON.stringify(dto) });
export const fetchBatches = (q: { courseId?: string; teacherId?: string; status?: string; search?: string } = {}) => {
  const p = new URLSearchParams();
  Object.entries(q).forEach(([k, v]) => { if (v && v !== "All") p.set(k, String(v)); });
  return api<Batch[]>(`/attendance/batches?${p.toString()}`);
};
export const fetchBatch = (id: string) => api<Batch>(`/attendance/batches/${id}`);
export const updateBatch = (id: string, dto: Record<string, unknown>) =>
  api<Batch>(`/attendance/batches/${id}`, { method: "PATCH", body: JSON.stringify(dto) });
export const assignBatchStudents = (id: string, studentIds: string[]) =>
  api<Batch>(`/attendance/batches/${id}/students`, { method: "POST", body: JSON.stringify({ studentIds }) });
export const removeBatchStudent = (id: string, studentId: string) =>
  api<Batch>(`/attendance/batches/${id}/students/${studentId}`, { method: "DELETE" });

// Classes
export const scheduleClass = (dto: Record<string, unknown>) =>
  api<AttendanceClass>("/attendance/classes", { method: "POST", body: JSON.stringify(dto) });
export const generateClasses = (dto: Record<string, unknown>) =>
  api<{ generated: number }>("/attendance/classes/generate", { method: "POST", body: JSON.stringify(dto) });
export const fetchAttendanceClasses = (q: { batchId?: string; teacherId?: string; status?: string; date?: string; from?: string; to?: string } = {}) => {
  const p = new URLSearchParams();
  Object.entries(q).forEach(([k, v]) => { if (v && v !== "All") p.set(k, String(v)); });
  return api<AttendanceClass[]>(`/attendance/classes?${p.toString()}`);
};
export const fetchClassAttendance = (id: string) => api<ClassAttendanceSheet>(`/attendance/classes/${id}`);

// Lifecycle
export const startClass = (id: string) => api<AttendanceClass>(`/attendance/classes/${id}/start`, { method: "POST" });
export const endClass = (id: string, teacherStatus?: string) =>
  api<ClassAttendanceSheet>(`/attendance/classes/${id}/end`, { method: "POST", body: JSON.stringify({ teacherStatus }) });
export const markAttendance = (id: string, studentId: string, status: string, remarks?: string) =>
  api<ClassAttendanceSheet>(`/attendance/classes/${id}/mark`, { method: "POST", body: JSON.stringify({ studentId, status, remarks }) });
export const cancelClass = (id: string) => api<AttendanceClass>(`/attendance/classes/${id}/cancel`, { method: "POST" });
export const joinClass = (id: string, device?: string) =>
  api<{ joinedAt: string; meetingUrl: string | null; classId: string }>(`/attendance/classes/${id}/join`, { method: "POST", body: JSON.stringify({ device }) });
export const leaveClass = (id: string) =>
  api<{ leftAt: string; durationMins: number; status: string }>(`/attendance/classes/${id}/leave`, { method: "POST" });

// Dashboards
export interface AdminAttendanceDashboard {
  todayClasses: number; runningClasses: number; completedClasses: number;
  studentsPresent: number; studentsAbsent: number; teachersPresent: number;
  pendingCorrections: number; attendanceRate: number;
  dailyTrend: { date: string; present: number; absent: number; rate: number }[];
}
export interface TeacherAttendanceDashboard {
  todayClasses: AttendanceClass[]; pendingAttendance: number; completedClasses: number; studentAttendanceRate: number;
}
export interface StudentAttendanceDashboard {
  attendanceRate: number; totalSessions?: number; missedCount: number; lateCount: number;
  todayClasses: { classId: string; title: string; course?: string; batch?: string; teacher: string; startsAt: string; endsAt: string; status: AttendanceClassStatus; meetingUrl: string | null; myStatus: StudentAttendanceStatus | null; joinedAt: string | null }[];
  upcoming: { id: string; title: string; course?: string; batch?: string; startsAt: string; endsAt: string }[];
  calendar: { date: string; status: StudentAttendanceStatus | null; title: string }[];
}
export interface AttendanceAnalytics {
  weekly: { period: string; present: number; absent: number; rate: number }[];
  monthly: { period: string; present: number; absent: number; rate: number }[];
  teacherWise: { name: string; rate: number; total: number }[];
  courseWise: { name: string; rate: number; total: number }[];
  batchWise: { name: string; rate: number; total: number }[];
  countryWise: { name: string; rate: number; total: number }[];
}
export const fetchAttendanceAnalytics = () => api<AttendanceAnalytics>("/attendance/analytics");
export const fetchAdminAttendanceDashboard = () => api<AdminAttendanceDashboard>("/attendance/dashboard/admin");
export const fetchTeacherAttendanceDashboard = () => api<TeacherAttendanceDashboard>("/attendance/dashboard/teacher");
export const fetchStudentAttendanceDashboard = () => api<StudentAttendanceDashboard>("/attendance/dashboard/student");

// Reports
export const fetchAttendanceReport = (type: string, q: { from?: string; to?: string; batchId?: string; teacherId?: string; courseId?: string } = {}) => {
  const p = new URLSearchParams();
  Object.entries(q).forEach(([k, v]) => { if (v) p.set(k, String(v)); });
  return api<Record<string, unknown>[]>(`/attendance/reports/${type}?${p.toString()}`);
};

// Corrections
export const requestCorrection = (dto: Record<string, unknown>) =>
  api<AttendanceCorrection>("/attendance/corrections", { method: "POST", body: JSON.stringify(dto) });
export const fetchCorrections = (status?: string) =>
  api<AttendanceCorrection[]>(`/attendance/corrections${status ? `?status=${status}` : ""}`);
export const reviewCorrection = (id: string, decision: "APPROVED" | "REJECTED", notes?: string) =>
  api<AttendanceCorrection>(`/attendance/corrections/${id}`, { method: "PATCH", body: JSON.stringify({ decision, notes }) });

// ─── Teacher Management (profile hub: subjects/availability/workload/rating/…) ─

export interface TeacherWorkload {
  activeStudents: number;
  classesThisWeek: number;
  hoursThisWeek: number;
  workloadPct: number;
}
export interface TeacherAvailability {
  [day: string]: { from: string; to: string }[];
}
export interface TeacherManagement {
  id: string;
  teacherCode: string;
  status: string;
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  mobile: string | null;
  whatsapp: string | null;
  country: string | null;
  avatarUrl: string | null;
  gender: string | null;
  dateOfBirth: string | null;
  nationality: string | null;
  timeZone: string | null;
  address: string | null;
  qualification: string | null;
  experienceYears: string | null;
  languages: string[];
  bio: string | null;
  specialisation: string | null;
  hourlyRate: string | number | null;
  joiningDate: string | null;
  subjects: string[];
  levels: string[];
  teachingModes: string[];
  course: string | null;
  availability: TeacherAvailability | null;
  availabilityApproved: boolean;
  availabilitySubmittedAt: string | null;
  workload: TeacherWorkload;
  rating: number | null;
  ratingCount: number;
  archived: boolean;
  hasRegistration: boolean;
}
export interface TeacherStudentRow {
  enrollmentId: string;
  studentId: string;
  studentCode: string;
  name: string;
  email: string;
  course: string;
  status: string;
}
export interface TeacherPerformance {
  totalClasses: number; completedClasses: number; cancelledClasses: number; liveClasses: number;
  completionRate: number; attendanceRate: number; onTimeStartPct: number;
  trialsTotal: number; trialsConverted: number; trialConversion: number;
  parentRating: number; teacherFeedbackRating: number;
  rating: number; ratingBreakdown: { label: string; score: number }[];
}
export interface TeacherScheduleData {
  weekStart: string;
  byDay: Record<string, { id: string; title: string; course?: string; batch?: string; startsAt: string; endsAt: string; status: string; students: number }[]>;
}
export interface TeacherAnalytics {
  monthlyHours: { month: string; hours: number }[];
  subjectDistribution: { name: string; count: number }[];
}
export interface TeacherDocuments {
  resume: string | null; degree: string | null; certificates: string | null;
  govId: string | null; photo: string | null; experienceLetter: string | null; policeVerification: string | null;
}

export const fetchTeacherManagement = (id: string) => api<TeacherManagement>(`/teacher-management/${id}`);
export const updateTeacherTeaching = (id: string, dto: { subjects?: string[]; levels?: string[]; teachingModes?: string[] }) =>
  api<{ subjects: string[]; levels: string[]; teachingModes: string[] }>(`/teacher-management/${id}/teaching`, { method: "PATCH", body: JSON.stringify(dto) });
export const updateTeacherProfileFields = (id: string, dto: Record<string, unknown>) =>
  api<{ id: string }>(`/teacher-management/${id}/profile`, { method: "PATCH", body: JSON.stringify(dto) });
export const setTeacherAvailability = (id: string, availability: TeacherAvailability) =>
  api<{ availability: TeacherAvailability; availabilityApproved: boolean; availabilitySubmittedAt: string }>(`/teacher-management/${id}/availability`, { method: "PUT", body: JSON.stringify({ availability }) });
export const approveTeacherAvailability = (id: string, approve = true) =>
  api<{ availabilityApproved: boolean }>(`/teacher-management/${id}/availability/approve`, { method: "PATCH", body: JSON.stringify({ approve }) });
export const fetchManagedTeacherStudents = (id: string) => api<TeacherStudentRow[]>(`/teacher-management/${id}/students`);
export const transferTeacherStudents = (id: string, enrollmentIds: string[], toTeacherId: string, reason?: string) =>
  api<{ transferred: number; toTeacher: string }>(`/teacher-management/${id}/students/transfer`, { method: "POST", body: JSON.stringify({ enrollmentIds, toTeacherId, reason }) });
export const fetchTeacherSchedule = (id: string) => api<TeacherScheduleData>(`/teacher-management/${id}/schedule`);
export const fetchTeacherPerformance = (id: string) => api<TeacherPerformance>(`/teacher-management/${id}/performance`);
export const fetchTeacherAnalytics = (id: string) => api<TeacherAnalytics>(`/teacher-management/${id}/analytics`);
export const fetchTeacherDocuments = (id: string) => api<TeacherDocuments>(`/teacher-management/${id}/documents`);
export const fetchTeacherCommunication = (id: string) => api<AppNotification[]>(`/teacher-management/${id}/communication`);
export const sendTeacherMessage = (id: string, dto: { title: string; body: string; channel?: string }) =>
  api<{ sent: boolean }>(`/teacher-management/${id}/message`, { method: "POST", body: JSON.stringify(dto) });
export const setTeacherStatus = (id: string, status: string) =>
  api<{ status: string }>(`/teacher-management/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) });

// Teacher self-service availability
export const fetchMyAvailability = () => api<{ id: string; availability: TeacherAvailability | null; availabilityApproved: boolean; availabilitySubmittedAt: string | null }>(`/teacher-management/me/availability`);
export const submitMyAvailability = (availability: TeacherAvailability) =>
  api<{ availability: TeacherAvailability; availabilityApproved: boolean }>(`/teacher-management/me/availability`, { method: "PUT", body: JSON.stringify({ availability }) });

// Assign / remove students + batches, archive
export const fetchAssignableStudents = (search?: string) =>
  api<{ enrollmentId: string; name: string; studentCode: string; course: string }[]>(`/teacher-management/assignable/students${search ? `?search=${encodeURIComponent(search)}` : ""}`);
export const assignTeacherStudents = (id: string, enrollmentIds: string[]) =>
  api<{ assigned: number }>(`/teacher-management/${id}/students/assign`, { method: "POST", body: JSON.stringify({ enrollmentIds }) });
export const removeTeacherStudent = (id: string, enrollmentId: string) =>
  api<{ removed: boolean }>(`/teacher-management/${id}/students/${enrollmentId}`, { method: "DELETE" });

export interface TeacherBatches {
  assigned: { id: string; code: string; name: string; course?: string; students: number; classes: number; status: string }[];
  available: { id: string; code: string; name: string; course?: string }[];
}
export const fetchTeacherBatches = (id: string) => api<TeacherBatches>(`/teacher-management/${id}/batches`);
export const assignTeacherBatches = (id: string, batchIds: string[]) =>
  api<{ assigned: number }>(`/teacher-management/${id}/batches/assign`, { method: "POST", body: JSON.stringify({ batchIds }) });
export const unassignTeacherBatch = (id: string, batchId: string) =>
  api<{ removed: boolean }>(`/teacher-management/${id}/batches/${batchId}`, { method: "DELETE" });

export const archiveTeacher = (id: string, archived: boolean) =>
  api<{ archived: boolean }>(`/teacher-management/${id}/archive`, { method: "PATCH", body: JSON.stringify({ archived }) });

// Fleet analytics + performance report
export interface TeacherFleetAnalytics {
  totalTeachers: number; avgRating: number; trialConversion: number;
  teacherWorkload: { name: string; workloadPct: number; students: number }[];
  subjectDistribution: { name: string; count: number }[];
  countryDistribution: { name: string; count: number }[];
  ratingBuckets: { name: string; count: number }[];
  monthlyHours: { month: string; hours: number }[];
}
export interface TeacherPerformanceRow {
  teacher: string; teacherCode: string; students: number; classHours: number; totalClasses: number;
  attendance: number; leaves: number; trialSuccess: number; parentRating: number; rating: number;
}
export const fetchTeacherFleetAnalytics = () => api<TeacherFleetAnalytics>(`/teacher-management/analytics/fleet`);
export const fetchTeacherPerformanceReport = () => api<TeacherPerformanceRow[]>(`/teacher-management/reports/performance`);

// ─────────────────────────────────────────────────────────────────────────────
// Student Management hub (/student-management)
// ─────────────────────────────────────────────────────────────────────────────
export interface StudentActivityRow {
  id: string; studentId: string; kind: string; type: string; title: string;
  description?: string | null; channel?: string | null; visibility: string;
  meta?: unknown; actorId?: string | null; actorName?: string | null; createdAt: string;
}
export interface StudentEnrollmentRow {
  id: string; courseId: string; course: string; status: string; progress: number;
  teacherId: string | null; teacher: string | null; package: string | null;
  startedAt: string | null; completedAt: string | null;
}
export interface StudentBatchRow {
  id: string; code: string; name: string; course: string; status: string;
  level: string | null; teacher: string | null; schedule: string | null; occupancy: string; addedAt: string;
}
export interface StudentManagement {
  id: string; studentCode: string; status: string;
  onHoldReason: string | null; onHoldAt: string | null;
  coachId: string | null; coach: string | null;
  user: { id: string; firstName: string; lastName: string; email: string; avatarUrl: string | null; country: string | null; timezone: string | null; lastLoginAt: string | null; createdAt: string };
  profile: { phone: string | null; gender: string | null; dateOfBirth: string | null; nationality: string | null; address: string | null; timeZone: string | null; profession: string | null; joiningDate: string | null; fees: string | null; lastPaymentDate: string | null; nextPaymentDate: string | null };
  academic: { currentGrade: string | null; currentSchool: string | null; board: string | null; learningLevel: string | null; preferredLanguage: string | null; learningGoal: string | null };
  parent: { parentName: string | null; guardianName: string | null; parentRelationship: string | null; parentEmail: string | null; parentMobile: string | null; parentWhatsapp: string | null };
  activeCourse: { id: string; courseId: string; title: string; status: string; progress: number; teacher: string | null } | null;
  enrollments: StudentEnrollmentRow[];
  batches: StudentBatchRow[];
  attendanceSummary: { present: number; absent: number; late: number; total: number; rate: number };
  cards: { attendanceRate: number; pendingAssignments: number; completedAssignments: number; upcomingClasses: number; dueInvoices: number };
  documents: { id: string; type: string; label: string; url: string; uploadedAt: string; archived: boolean }[];
}
export interface StudentAttendanceDetail {
  summary: { present: number; absent: number; late: number; total: number; rate: number };
  trend: { month: string; rate: number }[];
  recent: { title: string; course: string; date: string; status: string; lateMinutes: number | null }[];
}
export interface StudentAssignmentsDetail {
  summary: { total: number; pending: number; completed: number; lateSubmissions: number; avgMark: number | null };
  items: { title: string; course: string; status: string; grade: number | null; dueAt: string | null; submittedAt: string | null; late: boolean }[];
}
export interface StudentPerformanceDetail {
  attendanceTrend: { month: string; rate: number }[];
  assessmentTrend: { month: string; score: number }[];
  attendanceRate: number; avgScore: number | null; highestScore: number | null; totalAssessments: number;
}
export interface StudentFleetAnalytics {
  cards: { total: number; active: number; trial: number; onHold: number; inactive: number; completed: number; dropouts: number; avgAttendance: number; avgScore: number };
  courseWise: { name: string; value: number }[];
  countryWise: { name: string; value: number }[];
  coachWise: { name: string; value: number }[];
  teacherWise: { name: string; value: number }[];
  batchOccupancy: { name: string; students: number; capacity: number }[];
  monthlyAdmissions: { month: string; count: number }[];
  studentGrowth: { month: string; total: number }[];
}
export interface StudentTransferRow {
  id: string; studentId: string; kind: string; reason: string; payload: Record<string, unknown>;
  fromLabel: string | null; toLabel: string | null; status: string;
  requestedByName: string | null; decidedByName: string | null; decidedAt: string | null; createdAt: string;
}
export interface StudentParentView {
  student: { name: string; code: string; status: string };
  course: string | null; teacher: string | null; coach: string | null;
  childAttendance: { present: number; absent: number; late: number; total: number; rate: number };
  attendanceTrend: { month: string; rate: number }[];
  homework: { pending: number; completed: number; avgMark: number | null };
  upcomingClasses: number; progress: number;
  feeStatus: { dueInvoices: number; nextPaymentDate: string | null; lastPaymentDate: string | null };
  recentClasses: { title: string; course: string; date: string; status: string; lateMinutes: number | null }[];
}

export const fetchStudentManagement = (id: string) => api<StudentManagement>(`/student-management/${id}`);
export const updateStudentBasic = (id: string, dto: Record<string, unknown>) =>
  api<{ updated: boolean }>(`/student-management/${id}/basic`, { method: "PATCH", body: JSON.stringify(dto) });
export const updateStudentAcademic = (id: string, dto: Record<string, unknown>) =>
  api<{ updated: boolean }>(`/student-management/${id}/academic`, { method: "PATCH", body: JSON.stringify(dto) });
export const updateStudentParent = (id: string, dto: Record<string, unknown>) =>
  api<{ updated: boolean }>(`/student-management/${id}/parent`, { method: "PATCH", body: JSON.stringify(dto) });

export const assignStudentCourse = (id: string, dto: { courseId: string; teacherId?: string; packageId?: string; status?: string }) =>
  api<{ enrollmentId: string }>(`/student-management/${id}/course`, { method: "POST", body: JSON.stringify(dto) });
export const updateStudentEnrollment = (id: string, enrollmentId: string, dto: { status?: string; progress?: number }) =>
  api<{ updated: boolean }>(`/student-management/${id}/enrollment/${enrollmentId}`, { method: "PATCH", body: JSON.stringify(dto) });
export const changeStudentTeacher = (id: string, dto: { enrollmentId: string; toTeacherId: string; reason: string }) =>
  api<{ changed: boolean; toTeacher: string }>(`/student-management/${id}/teacher`, { method: "POST", body: JSON.stringify(dto) });
export const changeStudentBatch = (id: string, dto: { batchId: string; reason?: string }) =>
  api<{ changed: boolean; batch: string }>(`/student-management/${id}/batch`, { method: "POST", body: JSON.stringify(dto) });
export const fetchStudentBatchHistory = (id: string) =>
  api<{ current: { code: string; name: string; course: string; status: string; since: string }[]; history: StudentActivityRow[] }>(`/student-management/${id}/batch-history`);

export const setStudentMgmtStatus = (id: string, status: string) =>
  api<{ status: string }>(`/student-management/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
export const freezeStudent = (id: string, reason: string) =>
  api<{ status: string }>(`/student-management/${id}/freeze`, { method: "POST", body: JSON.stringify({ reason }) });
export const reactivateStudent = (id: string) =>
  api<{ status: string }>(`/student-management/${id}/reactivate`, { method: "POST" });

export const fetchStudentNotes = (id: string) => api<StudentActivityRow[]>(`/student-management/${id}/notes`);
export const addStudentNote = (id: string, text: string) =>
  api<StudentActivityRow>(`/student-management/${id}/notes`, { method: "POST", body: JSON.stringify({ text }) });

export const fetchStudentMgmtDocuments = (id: string) =>
  api<{ id: string; type: string; label: string; url: string; uploadedAt: string; archived: boolean }[]>(`/student-management/${id}/documents`);
export const addStudentDocument = (id: string, dto: { type: string; label: string; url: string }) =>
  api<{ id: string }>(`/student-management/${id}/documents`, { method: "POST", body: JSON.stringify(dto) });
export const archiveStudentDocument = (id: string, docId: string, archived: boolean) =>
  api<{ archived: boolean }>(`/student-management/${id}/documents/archive`, { method: "PATCH", body: JSON.stringify({ docId, archived }) });

export const fetchStudentCommunication = (id: string) =>
  api<{ logged: StudentActivityRow[]; notifications: AppNotification[] }>(`/student-management/${id}/communication`);
export const sendStudentMgmtMessage = (id: string, dto: { title: string; body: string; channel?: string; audience?: string }) =>
  api<{ sent: boolean }>(`/student-management/${id}/message`, { method: "POST", body: JSON.stringify(dto) });
export const logStudentCommunication = (id: string, dto: { channel: string; summary: string }) =>
  api<StudentActivityRow>(`/student-management/${id}/log-communication`, { method: "POST", body: JSON.stringify(dto) });

export const fetchStudentTimeline = (id: string) => api<StudentActivityRow[]>(`/student-management/${id}/timeline`);
export const fetchStudentAudit = (id: string) => api<StudentActivityRow[]>(`/student-management/${id}/audit`);
export const fetchStudentMgmtAttendance = (id: string) => api<StudentAttendanceDetail>(`/student-management/${id}/attendance`);
export const fetchStudentMgmtAssignments = (id: string) => api<StudentAssignmentsDetail>(`/student-management/${id}/assignments`);
export const fetchStudentMgmtPerformance = (id: string) => api<StudentPerformanceDetail>(`/student-management/${id}/performance`);

export const fetchStudentFleetAnalytics = () => api<StudentFleetAnalytics>(`/student-management/analytics/fleet`);
export const fetchStudentMgmtReport = (type: string) => api<unknown>(`/student-management/reports/${type}`);

// Academic Coach
export const fetchCoaches = () => api<{ id: string; name: string; email: string }[]>(`/student-management/coaches`);
export const assignStudentCoach = (id: string, coachId: string | null) =>
  api<{ coachId: string | null; coach: string | null }>(`/student-management/${id}/coach`, { method: "PATCH", body: JSON.stringify({ coachId }) });

// Parent Dashboard (read-only, admin-viewable)
export const fetchStudentParentView = (id: string) => api<StudentParentView>(`/student-management/${id}/parent-view`);

// Transfer approval workflow
export const fetchStudentTransfers = (id: string) => api<StudentTransferRow[]>(`/student-management/${id}/transfers`);
export const requestStudentTransfer = (id: string, dto: { kind: string; reason: string; payload: Record<string, unknown> }) =>
  api<StudentTransferRow>(`/student-management/${id}/transfers`, { method: "POST", body: JSON.stringify(dto) });
export const fetchPendingTransfers = () =>
  api<(StudentTransferRow & { student: { studentCode: string; user: { firstName: string; lastName: string } } })[]>(`/student-management/transfers/pending`);
export const approveTransfer = (transferId: string) =>
  api<{ status: string }>(`/student-management/transfers/${transferId}/approve`, { method: "POST", body: JSON.stringify({}) });
export const rejectTransfer = (transferId: string) =>
  api<{ status: string }>(`/student-management/transfers/${transferId}/reject`, { method: "POST", body: JSON.stringify({}) });

// Certificate
export const issueStudentCertificate = (id: string, enrollmentId: string) =>
  api<{ certificateId: string; studentName: string; studentCode: string; course: string; teacher: string | null; issuedAt: string }>(`/student-management/${id}/certificate/${enrollmentId}`, { method: "POST", body: JSON.stringify({}) });

// Document file upload (multipart)
export const uploadStudentDocument = async (id: string, file: File, type: string, label: string): Promise<{ id: string }> => {
  const form = new FormData();
  form.append("file", file);
  form.append("type", type);
  form.append("label", label);
  const res = await fetch(`${BASE}/student-management/${id}/documents/upload`, { method: "POST", headers: { ...authHeader() }, body: form });
  if (!res.ok) throw new ApiError(res.status, await errorMessage(res));
  return res.json() as Promise<{ id: string }>;
};

// ─────────────────────────────────────────────────────────────────────────────
// Assignment Management (/assignments) — unified relational system
// ─────────────────────────────────────────────────────────────────────────────
export interface AssignmentAttachment { url: string; name: string; }
export interface RubricItem { name: string; max: number; }
export interface AssignmentListRow {
  id: string; title: string; course: string; courseId: string; batch: string | null; teacher: string | null;
  subject: string | null; type: string | null; difficulty: string | null; dueAt: string | null;
  status: string; locked: boolean; maxMarks: number; targetCount: number; submitted: number; checked: number;
}
export interface AssignmentDetail {
  id: string; title: string; description: string | null; instructions: string | null; courseId: string;
  courseTitle: string; batchId: string | null; batchLabel: string | null; teacherId: string | null; teacherName: string | null;
  subject: string | null; chapter: string | null; topic: string | null; difficulty: string | null; type: string | null;
  dueAt: string | null; publishAt: string | null; maxMarks: number; passingMarks: number; lateAllowed: boolean;
  latePenaltyPct: number; status: string; locked: boolean; targetType: string; targetStudentIds: string[];
  allowedFileTypes: string[]; maxFileSizeMb: number | null;
  attachments: AssignmentAttachment[] | null; rubric: RubricItem[] | null; targetCount: number;
}
export interface AssignmentSubmissionRow {
  studentId: string; studentCode: string; name: string; submissionId: string | null; status: string;
  submittedAt: string | null; isLate: boolean; grade: number | null; content: string | null;
  fileUrl: string | null; attachments: AssignmentAttachment[]; rubricScores: Record<string, number> | null;
  feedback: string | null; penaltyApplied: number | null; similarityPct: number | null;
}
export interface StudentAssignmentView {
  id: string; title: string; description: string | null; instructions: string | null; dueAt: string | null;
  maxMarks: number; passingMarks: number; type: string | null; difficulty: string | null; subject: string | null;
  lateAllowed: boolean; latePenaltyPct: number; course: string; teacher: string | null;
  allowedFileTypes: string[]; maxFileSizeMb: number | null;
  attachments: AssignmentAttachment[]; rubric: RubricItem[];
  submission: {
    id: string; status: string; content: string | null; fileUrl: string | null; attachments: AssignmentAttachment[];
    grade: number | null; feedback: string | null; feedbackFileUrl: string | null; rubricScores: Record<string, number> | null;
    isLate: boolean; penaltyApplied: number | null; submittedAt: string | null; evaluatedAt: string | null;
    returnedReason: string | null; draftSavedAt: string | null;
  } | null;
}
export interface AssignmentAnalytics {
  cards: { assignments: number; completed: number; pending: number; late: number; avgMarks: number };
  submissionTrend: { month: string; count: number }[];
  marksTrend: { month: string; score: number }[];
  teacherWise: { name: string; value: number }[];
  courseWise: { name: string; value: number }[];
  batchWise: { name: string; value: number }[];
  difficultyWise: { name: string; value: number }[];
  topStudents: { name: string; avg: number }[];
  weakStudents: { name: string; avg: number }[];
}
export interface AssignmentCalendarItem { id: string; title: string; dueAt: string | null; status: string; type: string | null; course: string; day: number | null; }

export const createAssignment = (dto: Record<string, unknown>) =>
  api<{ id: string }>(`/assignments`, { method: "POST", body: JSON.stringify(dto) });
export const updateAssignment = (id: string, dto: Record<string, unknown>) =>
  api<{ id: string }>(`/assignments/${id}`, { method: "PATCH", body: JSON.stringify(dto) });
export const deleteAssignment = (id: string) => api<{ deleted: boolean }>(`/assignments/${id}`, { method: "DELETE" });
export const listAssignments = (q: Record<string, string> = {}) =>
  api<{ items: AssignmentListRow[]; meta: { page: number; limit: number; total: number; pages: number } }>(`/assignments?${new URLSearchParams(q).toString()}`);
export const getAssignment = (id: string) => api<AssignmentDetail>(`/assignments/${id}`);
export const getAssignmentSubmissions = (id: string) => api<AssignmentSubmissionRow[]>(`/assignments/${id}/submissions`);
export const assignmentLifecycle = (id: string, action: "publish" | "unpublish" | "archive" | "close" | "lock" | "unlock" | "duplicate") =>
  api<Record<string, unknown>>(`/assignments/${id}/${action}`, { method: "POST", body: JSON.stringify({}) });
export const gradeAssignmentSubmission = (submissionId: string, dto: { grade: number; feedback?: string; feedbackFileUrl?: string; rubricScores?: Record<string, number>; returned?: boolean; returnedReason?: string }) =>
  api<{ id: string }>(`/assignments/submissions/${submissionId}/grade`, { method: "POST", body: JSON.stringify(dto) });
export const reviewAssignmentSubmission = (submissionId: string) =>
  api<{ id: string }>(`/assignments/submissions/${submissionId}/review`, { method: "POST", body: JSON.stringify({}) });

export const fetchAssignmentAdminDashboard = () => api<{ cards: Record<string, number> }>(`/assignments/dashboard/admin`);
export const fetchAssignmentTeacherDashboard = () => api<{ cards: Record<string, number> }>(`/assignments/dashboard/teacher`);
export const fetchAssignmentAnalytics = () => api<AssignmentAnalytics>(`/assignments/analytics`);
export const fetchAssignmentReport = (type: string) => api<Record<string, unknown>[]>(`/assignments/reports/${type}`);
export const fetchAssignmentCalendar = (month?: string) => api<AssignmentCalendarItem[]>(`/assignments/calendar${month ? `?month=${month}` : ""}`);
export const fetchAssignmentMeta = () => api<{ courses: { id: string; title: string }[]; batches: { id: string; code: string; name: string }[]; teachers?: { id: string; name: string }[] }>(`/assignments/meta`);
export const fetchTargetStudents = (courseId?: string, batchId?: string) => {
  const q = new URLSearchParams(); if (courseId) q.set("courseId", courseId); if (batchId) q.set("batchId", batchId);
  return api<{ id: string; studentCode: string; name: string }[]>(`/assignments/students?${q.toString()}`);
};
export const computeSubmissionSimilarity = (submissionId: string) =>
  api<{ similarityPct: number; matchedWith: string | null }>(`/assignments/submissions/${submissionId}/similarity`);

// Student
export const fetchMyAssignments = () => api<StudentAssignmentView[]>(`/assignments/mine`);
export const openMyAssignment = (id: string) => api<StudentAssignmentView>(`/assignments/${id}/mine`);
export const saveMyAssignmentDraft = (id: string, dto: { content?: string; fileUrl?: string; attachments?: AssignmentAttachment[] }) =>
  api<{ id: string }>(`/assignments/${id}/draft`, { method: "POST", body: JSON.stringify(dto) });
export const submitMyAssignment = (id: string, dto: { content?: string; fileUrl?: string; attachments?: AssignmentAttachment[] }) =>
  api<{ id: string }>(`/assignments/${id}/submit`, { method: "POST", body: JSON.stringify(dto) });

// Shared file upload (staff + students)
export const uploadAssignmentFile = async (file: File): Promise<AssignmentAttachment> => {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${BASE}/assignments/upload`, { method: "POST", headers: { ...authHeader() }, body: form });
  if (!res.ok) throw new ApiError(res.status, await errorMessage(res));
  return res.json() as Promise<AssignmentAttachment>;
};

// ─── Assessment Management (/assessments) — online tests, question bank ────────

export const QUESTION_TYPES = [
  "MCQ", "TRUE_FALSE", "FILL_BLANK", "MATCH", "SHORT_ANSWER", "LONG_ANSWER",
  "ESSAY", "CODING", "AUDIO", "SPEAKING", "FILE_UPLOAD",
] as const;
export const OBJECTIVE_QUESTION_TYPES = ["MCQ", "TRUE_FALSE", "FILL_BLANK", "MATCH"];
export const ASSESSMENT_TYPES = [
  "QUIZ", "WEEKLY_TEST", "MONTHLY_TEST", "UNIT_TEST", "MID_TERM", "FINAL_EXAM",
  "ORAL_TEST", "PRACTICE_TEST", "MOCK_TEST",
] as const;

export interface QuestionOption { id: string; text: string; correct?: boolean; }
export interface MatchPair { left: string; right: string; }
export interface QuestionMedia { url: string; name: string; kind?: string; }
export interface TestCase { input: string; expected: string; sample?: boolean; }
export interface Question {
  id: string; subject: string; chapter: string | null; topic: string | null; category: string | null;
  difficulty: string; type: string; text: string; options: (QuestionOption & MatchPair)[] | null;
  correctAnswer: string | null; marks: number; negativeMarks: number; estimatedTime: number;
  explanation: string | null; media: QuestionMedia[] | null; rubric: RubricItem[] | null;
  language: string | null; testCases: TestCase[] | null;
  version: number; archived: boolean; createdAt: string; updatedAt: string;
}
export interface AssessmentListRow {
  id: string; title: string; subject: string | null; type: string; course: string | null; courseId: string | null;
  batch: string | null; teacher: string | null; durationMin: number; totalMarks: number;
  startAt: string | null; endAt: string | null; status: string; locked: boolean; questions: number;
  targetCount: number; submitted: number; pendingEval: number; published: number;
}
export interface AssessmentDetail {
  id: string; title: string; courseId: string | null; batchId: string | null; teacherId: string | null;
  subject: string | null; chapter: string | null; topic: string | null; category: string | null; type: string;
  instructions: string | null; durationMin: number; totalMarks: number; passingMarks: number; attemptsAllowed: number;
  questionOrder: string; allowBack: boolean; showResultImmediately: boolean; negativeMarking: boolean;
  selectionMode: string; randomRules: Record<string, unknown> | null; startAt: string | null; endAt: string | null;
  publishAt: string | null; status: string; locked: boolean; targetType: string; targetStudentIds: string[];
  certificateEnabled: boolean; certificateThreshold: number; proctored: boolean; courseTitle: string | null; batchLabel: string | null;
  teacherName: string | null; targetCount: number;
  questionList: (Question & { order: number; marks: number; linkId: string })[];
}
export interface AttemptRosterRow {
  studentId: string; studentCode: string; name: string; attemptId: string | null; status: string;
  submittedAt: string | null; score: number | null; totalMarks: number | null; percentage: number | null;
  passed: boolean | null; autoSubmitted: boolean; rank: number | null; violations: number;
}
export interface AttemptDetail {
  id: string; status: string; studentName: string; teacherFeedback: string | null;
  autoScore: number; manualScore: number; score: number; totalMarks: number; percentage: number; passed: boolean;
  assessment: { title: string; totalMarks: number; passingMarks: number; negativeMarking: boolean; showResultImmediately: boolean };
  answerList: {
    answerId: string; questionId: string; response: unknown; markedForReview: boolean; isCorrect: boolean | null;
    awardedMarks: number | null; maxMarks: number; rubricScores: Record<string, number> | null; feedback: string | null;
    autoGraded: boolean; question: Question;
  }[];
}
export interface StudentAssessmentRow {
  id: string; title: string; subject: string | null; type: string; course: string | null; teacher: string | null;
  durationMin: number; totalMarks: number; passingMarks: number; questions: number; startAt: string | null;
  endAt: string | null; status: string; attemptsAllowed: number; showResultImmediately: boolean;
  windowOpen: boolean; canAttempt: boolean; attemptsUsed: number; inProgressAttemptId: string | null;
  lastAttempt: { id: string; status: string; score: number; totalMarks: number; percentage: number; passed: boolean; published: boolean } | null;
}
export interface TakePayload {
  attemptId: string; assessmentId: string; title: string; instructions: string | null; durationMin: number;
  allowBack: boolean; totalMarks: number; questionOrder: string; proctored: boolean; startedAt: string; remainingSec: number;
  questions: {
    questionId: string; type: string; text: string; subject: string; topic: string | null; difficulty: string;
    marks: number; media: QuestionMedia[] | null; estimatedTime: number; options: { id: string; text: string }[] | null;
    matchPairs: string[] | null; matchOptions: string[] | null; savedResponse: unknown; markedForReview: boolean;
    language: string | null; testCases: TestCase[] | null;
  }[];
}
export interface AttemptResult {
  available: boolean; status: string; title: string; subject?: string | null; type?: string;
  attemptId?: string; score?: number; totalMarks?: number; percentage?: number; passed?: boolean;
  rank?: number | null; totalStudents?: number | null; correctCount?: number; wrongCount?: number; skippedCount?: number;
  timeSpentSec?: number | null; teacherFeedback?: string | null; certEligible?: boolean; certificateNo?: string | null; violations?: number;
  questions?: {
    questionId: string; text: string; type: string; marks: number; response: unknown; correctAnswer: string | null;
    options: unknown; isCorrect: boolean | null; awardedMarks: number | null; feedback: string | null;
    explanation: string | null; rubricScores: Record<string, number> | null;
  }[];
}

// Question bank
export const createQuestion = (dto: Record<string, unknown>) => api<Question>(`/assessments/questions`, { method: "POST", body: JSON.stringify(dto) });
export const listQuestions = (q: Record<string, string> = {}) =>
  api<{ items: Question[]; meta: { page: number; limit: number; total: number; pages: number } }>(`/assessments/questions?${new URLSearchParams(q).toString()}`);
export const getQuestion = (id: string) => api<Question>(`/assessments/questions/${id}`);
export const updateQuestion = (id: string, dto: Record<string, unknown>) => api<Question>(`/assessments/questions/${id}`, { method: "PATCH", body: JSON.stringify(dto) });
export const archiveQuestion = (id: string) => api<Question>(`/assessments/questions/${id}/archive`, { method: "POST" });
export const restoreQuestion = (id: string) => api<Question>(`/assessments/questions/${id}/restore`, { method: "POST" });
export const deleteQuestion = (id: string) => api<{ deleted?: boolean; archived?: boolean }>(`/assessments/questions/${id}`, { method: "DELETE" });
export const fetchQuestionMeta = () => api<{ subjects: string[]; categories: string[]; types: readonly string[] }>(`/assessments/questions/meta`);

// Assessment CRUD + lifecycle
export const createAssessment = (dto: Record<string, unknown>) => api<AssessmentDetail>(`/assessments`, { method: "POST", body: JSON.stringify(dto) });
export const updateAssessment = (id: string, dto: Record<string, unknown>) => api<AssessmentDetail>(`/assessments/${id}`, { method: "PATCH", body: JSON.stringify(dto) });
export const deleteAssessment = (id: string) => api<{ deleted: boolean }>(`/assessments/${id}`, { method: "DELETE" });
export const listAssessments = (q: Record<string, string> = {}) =>
  api<{ items: AssessmentListRow[]; meta: { page: number; limit: number; total: number; pages: number } }>(`/assessments?${new URLSearchParams(q).toString()}`);
export const getAssessment = (id: string) => api<AssessmentDetail>(`/assessments/${id}`);
export const setAssessmentQuestions = (id: string, questionIds: string[]) => api<AssessmentDetail>(`/assessments/${id}/questions`, { method: "POST", body: JSON.stringify({ questionIds }) });
export const autofillAssessment = (id: string) => api<AssessmentDetail>(`/assessments/${id}/autofill`, { method: "POST" });
export const assessmentLifecycle = (id: string, action: "publish" | "unpublish" | "live" | "close" | "archive" | "lock" | "unlock" | "clone" | "publish-results") =>
  api<Record<string, unknown>>(`/assessments/${id}/${action}`, { method: "POST" });

// Attempts (teacher/admin)
export const getAssessmentAttempts = (id: string) => api<AttemptRosterRow[]>(`/assessments/${id}/attempts`);
export const getAttempt = (attemptId: string) => api<AttemptDetail>(`/assessments/attempts/${attemptId}`);
export const startAttemptReview = (attemptId: string) => api<Record<string, unknown>>(`/assessments/attempts/${attemptId}/review`, { method: "POST" });
export const evaluateAttempt = (attemptId: string, dto: { answers?: { questionId: string; awardedMarks: number; rubricScores?: Record<string, number>; feedback?: string }[]; teacherFeedback?: string; publish?: boolean }) =>
  api<{ ok: boolean; score: number; percentage: number; passed: boolean; status: string }>(`/assessments/attempts/${attemptId}/evaluate`, { method: "POST", body: JSON.stringify(dto) });

// Dashboards / analytics / reports / calendar / meta
export const fetchAssessmentAdminDashboard = () => api<{ cards: Record<string, number> }>(`/assessments/dashboard/admin`);
export const fetchAssessmentTeacherDashboard = () => api<{ cards: Record<string, number> }>(`/assessments/dashboard/teacher`);
export const fetchAssessmentAnalytics = () => api<Record<string, unknown>>(`/assessments/analytics`);
export const fetchQuestionAnalytics = (assessmentId?: string) => api<Record<string, unknown>[]>(`/assessments/analytics/questions${assessmentId ? `?assessmentId=${assessmentId}` : ""}`);
export const fetchAssessmentReport = (type: string) => api<Record<string, unknown> | Record<string, unknown>[]>(`/assessments/reports/${type}`);
export const fetchAssessmentCalendar = (month?: string) => api<{ id: string; title: string; startAt: string | null; endAt: string | null; status: string; type: string; course: string | null; day: number | null }[]>(`/assessments/calendar${month ? `?month=${month}` : ""}`);
export const fetchAssessmentMeta = () => api<{ courses: { id: string; title: string }[]; batches: { id: string; code: string; name: string }[]; teachers?: { id: string; name: string }[] }>(`/assessments/meta`);
export const fetchAssessmentTargetStudents = (courseId?: string, batchId?: string) => {
  const q = new URLSearchParams(); if (courseId) q.set("courseId", courseId); if (batchId) q.set("batchId", batchId);
  return api<{ id: string; studentCode: string; name: string }[]>(`/assessments/students?${q.toString()}`);
};

// Student history (admin/coach/teacher view — powers Student Hub + parent read-only)
export interface StudentAttemptRow {
  id: string; assessment: string; subject: string | null; type: string; status: string;
  score: number; totalMarks: number; percentage: number; passed: boolean; rank: number | null;
  submittedAt: string | null; published: boolean;
}
export const fetchStudentAssessmentAttempts = (studentId: string) => api<StudentAttemptRow[]>(`/assessments/student/${studentId}/attempts`);

// Student flow
export const fetchMyAssessments = () => api<StudentAssessmentRow[]>(`/assessments/mine`);
export const takeAssessment = (id: string) => api<TakePayload>(`/assessments/${id}/take`);
export const saveAssessmentAnswer = (attemptId: string, dto: { questionId: string; response?: unknown; markedForReview?: boolean; timeSpentSec?: number }) =>
  api<{ saved: boolean }>(`/assessments/attempts/${attemptId}/answer`, { method: "POST", body: JSON.stringify(dto) });
export const submitAssessmentAttempt = (attemptId: string, dto: { autoSubmitted?: boolean; timeSpentSec?: number; violations?: number; proctorLog?: { type: string; at: string }[]; answers?: { questionId: string; response?: unknown; markedForReview?: boolean }[] }) =>
  api<{ attemptId: string; status: string; hasSubjective: boolean; autoScore: number; correct: number; wrong: number; skipped: number }>(`/assessments/attempts/${attemptId}/submit`, { method: "POST", body: JSON.stringify(dto) });
export const fetchAttemptResult = (attemptId: string) => api<AttemptResult>(`/assessments/attempts/${attemptId}/result`);
export const fetchAttemptCertificate = (attemptId: string) =>
  api<{ studentName: string; studentCode: string; assessment: string; subject: string | null; percentage: number; score: number; totalMarks: number; certificateNo: string; issuedAt: string }>(`/assessments/attempts/${attemptId}/certificate`);

// Shared file upload (question media + file answers)
export const uploadAssessmentFile = async (file: File): Promise<{ url: string; name: string }> => {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${BASE}/assessments/upload`, { method: "POST", headers: { ...authHeader() }, body: form });
  if (!res.ok) throw new ApiError(res.status, await errorMessage(res));
  return res.json() as Promise<{ url: string; name: string }>;
};
