"use client";

import { Sidebar } from "./sidebar";
import { useUI } from "@/store/ui";
import { cn } from "@/lib/utils";

export function AdminShell({ children }: { children: React.ReactNode }) {
  const sidebarCollapsed = useUI((s) => s.sidebarCollapsed);

  return (
    <div className="min-h-screen bg-gradient-to-br from-page to-surface-2/20">
      <Sidebar />
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
