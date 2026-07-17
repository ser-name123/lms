"use client";

import { Menu, Moon, Search, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useUI } from "@/store/ui";
import { UserMenu } from "./user-menu";
import { NotificationBell } from "./notification-bell";

export function Topbar({ title, subtitle }: { title: string; subtitle?: string }) {
  const { theme, toggleTheme, setMobileNav } = useUI();

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
        {subtitle && <span className="block truncate text-[11px] text-ink-3 font-semibold mt-1 leading-normal">{subtitle}</span>}
      </div>

      {/* Search */}
      <div className="ml-auto hidden md:block">
        <label className="relative block">
          <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-ink-3" />
          <input
            type="search"
            placeholder="Search..."
            className="h-10 w-64 rounded-full border-0 bg-surface-2 pr-4 pl-10 text-sm text-ink placeholder:text-ink-3 focus:bg-surface-2 focus:w-80 transition-all duration-300 focus:outline-none"
          />
        </label>
      </div>

      <div className="ml-auto flex items-center gap-1 md:ml-0">
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
