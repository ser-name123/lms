"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, Eye, EyeOff, Loader2, GraduationCap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ApiError, fetchMe, login, verifyOtp } from "@/lib/api";
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

  // OTP state
  const [otpRequired, setOtpRequired] = useState(false);
  const [otpCode, setOtpCode] = useState("");

  // Already signed in? Don't show the form again.
  useEffect(() => {
    if (hydrated && accessToken) router.replace("/dashboard");
  }, [hydrated, accessToken, router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);

    try {
      const res = await login(email, password);
      if ("otpRequired" in res && res.otpRequired) {
        setOtpRequired(true);
        setBusy(false);
        return;
      }

      // If it immediately returned tokens (fallback case)
      const tokens = res as any;
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

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);

    if (!otpCode || otpCode.length < 6) {
      setError("Please enter a 6-digit verification code.");
      setBusy(false);
      return;
    }

    try {
      const tokens = await verifyOtp(email, otpCode);
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
      setError(err instanceof ApiError ? err.message : "Verification failed. Please try again.");
      setBusy(false);
    }
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-gradient-to-br from-[#f8fafc] via-[#f1f5f9] to-[#e2e8f0] px-4 py-12 overflow-hidden">
      
      {/* Decorative Glow Bubbles */}
      <div className="absolute top-1/4 -left-36 size-96 rounded-full bg-gradient-to-tr from-indigo-500/20 to-purple-500/10 blur-[80px] pointer-events-none" />
      <div className="absolute bottom-1/4 -right-36 size-96 rounded-full bg-gradient-to-br from-blue-500/10 to-indigo-500/20 blur-[80px] pointer-events-none" />

      <div className="relative w-full max-w-[480px] rounded-3xl border border-hairline/80 bg-surface p-8 sm:p-10 shadow-[0_25px_60px_-15px_rgba(91,115,232,0.12)] animate-fade-up">
        {/* Brand Logo Header */}
        <div className="flex flex-col items-center mb-7">
          <div className="flex items-center gap-2.5">
            <div className="grid size-10.5 place-items-center rounded-xl bg-accent/10 border border-accent/20">
              <GraduationCap className="size-6 text-[#5b73e8]" />
            </div>
            <span className="text-2.5xl font-black tracking-wider text-ink uppercase">
              Edumin
            </span>
          </div>
          <h2 className="mt-4 text-base font-bold text-ink-2">
            {otpRequired ? "Verify Code" : "Sign in your account"}
          </h2>
        </div>

        {!otpRequired ? (
          <form onSubmit={submit} className="space-y-5" noValidate>
            <div>
              <label htmlFor="email" className="mb-2 block text-xs font-bold uppercase tracking-wider text-ink-3">
                Username
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="username"
                className="h-11.5 w-full rounded-xl border border-hairline bg-surface px-4 text-sm text-ink placeholder:text-ink-3 focus:outline-none focus:border-[#5b73e8] focus:ring-1 focus:ring-[#5b73e8] focus:shadow-[0_0_0_4px_rgba(91,115,232,0.12)] transition-all duration-200"
                suppressHydrationWarning
              />
            </div>

            <div>
              <label htmlFor="password" className="mb-2 block text-xs font-bold uppercase tracking-wider text-ink-3">
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
                  placeholder="••••••"
                  className="h-11.5 w-full rounded-xl border border-hairline bg-surface pr-12 pl-4 text-sm text-ink placeholder:text-ink-3 focus:outline-none focus:border-[#5b73e8] focus:ring-1 focus:ring-[#5b73e8] focus:shadow-[0_0_0_4px_rgba(91,115,232,0.12)] transition-all duration-200"
                  suppressHydrationWarning
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute top-1/2 right-3.5 grid size-7 -translate-y-1/2 place-items-center rounded-md text-ink-3 hover:bg-surface-2 hover:text-ink"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  suppressHydrationWarning
                >
                  {showPassword ? <EyeOff className="size-4.5" /> : <Eye className="size-4.5" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs font-semibold">
              <label className="flex items-center gap-2 cursor-pointer text-ink-2">
                <input 
                  type="checkbox" 
                  className="rounded-md border-hairline text-[#5b73e8] focus:ring-[#5b73e8] size-4" 
                  suppressHydrationWarning
                />
                <span>Remember my preference</span>
              </label>
              <a href="#" className="text-[#5b73e8] hover:underline">
                Forgot Password?
              </a>
            </div>

            {error && (
              <p
                role="alert"
                className="flex items-start gap-2.5 rounded-xl bg-critical/5 border border-critical/10 px-4 py-3 text-sm text-critical"
              >
                <CircleAlert className="mt-0.5 size-4 shrink-0 text-critical" />
                {error}
              </p>
            )}

            <Button
              type="submit"
              disabled={busy}
              className="h-11.5 w-full justify-center rounded-xl bg-gradient-to-r from-[#5b73e8] to-[#4860e6] hover:shadow-[0_8px_25px_rgba(91,115,232,0.35)] font-bold text-white transition-all duration-300 animate-fade-in"
              suppressHydrationWarning
            >
              {busy ? (
                <>
                  <Loader2 className="size-4 animate-spin mr-1.5" />
                  Signing in…
                </>
              ) : (
                "Sign Me In"
              )}
            </Button>

            {/* Divider */}
            <div className="relative flex items-center justify-center my-5">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-hairline/80"></div>
              </div>
              <span className="relative px-3 bg-surface text-xs font-semibold text-ink-3">
                Or sign in with
              </span>
            </div>

            {/* Social Buttons */}
            <div className="grid grid-cols-2 gap-3.5">
              <button
                type="button"
                className="flex items-center justify-center gap-2 h-10.5 px-4 rounded-xl border border-hairline bg-surface hover:border-[#EA4335]/30 hover:bg-[#EA4335]/5 hover:scale-[1.01] active:scale-[0.99] transition-all duration-200 text-xs font-bold text-ink-2"
                suppressHydrationWarning
              >
                <svg className="size-4 shrink-0" viewBox="0 0 24 24">
                  <path
                    fill="#EA4335"
                    d="M12.24 10.285V14.4h6.887c-.648 2.41-2.519 4.2-5.136 4.2A5.64 5.64 0 0 1 8.3 12.985a5.64 5.64 0 0 1 5.69-5.615c2.476 0 4.148 1.03 5.093 1.935l3.143-3.14C20.25 4.315 17.382 3 13.99 3 7.92 3 3 7.92 3 13.99s4.92 10.99 10.99 10.99c6.335 0 10.536-4.453 10.536-10.72 0-.71-.06-1.4-.19-1.975H12.24Z"
                  />
                </svg>
                Google
              </button>
              <button
                type="button"
                className="flex items-center justify-center gap-2 h-10.5 px-4 rounded-xl border border-hairline bg-surface hover:border-ink/20 hover:bg-ink/5 hover:scale-[1.01] active:scale-[0.99] transition-all duration-200 text-xs font-bold text-ink-2"
                suppressHydrationWarning
              >
                <svg className="size-4.5 shrink-0 fill-current text-ink" viewBox="0 0 24 24">
                  <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 4.17c.66-.81 1.11-1.93.99-3.06-1 .04-2.18.66-2.9 1.5-.63.73-1.18 1.87-1.03 2.98 1.12.09 2.27-.61 2.94-1.42Z" />
                </svg>
                Apple
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} className="space-y-5" noValidate>
            <div>
              <label htmlFor="otp" className="mb-2 block text-xs font-bold uppercase tracking-wider text-ink-3">
                Verification Code
              </label>
              <input
                id="otp"
                type="text"
                maxLength={6}
                required
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                placeholder="123456"
                className="h-11.5 w-full text-center tracking-[0.5em] font-bold rounded-xl border border-hairline bg-surface px-4 text-lg text-ink placeholder:text-ink-3 placeholder:tracking-normal focus:outline-none focus:border-[#5b73e8] focus:ring-1 focus:ring-[#5b73e8] focus:shadow-[0_0_0_4px_rgba(91,115,232,0.12)] transition-all duration-200"
                suppressHydrationWarning
              />
              <p className="mt-2 text-xs text-ink-3">
                Please enter the 6-digit code sent to your registered email address.
              </p>
            </div>

            {error && (
              <p
                role="alert"
                className="flex items-start gap-2.5 rounded-xl bg-critical/5 border border-critical/10 px-4 py-3 text-sm text-critical animate-fade-in"
              >
                <CircleAlert className="mt-0.5 size-4 shrink-0 text-critical" />
                {error}
              </p>
            )}

            <div className="flex gap-3">
              <Button
                type="button"
                onClick={() => {
                  setOtpRequired(false);
                  setOtpCode("");
                  setError(null);
                }}
                className="h-11.5 flex-1 justify-center rounded-xl border border-hairline bg-transparent hover:bg-surface-2 text-ink-2 font-bold transition-all duration-200"
                suppressHydrationWarning
              >
                Back
              </Button>
              <Button
                type="submit"
                disabled={busy}
                className="h-11.5 flex-[2] justify-center rounded-xl bg-gradient-to-r from-[#5b73e8] to-[#4860e6] hover:shadow-[0_8px_25px_rgba(91,115,232,0.35)] font-bold text-white transition-all duration-300"
                suppressHydrationWarning
              >
                {busy ? (
                  <>
                    <Loader2 className="size-4 animate-spin mr-1.5" />
                    Checking…
                  </>
                ) : (
                  "Verify & Sign In"
                )}
              </Button>
            </div>
          </form>
        )}

        {/* Footer */}
        <div className="mt-6 text-center text-xs text-ink-3 font-semibold">
          Don't have an account?{" "}
          <a href="#" className="text-[#5b73e8] hover:underline ml-0.5">
            Sign up
          </a>
        </div>
      </div>
    </main>
  );
}

