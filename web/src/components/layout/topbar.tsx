"use client";

import { useEffect, useState } from "react";
import { Menu, Moon, Search, Sun, X } from "lucide-react";
import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";
import { useUI } from "@/store/ui";
import { UserMenu } from "./user-menu";
import { NotificationBell } from "./notification-bell";
import { GlobalSearch } from "./global-search";

export function Topbar({ title, subtitle }: { title: string; subtitle?: string }) {
  const { theme, toggleTheme, setMobileNav } = useUI();
  const pathname = usePathname();
  // The inline search is too wide for a phone, so below `md` it collapses to an
  // icon that swaps the whole bar for a full-width search row.
  const [mobileSearch, setMobileSearch] = useState(false);
  const [currentTime, setCurrentTime] = useState("");

  useEffect(() => {
    const isDashboard = pathname === "/dashboard" || pathname === "/teacher/dashboard" || pathname === "/student/dashboard";
    if (!isDashboard) return;

    const updateTime = () => {
      const d = new Date();
      setCurrentTime(
        d.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: true,
        })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [pathname]);

  const displaySubtitle = (() => {
    if (!subtitle) return undefined;
    const isDashboard = pathname === "/dashboard" || pathname === "/teacher/dashboard" || pathname === "/student/dashboard";
    if (isDashboard && currentTime) {
      return `${subtitle} · ${currentTime}`;
    }
    return subtitle;
  })();

  if (mobileSearch) {
    return (
      <header className="sticky top-0 z-30 flex min-h-[4.5rem] items-center gap-2 border-b border-hairline bg-surface/80 px-4 py-3 backdrop-blur-md md:hidden">
        <GlobalSearch autoFocus fullWidth />
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setMobileSearch(false)}
          aria-label="Close search"
          className="rounded-xl hover:bg-surface-2"
        >
          <X className="size-4.5 text-ink-2" />
        </Button>
      </header>
    );
  }

  return (
    <header className="sticky top-0 z-30 flex min-h-[4.5rem] py-3 items-center gap-3 border-b border-hairline bg-surface/80 px-4 backdrop-blur-md sm:px-6">
      <button
        onClick={() => setMobileNav(true)}
        className="grid size-9 place-items-center rounded-lg text-ink-2 hover:bg-surface-2 lg:hidden"
        aria-label="Open navigation"
      >
        <Menu className="size-5" />
      </button>

      <div className="min-w-0 flex flex-col justify-center">
        <span className="block truncate text-base font-extrabold tracking-tight text-ink leading-tight">{title}</span>
        {displaySubtitle && <span className="block truncate text-[11px] text-ink-3 font-semibold mt-1 leading-normal">{displaySubtitle}</span>}
      </div>

      {/* Search */}
      <div className="ml-auto hidden md:block">
        <GlobalSearch />
      </div>

      <div className="ml-auto flex items-center gap-1 md:ml-0">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setMobileSearch(true)}
          aria-label="Search"
          className="rounded-xl hover:bg-surface-2 md:hidden"
        >
          <Search className="size-4.5 text-ink-2" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
          className="rounded-xl hover:bg-surface-2 transition-all duration-200"
        >
          {theme === "light" ? <Moon className="size-4.5 text-ink-2" /> : <Sun className="size-4.5 text-ink-2" />}
        </Button>

        <NotificationBell />

        <UserMenu />
      </div>
    </header>
  );
}
