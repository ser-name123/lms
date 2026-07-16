"use client";

import { useEffect, useState } from "react";
import {
  Globe,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Save,
  User,
  Calendar,
  Lock,
  Camera,
  UploadCloud,
  Eye,
  EyeOff,
  Trash2,
} from "lucide-react";
import Swal from "sweetalert2";

import { Topbar } from "@/components/layout/topbar";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ImageCropperModal } from "@/components/image-cropper";
import {
  fetchStudentProfile,
  updateStudentProfile,
  resolveFileUrl,
  fetchSessions,
  revokeSession,
} from "@/lib/api";
import { useAuth } from "@/store/auth";
import { parseUserAgent } from "@/lib/utils";

export default function StudentProfile() {
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Sessions state
  const [sessions, setSessions] = useState<any[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);

  // Form states
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [gender, setGender] = useState("");
  const [country, setCountry] = useState("");
  const [timezone, setTimezone] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");

  // Password fields
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Cropper state
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);

  const { setSession } = useAuth();

  const loadProfile = () => {
    setLoading(true);
    fetchStudentProfile()
      .then((res) => {
        setProfile(res);
        setFirstName(res.user.firstName || "");
        setLastName(res.user.lastName || "");
        setPhone(res.phone || "");
        setGender(res.gender || "Male");
        setCountry(res.user.country || "");
        setTimezone(res.user.timezone || "");
        setAvatarUrl(res.user.avatarUrl || "");
      })
      .catch((err) => {
        console.error("Failed to load profile details", err);
      })
      .finally(() => {
        setLoading(false);
      });
  };

  const loadSessionsList = () => {
    setLoadingSessions(true);
    fetchSessions()
      .then((res) => {
        setSessions(res);
      })
      .catch((err) => {
        console.error("Failed to load active login sessions", err);
      })
      .finally(() => {
        setLoadingSessions(false);
      });
  };

  useEffect(() => {
    loadProfile();
    loadSessionsList();
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      setCropImageSrc(reader.result as string);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleCropAvatar = async (croppedBase64: string) => {
    setCropImageSrc(null);
    setUploading(true);
    try {
      await updateStudentProfile({ avatarUrl: croppedBase64 });
      setAvatarUrl(croppedBase64);
      updateLocalAuthSession(croppedBase64);

      Swal.fire({
        title: "Photo Updated!",
        text: "Your profile picture has been updated successfully.",
        icon: "success",
        toast: true,
        position: "top-end",
        showConfirmButton: false,
        timer: 3000,
      });
    } catch (err) {
      Swal.fire({
        title: "Failed",
        text: "We could not update your profile photo. Please try again.",
        icon: "error",
        confirmButtonColor: "#f85a6b",
      });
    } finally {
      setUploading(false);
    }
  };

  const updateLocalAuthSession = (newAvatarUrl?: string) => {
    const authData = localStorage.getItem("lms-auth");
    if (authData) {
      const auth = JSON.parse(authData);
      if (auth.state) {
        const sessionTokens = {
          accessToken: auth.state.accessToken,
          refreshToken: auth.state.refreshToken,
        };
        const updatedUser = {
          ...auth.state.user,
          avatarUrl: newAvatarUrl !== undefined ? newAvatarUrl : auth.state.user.avatarUrl,
          firstName: firstName || auth.state.user.firstName,
          lastName: lastName || auth.state.user.lastName,
        };
        setSession(sessionTokens, updatedUser);
      }
    }
  };

  const handleRevokeSession = async (id: string) => {
    const result = await Swal.fire({
      title: "Logout device?",
      text: "You will be logged out of this session device.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#f85a6b",
      confirmButtonText: "Logout",
    });
    if (!result.isConfirmed) return;

    try {
      await revokeSession(id);
      Swal.fire({
        title: "Logged out",
        text: "Device session has been revoked successfully.",
        icon: "success",
        toast: true,
        position: "top-end",
        showConfirmButton: false,
        timer: 3000,
      });
      loadSessionsList();
    } catch (err) {
      Swal.fire("Error", "Could not logout session.", "error");
    }
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) {
      Swal.fire({
        title: "Names Required",
        text: "First name and last name cannot be empty.",
        icon: "warning",
        confirmButtonColor: "#386FA4",
      });
      return;
    }

    // Password validation checks
    if (password) {
      if (password.length < 8) {
        Swal.fire({
          title: "Weak Password",
          text: "New password must be at least 8 characters long.",
          icon: "warning",
          confirmButtonColor: "#386FA4",
        });
        return;
      }
      if (password !== confirmPassword) {
        Swal.fire({
          title: "Mismatched Passwords",
          text: "Confirm password does not match your new password.",
          icon: "warning",
          confirmButtonColor: "#386FA4",
        });
        return;
      }
    }

    setSaving(true);
    try {
      const payload: any = {
        firstName,
        lastName,
        phone,
        gender,
        country,
        timezone,
      };
      if (password) {
        payload.password = password;
      }

      await updateStudentProfile(payload);

      // Sync auth session state
      updateLocalAuthSession();

      Swal.fire({
        title: "Profile Saved",
        text: "Your profile information has been updated successfully.",
        icon: "success",
        confirmButtonColor: "#10b981",
      });

      setPassword("");
      setConfirmPassword("");
      loadProfile();
    } catch (err) {
      Swal.fire({
        title: "Failed",
        text: "Could not update profile information. Please try again.",
        icon: "error",
        confirmButtonColor: "#f85a6b",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <>
        <Topbar title="My Profile" subtitle="Manage your account info" />
        <div className="flex h-[calc(100vh-4.5rem)] items-center justify-center">
          <div className="text-center">
            <Loader2 className="mx-auto size-8 animate-spin text-accent" />
            <p className="mt-3 text-sm font-bold text-ink-3">Loading profile details...</p>
          </div>
        </div>
      </>
    );
  }

  const joinDate = profile.user.joiningDate
    ? new Date(profile.user.joiningDate).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : profile.user.createdAt
    ? new Date(profile.user.createdAt).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "—";

  return (
    <>
      <Topbar title="My Profile" subtitle="View and edit your personal details" />

      <main className="p-4 sm:p-6 lg:p-8 space-y-6 w-full max-w-full mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Left Info Column */}
          <div className="space-y-6">
            <Card className="border border-hairline bg-surface rounded-3xl p-6 text-center space-y-5 hover:shadow-md transition">
              {/* Avatar Upload Container */}
              <div className="relative size-28 mx-auto group">
                <div className="size-full rounded-full overflow-hidden bg-gradient-to-tr from-accent to-[#59A5D8] flex items-center justify-center text-white font-extrabold text-3xl shadow-md border-2 border-hairline select-none relative">
                  {uploading ? (
                    <Loader2 className="size-8 animate-spin text-white" />
                  ) : avatarUrl ? (
                    <img
                      src={resolveFileUrl(avatarUrl)}
                      alt={`${firstName} ${lastName}`}
                      className="size-full object-cover rounded-full"
                    />
                  ) : (
                    <span>
                      {firstName.substring(0, 1).toUpperCase()}
                      {lastName.substring(0, 1).toUpperCase()}
                    </span>
                  )}
                </div>

                {/* Hover upload overlay triggers input */}
                <label className="absolute inset-0 bg-black/50 hover:bg-black/60 rounded-full flex flex-col items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200 cursor-pointer text-[10px] font-bold">
                  <Camera className="size-5 mb-1" />
                  Upload Photo
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileSelect}
                    disabled={uploading}
                    className="hidden"
                  />
                </label>
              </div>

              <div>
                <h3 className="font-extrabold text-base text-ink truncate leading-tight">
                  {firstName} {lastName}
                </h3>
                <p className="text-[10px] text-ink-3 font-extrabold uppercase mt-1">
                  Student ID: {profile.studentCode}
                </p>
              </div>

              <div className="border-t border-hairline pt-4 space-y-3 text-left text-xs font-semibold text-ink-2">
                <p className="flex items-center gap-2.5">
                  <Mail className="size-4.5 text-ink-3 shrink-0" />
                  <span className="truncate">{profile.user.email}</span>
                </p>
                <p className="flex items-center gap-2.5">
                  <Calendar className="size-4.5 text-ink-3 shrink-0" />
                  <span>Joined Academy: {joinDate}</span>
                </p>
              </div>
            </Card>

            {/* Login History Card */}
            <Card className="border border-hairline bg-surface rounded-3xl p-6 space-y-4 hover:shadow-md transition text-left">
              <h4 className="font-extrabold text-sm text-ink uppercase tracking-wider border-b border-hairline pb-2.5">
                Login History
              </h4>
              {loadingSessions ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="size-5 animate-spin text-accent" />
                </div>
              ) : sessions.length > 0 ? (
                <div className="divide-y divide-hairline space-y-3 max-h-[250px] overflow-y-auto pr-1">
                  {sessions.map((s) => (
                    <div key={s.id} className="flex justify-between items-center text-xs font-semibold text-ink-2 pt-3 first:pt-0">
                      <div className="space-y-0.5 min-w-0">
                        <span className="block font-bold text-ink truncate" title={s.userAgent || "Unknown Device"}>
                          {parseUserAgent(s.userAgent)}
                        </span>
                        <span className="block text-[9px] text-ink-3">
                          IP: {s.ipAddress || "Unknown"} &bull; {new Date(s.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <div>
                        {s.isCurrent ? (
                          <Badge tone="good" className="text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 select-none">
                            Active
                          </Badge>
                        ) : (
                          <button
                            onClick={() => handleRevokeSession(s.id)}
                            className="size-7.5 rounded-lg border border-hairline hover:border-critical/35 hover:bg-critical-soft/10 text-ink-3 hover:text-critical flex items-center justify-center transition cursor-pointer"
                            title="Log out of this device"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-ink-3 py-4 text-center font-medium">
                  No active sessions found.
                </p>
              )}
            </Card>
          </div>

          {/* Right Form Column */}
          <div className="lg:col-span-2 space-y-6">
            <Card className="border border-hairline bg-surface rounded-3xl p-6">
              <form onSubmit={handleFormSubmit} className="space-y-5">
                
                {/* Section 1: Personal Profile Info */}
                <div>
                  <h4 className="font-extrabold text-sm text-ink uppercase tracking-wider border-b border-hairline pb-2 mb-4">
                    Personal Information Details
                  </h4>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-extrabold text-ink-3 uppercase mb-1.5 tracking-wider">
                        First Name
                      </label>
                      <input
                        type="text"
                        required
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        className="h-10 w-full rounded-xl border border-hairline bg-surface px-3.5 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-extrabold text-ink-3 uppercase mb-1.5 tracking-wider">
                        Last Name
                      </label>
                      <input
                        type="text"
                        required
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        className="h-10 w-full rounded-xl border border-hairline bg-surface px-3.5 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                      />
                    </div>
                  </div>
                </div>

                {/* Contacts & Email Info */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-extrabold text-ink-3 uppercase mb-1.5 tracking-wider">
                      Email Address (Read-only)
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-ink-3 pointer-events-none" />
                      <input
                        type="email"
                        disabled
                        value={profile.user.email}
                        className="h-10 w-full rounded-xl border border-hairline bg-surface-2 pl-10 pr-3.5 text-xs text-ink-3 cursor-not-allowed select-none"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-extrabold text-ink-3 uppercase mb-1.5 tracking-wider">
                      Phone / Mobile
                    </label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-ink-3 pointer-events-none" />
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="+1 (555) 0199"
                        className="h-10 w-full rounded-xl border border-hairline bg-surface pl-10 pr-3.5 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                      />
                    </div>
                  </div>
                </div>

                {/* Country, gender, timezone */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-[10px] font-extrabold text-ink-3 uppercase mb-1.5 tracking-wider">
                      Gender
                    </label>
                    <select
                      value={gender}
                      onChange={(e) => setGender(e.target.value)}
                      className="h-10 w-full rounded-xl border border-hairline bg-surface px-3.5 text-xs text-ink font-semibold focus:outline-none focus:ring-2 focus:ring-accent"
                    >
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-extrabold text-ink-3 uppercase mb-1.5 tracking-wider">
                      Country
                    </label>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-ink-3 pointer-events-none" />
                      <input
                        type="text"
                        value={country}
                        onChange={(e) => setCountry(e.target.value)}
                        placeholder="United States"
                        className="h-10 w-full rounded-xl border border-hairline bg-surface pl-10 pr-3.5 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-extrabold text-ink-3 uppercase mb-1.5 tracking-wider">
                      Timezone
                    </label>
                    <div className="relative">
                      <Globe className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-ink-3 pointer-events-none" />
                      <input
                        type="text"
                        value={timezone}
                        onChange={(e) => setTimezone(e.target.value)}
                        placeholder="America/Chicago"
                        className="h-10 w-full rounded-xl border border-hairline bg-surface pl-10 pr-3.5 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                      />
                    </div>
                  </div>
                </div>

                {/* Section 2: Security & Password Upgrade */}
                <div className="pt-4">
                  <h4 className="font-extrabold text-sm text-ink uppercase tracking-wider border-b border-hairline pb-2 mb-4 flex items-center gap-1.5">
                    <Lock className="size-4 text-accent" />
                    Security & Password Update
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-extrabold text-ink-3 uppercase mb-1.5 tracking-wider">
                        New Password
                      </label>
                      <div className="relative">
                        <input
                          type={showPassword ? "text" : "password"}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="••••••••"
                          className="h-10 w-full rounded-xl border border-hairline bg-surface px-3.5 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-accent pr-10"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-3 hover:text-ink cursor-pointer"
                        >
                          {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-extrabold text-ink-3 uppercase mb-1.5 tracking-wider">
                        Confirm New Password
                      </label>
                      <input
                        type={showPassword ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="••••••••"
                        className="h-10 w-full rounded-xl border border-hairline bg-surface px-3.5 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                      />
                    </div>
                  </div>
                  <span className="text-[10px] text-ink-3 leading-none mt-2 block font-semibold">
                    Leave blank if you do not wish to update your login password.
                  </span>
                </div>

                {/* Form submit */}
                <div className="flex justify-end gap-2 border-t border-hairline pt-4 bg-surface">
                  <Button
                    type="submit"
                    disabled={saving}
                    className="h-10 px-5 bg-accent hover:bg-accent-hover text-white text-xs font-bold rounded-xl flex items-center gap-1 shadow-sm"
                  >
                    {saving ? (
                      <Loader2 className="size-4 animate-spin mr-1" />
                    ) : (
                      <Save className="size-4 mr-1" />
                    )}
                    Save Changes
                  </Button>
                </div>
              </form>
            </Card>
          </div>

        </div>
      </main>

      {/* Global Image Cropper Modal */}
      {cropImageSrc && (
        <ImageCropperModal
          imageSrc={cropImageSrc}
          aspectRatio={1}
          onCrop={handleCropAvatar}
          onSkip={() => handleCropAvatar(cropImageSrc)}
          onCancel={() => setCropImageSrc(null)}
        />
      )}
    </>
  );
}
