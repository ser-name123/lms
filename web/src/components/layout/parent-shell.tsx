"use client";

/*
 * Parent portal shell. Mirrors the student shell — parents get a small,
 * read-only navigation: they monitor a child, they do not administer anything.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  GraduationCap,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  Wallet,
  X,
} from "lucide-react";

import { useUI } from "@/store/ui";
import { useSettingsStore } from "@/store/settings";
import { cn } from "@/lib/utils";

/*
 * Only routes that actually exist are listed. The parent dashboard already
 * carries attendance, homework, assessments and progress as widgets; dedicated
 * sub-pages for those are still to be built, and listing them before they exist
 * would ship links straight into a 404.
 */
const parentNavItems = [
  { label: "Dashboard", href: "/parent/dashboard", icon: LayoutDashboard },
  // Shared route group, so it is not under /parent.
  { label: "Notifications", href: "/notifications", icon: Bell },
  { label: "Fees", href: "/parent/fees", icon: Wallet },
];

export function ParentShell({ children }: { children: React.ReactNode }) {
  const { sidebarCollapsed, toggleSidebar, mobileNavOpen, setMobileNav, theme } = useUI();
  const { settings } = useSettingsStore();
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-gradient-to-br from-page to-surface-2/20">
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
        <div className="flex h-16 items-center gap-2.5 border-b border-sidebar-border px-4">
          {theme === "dark" && settings?.logoDark ? (
            <img
              src={settings.logoDark}
              alt="Logo"
              className="size-11 shrink-0 rounded-lg bg-white object-contain p-1"
            />
          ) : settings?.logo ? (
            <img
              src={settings.logo}
              alt="Logo"
              className="size-11 shrink-0 rounded-lg bg-white object-contain p-1"
            />
          ) : (
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-gradient-to-tr from-accent to-[#59A5D8] text-white shadow-md shadow-accent/20">
              <GraduationCap className="size-6" />
            </span>
          )}
          {!sidebarCollapsed && (
            <div className="animate-fade-in min-w-0 flex-1">
              <p className="truncate text-base font-extrabold tracking-widest text-white uppercase">
                {settings?.websiteName || "AL FURQAN"}
              </p>
              <p className="truncate text-[10px] font-bold tracking-wider text-sidebar-text/70 uppercase">
                Parent Portal
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

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <ul className="space-y-1.5">
            {parentNavItems.map((item) => {
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
                        ? "border border-white/5 bg-sidebar-active text-white shadow-sm"
                        : "text-sidebar-text hover:translate-x-0.5 hover:bg-sidebar-active/30 hover:text-white",
                      sidebarCollapsed && "justify-center px-0 hover:translate-x-0",
                    )}
                  >
                    {active && <span className="absolute left-1.5 h-5 w-1 rounded-full bg-white" />}
                    <Icon
                      className={cn(
                        "size-4.5 shrink-0 transition-transform duration-200 group-hover:scale-110",
                        active ? "text-white" : "text-sidebar-text/80 group-hover:text-white",
                      )}
                    />
                    {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

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
