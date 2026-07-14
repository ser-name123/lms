"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Theme = "light" | "dark";

type UIState = {
  theme: Theme;
  sidebarCollapsed: boolean;
  mobileNavOpen: boolean;
  commandOpen: boolean;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
  toggleSidebar: () => void;
  setMobileNav: (open: boolean) => void;
  setCommandOpen: (open: boolean) => void;
};

export const useUI = create<UIState>()(
  persist(
    (set, get) => ({
      theme: "light",
      sidebarCollapsed: false,
      mobileNavOpen: false,
      commandOpen: false,
      setTheme: (theme) => {
        applyTheme(theme);
        set({ theme });
      },
      toggleTheme: () => get().setTheme(get().theme === "light" ? "dark" : "light"),
      toggleSidebar: () => set({ sidebarCollapsed: !get().sidebarCollapsed }),
      setMobileNav: (mobileNavOpen) => set({ mobileNavOpen }),
      setCommandOpen: (commandOpen) => set({ commandOpen }),
    }),
    {
      name: "lms-ui",
      partialize: (s) => ({ theme: s.theme, sidebarCollapsed: s.sidebarCollapsed }),
      onRehydrateStorage: () => (state) => {
        if (state) applyTheme(state.theme);
      },
    },
  ),
);

function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
}
