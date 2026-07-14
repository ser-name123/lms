"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, Eye, EyeOff, Loader2, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ApiError, fetchMe, login } from "@/lib/api";
import { useAuth, useAuthHydrated } from "@/store/auth";

export default function SignInPage() {
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const { accessToken, setSession, setTokens, clear } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Already signed in? Don't show the form again.
  useEffect(() => {
    if (hydrated && accessToken) router.replace("/dashboard");
  }, [hydrated, accessToken, router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);

    try {
      const tokens = await login(email, password);
      // Tokens must be in the store before fetchMe(), which reads them for its
      // Authorization header.
      setTokens(tokens);

      const user = await fetchMe();
      if (user.role !== "ADMIN") {
        clear();
        throw new ApiError(403, "This console is for administrators only.");
      }

      setSession(tokens, user);
      router.replace("/dashboard");
    } catch (err) {
      clear();
      setError(err instanceof ApiError ? err.message : "Could not reach the server.");
      setBusy(false);
    }
  };

  return (
    <main className="grid min-h-screen bg-page lg:grid-cols-2">
      {/* Form */}
      <div className="flex items-center justify-center px-6 py-12">
        <div className="animate-fade-up w-full max-w-sm">
          <span className="grid size-11 place-items-center rounded-xl bg-accent text-accent-ink">
            <Sparkles className="size-5" />
          </span>

          <h1 className="mt-6 text-2xl font-semibold tracking-tight text-ink">Welcome back</h1>
          <p className="mt-1.5 text-sm text-ink-3">Sign in to the Alfurqan admin console.</p>

          <form onSubmit={submit} className="mt-8 space-y-4" noValidate>
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-ink-2">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@lms.local"
                className="h-10 w-full rounded-lg border border-hairline bg-surface px-3 text-sm text-ink placeholder:text-ink-3 focus:outline-2 focus:outline-offset-2 focus:outline-accent"
              />
            </div>

            <div>
              <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-ink-2">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="h-10 w-full rounded-lg border border-hairline bg-surface pr-10 pl-3 text-sm text-ink placeholder:text-ink-3 focus:outline-2 focus:outline-offset-2 focus:outline-accent"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute top-1/2 right-2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-ink-3 hover:bg-surface-2 hover:text-ink"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>

            {error && (
              <p
                role="alert"
                className="flex items-start gap-2 rounded-lg bg-surface-2 px-3 py-2.5 text-sm text-ink-2"
              >
                <CircleAlert className="mt-0.5 size-4 shrink-0 text-critical" />
                {error}
              </p>
            )}

            <Button
              type="submit"
              variant="primary"
              disabled={busy}
              className="h-10 w-full justify-center"
            >
              {busy ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Signing in…
                </>
              ) : (
                "Sign in"
              )}
            </Button>
          </form>

          <p className="mt-8 rounded-lg border border-hairline bg-surface p-3 text-xs text-ink-3">
            Seeded admin — <span className="font-medium text-ink-2">admin@lms.local</span> /{" "}
            <span className="font-medium text-ink-2">Admin@12345</span>
          </p>
        </div>
      </div>

      {/* Decorative panel */}
      <div className="relative hidden overflow-hidden border-l border-hairline bg-surface lg:block">
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, var(--ink) 1px, transparent 0)",
            backgroundSize: "24px 24px",
          }}
          aria-hidden
        />
        <div className="relative flex h-full flex-col justify-end p-12">
          <blockquote className="max-w-md">
            <p className="text-xl leading-relaxed font-medium tracking-tight text-ink">
              Every student, class, invoice and payout — in one console.
            </p>
            <footer className="mt-4 text-sm text-ink-3">Alfurqan LMS · Admin</footer>
          </blockquote>
        </div>
      </div>
    </main>
  );
}
