"use client";

import { useSyncExternalStore } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Role = "ADMIN" | "SUPERVISOR" | "ACADEMIC_COACH" | "TEACHER" | "STUDENT";

export type User = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  avatarUrl: string | null;
};

type AuthState = {
  accessToken: string | null;
  refreshToken: string | null;
  user: User | null;

  setSession: (tokens: { accessToken: string; refreshToken: string }, user: User) => void;
  setTokens: (tokens: { accessToken: string; refreshToken: string }) => void;
  clear: () => void;
};

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      user: null,

      setSession: (tokens, user) => set({ ...tokens, user }),
      setTokens: (tokens) => set(tokens),
      clear: () => set({ accessToken: null, refreshToken: null, user: null }),
    }),
    {
      name: "lms-auth",
      partialize: (s) => ({
        accessToken: s.accessToken,
        refreshToken: s.refreshToken,
        user: s.user,
      }),
    },
  ),
);

/**
 * True once persisted state has been read back.
 *
 * The guard must not decide anything before this: on the very first client
 * render the store is still empty, and redirecting then would bounce a
 * signed-in user to /signin on every refresh.
 *
 * localStorage is synchronous, so zustand rehydrates *during* create() — which
 * is why this cannot be tracked from inside onRehydrateStorage (`useAuth` does
 * not exist yet at that point).
 */
export function useAuthHydrated() {
  return useSyncExternalStore(
    (onChange) => useAuth.persist.onFinishHydration(onChange),
    () => useAuth.persist.hasHydrated(),
    () => false, // on the server nothing is hydrated yet
  );
}

/* Read outside React — the API client needs tokens mid-request. */
export const authSnapshot = () => useAuth.getState();
