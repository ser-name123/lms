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
  api<Tokens>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });

export const fetchMe = () => api<User>("/auth/me");

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
