"use client";

import Link from "next/link";
import { GraduationCap, User, ChevronRight, ArrowLeft, Sparkles } from "lucide-react";

const OPTIONS = [
  {
    href: "/register",
    icon: User,
    title: "I'm a Student",
    desc: "Create a student account and apply for admission.",
    accent: "bg-accent/10 text-accent",
  },
  {
    href: "/register-teacher",
    icon: GraduationCap,
    title: "I'm a Teacher",
    desc: "Apply to join our teaching team through the hiring process.",
    accent: "bg-emerald-500/10 text-emerald-500",
  },
];

export default function SignupChooserPage() {
  return (
    <main className="min-h-screen grid place-items-center bg-page p-4">
      <div className="w-full max-w-md">
        {/* Brand */}
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 grid size-12 place-items-center rounded-2xl bg-accent/10 text-accent">
            <Sparkles className="size-6" />
          </div>
          <h1 className="text-xl font-black text-ink">Create your account</h1>
          <p className="mt-1 text-sm text-ink-3">How would you like to sign up?</p>
        </div>

        {/* Choices */}
        <div className="space-y-3">
          {OPTIONS.map((o) => (
            <Link
              key={o.href}
              href={o.href}
              className="group flex items-center gap-4 rounded-2xl border border-hairline bg-surface p-5 shadow-sm transition-all hover:border-accent/50 hover:shadow-md"
            >
              <span className={`grid size-12 shrink-0 place-items-center rounded-xl ${o.accent}`}>
                <o.icon className="size-6" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-black text-ink">{o.title}</span>
                <span className="block text-xs text-ink-3 mt-0.5">{o.desc}</span>
              </span>
              <ChevronRight className="size-5 shrink-0 text-ink-3 transition-transform group-hover:translate-x-0.5 group-hover:text-accent" />
            </Link>
          ))}
        </div>

        {/* Trial nudge + back to sign in */}
        <p className="mt-5 text-center text-xs text-ink-3">
          Just exploring?{" "}
          <Link href="/get-started" className="font-bold text-accent hover:underline">
            Book a free trial class
          </Link>
        </p>
        <div className="mt-4 text-center">
          <Link
            href="/signin"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-ink-3 hover:text-ink"
          >
            <ArrowLeft className="size-4" /> Back to Sign in
          </Link>
        </div>
      </div>
    </main>
  );
}
