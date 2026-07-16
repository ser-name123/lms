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
    teacher: { id: string; user: { firstName: string; lastName: string } };
    package?: { id: string; name: string; price: number; classesPerMonth: number } | null;
  }[];
};

export const fetchStudents = (params: { 
  page: number; 
  limit: number; 
  search?: string; 
  status?: string;
  courseId?: string;
  teacherId?: string;
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
  hourlyRate: number | null;
  bio: string | null;
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

// ─── Trial Calls & Types ──────────────────────────────────────────────────────

export type TrialClassItem = {
  id: string;
  name: string;
  email: string;
  mobile: string;
  country: string;
  course: string;
  prefTeacherGender: string;
  status: "PENDING" | "SCHEDULED" | "COMPLETED";
  age: number;
  goals: string;
  scheduledTime?: string;
  assignedTeacher?: string;
  meetLink?: string;
  pronunciationGrade?: string;
  fluencyGrade?: string;
  focusGrade?: string;
  recommendedLevel?: string;
  evaluationNotes?: string;
};

export const fetchTrials = () => api<TrialClassItem[]>("/trials");

export const createTrial = (dto: any) => api<TrialClassItem>("/trials", {
  method: "POST",
  body: JSON.stringify(dto),
});

export const scheduleTrial = (id: string, dto: any) => api<TrialClassItem>(`/trials/${id}/schedule`, {
  method: "PUT",
  body: JSON.stringify(dto),
});

export const evaluateTrial = (id: string, dto: any) => api<TrialClassItem>(`/trials/${id}/evaluate`, {
  method: "PUT",
  body: JSON.stringify(dto),
});

export const updateTrial = (id: string, dto: any) => api<TrialClassItem>(`/trials/${id}`, {
  method: "PUT",
  body: JSON.stringify(dto),
});

export const deleteTrial = (id: string) => api<void>(`/trials/${id}`, {
  method: "DELETE",
});

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

export type ExpenseCategory = 
  | "SALARY" 
  | "RENT" 
  | "UTILITIES" 
  | "MARKETING" 
  | "SOFTWARE" 
  | "OFFICE_SUPPLIES" 
  | "TRAVEL" 
  | "OTHERS";

export type ExpenseStatus = "APPROVED" | "PENDING" | "REJECTED";
export type ExpensePaymentMethod = "BANK_TRANSFER" | "CREDIT_CARD" | "PAYPAL" | "CASH" | "WISE";

export interface Expense {
  id: string;
  title: string;
  amount: number;
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
  categoryBreakdown: { name: string; value: number; count: number }[];
  trend: { month: string; revenue: number; expenses: number }[];
}

export const fetchExpenses = (params: {
  page: number;
  limit: number;
  search?: string;
  category?: string;
  status?: string;
  paymentMethod?: string;
  sortBy?: string;
}) => {
  const queryObj: Record<string, string> = {
    page: String(params.page),
    limit: String(params.limit),
  };
  if (params.search) queryObj.search = params.search;
  if (params.category && params.category !== "All") queryObj.category = params.category.toUpperCase();
  if (params.status && params.status !== "All") queryObj.status = params.status.toUpperCase();
  if (params.paymentMethod && params.paymentMethod !== "All") {
    queryObj.paymentMethod = params.paymentMethod.toUpperCase().replace(" ", "_");
  }
  if (params.sortBy) queryObj.sortBy = params.sortBy;

  const q = new URLSearchParams(queryObj);
  return api<{ items: Expense[]; meta: { page: number; limit: number; total: number; totalPages: number } }>(`/expenses?${q.toString()}`);
};

export const fetchExpenseStats = () => api<ExpenseStats>("/expenses/stats");

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

export const seedExpenses = () => api<{ seededCount: number }>("/expenses/seed", {
  method: "POST",
});



