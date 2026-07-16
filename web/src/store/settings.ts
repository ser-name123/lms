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

  const formatPx = (val: string | undefined, fallback: string) => {
    if (!val) return fallback;
    const trimmed = val.trim();
    if (/^\d+$/.test(trimmed)) return trimmed + "px";
    return trimmed;
  };

  // 0. Inject Google Fonts Dynamically
  const fontsToLoad = new Set<string>();
  if (settings.primaryFontFamily) fontsToLoad.add(settings.primaryFontFamily);
  if (settings.secondaryFontFamily) fontsToLoad.add(settings.secondaryFontFamily);
  
  const getGoogleFontName = (val: string) => {
    if (!val || val === 'primary' || val === 'secondary') return null;
    return val;
  };
  
  [
    settings.h1FontFamily,
    settings.h2FontFamily,
    settings.h3FontFamily,
    settings.h4FontFamily,
    settings.h5FontFamily,
    settings.pFontFamily
  ].forEach(f => {
    const name = getGoogleFontName(f || '');
    if (name) fontsToLoad.add(name);
  });

  let fontsLinkTag = document.getElementById("dynamic-google-fonts") as HTMLLinkElement;
  if (fontsToLoad.size > 0) {
    if (!fontsLinkTag) {
      fontsLinkTag = document.createElement("link");
      fontsLinkTag.id = "dynamic-google-fonts";
      fontsLinkTag.rel = "stylesheet";
      document.head.appendChild(fontsLinkTag);
    }
    const fontQuery = Array.from(fontsToLoad)
      .map(font => `family=${font.replace(/\s+/g, "+")}:wght@100;200;300;400;500;600;700;800;900`)
      .join("&");
    fontsLinkTag.href = `https://fonts.googleapis.com/css2?${fontQuery}&display=swap`;
  } else {
    if (fontsLinkTag) {
      fontsLinkTag.remove();
    }
  }

  // 1. Inject Favicon Link
  const faviconUrl = settings.favicon || "/favicon.ico";
  const favicons = document.querySelectorAll("link[rel='icon'], link[rel='shortcut icon']");
  if (favicons.length > 0) {
    favicons.forEach((fav) => {
      (fav as HTMLLinkElement).href = faviconUrl;
    });
  } else {
    const link = document.createElement("link");
    link.rel = "icon";
    link.href = faviconUrl;
    document.head.appendChild(link);
  }

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

      --font-primary: '${settings.primaryFontFamily || "Outfit"}', system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
      --font-secondary: '${settings.secondaryFontFamily || "Inter"}', system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
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
    
    body {
      font-family: var(--font-primary) !important;
    }

    h1 {
      font-family: ${settings.h1FontFamily === 'secondary' ? 'var(--font-secondary)' : settings.h1FontFamily === 'primary' || !settings.h1FontFamily ? 'var(--font-primary)' : `'${settings.h1FontFamily}', system-ui, sans-serif`} !important;
      font-size: ${formatPx(settings.h1FontSize, '32px')};
      font-weight: ${settings.h1FontWeight || '700'};
    }

    h2 {
      font-family: ${settings.h2FontFamily === 'secondary' ? 'var(--font-secondary)' : settings.h2FontFamily === 'primary' || !settings.h2FontFamily ? 'var(--font-primary)' : `'${settings.h2FontFamily}', system-ui, sans-serif`} !important;
      font-size: ${formatPx(settings.h2FontSize, '24px')};
      font-weight: ${settings.h2FontWeight || '700'};
    }

    h3 {
      font-family: ${settings.h3FontFamily === 'secondary' ? 'var(--font-secondary)' : settings.h3FontFamily === 'primary' || !settings.h3FontFamily ? 'var(--font-primary)' : `'${settings.h3FontFamily}', system-ui, sans-serif`} !important;
      font-size: ${formatPx(settings.h3FontSize, '20px')};
      font-weight: ${settings.h3FontWeight || '600'};
    }

    h4 {
      font-family: ${settings.h4FontFamily === 'secondary' ? 'var(--font-secondary)' : settings.h4FontFamily === 'primary' || !settings.h4FontFamily ? 'var(--font-primary)' : `'${settings.h4FontFamily}', system-ui, sans-serif`} !important;
      font-size: ${formatPx(settings.h4FontSize, '18px')};
      font-weight: ${settings.h4FontWeight || '600'};
    }

    h5 {
      font-family: ${settings.h5FontFamily === 'secondary' ? 'var(--font-secondary)' : settings.h5FontFamily === 'primary' || !settings.h5FontFamily ? 'var(--font-primary)' : `'${settings.h5FontFamily}', system-ui, sans-serif`} !important;
      font-size: ${formatPx(settings.h5FontSize, '16px')};
      font-weight: ${settings.h5FontWeight || '600'};
    }

    p {
      font-family: ${settings.pFontFamily === 'primary' ? 'var(--font-primary)' : settings.pFontFamily === 'secondary' || !settings.pFontFamily ? 'var(--font-secondary)' : `'${settings.pFontFamily}', system-ui, sans-serif`} !important;
      font-size: ${formatPx(settings.pFontSize, '14px')};
      font-weight: ${settings.pFontWeight || '400'};
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
