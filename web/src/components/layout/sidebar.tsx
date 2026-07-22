"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  Radio,
  PanelLeftClose,
  PanelLeftOpen,
  GraduationCap,
  X,
  ChevronDown,
  ChevronRight,
  LayoutDashboard,
  Sparkles,
  CalendarDays,
  ClipboardList,
  Users,
  MessageCircle,
  Megaphone,
  HelpCircle,
  ClipboardCheck,
  TrendingUp,
  BookOpen,
  Package,
  type LucideIcon,
} from "lucide-react";

import { navGroups, type NavItem } from "./nav-config";
import { useUI } from "@/store/ui";
import { useSettingsStore } from "@/store/settings";
import { useAuth } from "@/store/auth";
import { cn } from "@/lib/utils";

function SidebarItem({
  item,
  pathname,
  sidebarCollapsed,
  setMobileNav,
}: {
  item: NavItem;
  pathname: string;
  sidebarCollapsed: boolean;
  setMobileNav: (open: boolean) => void;
}) {
  const hasActiveChild = item.children?.some(
    (child) => pathname === child.href || pathname.startsWith(`${child.href}/`)
  );
  
  const [isOpen, setIsOpen] = useState(hasActiveChild);

  // Synchronize submenu open state with active route and sidebar collapsed state
  useEffect(() => {
    if (sidebarCollapsed) {
      setIsOpen(false);
    } else {
      setIsOpen(hasActiveChild);
    }
  }, [pathname, hasActiveChild, sidebarCollapsed]);

  const Icon = item.icon;

  if (item.children) {
    const active = hasActiveChild;
    return (
      <li>
        <button
          onClick={() => {
            if (!sidebarCollapsed) {
              setIsOpen(!isOpen);
            }
          }}
          title={sidebarCollapsed ? item.label : undefined}
          className={cn(
            "group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 text-left",
            active
              ? "bg-sidebar-active/20 text-white shadow-sm border border-white/5"
              : "text-sidebar-text hover:bg-sidebar-active/30 hover:text-white hover:translate-x-0.5",
            sidebarCollapsed && "justify-center px-0 hover:translate-x-0"
          )}
        >
          {active && (
            <span className="absolute left-1.5 h-5 w-1 rounded-full bg-white/40" />
          )}
          <Icon
            className={cn(
              "size-4.5 shrink-0 transition-transform duration-200 group-hover:scale-110",
              active ? "text-white" : "text-sidebar-text/80 group-hover:text-white"
            )}
          />
          {!sidebarCollapsed && (
            <>
              <span className="truncate">{item.label}</span>
              <span className="ml-auto text-sidebar-text/60 group-hover:text-white">
                {isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
              </span>
            </>
          )}
        </button>

        {/* Collapsible Children */}
        {isOpen && !sidebarCollapsed && (
          <ul className="mt-1 ml-4 pl-3.5 border-l border-sidebar-border/60 space-y-1 animate-fade-in">
            {item.children.map((child) => {
              const childActive = pathname === child.href || pathname.startsWith(`${child.href}/`);
              const ChildIcon = child.icon;

              return (
                <li key={child.href}>
                  <Link
                    href={child.href}
                    onClick={() => setMobileNav(false)}
                    className={cn(
                      "group flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium transition-all duration-200",
                      childActive
                        ? "bg-sidebar-active text-white font-semibold"
                        : "text-sidebar-text/85 hover:bg-sidebar-active/20 hover:text-white"
                    )}
                  >
                    <ChildIcon className={cn("size-3.5 shrink-0 transition-transform duration-200 group-hover:scale-110", childActive ? "text-white" : "text-sidebar-text/60 group-hover:text-white")} />
                    <span className="truncate">{child.label}</span>
                    {child.badge && (
                      <span className="tnum ml-auto rounded-md bg-sidebar-active/50 px-1 py-0.5 text-[9px] font-bold text-white border border-sidebar-border">
                        {child.badge}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </li>
    );
  }

  const active = item.href ? (pathname === item.href || pathname.startsWith(`${item.href}/`)) : false;
  return (
    <li>
      <Link
        href={item.href || "#"}
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
        {!sidebarCollapsed && (
          <>
            <span className="truncate">{item.label}</span>
            {item.badge && (
              <span className="tnum ml-auto rounded-md bg-sidebar-active/50 px-1.5 py-0.5 text-[10px] font-bold text-white border border-sidebar-border">
                {item.badge}
              </span>
            )}
          </>
        )}
      </Link>
    </li>
  );
}

export function Sidebar() {
  const { sidebarCollapsed, toggleSidebar, mobileNavOpen, setMobileNav, theme } = useUI();
  const { settings } = useSettingsStore();
  const { user } = useAuth();
  const pathname = usePathname();

  const coachNavItems = [
    { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    // /notifications lives in its own route group, so the admin prefix
    // allowlists above do not gate it — every role reaches its own inbox.
    { label: "Notifications", href: "/notifications", icon: Bell },
    { label: "Trial Classes", href: "/leads", icon: Sparkles },
    // The coach list is a hand-written duplicate of navGroups, not a filter
    // over it, so anything added for admins has to be added here too or a coach
    // simply never sees it. This is one they decide, so it belongs in both.
    { label: "Subscription Requests", href: "/subscription-requests", icon: ClipboardList },
    { label: "Manage Students", href: "/students", icon: Users },
    { label: "Progress Tracking", href: "/students/progress", icon: TrendingUp },
    { label: "Manage Teachers", href: "/teachers", icon: GraduationCap },
    // The coach runs the curriculum, and both of these feed the decisions they
    // already make: which course a student is enrolled on, and which package
    // they sit on when a change is approved.
    { label: "Courses", href: "/courses", icon: BookOpen },
    { label: "Packages", href: "/packages", icon: Package },
    {
      label: "Schedule",
      icon: CalendarDays,
      children: [
        { label: "Classes", href: "/classes", icon: CalendarDays },
        { label: "Meetings", href: "/meetings", icon: Users },
        { label: "Attendance", href: "/attendance", icon: ClipboardCheck },
      ],
    },
    { label: "Messages", href: "/chat", icon: MessageCircle },
    { label: "Support", href: "/support", icon: HelpCircle },
  ];

  // Flat list, so the grouping the admin sidebar uses is not available here —
  // the labels and icons have to carry the distinction on their own. "My
  // Notifications" is this user's inbox; the other two are tools for sending.
  const supervisorNavItems = [
    { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { label: "My Notifications", href: "/notifications", icon: Bell },
    { label: "Announcements", href: "/announcements", icon: Megaphone },
    { label: "Notification Centre", href: "/notification-management", icon: Radio },
    { label: "Recruitment", href: "/recruitment", icon: Users },
    { label: "Meeting & Training", href: "/meetings", icon: ClipboardList },
    { label: "Teachers", href: "/teachers", icon: GraduationCap },
    { label: "Messages", href: "/chat", icon: MessageCircle },
    { label: "Support", href: "/support", icon: HelpCircle },
  ];

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
          "fixed inset-y-0 left-0 z-50 flex flex-col border-r border-sidebar-border bg-sidebar text-sidebar-text",
          "transition-[width,transform] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
          sidebarCollapsed ? "w-[72px]" : "w-64",
          mobileNavOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
      >
        {/* Brand */}
        <div className="flex h-16 items-center gap-2.5 border-b border-sidebar-border px-4">
          {theme === "dark" && settings?.logoDark ? (
            <img src={settings.logoDark} alt="Logo" className="size-11 object-contain rounded-lg shrink-0 bg-white p-1" />
          ) : settings?.logo ? (
            <img src={settings.logo} alt="Logo" className="size-11 object-contain rounded-lg shrink-0 bg-white p-1" />
          ) : (
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-gradient-to-tr from-accent to-[#59A5D8] shadow-md shadow-accent/20 text-white animate-fade-in">
              <GraduationCap className="size-6" />
            </span>
          )}
          {!sidebarCollapsed && (
            <div className="min-w-0 flex-1 animate-fade-in">
              <p className="truncate text-base font-extrabold tracking-widest text-white uppercase">
                {settings?.websiteName || "AL FURQAN"}
              </p>
              <p className="truncate text-[10px] font-bold text-sidebar-text/70 uppercase tracking-wider">
                {user?.role === "ACADEMIC_COACH"
                  ? "COACH CONSOLE"
                  : user?.role === "SUPERVISOR"
                  ? "SUPERVISOR CONSOLE"
                  : (settings?.adminConsoleTitle || "Admin console")}
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

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {user?.role === "ACADEMIC_COACH" ? (
            <ul className="space-y-1">
              {coachNavItems.map((item) => (
                <SidebarItem
                  key={item.href || item.label}
                  item={item}
                  pathname={pathname}
                  sidebarCollapsed={sidebarCollapsed}
                  setMobileNav={setMobileNav}
                />
              ))}
            </ul>
          ) : user?.role === "SUPERVISOR" ? (
            <ul className="space-y-1">
              {supervisorNavItems.map((item) => (
                <SidebarItem
                  key={item.href || item.label}
                  item={item}
                  pathname={pathname}
                  sidebarCollapsed={sidebarCollapsed}
                  setMobileNav={setMobileNav}
                />
              ))}
            </ul>
          ) : (
            navGroups.map((group) => (
              <div key={group.label} className="mb-5 last:mb-0">
                {!sidebarCollapsed && (
                  <p className="mb-1.5 px-3 text-[10px] font-bold tracking-wider text-sidebar-text/60 uppercase">
                    {group.label}
                  </p>
                )}
                <ul className="space-y-1">
                  {group.items.map((item) => (
                    <SidebarItem
                      key={item.href || item.label}
                      item={item}
                      pathname={pathname}
                      sidebarCollapsed={sidebarCollapsed}
                      setMobileNav={setMobileNav}
                    />
                  ))}
                </ul>
              </div>
            ))
          )}
        </nav>

        {/* Collapse toggle — desktop only */}
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
    </>
  );
}
