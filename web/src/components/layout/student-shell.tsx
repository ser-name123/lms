"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  PanelLeftClose,
  PanelLeftOpen,
  GraduationCap,
  X,
  LayoutDashboard,
  BookOpen,
  CalendarDays,
  ClipboardList,
  Receipt,
  User,
  Video,
  Library,
  MessageCircle,
  ClipboardCheck,
  FileCheck2,
  TrendingUp,
} from "lucide-react";

import { useUI } from "@/store/ui";
import { useSettingsStore } from "@/store/settings";
import { cn } from "@/lib/utils";

const studentNavItems = [
  { label: "Dashboard", href: "/student/dashboard", icon: LayoutDashboard },
  // Shared route group, so it is not under /student.
  { label: "Notifications", href: "/notifications", icon: Bell },
  { label: "My Courses", href: "/student/courses", icon: BookOpen },
  { label: "My Schedule", href: "/student/classes", icon: CalendarDays },
  { label: "My Attendance", href: "/student/attendance", icon: ClipboardCheck },
  { label: "Live Meetings", href: "/student/meetings", icon: Video },
  { label: "Homework & Grades", href: "/student/assignments", icon: ClipboardList },
  { label: "Assessments", href: "/student/assessments", icon: FileCheck2 },
  { label: "My Progress", href: "/student/progress", icon: TrendingUp },
  { label: "Knowledge Base", href: "/student/knowledgebase", icon: Library },
  { label: "Billing & Invoices", href: "/student/invoices", icon: Receipt },
  { label: "Fees & Payments", href: "/student/fees", icon: Receipt },
  { label: "Support Chat", href: "/student/chat", icon: MessageCircle },
  { label: "My Profile", href: "/student/profile", icon: User },
];

export function StudentShell({ children }: { children: React.ReactNode }) {
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
                Student Portal
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
            {studentNavItems.map((item) => {
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

        {/* Sidebar desktop collapse toggle button */}
        <div className="hidden border-t border-sidebar-border p-3 lg:block">
          <button
            onClick={toggleSidebar}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium text-sidebar-text transition-colors hover:bg-sidebar-active/30 hover:text-white",
              sidebarCollapsed && "justify-center px-0",
            )}
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen className="size-4.5" />
            ) : (
              <>
                <PanelLeftClose className="size-4.5" />
                <span>Collapse</span>
              </>
            )}
          </button>
        </div>
      </aside>

      <div
        className={cn(
          "transition-[padding] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
          sidebarCollapsed ? "lg:pl-[72px]" : "lg:pl-64",
        )}
      >
        {children}
      </div>
    </div>
  );
}
