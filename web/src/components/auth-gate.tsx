"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import { ApiError, fetchMe } from "@/lib/api";
import { useAuth, useAuthHydrated } from "@/store/auth";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const { accessToken, user, setSession, clear } = useAuth();

  /* Re-validate against the server on mount. A token in localStorage only
     proves someone once signed in — the account may since have been
     deactivated or the token revoked. */
  const { data, error, isError } = useQuery({
    queryKey: ["me"],
    queryFn: fetchMe,
    enabled: hydrated && Boolean(accessToken),
    retry: false,
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    if (hydrated && !accessToken) router.replace("/signin");
  }, [hydrated, accessToken, router]);

  useEffect(() => {
    // 401 means refresh also failed; 403 means the account is not an admin.
    if (isError && error instanceof ApiError && [401, 403].includes(error.status)) {
      clear();
      router.replace("/signin");
    }
  }, [isError, error, clear, router]);

  useEffect(() => {
    if (data && data.id !== user?.id) {
      const { accessToken: a, refreshToken: r } = useAuth.getState();
      if (a && r) setSession({ accessToken: a, refreshToken: r }, data);
    }
  }, [data, user?.id, setSession]);

  if (!hydrated || !accessToken) {
    return (
      <div className="grid min-h-screen place-items-center bg-page">
        <Loader2 className="size-5 animate-spin text-ink-3" />
        <span className="sr-only">Loading</span>
      </div>
    );
  }

  return <>{children}</>;
}
