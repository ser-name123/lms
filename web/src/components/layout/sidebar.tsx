"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen, GraduationCap, X } from "lucide-react";

import { navGroups } from "./nav-config";
import { useUI } from "@/store/ui";
import { useSettingsStore } from "@/store/settings";
import { cn } from "@/lib/utils";

export function Sidebar() {
  const { sidebarCollapsed, toggleSidebar, mobileNavOpen, setMobileNav, theme } = useUI();
  const { settings } = useSettingsStore();
  const pathname = usePathname();

  return (
    <>
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
          "fixed inset-y-0 left-0 z-50 flex flex-col border-r border-hairline bg-surface",
          "transition-[width,transform] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
          sidebarCollapsed ? "w-[72px]" : "w-64",
          mobileNavOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
      >
        {/* Brand */}
        <div className="flex h-16 items-center gap-2.5 border-b border-hairline px-4">
          {theme === "dark" && settings?.logoDark ? (
            <img src={settings.logoDark} alt="Logo" className="size-9 object-contain rounded-lg shrink-0" />
          ) : settings?.logo ? (
            <img src={settings.logo} alt="Logo" className="size-9 object-contain rounded-lg shrink-0" />
          ) : (
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-to-tr from-[#5b73e8] to-[#886cff] shadow-md shadow-accent/20 text-white animate-fade-in">
              <GraduationCap className="size-5" />
            </span>
          )}
          {!sidebarCollapsed && (
            <div className="min-w-0 flex-1 animate-fade-in">
              <p className="truncate text-base font-extrabold tracking-widest text-[#5b73e8] uppercase" style={{ color: "var(--accent)" }}>
                {settings?.websiteName || "Edumin"}
              </p>
              <p className="truncate text-[10px] font-bold text-ink-3 uppercase tracking-wider">
                {settings?.adminConsoleTitle || "Admin console"}
              </p>
            </div>
          )}
          <button
            onClick={() => setMobileNav(false)}
            className="ml-auto grid size-8 place-items-center rounded-lg text-ink-2 hover:bg-surface-2 lg:hidden"
            aria-label="Close navigation"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {navGroups.map((group) => (
            <div key={group.label} className="mb-5 last:mb-0">
              {!sidebarCollapsed && (
                <p className="mb-1.5 px-3 text-[10px] font-bold tracking-wider text-ink-3/80 dark:text-zinc-500 uppercase">
                  {group.label}
                </p>
              )}
              <ul className="space-y-1">
                {group.items.map((item) => {
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
                            ? "bg-accent-soft text-accent shadow-sm border border-accent/5"
                            : "text-ink-2 hover:bg-surface-2 hover:text-ink hover:translate-x-0.5",
                          sidebarCollapsed && "justify-center px-0 hover:translate-x-0",
                        )}
                      >
                        {active && (
                          <span className="absolute left-1.5 h-5 w-1 rounded-full bg-accent" />
                        )}
                        <Icon className={cn("size-4.5 shrink-0 transition-transform duration-200 group-hover:scale-110", active ? "text-accent" : "text-ink-3 group-hover:text-ink")} />
                        {!sidebarCollapsed && (
                          <>
                            <span className="truncate">{item.label}</span>
                            {item.badge && (
                              <span className="tnum ml-auto rounded-md bg-surface-3/50 dark:bg-zinc-800/80 px-1.5 py-0.5 text-[10px] font-bold text-ink-3 border border-hairline">
                                {item.badge}
                              </span>
                            )}
                          </>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* Collapse toggle — desktop only */}
        <div className="hidden border-t border-hairline p-3 lg:block">
          <button
            onClick={toggleSidebar}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink",
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
    </>
  );
}
