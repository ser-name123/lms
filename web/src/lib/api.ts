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
export const fetchStudentsTeachers = () => api<{ id: string; user: { firstName: string; lastName: string } }[]>("/students/teachers");

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
