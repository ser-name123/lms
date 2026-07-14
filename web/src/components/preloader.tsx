"use client";

import { useEffect, useState } from "react";
import { useSettingsStore } from "@/store/settings";

export function Preloader() {
  const { settings, initialized } = useSettingsStore();
  const [visible, setVisible] = useState(true);
  const [shouldRender, setShouldRender] = useState(true);

  useEffect(() => {
    if (initialized) {
      // Fade out transition after settings load
      const timer = setTimeout(() => {
        setVisible(false);
        const removeTimer = setTimeout(() => setShouldRender(false), 300);
        return () => clearTimeout(removeTimer);
      }, 500); // 500ms delay for visual premium feel
      return () => clearTimeout(timer);
    }
  }, [initialized]);

  if (!shouldRender) return null;

  // If loader is explicitly disabled in settings, do not show it
  const loaderEnabled = settings?.loaderEnabled !== "false";
  if (!loaderEnabled) return null;

  const customLoaderUrl = settings?.loaderUrl;

  return (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center transition-opacity duration-300 ${
        visible ? "opacity-100" : "opacity-0 pointer-events-none"
      }`}
      style={{ backgroundColor: "var(--page, #09090b)" }}
    >
      <div className="flex flex-col items-center gap-4">
        {customLoaderUrl ? (
          <img
            src={customLoaderUrl}
            alt="Loading..."
            className="max-h-24 max-w-24 object-contain"
          />
        ) : (
          /* High-fidelity default SVG spinner matching dynamic accent variables */
          <div className="relative size-14 flex items-center justify-center">
            <div 
              className="absolute inset-0 rounded-full border-4 opacity-15"
              style={{ borderColor: "var(--accent, #5b73e8)" }}
            ></div>
            <div 
              className="absolute inset-0 rounded-full border-4 border-t-transparent animate-spin"
              style={{ borderLeftColor: "var(--accent, #5b73e8)", borderRightColor: "var(--accent, #5b73e8)", borderBottomColor: "var(--accent, #5b73e8)" }}
            ></div>
          </div>
        )}
        <p 
          className="text-[10px] font-bold tracking-widest uppercase animate-pulse"
          style={{ color: "var(--ink-3, #a1a1aa)" }}
        >
          Please wait
        </p>
      </div>
    </div>
  );
}
