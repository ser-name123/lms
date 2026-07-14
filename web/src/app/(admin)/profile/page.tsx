"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { 
  User, 
  Key, 
  Laptop, 
  Smartphone, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Upload,
  X
} from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/store/auth";
import { updateProfile, fetchMe, fetchSessions, deleteSession, revokeSession, ApiError } from "@/lib/api";
import { initials } from "@/lib/utils";
import { ImageCropperModal } from "@/components/image-cropper";

type Tab = "profile" | "security";

export default function ProfilePage() {
  const router = useRouter();
  const { user, accessToken, refreshToken, setSession, clear } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("profile");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Profile Form States
  const [firstName, setFirstName] = useState(user?.firstName ?? "");
  const [lastName, setLastName] = useState(user?.lastName ?? "");
  const [email, setEmail] = useState(user?.email ?? "");

  // Password States
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Loading/Notification States
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Active Sessions States
  const [sessions, setSessions] = useState<{ id: string; userAgent: string | null; ipAddress: string | null; createdAt: string; isCurrent: boolean }[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);

  // Custom Image Cropper States
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);

  // Load active sessions from database
  const loadActiveSessions = async () => {
    setLoadingSessions(true);
    try {
      const list = await fetchSessions();
      setSessions(list);
    } catch (err) {
      console.error("Failed to load sessions:", err);
    } finally {
      setLoadingSessions(false);
    }
  };

  useEffect(() => {
    if (activeTab === "security") {
      loadActiveSessions();
    }
  }, [activeTab]);

  const handleRevokeSession = async (id: string) => {
    try {
      await deleteSession(id);
      loadActiveSessions();
      setStatus({ type: "success", message: "Session revoked successfully." });
    } catch (err) {
      setStatus({ 
        type: "error", 
        message: err instanceof ApiError ? err.message : "Failed to revoke session." 
      });
    }
  };

  const handleLogoutCurrentDevice = async () => {
    try {
      if (refreshToken) {
        await revokeSession(refreshToken);
      }
    } catch (err) {
      console.error("Failed to call logout API, clearing state locally", err);
    } finally {
      clear();
      router.push("/signin");
    }
  };

  if (!user) return null;

  // File selected: load FileReader and read native dimensions to trigger Crop Modal
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setStatus({ type: "error", message: "File size exceeds 2MB limit." });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setCropImageSrc(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleCropAvatar = async (croppedBase64: string) => {
    setBusy(true);
    try {
      await updateProfile({ avatarUrl: croppedBase64 });
      const freshUser = await fetchMe();
      if (accessToken && refreshToken) {
        setSession({ accessToken, refreshToken }, freshUser);
      }
      setStatus({ type: "success", message: "Profile picture updated successfully!" });
      setCropImageSrc(null);
    } catch (err) {
      setStatus({
        type: "error",
        message: err instanceof ApiError ? err.message : "Failed to update profile avatar."
      });
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSkipCropAvatar = async () => {
    if (!cropImageSrc) return;
    setBusy(true);
    try {
      await updateProfile({ avatarUrl: cropImageSrc });
      const freshUser = await fetchMe();
      if (accessToken && refreshToken) {
        setSession({ accessToken, refreshToken }, freshUser);
      }
      setStatus({ type: "success", message: "Profile picture updated successfully!" });
      setCropImageSrc(null);
    } catch (err) {
      setStatus({
        type: "error",
        message: err instanceof ApiError ? err.message : "Failed to update profile avatar."
      });
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setStatus(null);

    try {
      await updateProfile({ firstName, lastName, email });
      const freshUser = await fetchMe();
      if (accessToken && refreshToken) {
        setSession({ accessToken, refreshToken }, freshUser);
      }
      setStatus({ type: "success", message: "Profile details updated successfully!" });
    } catch (err) {
      setStatus({ 
        type: "error", 
        message: err instanceof ApiError ? err.message : "Failed to update profile." 
      });
    } finally {
      setBusy(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setStatus(null);

    if (newPassword !== confirmPassword) {
      setStatus({ type: "error", message: "New passwords do not match." });
      setBusy(false);
      return;
    }

    try {
      await updateProfile({ password: newPassword });
      setNewPassword("");
      setConfirmPassword("");
      setStatus({ type: "success", message: "Password updated successfully!" });
    } catch (err) {
      setStatus({ 
        type: "error", 
        message: err instanceof ApiError ? err.message : "Failed to update password." 
      });
    } finally {
      setBusy(false);
    }
  };

  // User-agent string parsing utility helper
  const parseUserAgent = (ua: string | null) => {
    if (!ua) return { browser: "Unknown Browser", os: "Unknown OS", device: "desktop" as const };
    
    let browser = "Other Browser";
    let os = "Other OS";
    let device: "desktop" | "mobile" = "desktop";

    const lower = ua.toLowerCase();

    if (lower.includes("firefox")) browser = "Firefox";
    else if (lower.includes("chrome") || lower.includes("chromium")) browser = "Chrome";
    else if (lower.includes("safari")) browser = "Safari";
    else if (lower.includes("edge")) browser = "Edge";

    if (lower.includes("windows")) os = "Windows";
    else if (lower.includes("macintosh") || lower.includes("mac os")) os = "macOS";
    else if (lower.includes("linux")) os = "Linux";
    else if (lower.includes("android")) {
      os = "Android";
      device = "mobile";
    } else if (lower.includes("iphone") || lower.includes("ipad")) {
      os = "iOS";
      device = "mobile";
    }

    return { browser, os, device };
  };

  const name = `${user.firstName} ${user.lastName}`;

  return (
    <>
      <Topbar title="Admin Profile" subtitle="Manage your profile information, password, and system integrations" />
      
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

        {/* Settings Layout Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          
          {/* Navigation Sidebar Cards */}
          <div className="md:col-span-1 space-y-4">
            
            {/* Quick Profile Summary Card */}
            <div className="border border-hairline/80 rounded-2xl bg-surface p-5 text-center shadow-sm">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/*"
                className="hidden"
              />
              <div className="relative mx-auto size-20">
                <div className="size-full rounded-full bg-accent-soft text-accent grid place-items-center text-xl font-bold border-2 border-accent/20 overflow-hidden">
                  {user.avatarUrl ? (
                    <img
                      src={user.avatarUrl}
                      alt={name}
                      className="size-full object-cover"
                    />
                  ) : (
                    initials(name)
                  )}
                </div>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute bottom-0 right-0 size-6 bg-[#5b73e8] border border-surface rounded-full text-white grid place-items-center hover:scale-105 active:scale-95 transition-transform"
                  aria-label="Upload Avatar"
                  suppressHydrationWarning
                >
                  <Upload className="size-3.5" />
                </button>
              </div>
              <h3 className="mt-3.5 font-bold text-ink truncate">{name}</h3>
              <p className="text-xs text-ink-3 truncate uppercase tracking-wider font-semibold mt-0.5">{user.role}</p>
              
              {/* Dynamic Size & Dimensions Recommendations Text */}
              <p className="text-[10px] text-ink-3 mt-3 px-2 leading-relaxed border-t border-hairline pt-2" suppressHydrationWarning>
                Supported: JPG, PNG. Max: 2MB.<br />Recommended: 200x200px (1:1)
              </p>
            </div>

            {/* Navigation Tabs List */}
            <div className="border border-hairline/80 rounded-2xl bg-surface p-1.5 shadow-sm space-y-1">
              <button
                onClick={() => { setActiveTab("profile"); setStatus(null); }}
                className={`flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-bold transition-all duration-200 ${
                  activeTab === "profile" 
                    ? "bg-[#5b73e8] text-white" 
                    : "text-ink-2 hover:bg-surface-2"
                }`}
              >
                <User className="size-4.5" />
                Profile Details
              </button>
              <button
                onClick={() => { setActiveTab("security"); setStatus(null); }}
                className={`flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-bold transition-all duration-200 ${
                  activeTab === "security" 
                    ? "bg-[#5b73e8] text-white" 
                    : "text-ink-2 hover:bg-surface-2"
                }`}
              >
                <Key className="size-4.5" />
                Security
              </button>
            </div>

          </div>

          {/* Form and Configuration Panel */}
          <div className="md:col-span-3 space-y-6">
            
            {activeTab === "profile" && (
              <div className="border border-hairline/80 rounded-3xl bg-surface shadow-sm overflow-hidden animate-fade-in">
                <div className="border-b border-hairline px-6 py-5">
                  <h2 className="font-bold text-lg text-ink">Personal Information</h2>
                  <p className="text-xs text-ink-3 mt-0.5">Edit your administrative display profiles and email coordinates</p>
                </div>
                <form onSubmit={handleSaveProfile} className="p-6 space-y-5">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-ink-3">First Name</label>
                      <input
                        type="text"
                        required
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        className="h-11.5 w-full rounded-xl border border-hairline bg-surface px-4 text-sm text-ink focus:outline-none focus:border-[#5b73e8] focus:ring-1 focus:ring-[#5b73e8] focus:shadow-[0_0_0_4px_rgba(91,115,232,0.12)] transition-all duration-200"
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-ink-3">Last Name</label>
                      <input
                        type="text"
                        required
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        className="h-11.5 w-full rounded-xl border border-hairline bg-surface px-4 text-sm text-ink focus:outline-none focus:border-[#5b73e8] focus:ring-1 focus:ring-[#5b73e8] focus:shadow-[0_0_0_4px_rgba(91,115,232,0.12)] transition-all duration-200"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-ink-3">Email Address</label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="h-11.5 w-full rounded-xl border border-hairline bg-surface px-4 text-sm text-ink focus:outline-none focus:border-[#5b73e8] focus:ring-1 focus:ring-[#5b73e8] focus:shadow-[0_0_0_4px_rgba(91,115,232,0.12)] transition-all duration-200"
                    />
                  </div>
                  <div className="flex justify-end pt-2">
                    <Button
                      type="submit"
                      disabled={busy}
                      className="h-11 justify-center rounded-xl bg-gradient-to-r from-[#5b73e8] to-[#4860e6] font-bold text-white px-6 hover:shadow-[0_8px_20px_rgba(91,115,232,0.25)] transition-all duration-300"
                      suppressHydrationWarning
                    >
                      {busy ? <Loader2 className="size-4 animate-spin mr-1.5" /> : null}
                      Save Changes
                    </Button>
                  </div>
                </form>
              </div>
            )}

            {activeTab === "security" && (
              <div className="space-y-6">
                
                {/* Password Form */}
                <div className="border border-hairline/80 rounded-3xl bg-surface shadow-sm overflow-hidden animate-fade-in">
                  <div className="border-b border-hairline px-6 py-5">
                    <h2 className="font-bold text-lg text-ink">Change Password</h2>
                    <p className="text-xs text-ink-3 mt-0.5">Ensure your administrator account uses a strong password protection scheme</p>
                  </div>
                  <form onSubmit={handleChangePassword} className="p-6 space-y-5">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-ink-3">New Password</label>
                        <input
                          type="password"
                          required
                          placeholder="••••••••"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          className="h-11.5 w-full rounded-xl border border-hairline bg-surface px-4 text-sm text-ink focus:outline-none focus:border-[#5b73e8] focus:ring-1 focus:ring-[#5b73e8] focus:shadow-[0_0_0_4px_rgba(91,115,232,0.12)] transition-all duration-200"
                        />
                      </div>
                      <div>
                        <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-ink-3">Confirm New Password</label>
                        <input
                          type="password"
                          required
                          placeholder="••••••••"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          className="h-11.5 w-full rounded-xl border border-hairline bg-surface px-4 text-sm text-ink focus:outline-none focus:border-[#5b73e8] focus:ring-1 focus:ring-[#5b73e8] focus:shadow-[0_0_0_4px_rgba(91,115,232,0.12)] transition-all duration-200"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end pt-2">
                      <Button
                        type="submit"
                        disabled={busy}
                        className="h-11 justify-center rounded-xl bg-gradient-to-r from-[#5b73e8] to-[#4860e6] font-bold text-white px-6 hover:shadow-[0_8px_20px_rgba(91,115,232,0.25)] transition-all duration-300"
                        suppressHydrationWarning
                      >
                        {busy ? <Loader2 className="size-4 animate-spin mr-1.5" /> : null}
                        Update Password
                      </Button>
                    </div>
                  </form>
                </div>

                {/* Active Sessions List */}
                <div className="border border-hairline/80 rounded-3xl bg-surface shadow-sm overflow-hidden animate-fade-in">
                  <div className="border-b border-hairline px-6 py-5">
                    <h2 className="font-bold text-lg text-ink">Active Devices & Sessions</h2>
                    <p className="text-xs text-ink-3 mt-0.5">Currently authenticated web environments accessing this admin portal</p>
                  </div>
                  <div className="divide-y divide-hairline">
                    {loadingSessions ? (
                      <div className="flex justify-center items-center py-6 text-sm font-bold text-ink-3">
                        <Loader2 className="size-4 animate-spin mr-1.5" />
                        Loading sessions...
                      </div>
                    ) : sessions.length === 0 ? (
                      <div className="text-center py-6 text-sm font-bold text-ink-3">
                        No active sessions found.
                      </div>
                    ) : (
                      sessions.map((session) => {
                        const { browser, os, device } = parseUserAgent(session.userAgent);
                        const Icon = device === "mobile" ? Smartphone : Laptop;
                        return (
                          <div key={session.id} className="flex items-center justify-between px-6 py-4.5">
                            <div className="flex items-center gap-3">
                              <div className={`size-9 rounded-xl grid place-items-center ${
                                session.isCurrent 
                                  ? "bg-good/5 text-good" 
                                  : "bg-ink-3/10 text-ink-2"
                              }`}>
                                <Icon className="size-5" />
                              </div>
                              <div>
                                <p className="text-sm font-bold text-ink">{browser} on {os}</p>
                                <p className="text-xs text-ink-3">
                                  {session.ipAddress || "Unknown IP"} · {session.isCurrent ? (
                                    <span className="text-good font-semibold">Active Now</span>
                                  ) : (
                                    <span>Added on {new Date(session.createdAt).toLocaleDateString()}</span>
                                  )}
                                </p>
                              </div>
                            </div>
                            {session.isCurrent ? (
                              <div className="flex items-center gap-3" suppressHydrationWarning>
                                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-good/5 text-good border border-good/10">This Device</span>
                                <button
                                  onClick={handleLogoutCurrentDevice}
                                  className="text-xs text-critical hover:underline font-bold"
                                >
                                  Log Out
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => handleRevokeSession(session.id)}
                                className="text-xs text-critical hover:underline font-bold"
                              >
                                Revoke
                              </button>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

              </div>
            )}

          </div>

        </div>

      </div>

      {/* Interactive Drag & Zoom Image Cropping Modal */}
      {cropImageSrc && (
        <ImageCropperModal
          imageSrc={cropImageSrc}
          aspectRatio={1} // square aspect ratio for avatar
          onCrop={handleCropAvatar}
          onSkip={handleSkipCropAvatar}
          onCancel={() => {
            setCropImageSrc(null);
            if (fileInputRef.current) fileInputRef.current.value = "";
          }}
        />
      )}
    </>
  );
}
