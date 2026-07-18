"use client";

/*
 * Root route. It used to redirect everyone to /dashboard, which is only valid
 * for ADMIN / SUPERVISOR / ACADEMIC_COACH — a teacher, student or parent
 * landing on "/" was sent straight into a 404. Route by role instead.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useAuth, useAuthHydrated } from "@/store/auth";
import { dashboardPathFor } from "@/lib/routes";

export default function Home() {
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const { accessToken, user } = useAuth();

  useEffect(() => {
    // Wait for the persisted session to load, or a signed-in user would be
    // bounced to /signin on every refresh.
    if (!hydrated) return;
    router.replace(accessToken && user ? dashboardPathFor(user.role) : "/signin");
  }, [hydrated, accessToken, user, router]);

  return null;
}
