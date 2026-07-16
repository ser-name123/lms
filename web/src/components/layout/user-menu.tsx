"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, LogOut, Settings, User as UserIcon } from "lucide-react";

import { revokeSession } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { cn, initials } from "@/lib/utils";

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Administrator",
  SUPERVISOR: "Supervisor",
  ACADEMIC_COACH: "Academic coach",
  TEACHER: "Teacher",
  STUDENT: "Student",
};

export function UserMenu() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, refreshToken, clear } = useAuth();

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const signOut = async () => {
    setBusy(true);

    // Revoke server-side first, while the token is still in the store.
    if (refreshToken) await revokeSession(refreshToken);

    clear();
    // Otherwise the next user to sign in briefly sees the previous one's data.
    queryClient.clear();
    router.replace("/signin");
  };

  if (!user) return null;

  const name = `${user.firstName} ${user.lastName}`;

  return (
    <div ref={ref} className="relative ml-2 border-l border-hairline pl-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2.5 rounded-lg py-1 pr-1.5 pl-1 transition-colors hover:bg-surface-2"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {user.avatarUrl ? (
          <img
            src={user.avatarUrl}
            alt={name}
            className="size-8 shrink-0 rounded-full object-cover border border-hairline"
          />
        ) : (
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent-soft text-xs font-semibold text-accent">
            {initials(name)}
          </span>
        )}
        <span className="hidden text-left leading-tight lg:block">
          <span className="block text-sm font-medium text-ink">{name}</span>
          <span className="block text-xs text-ink-3">
            {ROLE_LABEL[user.role] ?? user.role}
          </span>
        </span>
        <ChevronDown
          className={cn(
            "hidden size-4 text-ink-3 transition-transform lg:block",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="animate-fade-up absolute right-0 mt-2 w-60 overflow-hidden rounded-xl border border-hairline bg-surface shadow-[var(--shadow-pop)]"
        >
          <div className="border-b border-hairline px-3.5 py-3">
            <p className="truncate text-sm font-medium text-ink">{name}</p>
            <p className="truncate text-xs text-ink-3">{user.email}</p>
          </div>

          <div className="p-1.5">
            <button
              role="menuitem"
              onClick={() => {
                setOpen(false);
                if (user.role === "STUDENT") {
                  router.push("/student/profile");
                } else if (user.role === "TEACHER") {
                  router.push("/teacher/profile");
                } else {
                  router.push("/profile");
                }
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
            >
              <UserIcon className="size-4" />
              Profile
            </button>
            {user.role !== "STUDENT" &&
              user.role !== "TEACHER" &&
              user.role !== "ACADEMIC_COACH" &&
              user.role !== "SUPERVISOR" && (
              <button
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  router.push("/settings");
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
              >
                <Settings className="size-4" />
                Settings
              </button>
            )}
          </div>

          <div className="border-t border-hairline p-1.5">
            <button
              role="menuitem"
              onClick={signOut}
              disabled={busy}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-critical transition-colors hover:bg-surface-2 disabled:opacity-50"
            >
              <LogOut className="size-4" />
              {busy ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
