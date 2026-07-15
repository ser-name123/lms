"use client";

import { create } from "zustand";
import { fetchSystemSettings, SystemSettings } from "@/lib/api";

type SettingsState = {
  settings: SystemSettings | null;
  loading: boolean;
  initialized: boolean;
  loadSettings: () => Promise<void>;
  updateLocalSettings: (settings: SystemSettings) => void;
};

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: null,
  loading: false,
  initialized: false,
  loadSettings: async () => {
    set({ loading: true });
    try {
      const settings = await fetchSystemSettings();
      set({ settings, initialized: true });
      applyDynamicStyles(settings);
    } catch (err) {
      console.error("Failed to load website settings:", err);
    } finally {
      set({ loading: false });
    }
  },
  updateLocalSettings: (settings) => {
    set({ settings });
    applyDynamicStyles(settings);
  },
}));

function applyDynamicStyles(settings: SystemSettings) {
  if (typeof window === "undefined") return;

  // 1. Inject Favicon Link
  let faviconLink = document.querySelector("link[rel='icon']") as HTMLLinkElement;
  if (!faviconLink) {
    faviconLink = document.createElement("link");
    faviconLink.rel = "icon";
    document.head.appendChild(faviconLink);
  }
  faviconLink.href = settings.favicon || "/favicon.ico";

  // 2. Inject Dynamic CSS Variables for Brand Theme
  let customStyleTag = document.getElementById("dynamic-theme-vars") as HTMLStyleElement;
  if (!customStyleTag) {
    customStyleTag = document.createElement("style");
    customStyleTag.id = "dynamic-theme-vars";
    document.head.appendChild(customStyleTag);
  }

  // Helper to convert hex to rgba
  const hexToRgba = (hex: string, alpha: number) => {
    if (!hex || !hex.startsWith("#")) return hex;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  // Helper to adjust color brightness for gradients
  const adjustColorBrightness = (hex: string, percent: number) => {
    if (!hex || !hex.startsWith("#")) return hex;
    let R = parseInt(hex.substring(1, 3), 16);
    let G = parseInt(hex.substring(3, 5), 16);
    let B = parseInt(hex.substring(5, 7), 16);

    R = Math.min(255, Math.max(0, R + percent));
    G = Math.min(255, Math.max(0, G + percent));
    B = Math.min(255, Math.max(0, B + percent));

    const rHex = R.toString(16).padStart(2, '0');
    const gHex = G.toString(16).padStart(2, '0');
    const bHex = B.toString(16).padStart(2, '0');

    return `#${rHex}${gHex}${bHex}`;
  };

  customStyleTag.innerHTML = `
    :root {
      --accent: ${settings.primaryColor} !important;
      --accent-soft: ${hexToRgba(settings.primaryColor, 0.08)} !important;
      --accent-ink: ${settings.accentTextLight} !important;
      
      --page: ${settings.pageBgLight} !important;
      --surface: ${settings.surfaceBgLight} !important;
      
      --ink: ${settings.textPrimaryLight} !important;
      --ink-2: ${settings.textSecondaryLight} !important;
      --ink-3: ${settings.textMutedLight} !important;
      --border: ${settings.topbarBorderLight} !important;
    }
    
    .dark {
      --accent: ${settings.secondaryColor} !important;
      --accent-soft: ${hexToRgba(settings.secondaryColor, 0.15)} !important;
      --accent-ink: ${settings.accentTextDark} !important;
      
      --page: ${settings.pageBgDark} !important;
      --surface: ${settings.surfaceBgDark} !important;
      
      --ink: ${settings.textPrimaryDark} !important;
      --ink-2: ${settings.textSecondaryDark} !important;
      --ink-3: ${settings.textMutedDark} !important;
      --border: ${settings.topbarBorderDark} !important;
    }
    
    /* Global Sidebar Style Overrides */
    aside {
      background: linear-gradient(180deg, ${settings.sidebarBgLight} 0%, ${adjustColorBrightness(settings.sidebarBgLight, 25)} 100%) !important;
      border-right-color: ${settings.topbarBorderLight} !important;
    }
    aside p, aside span, aside svg, aside a, aside button {
      color: ${settings.sidebarTextLight} !important;
    }
    aside a:hover, aside button:hover {
      background-color: ${hexToRgba(settings.sidebarTextLight, 0.08)} !important;
    }
    aside a[href].bg-accent-soft, aside a[href].text-accent, aside .bg-accent-soft {
      background: linear-gradient(90deg, ${settings.sidebarActiveBgLight} 0%, ${hexToRgba(settings.sidebarActiveBgLight, 0.55)} 100%) !important;
      color: ${settings.sidebarActiveTextLight} !important;
    }
    aside a[href].bg-accent-soft *, aside a[href].text-accent *, aside .bg-accent-soft * {
      color: ${settings.sidebarActiveTextLight} !important;
    }
    
    .dark aside {
      background: linear-gradient(180deg, ${settings.sidebarBgDark} 0%, ${adjustColorBrightness(settings.sidebarBgDark, -15)} 100%) !important;
      border-right-color: ${settings.topbarBorderDark} !important;
    }
    .dark aside p, .dark aside span, .dark aside svg, .dark aside a, .dark aside button {
      color: ${settings.sidebarTextDark} !important;
    }
    .dark aside a:hover, .dark aside button:hover {
      background-color: ${hexToRgba(settings.sidebarTextDark, 0.08)} !important;
    }
    .dark aside a[href].bg-accent-soft, .dark aside a[href].text-accent, .dark aside .bg-accent-soft {
      background: linear-gradient(90deg, ${settings.sidebarActiveBgDark} 0%, ${hexToRgba(settings.sidebarActiveBgDark, 0.5)} 100%) !important;
      color: ${settings.sidebarActiveTextDark} !important;
    }
    .dark aside a[href].bg-accent-soft *, .dark aside a[href].text-accent *, .dark aside .bg-accent-soft * {
      color: ${settings.sidebarActiveTextDark} !important;
    }

    /* Global Topbar Style Overrides */
    header {
      background-color: ${settings.topbarBgLight} !important;
      border-bottom-color: ${settings.topbarBorderLight} !important;
    }
    header h1, header p, header svg, header button, header span {
      color: ${settings.textPrimaryLight} !important;
    }
    
    .dark header {
      background-color: ${settings.topbarBgDark} !important;
      border-bottom-color: ${settings.topbarBorderDark} !important;
    }
    .dark header h1, .dark header p, .dark header svg, .dark header button, .dark header span {
      color: ${settings.textPrimaryDark} !important;
    }
  `;

  // 3. Inject Google Head Tags / Custom Scripts
  let googleTagsContainer = document.getElementById("dynamic-google-tags");
  if (!googleTagsContainer) {
    googleTagsContainer = document.createElement("div");
    googleTagsContainer.id = "dynamic-google-tags";
    googleTagsContainer.style.display = "none";
    document.body.appendChild(googleTagsContainer);
  }

  googleTagsContainer.innerHTML = settings.googleTags || "";
  
  const scripts = googleTagsContainer.querySelectorAll("script");
  scripts.forEach((oldScript) => {
    const newScript = document.createElement("script");
    Array.from(oldScript.attributes).forEach((attr) => {
      newScript.setAttribute(attr.name, attr.value);
    });
    if (oldScript.innerHTML) {
      newScript.innerHTML = oldScript.innerHTML;
    }
    document.head.appendChild(newScript);
    oldScript.remove();
  });
}
