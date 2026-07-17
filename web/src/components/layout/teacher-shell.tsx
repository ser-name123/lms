"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  PanelLeftClose,
  PanelLeftOpen,
  GraduationCap,
  X,
  LayoutDashboard,
  CalendarDays,
  ClipboardList,
  Receipt,
  User,
  Users,
  MessageCircle,
  Video,
  Radio,
  CalendarClock,
  ClipboardCheck,
  FileCheck2,
} from "lucide-react";

import { useUI } from "@/store/ui";
import { useSettingsStore } from "@/store/settings";
import { cn } from "@/lib/utils";

const teacherNavItems = [
  { label: "Dashboard", href: "/teacher/dashboard", icon: LayoutDashboard },
  { label: "My Schedule", href: "/teacher/classes", icon: CalendarDays },
  { label: "My Availability", href: "/teacher/availability", icon: CalendarClock },
  { label: "Attendance", href: "/teacher/attendance", icon: ClipboardCheck },
  { label: "Trial Classes", href: "/teacher/trials", icon: CalendarClock },
  { label: "Live Classes", href: "/teacher/live-class", icon: Radio },
  { label: "Live Meetings", href: "/teacher/meetings", icon: Video },
  { label: "My Students", href: "/teacher/students", icon: Users },
  { label: "Assignments", href: "/teacher/assignments", icon: ClipboardList },
  { label: "Assessments", href: "/teacher/assessments", icon: FileCheck2 },
  { label: "Payout History", href: "/teacher/payouts", icon: Receipt },
  { label: "Support Chat", href: "/teacher/chat", icon: MessageCircle },
  { label: "My Profile", href: "/teacher/profile", icon: User },
];

export function TeacherShell({ children }: { children: React.ReactNode }) {
  const { sidebarCollapsed, toggleSidebar, mobileNavOpen, setMobileNav, theme } = useUI();
  const { settings } = useSettingsStore();
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-gradient-to-br from-page to-surface-2/20">
      {/* Mobile scrim */}
      <div
        onClick={() => setMobileNav(false)}
        className={cn(
          "fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] transition-opacity lg:hidden",
          mobileNavOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        aria-hidden
      />

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col border-r border-sidebar-border bg-sidebar text-sidebar-text",
          "transition-[width,transform] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
          sidebarCollapsed ? "w-[72px]" : "w-64",
          mobileNavOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
      >
        {/* Brand logo */}
        <div className="flex h-16 items-center gap-2.5 border-b border-sidebar-border px-4">
          {theme === "dark" && settings?.logoDark ? (
            <img src={settings.logoDark} alt="Logo" className="size-11 object-contain rounded-lg shrink-0 bg-white p-1" />
          ) : settings?.logo ? (
            <img src={settings.logo} alt="Logo" className="size-11 object-contain rounded-lg shrink-0 bg-white p-1" />
          ) : (
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-gradient-to-tr from-accent to-[#59A5D8] shadow-md shadow-accent/20 text-white">
              <GraduationCap className="size-6" />
            </span>
          )}
          {!sidebarCollapsed && (
            <div className="min-w-0 flex-1 animate-fade-in">
              <p className="truncate text-base font-extrabold tracking-widest text-white uppercase">
                {settings?.websiteName || "AL FURQAN"}
              </p>
              <p className="truncate text-[10px] font-bold text-sidebar-text/70 uppercase tracking-wider">
                Teacher Panel
              </p>
            </div>
          )}
          <button
            onClick={() => setMobileNav(false)}
            className="ml-auto grid size-8 place-items-center rounded-lg text-sidebar-text hover:bg-sidebar-active lg:hidden"
            aria-label="Close navigation"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Navigation list */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <ul className="space-y-1.5">
            {teacherNavItems.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setMobileNav(false)}
                    title={sidebarCollapsed ? item.label : undefined}
                    className={cn(
                      "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                      active
                        ? "bg-sidebar-active text-white shadow-sm border border-white/5"
                        : "text-sidebar-text hover:bg-sidebar-active/30 hover:text-white hover:translate-x-0.5",
                      sidebarCollapsed && "justify-center px-0 hover:translate-x-0"
                    )}
                  >
                    {active && (
                      <span className="absolute left-1.5 h-5 w-1 rounded-full bg-white" />
                    )}
                    <Icon
                      className={cn(
                        "size-4.5 shrink-0 transition-transform duration-200 group-hover:scale-110",
                        active ? "text-white" : "text-sidebar-text/80 group-hover:text-white"
                      )}
                    />
                    {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Footer controls */}
        <div className="border-t border-sidebar-border p-3 flex justify-between">
          <button
            onClick={toggleSidebar}
            className="hidden lg:grid size-9 place-items-center rounded-xl hover:bg-sidebar-active text-sidebar-text/80 transition"
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {sidebarCollapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          </button>
        </div>
      </aside>

      <div
        className={cn(
          "transition-[padding] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] min-h-screen flex flex-col",
          sidebarCollapsed ? "lg:pl-[72px]" : "lg:pl-64",
        )}
      >
        <div className="flex-1 flex flex-col">{children}</div>
      </div>
    </div>
  );
}
