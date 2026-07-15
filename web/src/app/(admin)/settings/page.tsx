"use client";

import { useState, useEffect, useRef } from "react";
import { 
  Globe, 
  Palette, 
  Code2, 
  Upload, 
  Trash2, 
  CheckCircle2, 
  AlertCircle, 
  Loader2,
  Mail,
  Wifi,
  Image as ImageIcon
} from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { Button } from "@/components/ui/button";
import { fetchSystemSettings, saveSystemSettings, fetchSmtpConfig, saveSmtpConfig, ApiError } from "@/lib/api";
import { useSettingsStore } from "@/store/settings";
import { useAuth } from "@/store/auth";
import { ImageCropperModal } from "@/components/image-cropper";

type Tab = "brand" | "theme" | "scripts" | "smtp" | "loader";

export default function SettingsPage() {
  const { updateLocalSettings } = useSettingsStore();
  const [activeTab, setActiveTab] = useState<Tab>("brand");

  // Brand states
  const [websiteName, setWebsiteName] = useState("Edumin LMS");
  const [logo, setLogo] = useState<string | null>(null);
  const [logoDark, setLogoDark] = useState<string | null>(null);
  const [adminConsoleTitle, setAdminConsoleTitle] = useState("Admin console");
  const [favicon, setFavicon] = useState<string | null>(null);
  const [defaultTheme, setDefaultTheme] = useState("light");
  const [googleTags, setGoogleTags] = useState("");

  // Pre-loader States
  const [loaderEnabled, setLoaderEnabled] = useState("true");
  const [loaderUrl, setLoaderUrl] = useState<string | null>(null);

  // Cropper States
  const [cropperSrc, setCropperSrc] = useState<string | null>(null);
  const [cropperTarget, setCropperTarget] = useState<"logo" | "logoDark" | "favicon" | "loader" | null>(null);

  // Light Mode Color States
  const [primaryColor, setPrimaryColor] = useState("#133C55");
  const [accentTextLight, setAccentTextLight] = useState("#ffffff");
  const [pageBgLight, setPageBgLight] = useState("#f5f8fb");
  const [surfaceBgLight, setSurfaceBgLight] = useState("#ffffff");
  const [textPrimaryLight, setTextPrimaryLight] = useState("#13222e");
  const [textSecondaryLight, setTextSecondaryLight] = useState("#2c4251");
  const [textMutedLight, setTextMutedLight] = useState("#5c7b90");
  const [sidebarBgLight, setSidebarBgLight] = useState("#133C55");
  const [sidebarTextLight, setSidebarTextLight] = useState("#91E5F6");
  const [sidebarActiveBgLight, setSidebarActiveBgLight] = useState("rgba(56, 111, 164, 0.35)");
  const [sidebarActiveTextLight, setSidebarActiveTextLight] = useState("#ffffff");
  const [topbarBgLight, setTopbarBgLight] = useState("#ffffff");
  const [topbarBorderLight, setTopbarBorderLight] = useState("rgba(19, 60, 85, 0.08)");

  // Dark Mode Color States
  const [secondaryColor, setSecondaryColor] = useState("#6366f1");
  const [accentTextDark, setAccentTextDark] = useState("#ffffff");
  const [pageBgDark, setPageBgDark] = useState("#09090b");
  const [surfaceBgDark, setSurfaceBgDark] = useState("#18181b");
  const [textPrimaryDark, setTextPrimaryDark] = useState("#f4f4f5");
  const [textSecondaryDark, setTextSecondaryDark] = useState("#d4d4d8");
  const [textMutedDark, setTextMutedDark] = useState("#a1a1aa");
  const [sidebarBgDark, setSidebarBgDark] = useState("#18181b");
  const [sidebarTextDark, setSidebarTextDark] = useState("#d4d4d8");
  const [sidebarActiveBgDark, setSidebarActiveBgDark] = useState("rgba(99, 102, 241, 0.15)");
  const [sidebarActiveTextDark, setSidebarActiveTextDark] = useState("#6366f1");
  const [topbarBgDark, setTopbarBgDark] = useState("#18181b");
  const [topbarBorderDark, setTopbarBorderDark] = useState("rgba(255, 255, 255, 0.08)");

  // SMTP Configuration States
  const [smtpHost, setSmtpHost] = useState("smtp.gmail.com");
  const [smtpPort, setSmtpPort] = useState(587);
  const [smtpUser, setSmtpUser] = useState("objectsquarerajan@gmail.com");
  const [smtpPass, setSmtpPass] = useState("");
  const [smtpFrom, setSmtpFrom] = useState("objectsquarerajan@gmail.com");
  const [smtpSecure, setSmtpSecure] = useState(false);
  const [loadingSmtp, setLoadingSmtp] = useState(false);

  // SMTP Test States
  const [smtpTestEmail, setSmtpTestEmail] = useState("objectsquarerajan@gmail.com");
  const [smtpStatus, setSmtpStatus] = useState<"idle" | "testing" | "success" | "error">("idle");
  const [smtpErrorMsg, setSmtpErrorMsg] = useState("");

  // UI state
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const logoInputRef = useRef<HTMLInputElement>(null);
  const logoDarkInputRef = useRef<HTMLInputElement>(null);
  const faviconInputRef = useRef<HTMLInputElement>(null);
  const loaderInputRef = useRef<HTMLInputElement>(null);

  // Load current settings on mount
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const settings = await fetchSystemSettings();
        setWebsiteName(settings.websiteName);
        setLogo(settings.logo);
        setLogoDark(settings.logoDark);
        setAdminConsoleTitle(settings.adminConsoleTitle ?? "Admin console");
        setFavicon(settings.favicon);
        setDefaultTheme(settings.defaultTheme);
        setGoogleTags(settings.googleTags);
        setLoaderEnabled(settings.loaderEnabled ?? "true");
        setLoaderUrl(settings.loaderUrl);

        // Light Mode colors
        setPrimaryColor(settings.primaryColor);
        setAccentTextLight(settings.accentTextLight);
        setPageBgLight(settings.pageBgLight);
        setSurfaceBgLight(settings.surfaceBgLight);
        setTextPrimaryLight(settings.textPrimaryLight);
        setTextSecondaryLight(settings.textSecondaryLight);
        setTextMutedLight(settings.textMutedLight);
        setSidebarBgLight(settings.sidebarBgLight);
        setSidebarTextLight(settings.sidebarTextLight);
        setSidebarActiveBgLight(settings.sidebarActiveBgLight);
        setSidebarActiveTextLight(settings.sidebarActiveTextLight);
        setTopbarBgLight(settings.topbarBgLight);
        setTopbarBorderLight(settings.topbarBorderLight);

        // Dark Mode colors
        setSecondaryColor(settings.secondaryColor);
        setAccentTextDark(settings.accentTextDark);
        setPageBgDark(settings.pageBgDark);
        setSurfaceBgDark(settings.surfaceBgDark);
        setTextPrimaryDark(settings.textPrimaryDark);
        setTextSecondaryDark(settings.textSecondaryDark);
        setTextMutedDark(settings.textMutedDark);
        setSidebarBgDark(settings.sidebarBgDark);
        setSidebarTextDark(settings.sidebarTextDark);
        setSidebarActiveBgDark(settings.sidebarActiveBgDark);
        setSidebarActiveTextDark(settings.sidebarActiveTextDark);
        setTopbarBgDark(settings.topbarBgDark);
        setTopbarBorderDark(settings.topbarBorderDark);
      } catch (err) {
        console.error("Failed to load settings:", err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  // Load SMTP Config from database on selection
  const loadSmtpConfig = async () => {
    setLoadingSmtp(true);
    try {
      const cfg = await fetchSmtpConfig();
      setSmtpHost(cfg.host);
      setSmtpPort(cfg.port);
      setSmtpUser(cfg.user);
      setSmtpPass(cfg.pass || "");
      setSmtpFrom(cfg.from || cfg.user);
      setSmtpSecure(cfg.secure);
    } catch (err) {
      console.error("Failed to load SMTP config:", err);
    } finally {
      setLoadingSmtp(false);
    }
  };

  useEffect(() => {
    if (activeTab === "smtp") {
      loadSmtpConfig();
    }
  }, [activeTab]);

  // Handle Logo Upload (Base64 encoding)
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setStatus({ type: "error", message: "Logo file size exceeds 2MB limit." });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setCropperSrc(reader.result as string);
      setCropperTarget("logo");
    };
    reader.readAsDataURL(file);
  };

  const handleLogoDarkUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setStatus({ type: "error", message: "Logo file size exceeds 2MB limit." });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setCropperSrc(reader.result as string);
      setCropperTarget("logoDark");
    };
    reader.readAsDataURL(file);
  };

  // Handle Favicon Upload (Base64 encoding)
  const handleFaviconUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 500 * 1024) {
      setStatus({ type: "error", message: "Favicon file size exceeds 500KB limit." });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setCropperSrc(reader.result as string);
      setCropperTarget("favicon");
    };
    reader.readAsDataURL(file);
  };

  // Handle Loader Upload (Base64 encoding)
  const handleLoaderUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setStatus({ type: "error", message: "Loader file size exceeds 2MB limit." });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setCropperSrc(reader.result as string);
      setCropperTarget("loader");
    };
    reader.readAsDataURL(file);
  };

  // Reset colors to system defaults
  const handleResetColors = () => {
    // Reset Light Mode
    setPrimaryColor("#133C55");
    setAccentTextLight("#ffffff");
    setPageBgLight("#f5f8fb");
    setSurfaceBgLight("#ffffff");
    setTextPrimaryLight("#13222e");
    setTextSecondaryLight("#2c4251");
    setTextMutedLight("#5c7b90");
    setSidebarBgLight("#133C55");
    setSidebarTextLight("#91E5F6");
    setSidebarActiveBgLight("rgba(56, 111, 164, 0.35)");
    setSidebarActiveTextLight("#ffffff");
    setTopbarBgLight("#ffffff");
    setTopbarBorderLight("rgba(19, 60, 85, 0.08)");

    // Reset Dark Mode
    setSecondaryColor("#6366f1");
    setAccentTextDark("#ffffff");
    setPageBgDark("#09090b");
    setSurfaceBgDark("#18181b");
    setTextPrimaryDark("#f4f4f5");
    setTextSecondaryDark("#d4d4d8");
    setTextMutedDark("#a1a1aa");
    setSidebarBgDark("#18181b");
    setSidebarTextDark("#d4d4d8");
    setSidebarActiveBgDark("rgba(99, 102, 241, 0.15)");
    setSidebarActiveTextDark("#6366f1");
    setTopbarBgDark("#18181b");
    setTopbarBorderDark("rgba(255, 255, 255, 0.08)");
  };

  // Submit System Settings
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setStatus(null);

    const payload = {
      logo,
      logoDark,
      adminConsoleTitle,
      favicon,
      websiteName,
      defaultTheme,
      googleTags,
      loaderEnabled,
      loaderUrl,

      // Light Mode Color mappings
      primaryColor,
      accentTextLight,
      pageBgLight,
      surfaceBgLight,
      textPrimaryLight,
      textSecondaryLight,
      textMutedLight,
      sidebarBgLight,
      sidebarTextLight,
      sidebarActiveBgLight,
      sidebarActiveTextLight,
      topbarBgLight,
      topbarBorderLight,

      // Dark Mode Color mappings
      secondaryColor,
      accentTextDark,
      pageBgDark,
      surfaceBgDark,
      textPrimaryDark,
      textSecondaryDark,
      textMutedDark,
      sidebarBgDark,
      sidebarTextDark,
      sidebarActiveBgDark,
      sidebarActiveTextDark,
      topbarBgDark,
      topbarBorderDark,
    };

    try {
      await saveSystemSettings(payload);
      updateLocalSettings(payload);
      setStatus({ type: "success", message: "Website configurations updated successfully!" });
    } catch (err) {
      setStatus({
        type: "error",
        message: err instanceof ApiError ? err.message : "Failed to update configurations."
      });
    } finally {
      setBusy(false);
    }
  };

  // Save SMTP Settings
  const handleSaveSmtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setStatus(null);

    try {
      await saveSmtpConfig({
        host: smtpHost,
        port: smtpPort,
        user: smtpUser,
        pass: smtpPass,
        from: smtpFrom,
        secure: smtpSecure
      });
      setStatus({ type: "success", message: "SMTP configuration updated successfully!" });
    } catch (err) {
      setStatus({ 
        type: "error", 
        message: err instanceof ApiError ? err.message : "Failed to update SMTP configuration." 
      });
    } finally {
      setBusy(false);
    }
  };

  // Dispatch Diagnostic SMTP Connection Test
  const handleTestSmtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setSmtpStatus("testing");
    setSmtpErrorMsg("");

    try {
      const fd = new FormData();
      fd.append("to", smtpTestEmail);
      fd.append("subject", "Edumin SMTP Connection Test");
      fd.append("message", "Your SMTP transporter connection test is successful!");

      const accessToken = useAuth.getState().accessToken;
      const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000/api";

      const res = await fetch(`${apiBase}/emails/send`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: fd,
      });

      if (!res.ok) {
        throw new Error("Transporter rejected or failed connection.");
      }

      setSmtpStatus("success");
    } catch (err) {
      setSmtpStatus("error");
      setSmtpErrorMsg(err instanceof Error ? err.message : "Test dispatch failed.");
    }
  };

  return (
    <>
      <Topbar title="System Settings" subtitle="Configure and customize your website brand, colors, logo, and integration scripts" />

      <div className="animate-fade-up p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
        
        {/* Status Toast Alert */}
        {status && (
          <div className={`flex items-start gap-3 p-4 rounded-xl border animate-fade-in ${
            status.type === "success" 
              ? "bg-good/5 border-good/20 text-good-ink" 
              : "bg-critical/5 border-critical/20 text-critical"
          }`}>
            {status.type === "success" ? <CheckCircle2 className="size-5 shrink-0" /> : <AlertCircle className="size-5 shrink-0" />}
            <span className="text-sm font-semibold">{status.message}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">

          {/* Navigation Sidebar */}
          <div className="md:col-span-1 space-y-4">
            <div className="border border-hairline/80 rounded-2xl bg-surface p-1.5 shadow-sm space-y-1">
              <button
                onClick={() => { setActiveTab("brand"); setStatus(null); }}
                className={`flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-bold transition-all duration-200 ${
                  activeTab === "brand" 
                    ? "bg-accent text-white" 
                    : "text-ink-2 hover:bg-surface-2"
                }`}
              >
                <Globe className="size-4.5" />
                Brand & Metadata
              </button>
              <button
                onClick={() => { setActiveTab("theme"); setStatus(null); }}
                className={`flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-bold transition-all duration-200 ${
                  activeTab === "theme" 
                    ? "bg-accent text-white" 
                    : "text-ink-2 hover:bg-surface-2"
                }`}
              >
                <Palette className="size-4.5" />
                Color Schemes
              </button>
              <button
                onClick={() => { setActiveTab("smtp"); setStatus(null); }}
                className={`flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-bold transition-all duration-200 ${
                  activeTab === "smtp" 
                    ? "bg-accent text-white" 
                    : "text-ink-2 hover:bg-surface-2"
                }`}
              >
                <Mail className="size-4.5" />
                SMTP Transporter
              </button>
              <button
                onClick={() => { setActiveTab("scripts"); setStatus(null); }}
                className={`flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-bold transition-all duration-200 ${
                  activeTab === "scripts" 
                    ? "bg-accent text-white" 
                    : "text-ink-2 hover:bg-surface-2"
                }`}
              >
                <Code2 className="size-4.5" />
                Custom Head Scripts
              </button>
              <button
                onClick={() => { setActiveTab("loader"); setStatus(null); }}
                className={`flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-bold transition-all duration-200 ${
                  activeTab === "loader" 
                    ? "bg-accent text-white" 
                    : "text-ink-2 hover:bg-surface-2"
                }`}
              >
                <Loader2 className="size-4.5" />
                Pre-loader Screen
              </button>
            </div>
          </div>

          {/* Configuration Forms */}
          <div className="md:col-span-3">
            {loading ? (
              <div className="border border-hairline/80 rounded-3xl bg-surface p-12 text-center shadow-sm">
                <Loader2 className="size-8 animate-spin mx-auto text-ink-3" />
                <p className="text-sm font-bold text-ink-3 mt-3">Loading system configurations...</p>
              </div>
            ) : (
              <div className="space-y-6">

                {activeTab === "brand" && (
                  <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="border border-hairline/80 rounded-3xl bg-surface shadow-sm overflow-hidden animate-fade-in space-y-5 p-6">
                      <div className="border-b border-hairline pb-4 mb-4">
                        <h2 className="font-bold text-lg text-ink">Brand Identity Settings</h2>
                        <p className="text-xs text-ink-3 mt-0.5">Customize your brand name, administrative logo image, and browser favicon</p>
                      </div>

                      {/* Website Name & Admin Console Label */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-ink-3">Website Name</label>
                          <input
                            type="text"
                            required
                            value={websiteName}
                            onChange={(e) => setWebsiteName(e.target.value)}
                            placeholder="Edumin LMS"
                            className="h-11.5 w-full rounded-xl border border-hairline bg-surface px-4 text-sm text-ink focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent focus:shadow-[0_0_0_4px_rgba(19,60,85,0.12)] transition-all duration-200"
                          />
                        </div>
                        <div>
                          <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-ink-3">Admin Console Label</label>
                          <input
                            type="text"
                            required
                            value={adminConsoleTitle}
                            onChange={(e) => setAdminConsoleTitle(e.target.value)}
                            placeholder="Admin console"
                            className="h-11.5 w-full rounded-xl border border-hairline bg-surface px-4 text-sm text-ink focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent focus:shadow-[0_0_0_4px_rgba(19,60,85,0.12)] transition-all duration-200"
                          />
                        </div>
                      </div>

                      {/* Logo Upload */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
                        {/* Light Logo */}
                        <div className="border border-hairline/80 p-5 rounded-2xl bg-surface shadow-sm space-y-4">
                          <span className="block text-xs font-bold uppercase tracking-wider text-ink-3">Website Logo (Light)</span>
                          <div className="h-32 border border-dashed border-hairline rounded-xl grid place-items-center bg-surface-2/40 overflow-hidden relative group">
                            {logo ? (
                              <>
                                <img src={logo} alt="Logo Preview" className="h-full w-full object-contain p-2" />
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => setLogo(null)}
                                    className="p-2 bg-critical text-white rounded-lg hover:scale-105 transition-transform"
                                  >
                                    <Trash2 className="size-4" />
                                  </button>
                                </div>
                              </>
                            ) : (
                              <div className="text-center text-ink-3 space-y-1">
                                <ImageIcon className="size-8 mx-auto stroke-1" />
                                <span className="block text-xs">No Logo Uploaded</span>
                              </div>
                            )}
                          </div>
                          <input
                            type="file"
                            ref={logoInputRef}
                            onChange={handleLogoUpload}
                            accept="image/*"
                            className="hidden"
                          />
                          <Button
                            type="button"
                            onClick={() => logoInputRef.current?.click()}
                            className="w-full h-10 border border-hairline hover:bg-surface-2 rounded-xl text-ink-2 font-bold text-xs"
                          >
                            <Upload className="size-3.5 mr-1.5" />
                            Upload Logo (2MB max)
                          </Button>
                        </div>

                        {/* Dark Logo */}
                        <div className="border border-hairline/80 p-5 rounded-2xl bg-surface shadow-sm space-y-4">
                          <span className="block text-xs font-bold uppercase tracking-wider text-ink-3">Website Logo (Dark Theme)</span>
                          <div className="h-32 border border-dashed border-hairline rounded-xl grid place-items-center bg-zinc-950 overflow-hidden relative group">
                            {logoDark ? (
                              <>
                                <img src={logoDark} alt="Dark Logo Preview" className="h-full w-full object-contain p-2" />
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => setLogoDark(null)}
                                    className="p-2 bg-critical text-white rounded-lg hover:scale-105 transition-transform"
                                  >
                                    <Trash2 className="size-4" />
                                  </button>
                                </div>
                              </>
                            ) : (
                              <div className="text-center text-zinc-400 space-y-1">
                                <ImageIcon className="size-8 mx-auto stroke-1 text-zinc-500" />
                                <span className="block text-xs">No Logo Uploaded</span>
                              </div>
                            )}
                          </div>
                          <input
                            type="file"
                            ref={logoDarkInputRef}
                            onChange={handleLogoDarkUpload}
                            accept="image/*"
                            className="hidden"
                          />
                          <Button
                            type="button"
                            onClick={() => logoDarkInputRef.current?.click()}
                            className="w-full h-10 border border-hairline hover:bg-surface-2 rounded-xl text-ink-2 font-bold text-xs"
                          >
                            <Upload className="size-3.5 mr-1.5" />
                            Upload Logo (2MB max)
                          </Button>
                        </div>

                        {/* Favicon Upload */}
                        <div className="border border-hairline/80 p-5 rounded-2xl bg-surface shadow-sm space-y-4">
                          <span className="block text-xs font-bold uppercase tracking-wider text-ink-3">Browser Favicon</span>
                          <div className="h-32 border border-dashed border-hairline rounded-xl grid place-items-center bg-surface-2/40 overflow-hidden relative group">
                            {favicon ? (
                              <>
                                <img src={favicon} alt="Favicon Preview" className="size-16 object-contain" />
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => setFavicon(null)}
                                    className="p-2 bg-critical text-white rounded-lg hover:scale-105 transition-transform"
                                  >
                                    <Trash2 className="size-4" />
                                  </button>
                                </div>
                              </>
                            ) : (
                              <div className="text-center text-ink-3 space-y-1">
                                <Globe className="size-8 mx-auto stroke-1" />
                                <span className="block text-xs">No Favicon Uploaded</span>
                              </div>
                            )}
                          </div>
                          <input
                            type="file"
                            ref={faviconInputRef}
                            onChange={handleFaviconUpload}
                            accept="image/x-icon,image/png,image/jpeg"
                            className="hidden"
                          />
                          <Button
                            type="button"
                            onClick={() => faviconInputRef.current?.click()}
                            className="w-full h-10 border border-hairline hover:bg-surface-2 rounded-xl text-ink-2 font-bold text-xs"
                          >
                            <Upload className="size-3.5 mr-1.5" />
                            Upload Favicon (500KB max)
                          </Button>
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-end pt-2">
                      <Button
                        type="submit"
                        disabled={busy}
                        className="h-11 justify-center rounded-xl bg-gradient-to-r from-accent to-[#386FA4] font-bold text-white px-8 hover:shadow-[0_8px_20px_rgba(19,60,85,0.25)] transition-all duration-300"
                      >
                        {busy ? <Loader2 className="size-4 animate-spin mr-1.5" /> : null}
                        Save System Settings
                      </Button>
                    </div>
                  </form>
                )}

                {activeTab === "theme" && (
                  <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Default Mode Selector */}
                    <div className="border border-hairline/80 rounded-3xl bg-surface p-6 shadow-sm">
                      <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-ink-3">Default Theme Mode</label>
                      <select
                        value={defaultTheme}
                        onChange={(e) => setDefaultTheme(e.target.value)}
                        className="h-11.5 w-full rounded-xl border border-hairline bg-surface px-4 text-sm text-ink focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent focus:shadow-[0_0_0_4px_rgba(19,60,85,0.12)] transition-all duration-200"
                      >
                        <option value="light">Always Light Mode by Default</option>
                        <option value="dark">Always Dark Mode by Default</option>
                      </select>
                    </div>

                    {/* Light Mode Colors */}
                    <div className="border border-hairline/80 rounded-3xl bg-surface p-6 shadow-sm space-y-4">
                      <div className="border-b border-hairline pb-3 mb-2 flex items-center justify-between">
                        <div>
                          <h3 className="font-bold text-base text-ink">Light Mode Theme Colors</h3>
                          <p className="text-xs text-ink-3 mt-0.5">Customize color variables applied to default light interface</p>
                        </div>
                        <button
                          type="button"
                          onClick={handleResetColors}
                          className="text-xs text-accent hover:underline font-bold"
                        >
                          Reset to Defaults
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        
                        {/* Accent / Primary button color */}
                        <div className="flex items-center justify-between p-3 border border-hairline rounded-xl bg-surface-2/20">
                          <div>
                            <span className="block text-xs font-bold text-ink-2">Accent / Button Background</span>
                            <span className="text-[10px] text-ink-3 font-mono mt-0.5 block">{primaryColor}</span>
                          </div>
                          <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="size-9 rounded cursor-pointer border-0 bg-transparent" />
                        </div>

                        {/* Button Text Color */}
                        <div className="flex items-center justify-between p-3 border border-hairline rounded-xl bg-surface-2/20">
                          <div>
                            <span className="block text-xs font-bold text-ink-2">Button Text Color</span>
                            <span className="text-[10px] text-ink-3 font-mono mt-0.5 block">{accentTextLight}</span>
                          </div>
                          <input type="color" value={accentTextLight} onChange={(e) => setAccentTextLight(e.target.value)} className="size-9 rounded cursor-pointer border-0 bg-transparent" />
                        </div>

                        {/* Page Background */}
                        <div className="flex items-center justify-between p-3 border border-hairline rounded-xl bg-surface-2/20">
                          <div>
                            <span className="block text-xs font-bold text-ink-2">Page Background</span>
                            <span className="text-[10px] text-ink-3 font-mono mt-0.5 block">{pageBgLight}</span>
                          </div>
                          <input type="color" value={pageBgLight} onChange={(e) => setPageBgLight(e.target.value)} className="size-9 rounded cursor-pointer border-0 bg-transparent" />
                        </div>

                        {/* Surface Background */}
                        <div className="flex items-center justify-between p-3 border border-hairline rounded-xl bg-surface-2/20">
                          <div>
                            <span className="block text-xs font-bold text-ink-2">Cards & Surface Background</span>
                            <span className="text-[10px] text-ink-3 font-mono mt-0.5 block">{surfaceBgLight}</span>
                          </div>
                          <input type="color" value={surfaceBgLight} onChange={(e) => setSurfaceBgLight(e.target.value)} className="size-9 rounded cursor-pointer border-0 bg-transparent" />
                        </div>

                        {/* Text Colors */}
                        <div className="flex items-center justify-between p-3 border border-hairline rounded-xl bg-surface-2/20">
                          <div>
                            <span className="block text-xs font-bold text-ink-2">Text Primary Color</span>
                            <span className="text-[10px] text-ink-3 font-mono mt-0.5 block">{textPrimaryLight}</span>
                          </div>
                          <input type="color" value={textPrimaryLight} onChange={(e) => setTextPrimaryLight(e.target.value)} className="size-9 rounded cursor-pointer border-0 bg-transparent" />
                        </div>

                        <div className="flex items-center justify-between p-3 border border-hairline rounded-xl bg-surface-2/20">
                          <div>
                            <span className="block text-xs font-bold text-ink-2">Text Secondary Color</span>
                            <span className="text-[10px] text-ink-3 font-mono mt-0.5 block">{textSecondaryLight}</span>
                          </div>
                          <input type="color" value={textSecondaryLight} onChange={(e) => setTextSecondaryLight(e.target.value)} className="size-9 rounded cursor-pointer border-0 bg-transparent" />
                        </div>

                        <div className="flex items-center justify-between p-3 border border-hairline rounded-xl bg-surface-2/20">
                          <div>
                            <span className="block text-xs font-bold text-ink-2">Text Muted Color</span>
                            <span className="text-[10px] text-ink-3 font-mono mt-0.5 block">{textMutedLight}</span>
                          </div>
                          <input type="color" value={textMutedLight} onChange={(e) => setTextMutedLight(e.target.value)} className="size-9 rounded cursor-pointer border-0 bg-transparent" />
                        </div>

                        {/* Sidebar */}
                        <div className="flex items-center justify-between p-3 border border-hairline rounded-xl bg-surface-2/20">
                          <div>
                            <span className="block text-xs font-bold text-ink-2">Sidebar Background</span>
                            <span className="text-[10px] text-ink-3 font-mono mt-0.5 block">{sidebarBgLight}</span>
                          </div>
                          <input type="color" value={sidebarBgLight} onChange={(e) => setSidebarBgLight(e.target.value)} className="size-9 rounded cursor-pointer border-0 bg-transparent" />
                        </div>

                        <div className="flex items-center justify-between p-3 border border-hairline rounded-xl bg-surface-2/20">
                          <div>
                            <span className="block text-xs font-bold text-ink-2">Sidebar Text Color</span>
                            <span className="text-[10px] text-ink-3 font-mono mt-0.5 block">{sidebarTextLight}</span>
                          </div>
                          <input type="color" value={sidebarTextLight} onChange={(e) => setSidebarTextLight(e.target.value)} className="size-9 rounded cursor-pointer border-0 bg-transparent" />
                        </div>

                        <div className="flex items-center justify-between p-3 border border-hairline rounded-xl bg-surface-2/20">
                          <div>
                            <span className="block text-xs font-bold text-ink-2">Sidebar Active Menu Background</span>
                            <span className="text-[10px] text-ink-3 font-mono mt-0.5 block">{sidebarActiveBgLight}</span>
                          </div>
                          <input type="text" value={sidebarActiveBgLight} onChange={(e) => setSidebarActiveBgLight(e.target.value)} className="w-24 h-9 rounded bg-surface border border-hairline text-center text-xs text-ink focus:outline-none" />
                        </div>

                        <div className="flex items-center justify-between p-3 border border-hairline rounded-xl bg-surface-2/20">
                          <div>
                            <span className="block text-xs font-bold text-ink-2">Sidebar Active Menu Text</span>
                            <span className="text-[10px] text-ink-3 font-mono mt-0.5 block">{sidebarActiveTextLight}</span>
                          </div>
                          <input type="color" value={sidebarActiveTextLight} onChange={(e) => setSidebarActiveTextLight(e.target.value)} className="size-9 rounded cursor-pointer border-0 bg-transparent" />
                        </div>

                        {/* Topbar */}
                        <div className="flex items-center justify-between p-3 border border-hairline rounded-xl bg-surface-2/20">
                          <div>
                            <span className="block text-xs font-bold text-ink-2">Topbar Background</span>
                            <span className="text-[10px] text-ink-3 font-mono mt-0.5 block">{topbarBgLight}</span>
                          </div>
                          <input type="color" value={topbarBgLight} onChange={(e) => setTopbarBgLight(e.target.value)} className="size-9 rounded cursor-pointer border-0 bg-transparent" />
                        </div>

                        <div className="flex items-center justify-between p-3 border border-hairline rounded-xl bg-surface-2/20">
                          <div>
                            <span className="block text-xs font-bold text-ink-2">Topbar Borders & Lines</span>
                            <span className="text-[10px] text-ink-3 font-mono mt-0.5 block">{topbarBorderLight}</span>
                          </div>
                          <input type="text" value={topbarBorderLight} onChange={(e) => setTopbarBorderLight(e.target.value)} className="w-24 h-9 rounded bg-surface border border-hairline text-center text-xs text-ink focus:outline-none" />
                        </div>

                      </div>
                    </div>

                    {/* Dark Mode Colors */}
                    <div className="border border-hairline/80 rounded-3xl bg-surface p-6 shadow-sm space-y-4">
                      <div className="border-b border-hairline pb-3 mb-2 flex items-center justify-between">
                        <div>
                          <h3 className="font-bold text-base text-ink">Dark Mode Theme Colors</h3>
                          <p className="text-xs text-ink-3 mt-0.5">Customize color variables applied to dark interface themes</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        
                        {/* Accent / Secondary button color */}
                        <div className="flex items-center justify-between p-3 border border-hairline rounded-xl bg-surface-2/20">
                          <div>
                            <span className="block text-xs font-bold text-ink-2">Accent / Button Background</span>
                            <span className="text-[10px] text-ink-3 font-mono mt-0.5 block">{secondaryColor}</span>
                          </div>
                          <input type="color" value={secondaryColor} onChange={(e) => setSecondaryColor(e.target.value)} className="size-9 rounded cursor-pointer border-0 bg-transparent" />
                        </div>

                        {/* Button Text Color */}
                        <div className="flex items-center justify-between p-3 border border-hairline rounded-xl bg-surface-2/20">
                          <div>
                            <span className="block text-xs font-bold text-ink-2">Button Text Color</span>
                            <span className="text-[10px] text-ink-3 font-mono mt-0.5 block">{accentTextDark}</span>
                          </div>
                          <input type="color" value={accentTextDark} onChange={(e) => setAccentTextDark(e.target.value)} className="size-9 rounded cursor-pointer border-0 bg-transparent" />
                        </div>

                        {/* Page Background */}
                        <div className="flex items-center justify-between p-3 border border-hairline rounded-xl bg-surface-2/20">
                          <div>
                            <span className="block text-xs font-bold text-ink-2">Page Background</span>
                            <span className="text-[10px] text-ink-3 font-mono mt-0.5 block">{pageBgDark}</span>
                          </div>
                          <input type="color" value={pageBgDark} onChange={(e) => setPageBgDark(e.target.value)} className="size-9 rounded cursor-pointer border-0 bg-transparent" />
                        </div>

                        {/* Surface Background */}
                        <div className="flex items-center justify-between p-3 border border-hairline rounded-xl bg-surface-2/20">
                          <div>
                            <span className="block text-xs font-bold text-ink-2">Cards & Surface Background</span>
                            <span className="text-[10px] text-ink-3 font-mono mt-0.5 block">{surfaceBgDark}</span>
                          </div>
                          <input type="color" value={surfaceBgDark} onChange={(e) => setSurfaceBgDark(e.target.value)} className="size-9 rounded cursor-pointer border-0 bg-transparent" />
                        </div>

                        {/* Text Colors */}
                        <div className="flex items-center justify-between p-3 border border-hairline rounded-xl bg-surface-2/20">
                          <div>
                            <span className="block text-xs font-bold text-ink-2">Text Primary Color</span>
                            <span className="text-[10px] text-ink-3 font-mono mt-0.5 block">{textPrimaryDark}</span>
                          </div>
                          <input type="color" value={textPrimaryDark} onChange={(e) => setTextPrimaryDark(e.target.value)} className="size-9 rounded cursor-pointer border-0 bg-transparent" />
                        </div>

                        <div className="flex items-center justify-between p-3 border border-hairline rounded-xl bg-surface-2/20">
                          <div>
                            <span className="block text-xs font-bold text-ink-2">Text Secondary Color</span>
                            <span className="text-[10px] text-ink-3 font-mono mt-0.5 block">{textSecondaryDark}</span>
                          </div>
                          <input type="color" value={textSecondaryDark} onChange={(e) => setTextSecondaryDark(e.target.value)} className="size-9 rounded cursor-pointer border-0 bg-transparent" />
                        </div>

                        <div className="flex items-center justify-between p-3 border border-hairline rounded-xl bg-surface-2/20">
                          <div>
                            <span className="block text-xs font-bold text-ink-2">Text Muted Color</span>
                            <span className="text-[10px] text-ink-3 font-mono mt-0.5 block">{textMutedDark}</span>
                          </div>
                          <input type="color" value={textMutedDark} onChange={(e) => setTextMutedDark(e.target.value)} className="size-9 rounded cursor-pointer border-0 bg-transparent" />
                        </div>

                        {/* Sidebar */}
                        <div className="flex items-center justify-between p-3 border border-hairline rounded-xl bg-surface-2/20">
                          <div>
                            <span className="block text-xs font-bold text-ink-2">Sidebar Background</span>
                            <span className="text-[10px] text-ink-3 font-mono mt-0.5 block">{sidebarBgDark}</span>
                          </div>
                          <input type="color" value={sidebarBgDark} onChange={(e) => setSidebarBgDark(e.target.value)} className="size-9 rounded cursor-pointer border-0 bg-transparent" />
                        </div>

                        <div className="flex items-center justify-between p-3 border border-hairline rounded-xl bg-surface-2/20">
                          <div>
                            <span className="block text-xs font-bold text-ink-2">Sidebar Text Color</span>
                            <span className="text-[10px] text-ink-3 font-mono mt-0.5 block">{sidebarTextDark}</span>
                          </div>
                          <input type="color" value={sidebarTextDark} onChange={(e) => setSidebarTextDark(e.target.value)} className="size-9 rounded cursor-pointer border-0 bg-transparent" />
                        </div>

                        <div className="flex items-center justify-between p-3 border border-hairline rounded-xl bg-surface-2/20">
                          <div>
                            <span className="block text-xs font-bold text-ink-2">Sidebar Active Menu Background</span>
                            <span className="text-[10px] text-ink-3 font-mono mt-0.5 block">{sidebarActiveBgDark}</span>
                          </div>
                          <input type="text" value={sidebarActiveBgDark} onChange={(e) => setSidebarActiveBgDark(e.target.value)} className="w-24 h-9 rounded bg-surface border border-hairline text-center text-xs text-ink focus:outline-none" />
                        </div>

                        <div className="flex items-center justify-between p-3 border border-hairline rounded-xl bg-surface-2/20">
                          <div>
                            <span className="block text-xs font-bold text-ink-2">Sidebar Active Menu Text</span>
                            <span className="text-[10px] text-ink-3 font-mono mt-0.5 block">{sidebarActiveTextDark}</span>
                          </div>
                          <input type="color" value={sidebarActiveTextDark} onChange={(e) => setSidebarActiveTextDark(e.target.value)} className="size-9 rounded cursor-pointer border-0 bg-transparent" />
                        </div>

                        {/* Topbar */}
                        <div className="flex items-center justify-between p-3 border border-hairline rounded-xl bg-surface-2/20">
                          <div>
                            <span className="block text-xs font-bold text-ink-2">Topbar Background</span>
                            <span className="text-[10px] text-ink-3 font-mono mt-0.5 block">{topbarBgDark}</span>
                          </div>
                          <input type="color" value={topbarBgDark} onChange={(e) => setTopbarBgDark(e.target.value)} className="size-9 rounded cursor-pointer border-0 bg-transparent" />
                        </div>

                        <div className="flex items-center justify-between p-3 border border-hairline rounded-xl bg-surface-2/20">
                          <div>
                            <span className="block text-xs font-bold text-ink-2">Topbar Borders & Lines</span>
                            <span className="text-[10px] text-ink-3 font-mono mt-0.5 block">{topbarBorderDark}</span>
                          </div>
                          <input type="text" value={topbarBorderDark} onChange={(e) => setTopbarBorderDark(e.target.value)} className="w-24 h-9 rounded bg-surface border border-hairline text-center text-xs text-ink focus:outline-none" />
                        </div>

                      </div>
                    </div>

                    <div className="flex justify-end pt-2">
                      <Button
                        type="submit"
                        disabled={busy}
                        className="h-11 justify-center rounded-xl bg-gradient-to-r from-accent to-[#386FA4] font-bold text-white px-8 hover:shadow-[0_8px_20px_rgba(19,60,85,0.25)] transition-all duration-300"
                      >
                        {busy ? <Loader2 className="size-4 animate-spin mr-1.5" /> : null}
                        Save Theme Settings
                      </Button>
                    </div>
                  </form>
                )}

                {activeTab === "smtp" && (
                  <div className="space-y-6 animate-fade-in">
                    {/* SMTP Connection Card */}
                    <div className="border border-hairline/80 rounded-3xl bg-surface shadow-sm overflow-hidden">
                      <div className="border-b border-hairline px-6 py-5 flex items-center justify-between">
                        <div>
                          <h2 className="font-bold text-lg text-ink">SMTP Server Configuration</h2>
                          <p className="text-xs text-ink-3 mt-0.5">Edit and manage outgoing Gmail or Custom SMTP settings</p>
                        </div>
                        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-good/5 text-good border border-good/10 font-bold text-xs animate-pulse" suppressHydrationWarning>
                          <Wifi className="size-3.5" />
                          Connected
                        </div>
                      </div>
                      
                      {loadingSmtp ? (
                        <div className="flex justify-center items-center py-8 text-sm font-bold text-ink-3">
                          <Loader2 className="size-4 animate-spin mr-1.5" />
                          Loading configurations...
                        </div>
                      ) : (
                        <form onSubmit={handleSaveSmtp} className="p-6 space-y-5">
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-ink-3">SMTP Host</label>
                              <input
                                type="text"
                                required
                                value={smtpHost}
                                onChange={(e) => setSmtpHost(e.target.value)}
                                placeholder="smtp.gmail.com"
                                className="h-11.5 w-full rounded-xl border border-hairline bg-surface px-4 text-sm text-ink focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent focus:shadow-[0_0_0_4px_rgba(19,60,85,0.12)] transition-all duration-200"
                              />
                            </div>
                            <div>
                              <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-ink-3">SMTP Port</label>
                              <input
                                type="number"
                                required
                                value={smtpPort}
                                onChange={(e) => setSmtpPort(Number(e.target.value))}
                                placeholder="587"
                                className="h-11.5 w-full rounded-xl border border-hairline bg-surface px-4 text-sm text-ink focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent focus:shadow-[0_0_0_4px_rgba(19,60,85,0.12)] transition-all duration-200"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-ink-3">Sender Email</label>
                              <input
                                type="email"
                                required
                                value={smtpUser}
                                onChange={(e) => {
                                  setSmtpUser(e.target.value);
                                  if (smtpFrom === smtpUser) setSmtpFrom(e.target.value);
                                }}
                                placeholder="username@gmail.com"
                                className="h-11.5 w-full rounded-xl border border-hairline bg-surface px-4 text-sm text-ink focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent focus:shadow-[0_0_0_4px_rgba(19,60,85,0.12)] transition-all duration-200"
                              />
                            </div>
                            <div>
                              <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-ink-3">App Password</label>
                              <input
                                type="password"
                                required
                                value={smtpPass}
                                onChange={(e) => setSmtpPass(e.target.value)}
                                placeholder="••••••••"
                                className="h-11.5 w-full rounded-xl border border-hairline bg-surface px-4 text-sm text-ink focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent focus:shadow-[0_0_0_4px_rgba(19,60,85,0.12)] transition-all duration-200"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-4 items-center">
                            <div>
                              <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-ink-3">From Name / Identity</label>
                              <input
                                type="text"
                                required
                                value={smtpFrom}
                                onChange={(e) => setSmtpFrom(e.target.value)}
                                placeholder="objectsquarerajan@gmail.com"
                                className="h-11.5 w-full rounded-xl border border-hairline bg-surface px-4 text-sm text-ink focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent focus:shadow-[0_0_0_4px_rgba(19,60,85,0.12)] transition-all duration-200"
                              />
                            </div>
                            <div className="flex items-center gap-2 pt-6 pl-2">
                              <input
                                type="checkbox"
                                id="smtpSecure"
                                checked={smtpSecure}
                                onChange={(e) => setSmtpSecure(e.target.checked)}
                                className="size-4.5 rounded border-hairline text-accent focus:ring-accent"
                              />
                              <label htmlFor="smtpSecure" className="text-xs font-bold uppercase tracking-wider text-ink-2 select-none cursor-pointer">
                                Enable SSL/TLS (Secure)
                              </label>
                            </div>
                          </div>

                          <div className="flex justify-end pt-2 border-t border-hairline">
                            <Button
                              type="submit"
                              disabled={busy}
                              className="h-11 justify-center rounded-xl bg-gradient-to-r from-accent to-[#386FA4] font-bold text-white px-6 hover:shadow-[0_8px_20px_rgba(19,60,85,0.25)] transition-all duration-300"
                            >
                              {busy ? <Loader2 className="size-4 animate-spin mr-1.5" /> : null}
                              Save Config
                            </Button>
                          </div>
                        </form>
                      )}
                    </div>

                    {/* Connection Test Sandbox */}
                    <div className="border border-hairline/80 rounded-3xl bg-surface shadow-sm overflow-hidden">
                      <div className="border-b border-hairline px-6 py-5">
                        <h2 className="font-bold text-lg text-ink">SMTP Connection Diagnostic</h2>
                        <p className="text-xs text-ink-3 mt-0.5">Send a diagnostic verification code test message directly through active nodemailer SMTP</p>
                      </div>
                      <form onSubmit={handleTestSmtp} className="p-6 space-y-5">
                        <div>
                          <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-ink-3">Recipient Test Email</label>
                          <input
                            type="email"
                            required
                            value={smtpTestEmail}
                            onChange={(e) => setSmtpTestEmail(e.target.value)}
                            placeholder="test@example.com"
                            className="h-11.5 w-full rounded-xl border border-hairline bg-surface px-4 text-sm text-ink focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent focus:shadow-[0_0_0_4px_rgba(19,60,85,0.12)] transition-all duration-200"
                          />
                        </div>

                        {smtpStatus === "success" && (
                          <div className="flex items-start gap-3 p-3.5 rounded-xl border bg-good/5 border-good/20 text-good-ink">
                            <CheckCircle2 className="size-5 shrink-0" />
                            <div className="text-sm">
                              <p className="font-bold">SMTP Test Dispatch Succeeded!</p>
                              <p className="text-xs opacity-90 mt-0.5">Please check your inbox at {smtpTestEmail} for the test message.</p>
                            </div>
                          </div>
                        )}

                        {smtpStatus === "error" && (
                          <div className="flex items-start gap-3 p-3.5 rounded-xl border bg-critical/5 border-critical/20 text-critical">
                            <AlertCircle className="size-5 shrink-0" />
                            <div className="text-sm">
                              <p className="font-bold">Connection Diagnostics Failed</p>
                              <p className="text-xs opacity-90 mt-0.5">{smtpErrorMsg || "Nodemailer refused connection credentials."}</p>
                            </div>
                          </div>
                        )}

                        <div className="flex justify-end pt-1">
                          <Button
                            type="submit"
                            disabled={smtpStatus === "testing"}
                            className="h-11 justify-center rounded-xl bg-accent hover:bg-accent-hover font-bold text-white px-6 hover:shadow-[0_8px_20px_rgba(19,60,85,0.25)] transition-all duration-300"
                          >
                            {smtpStatus === "testing" ? <Loader2 className="size-4 animate-spin mr-1.5" /> : null}
                            Send Test Email
                          </Button>
                        </div>
                      </form>
                    </div>
                  </div>
                )}

                {activeTab === "scripts" && (
                  <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="border border-hairline/80 rounded-3xl bg-surface shadow-sm overflow-hidden animate-fade-in space-y-5 p-6">
                      <div className="border-b border-hairline pb-4 mb-4">
                        <h2 className="font-bold text-lg text-ink">Google Analytics & Scripts</h2>
                        <p className="text-xs text-ink-3 mt-0.5">Inject tracking tags, metrics code, or dynamic CSS modifications directly into header context</p>
                      </div>

                      <div>
                        <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-ink-3">Head HTML / Custom Scripts</label>
                        <textarea
                          rows={8}
                          value={googleTags}
                          onChange={(e) => setGoogleTags(e.target.value)}
                          placeholder="<!-- Global site tag (gtag.js) - Google Analytics -->&#10;<script async src='https://www.googletagmanager.com/gtag/js?id=UA-XXXXX'></script>"
                          className="w-full font-mono text-xs rounded-xl border border-hairline bg-surface p-4 text-ink focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent focus:shadow-[0_0_0_4px_rgba(19,60,85,0.12)] transition-all duration-200"
                        />
                        <p className="text-[10px] text-ink-3 mt-1.5 leading-relaxed">
                          Important: Add valid HTML tags (like <code>&lt;script&gt;</code>, <code>&lt;link&gt;</code>, or <code>&lt;style&gt;</code>). Broken elements could disrupt rendering parameters.
                        </p>
                      </div>
                    </div>

                    <div className="flex justify-end pt-2">
                      <Button
                        type="submit"
                        disabled={busy}
                        className="h-11 justify-center rounded-xl bg-gradient-to-r from-accent to-[#386FA4] font-bold text-white px-8 hover:shadow-[0_8px_20px_rgba(19,60,85,0.25)] transition-all duration-300"
                      >
                        {busy ? <Loader2 className="size-4 animate-spin mr-1.5" /> : null}
                        Save System Settings
                      </Button>
                    </div>
                  </form>
                )}

                {activeTab === "loader" && (
                  <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="border border-hairline/80 rounded-3xl bg-surface shadow-sm overflow-hidden animate-fade-in space-y-5 p-6">
                      <div className="border-b border-hairline pb-4 mb-4">
                        <h2 className="font-bold text-lg text-ink">Pre-loader Settings</h2>
                        <p className="text-xs text-ink-3 mt-0.5">Manage the website transition loading screen and loading animation</p>
                      </div>

                      {/* Enable Toggle */}
                      <div className="flex items-center justify-between p-4.5 bg-surface-2/40 border border-hairline rounded-2xl">
                        <div className="space-y-0.5">
                          <p className="text-sm font-bold text-ink">Enable Pre-loader Screen</p>
                          <p className="text-xs text-ink-3">Show an animated loading splash screen while fetching resources</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            className="sr-only peer"
                            checked={loaderEnabled === "true"}
                            onChange={(e) => setLoaderEnabled(e.target.checked ? "true" : "false")}
                          />
                          <div className="w-11 h-6 bg-surface-3 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent"></div>
                        </label>
                      </div>

                      {/* Loader Upload & Preview */}
                      <div className="border border-hairline/80 p-5 rounded-2xl bg-surface shadow-sm space-y-4">
                        <label className="block text-xs font-bold uppercase tracking-wider text-ink-3">Pre-loader Animation Image (GIF, SVG, or PNG)</label>
                        
                        <div className="flex flex-col sm:flex-row items-center gap-6">
                          {/* Live Preview box */}
                          <div className="size-32 rounded-2xl border border-hairline bg-surface-2/50 flex flex-col items-center justify-center overflow-hidden shrink-0">
                            {loaderUrl ? (
                              <img src={loaderUrl} alt="Custom loader preview" className="max-h-full max-w-full object-contain p-2" />
                            ) : (
                              <div className="flex flex-col items-center gap-1.5 p-2">
                                <svg className="animate-spin h-8 w-8 text-accent" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                <span className="text-[10px] font-bold text-ink-3 mt-1">Default Loader</span>
                              </div>
                            )}
                          </div>

                          <div className="space-y-3.5 w-full">
                            <input
                              type="file"
                              ref={loaderInputRef}
                              onChange={handleLoaderUpload}
                              accept="image/*"
                              className="hidden"
                            />
                            <div className="flex items-center gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="rounded-xl border-hairline cursor-pointer"
                                onClick={() => loaderInputRef.current?.click()}
                              >
                                <Upload className="size-4 mr-1.5" />
                                Upload Custom Loader
                              </Button>
                              {loaderUrl && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="rounded-xl text-critical hover:bg-critical/5 font-bold cursor-pointer"
                                  onClick={() => setLoaderUrl(null)}
                                >
                                  <Trash2 className="size-4 mr-1.5" />
                                  Reset to Default
                                </Button>
                              )}
                            </div>
                            <p className="text-[11px] text-ink-3">
                              Recommended file type: SVG or animated GIF. Maximum file size: 2MB.
                            </p>
                          </div>
                        </div>
                      </div>

                    </div>

                    <div className="flex justify-end pt-2">
                      <Button
                        type="submit"
                        disabled={busy}
                        className="h-11 justify-center rounded-xl bg-gradient-to-r from-accent to-[#386FA4] font-bold text-white px-8 hover:shadow-[0_8px_20px_rgba(19,60,85,0.25)] transition-all duration-300 cursor-pointer"
                      >
                        {busy ? <Loader2 className="size-4 animate-spin mr-1.5" /> : null}
                        Save System Settings
                      </Button>
                    </div>
                  </form>
                )}

              </div>
            )}
          </div>

        </div>

      </div>

      {cropperSrc && cropperTarget && (
        <ImageCropperModal
          imageSrc={cropperSrc}
          aspectRatio={cropperTarget === "logo" || cropperTarget === "logoDark" ? 3.5 / 1 : 1}
          onCrop={(cropped) => {
            if (cropperTarget === "logo") setLogo(cropped);
            if (cropperTarget === "logoDark") setLogoDark(cropped);
            if (cropperTarget === "favicon") setFavicon(cropped);
            if (cropperTarget === "loader") setLoaderUrl(cropped);
            setCropperSrc(null);
            setCropperTarget(null);
          }}
          onSkip={() => {
            if (cropperTarget === "logo") setLogo(cropperSrc);
            if (cropperTarget === "logoDark") setLogoDark(cropperSrc);
            if (cropperTarget === "favicon") setFavicon(cropperSrc);
            if (cropperTarget === "loader") setLoaderUrl(cropperSrc);
            setCropperSrc(null);
            setCropperTarget(null);
          }}
          onCancel={() => {
            setCropperSrc(null);
            setCropperTarget(null);
          }}
        />
      )}
    </>
  );
}
