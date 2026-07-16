"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { HelpCircle, ChevronLeft, Home, FileWarning } from "lucide-react";

import { useAuth } from "@/store/auth";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  const router = useRouter();
  const { user } = useAuth();

  // Dynamic redirect path based on user role
  const dashboardPath = user
    ? user.role === "STUDENT"
      ? "/student/dashboard"
      : user.role === "TEACHER"
      ? "/teacher/dashboard"
      : "/dashboard"
    : "/signin";

  return (
    <div className="min-h-screen bg-gradient-to-br from-page to-surface-2/20 flex items-center justify-center p-6 select-none animate-fade-in">
      <div className="max-w-md w-full text-center space-y-8 p-8 border border-hairline bg-surface rounded-3xl shadow-2xl relative overflow-hidden group">
        
        {/* Glow decoration */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-accent/5 rounded-full blur-2xl pointer-events-none group-hover:scale-125 transition-transform duration-500" />
        
        <div className="space-y-4">
          {/* Animated Illustration */}
          <div className="relative size-24 mx-auto flex items-center justify-center bg-accent-soft/10 text-accent rounded-full border border-accent/20">
            <FileWarning className="size-10 text-accent" />
            <span className="absolute -top-1 -right-1 size-5 rounded-full bg-critical border-2 border-surface text-white text-[10px] font-bold grid place-items-center">
              !
            </span>
          </div>

          <div className="space-y-2">
            <h1 className="text-5xl font-black text-ink tracking-tight font-mono">404</h1>
            <h2 className="text-lg font-extrabold text-ink leading-tight">Page Not Found</h2>
            <p className="text-xs text-ink-3 font-semibold leading-relaxed max-w-sm mx-auto">
              The page you are looking for does not exist, has been moved, or you do not have sufficient permissions to view it.
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 pt-4 justify-center">
          <Button
            variant="outline"
            onClick={() => router.back()}
            className="h-11 rounded-xl border border-hairline hover:bg-surface-2 text-xs font-bold text-ink-2 flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <ChevronLeft className="size-4" />
            Go Back
          </Button>

          <Link href={dashboardPath} className="w-full sm:w-auto">
            <Button
              className="h-11 w-full rounded-xl bg-accent hover:bg-accent-hover text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm shadow-accent/10 cursor-pointer"
            >
              <Home className="size-4" />
              Go to Console
            </Button>
          </Link>
        </div>

        {/* Footer help */}
        <div className="border-t border-hairline/65 pt-5 text-[10px] text-ink-3 font-semibold flex items-center justify-center gap-1.5">
          <HelpCircle className="size-3.5" />
          <span>Need help? Contact Al Furqan Support portal.</span>
        </div>

      </div>
    </div>
  );
}
