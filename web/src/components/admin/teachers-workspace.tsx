"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { 
  Plus, 
  Search, 
  X, 
  Loader2, 
  User, 
  Mail, 
  Lock, 
  Globe, 
  CheckCircle2, 
  AlertCircle,
  Trash2,
  Edit2,
  DollarSign,
  Calendar,
  Key,
  Laptop,
  Clock,
  MoreVertical,
  GraduationCap,
  Users,
  CalendarCheck,
  UserCheck,
  Download,
  BookOpen,
  MapPin,
  FileText,
  XCircle,
  RefreshCw
} from "lucide-react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";
import Swal from "sweetalert2";

import { COUNTRIES } from "@/lib/countries";
import { Topbar } from "@/components/layout/topbar";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { 
  fetchTeachers, 
  fetchLmsCourses,
  createTeacher, 
  updateTeacher, 
  deleteTeacher, 
  fetchTeacherStats,
  fetchTeacherSessions,
  revokeTeacherSession,
  TeacherProfile, 
  TeacherStats,
  fetchEmployees,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  fetchEmployeeStats,
  fetchEmployeeSessions,
  revokeEmployeeSession,
  EmployeeProfile,
  EmployeeStats,
  fetchCandidates,
  createCandidate,
  updateCandidate,
  deleteCandidate,
  fetchCandidateStats,
  seedCandidates,
  Candidate,
  CandidateStats,
  CandidateStatus,
  fetchLeaves,
  createLeave,
  updateLeave,
  deleteLeave,
  fetchLeaveStats,
  seedLeaves,
  LeaveRequest,
  LeaveStats,
  LeaveType,
  LeaveRequestStatus,
  fetchTeacherRegistrationByProfile,
  updateTeacherRegistrationByProfile,
  resolveTeacherDocSrc,
  archiveTeacher,
  ApiError
} from "@/lib/api";
import { cn, initials, parseUserAgent } from "@/lib/utils";
import { useAuth } from "@/store/auth";
import { FullDetailsDrawer } from "@/components/admin/full-details-drawer";
import { TEACHER_DETAIL_SECTIONS } from "@/components/admin/registration-detail-config";

const STATS_COLORS = ["#133C55", "#386FA4", "#59A5D8", "#84D2F6", "#10b981", "#ffb822", "#f85a6b"];
const STATUS_FILTERS = ["All", "Active", "Inactive", "Pending"] as const;
const PER_PAGE = 8;

const statusTone: Record<string, Tone> = {
  Active: "good",
  Inactive: "neutral",
  Pending: "warning",
  ACTIVE: "good",
  INACTIVE: "neutral",
  PENDING: "warning",
  SUSPENDED: "critical"
};

const COUNTRY_TIMEZONES: Record<string, string> = {
  "Afghanistan": "Asia/Kabul",
  "Albania": "Europe/Tirane",
  "Algeria": "Africa/Algiers",
  "Argentina": "America/Argentina/Buenos_Aires",
  "Armenia": "Asia/Yerevan",
  "Australia": "Australia/Sydney",
  "Austria": "Europe/Vienna",
  "Azerbaijan": "Asia/Baku",
  "Bahrain": "Asia/Bahrain",
  "Bangladesh": "Asia/Dhaka",
  "Belarus": "Europe/Minsk",
  "Belgium": "Europe/Brussels",
  "Bosnia and Herzegovina": "Europe/Sarajevo",
  "Brazil": "America/Sao_Paulo",
  "Brunei": "Asia/Brunei",
  "Bulgaria": "Europe/Sofia",
  "Cambodia": "Asia/Phnom_Penh",
  "Cameroon": "Africa/Douala",
  "Canada": "America/Toronto",
  "Chad": "Africa/Ndjamena",
  "Chile": "America/Santiago",
  "China": "Asia/Shanghai",
  "Colombia": "America/Bogota",
  "Comoros": "Indian/Comoro",
  "Croatia": "Europe/Zagreb",
  "Cyprus": "Asia/Nicosia",
  "Czechia": "Europe/Prague",
  "Denmark": "Europe/Copenhagen",
  "Djibouti": "Africa/Djibouti",
  "Egypt": "Africa/Cairo",
  "Eritrea": "Africa/Asmara",
  "Estonia": "Europe/Tallinn",
  "Ethiopia": "Africa/Addis_Ababa",
  "Finland": "Europe/Helsinki",
  "France": "Europe/Paris",
  "Gambia": "Africa/Banjul",
  "Georgia": "Asia/Tbilisi",
  "Germany": "Europe/Berlin",
  "Ghana": "Africa/Accra",
  "Greece": "Europe/Athens",
  "Guinea": "Africa/Conakry",
  "Hong Kong": "Asia/Hong_Kong",
  "Hungary": "Europe/Budapest",
  "Iceland": "Atlantic/Reykjavik",
  "India": "Asia/Kolkata",
  "Indonesia": "Asia/Jakarta",
  "Iran": "Asia/Tehran",
  "Iraq": "Asia/Baghdad",
  "Ireland": "Europe/Dublin",
  "Israel": "Asia/Jerusalem",
  "Italy": "Europe/Rome",
  "Ivory Coast": "Africa/Abidjan",
  "Japan": "Asia/Tokyo",
  "Jordan": "Asia/Amman",
  "Kazakhstan": "Asia/Almaty",
  "Kenya": "Africa/Nairobi",
  "Kuwait": "Asia/Kuwait",
  "Kyrgyzstan": "Asia/Bishkek",
  "Latvia": "Europe/Riga",
  "Lebanon": "Asia/Beirut",
  "Libya": "Africa/Tripoli",
  "Lithuania": "Europe/Vilnius",
  "Luxembourg": "Europe/Luxembourg",
  "Malaysia": "Asia/Kuala_Lumpur",
  "Maldives": "Indian/Maldives",
  "Mali": "Africa/Bamako",
  "Malta": "Europe/Valetta",
  "Mauritania": "Africa/Nouakchott",
  "Mauritius": "Indian/Mauritius",
  "Mexico": "America/Mexico_City",
  "Morocco": "Africa/Casablanca",
  "Mozambique": "Africa/Maputo",
  "Myanmar": "Asia/Yangon",
  "Nepal": "Asia/Kathmandu",
  "Netherlands": "Europe/Amsterdam",
  "New Zealand": "Pacific/Auckland",
  "Niger": "Africa/Niamey",
  "Nigeria": "Africa/Lagos",
  "North Macedonia": "Europe/Skopje",
  "Norway": "Europe/Oslo",
  "Oman": "Asia/Muscat",
  "Pakistan": "Asia/Karachi",
  "Palestine": "Asia/Hebron",
  "Philippines": "Asia/Manila",
  "Poland": "Europe/Warsaw",
  "Portugal": "Europe/Lisbon",
  "Qatar": "Asia/Qatar",
  "Romania": "Europe/Bucharest",
  "Russia": "Europe/Moscow",
  "Saudi Arabia": "Asia/Riyadh",
  "Senegal": "Africa/Dakar",
  "Serbia": "Europe/Belgrade",
  "Singapore": "Asia/Singapore",
  "Slovakia": "Europe/Bratislava",
  "Slovenia": "Europe/Ljubljana",
  "Somalia": "Africa/Mogadishu",
  "South Africa": "Africa/Johannesburg",
  "South Korea": "Asia/Seoul",
  "Spain": "Europe/Madrid",
  "Sri Lanka": "Asia/Colombo",
  "Sudan": "Africa/Khartoum",
  "Sweden": "Europe/Stockholm",
  "Switzerland": "Europe/Zurich",
  "Syria": "Asia/Damascus",
  "Taiwan": "Asia/Taipei",
  "Tajikistan": "Asia/Dushanbe",
  "Tanzania": "Africa/Dar_es_Salaam",
  "Thailand": "Asia/Bangkok",
  "Tunisia": "Africa/Tunis",
  "Turkey": "Europe/Istanbul",
  "Turkmenistan": "Asia/Ashgabat",
  "Uganda": "Africa/Kampala",
  "Ukraine": "Europe/Kyiv",
  "United Arab Emirates": "Asia/Dubai",
  "United Kingdom": "Europe/London",
  "United States": "America/New_York",
  "Uzbekistan": "Asia/Tashkent",
  "Vietnam": "Asia/Ho_Chi_Minh",
  "Yemen": "Asia/Aden",
  "Zambia": "Africa/Lusaka",
  "Zimbabwe": "Africa/Harare"
};

export type TeachersTab = "teachers" | "others" | "recruitment" | "leave";

const TAB_META: Record<TeachersTab, { title: string; subtitle: string }> = {
  teachers: { title: "Manage Teachers", subtitle: "Overview and administration of teaching staff, credentials, and performance" },
  others: { title: "Other Employees", subtitle: "Administration of non-teaching staff and employee records" },
  recruitment: { title: "Recruitment", subtitle: "Candidate pipeline, applications, and hiring management" },
  leave: { title: "Leave Requests", subtitle: "Review and manage staff leave applications" },
};

export function TeachersWorkspace({ lockedTab }: { lockedTab?: TeachersTab }) {
  const { user } = useAuth();
  const router = useRouter();
  const isAdmin = user?.role === "ADMIN";

  const [activeTab] = useState<TeachersTab>(lockedTab ?? "teachers");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof STATUS_FILTERS)[number]>("All");
  const [selectedSpec, setSelectedSpec] = useState("All");
  const [sortBy, setSortBy] = useState("name_asc");
  const [page, setPage] = useState(1);
  const [teacherLimit, setTeacherLimit] = useState(20);
  
  // API states
  const [teachers, setTeachers] = useState<TeacherProfile[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);

  // Multi-select state
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(teachers.map(t => t.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectRow = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedIds(prev => [...prev, id]);
    } else {
      setSelectedIds(prev => prev.filter(x => x !== id));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;

    const result = await Swal.fire({
      title: `Delete ${selectedIds.length} Instructors?`,
      text: `Are you sure you want to permanently delete the profiles for the selected ${selectedIds.length} teachers? This action is irreversible.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, delete all",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#f85a6b",
      background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff",
      color: document.documentElement.classList.contains("dark") ? "#f4f4f5" : "#13222e"
    });

    if (result.isConfirmed) {
      setLoading(true);
      try {
        await Promise.all(selectedIds.map(id => deleteTeacher(id)));
        Swal.fire({
          title: "Deleted!",
          text: `${selectedIds.length} instructors deleted successfully.`,
          icon: "success",
          background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff",
        });
        setSelectedIds([]);
        loadTeachers();
        loadStats();
      } catch (err) {
        Swal.fire({
          title: "Failed!",
          text: err instanceof ApiError ? err.message : "Failed to delete instructors.",
          icon: "error",
          background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff",
        });
      } finally {
        setLoading(false);
      }
    }
  };

  const handleBulkStatusUpdate = async (newStatus: "ACTIVE" | "INACTIVE") => {
    if (selectedIds.length === 0) return;
    const actionLabel = newStatus === "ACTIVE" ? "unblock" : "block";

    const result = await Swal.fire({
      title: `${newStatus === "ACTIVE" ? "Unblock" : "Block"} ${selectedIds.length} Instructors?`,
      text: `Are you sure you want to ${actionLabel} the selected ${selectedIds.length} instructors?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: `Yes, ${actionLabel} all`,
      cancelButtonText: "Cancel",
      confirmButtonColor: newStatus === "ACTIVE" ? "#10b981" : "#f85a6b",
      background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff",
      color: document.documentElement.classList.contains("dark") ? "#f4f4f5" : "#13222e"
    });

    if (result.isConfirmed) {
      setLoading(true);
      try {
        await Promise.all(selectedIds.map(id => updateTeacher(id, { status: newStatus })));
        Swal.fire({
          title: "Status Updated!",
          text: `${selectedIds.length} instructors ${newStatus === "ACTIVE" ? "unblocked" : "blocked"} successfully.`,
          icon: "success",
          background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff",
        });
        setSelectedIds([]);
        loadTeachers();
        loadStats();
      } catch (err) {
        Swal.fire({
          title: "Failed!",
          text: err instanceof ApiError ? err.message : `Failed to ${actionLabel} instructors.`,
          icon: "error",
          background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff",
        });
      } finally {
        setLoading(false);
      }
    }
  };

  // Stats Dashboard
  const [stats, setStats] = useState<TeacherStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);

  // Active Dropdown Action Row
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  // Course Selection States
  const [availableCourses, setAvailableCourses] = useState<{ id: string; title: string }[]>([]);
  const [courseId, setCourseId] = useState("");
  const [manageCourseId, setManageCourseId] = useState("");
  const [courseIds, setCourseIds] = useState<string[]>([]);
  const [manageCourseIds, setManageCourseIds] = useState<string[]>([]);

  // Add Teacher Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [specialisation, setSpecialisation] = useState("Quran");
  const [hourlyRate, setHourlyRate] = useState<number | "">("");
  const [bio, setBio] = useState("");
  const [country, setCountry] = useState("India");
  const [timezone, setTimezone] = useState("Asia/Kolkata");
  const [modalBusy, setModalBusy] = useState(false);
  const [modalStatus, setModalStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const handleCountryChange = (val: string) => {
    setCountry(val);
    if (COUNTRY_TIMEZONES[val]) {
      setTimezone(COUNTRY_TIMEZONES[val]);
    }
  };

  const handleManageCountryChange = (val: string) => {
    setManageCountry(val);
    if (COUNTRY_TIMEZONES[val]) {
      setManageTimezone(COUNTRY_TIMEZONES[val]);
    }
  };

  const handleCourseToggle = (id: string) => {
    setCourseIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleManageCourseToggle = (id: string) => {
    setManageCourseIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  // Profile View & Edit Modal states
  const [selectedTeacher, setSelectedTeacher] = useState<TeacherProfile | null>(null);
  // Full application-details drawer (all the data the teacher registered with).
  const [detailsTeacher, setDetailsTeacher] = useState<TeacherProfile | null>(null);
  const [detailTab, setDetailTab] = useState<"overview" | "edit">("overview");
  const [manageFirstName, setManageFirstName] = useState("");
  const [manageLastName, setManageLastName] = useState("");
  const [manageEmail, setManageEmail] = useState("");
  const [manageSpecialisation, setManageSpecialisation] = useState("Quran");
  const [manageHourlyRate, setManageHourlyRate] = useState<number | "">("");
  const [manageBio, setManageBio] = useState("");
  const [manageCountry, setManageCountry] = useState("");
  const [manageTimezone, setManageTimezone] = useState("");
  const [manageStatus, setManageStatus] = useState("ACTIVE");
  const [managePassword, setManagePassword] = useState("");
  const [manageBusy, setManageBusy] = useState(false);
  const [manageStatusMsg, setManageStatusMsg] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Sessions Modal states
  const [sessionsTeacher, setSessionsTeacher] = useState<TeacherProfile | null>(null);
  const [sessions, setSessions] = useState<{ id: string; userAgent: string | null; ipAddress: string | null; createdAt: string }[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);

  // ─── Employee States ──────────────────────────────────────────────────────────
  const [employeeQuery, setEmployeeQuery] = useState("");
  const [employeeStatusFilter, setEmployeeStatusFilter] = useState("All");
  const [employeeRoleFilter, setEmployeeRoleFilter] = useState("All");
  const [employeeSortBy, setEmployeeSortBy] = useState("name_asc");
  const [employeePage, setEmployeePage] = useState(1);
  const [employeeLimit, setEmployeeLimit] = useState(20);

  const [employees, setEmployees] = useState<EmployeeProfile[]>([]);
  const [employeeTotal, setEmployeeTotal] = useState(0);
  const [employeeTotalPages, setEmployeeTotalPages] = useState(1);
  const [loadingEmployees, setLoadingEmployees] = useState(false);

  const [employeeStats, setEmployeeStats] = useState<EmployeeStats | null>(null);
  const [loadingEmployeeStats, setLoadingEmployeeStats] = useState(false);

  const [activeEmployeeMenuId, setActiveEmployeeMenuId] = useState<string | null>(null);

  // Add Employee Modal states
  const [showAddEmployeeModal, setShowAddEmployeeModal] = useState(false);
  const [empFirstName, setEmpFirstName] = useState("");
  const [empLastName, setEmpLastName] = useState("");
  const [empEmail, setEmpEmail] = useState("");
  const [empPassword, setEmpPassword] = useState("");
  const [empRole, setEmpRole] = useState("ACADEMIC_COACH");
  const [empPhone, setEmpPhone] = useState("");
  const [empGender, setEmpGender] = useState("Male");
  const [empJoiningDate, setEmpJoiningDate] = useState("");
  const [empSalary, setEmpSalary] = useState<number | "">("");
  const [empCountry, setEmpCountry] = useState("India");
  const [empTimezone, setEmpTimezone] = useState("Asia/Kolkata");
  const [empModalBusy, setEmpModalBusy] = useState(false);
  const [empModalStatus, setEmpModalStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // View & Edit Employee states
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeProfile | null>(null);
  const [detailEmployeeTab, setDetailEmployeeTab] = useState<"overview" | "edit">("overview");
  const [manageEmpFirstName, setManageEmpFirstName] = useState("");
  const [manageEmpLastName, setManageEmpLastName] = useState("");
  const [manageEmpEmail, setManageEmpEmail] = useState("");
  const [manageEmpRole, setManageEmpRole] = useState("ACADEMIC_COACH");
  const [manageEmpStatus, setManageEmpStatus] = useState("ACTIVE");
  const [manageEmpPhone, setManageEmpPhone] = useState("");
  const [manageEmpGender, setManageEmpGender] = useState("Male");
  const [manageEmpJoiningDate, setManageEmpJoiningDate] = useState("");
  const [manageEmpSalary, setManageEmpSalary] = useState<number | "">("");
  const [manageEmpCountry, setManageEmpCountry] = useState("");
  const [manageEmpTimezone, setManageEmpTimezone] = useState("");
  const [manageEmpPassword, setManageEmpPassword] = useState("");
  const [manageEmpBusy, setManageEmpBusy] = useState(false);
  const [manageEmpStatusMsg, setManageEmpStatusMsg] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Sessions Employee Modal states
  const [sessionsEmployee, setSessionsEmployee] = useState<EmployeeProfile | null>(null);
  const [employeeSessions, setEmployeeSessions] = useState<{ id: string; userAgent: string | null; ipAddress: string | null; createdAt: string }[]>([]);
  const [loadingEmployeeSessions, setLoadingEmployeeSessions] = useState(false);

  // ─── Candidate States ─────────────────────────────────────────────────────────
  const [candidateQuery, setCandidateQuery] = useState("");
  const [candidateStatusFilter, setCandidateStatusFilter] = useState("All");
  const [candidateSortBy, setCandidateSortBy] = useState("date_desc");
  const [candidatePage, setCandidatePage] = useState(1);
  const [candidateLimit, setCandidateLimit] = useState(20);

  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [candidateTotal, setCandidateTotal] = useState(0);
  const [candidateTotalPages, setCandidateTotalPages] = useState(1);
  const [loadingCandidates, setLoadingCandidates] = useState(false);

  const [candidateStats, setCandidateStats] = useState<CandidateStats | null>(null);
  const [loadingCandidateStats, setLoadingCandidateStats] = useState(false);

  const [activeCandidateMenuId, setActiveCandidateMenuId] = useState<string | null>(null);
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [manageCandidateNotes, setManageCandidateNotes] = useState("");
  const [manageCandidateBusy, setManageCandidateBusy] = useState(false);

  // ─── Leave Requests States ──────────────────────────────────────────────────
  const [leaveQuery, setLeaveQuery] = useState("");
  const [leaveStatusFilter, setLeaveStatusFilter] = useState("All");
  const [leaveSortBy, setLeaveSortBy] = useState("date_desc");
  const [leavePage, setLeavePage] = useState(1);
  const [leaveLimit, setLeaveLimit] = useState(20);

  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [leaveTotal, setLeaveTotal] = useState(0);
  const [leaveTotalPages, setLeaveTotalPages] = useState(1);
  const [loadingLeaves, setLoadingLeaves] = useState(false);

  const [leaveStats, setLeaveStats] = useState<LeaveStats | null>(null);
  const [loadingLeaveStats, setLoadingLeaveStats] = useState(false);

  const [activeLeaveMenuId, setActiveLeaveMenuId] = useState<string | null>(null);
  const [selectedLeave, setSelectedLeave] = useState<LeaveRequest | null>(null);
  const [manageLeaveNotes, setManageLeaveNotes] = useState("");
  const [manageLeaveBusy, setManageLeaveBusy] = useState(false);

  // Load summary statistics
  const loadStats = async () => {
    setLoadingStats(true);
    try {
      const data = await fetchTeacherStats();
      setStats(data);
    } catch (err) {
      console.error("Failed to load teacher stats:", err);
    } finally {
      setLoadingStats(false);
    }
  };

  // Load teachers list
  const loadTeachers = async () => {
    setLoading(true);
    setSelectedIds([]);
    try {
      const data = await fetchTeachers({
        page,
        limit: teacherLimit,
        search: query || undefined,
        status: filter === "All" ? undefined : filter.toUpperCase(),
        specialisation: selectedSpec === "All" ? undefined : selectedSpec,
        sortBy: sortBy
      });
      setTeachers(data.items);
      setTotal(data.meta.total);
      setTotalPages(data.meta.pages);
    } catch (err) {
      console.error("Failed to fetch teachers:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setSelectedIds([]);
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === "teachers") {
      loadTeachers();
    }
  }, [page, filter, selectedSpec, sortBy, activeTab, teacherLimit]);

  // Debounced search trigger
  useEffect(() => {
    if (activeTab !== "teachers") return;
    const delay = setTimeout(() => {
      setPage(1);
      loadTeachers();
    }, 400);
    return () => clearTimeout(delay);
  }, [query]);

  // Load metrics stats on mount
  useEffect(() => {
    loadStats();
    fetchLmsCourses()
      .then((data: any[]) => {
        setAvailableCourses(data);
      })
      .catch((err) => console.error("Failed to load courses:", err));
  }, []);

  // Handle CSV Export
  const handleExportCSV = () => {
    if (teachers.length === 0) {
      Swal.fire({
        title: "No Data",
        text: "There are no teacher accounts available to export.",
        icon: "warning",
        background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff",
        color: document.documentElement.classList.contains("dark") ? "#f4f4f5" : "#13222e"
      });
      return;
    }

    const headers = ["Code", "First Name", "Last Name", "Email", "Specialisation", "Hourly Rate (USD/hr)", "Country", "Timezone", "Status", "Date Joined"];
    const rows = teachers.map(t => [
      t.teacherCode,
      t.user.firstName,
      t.user.lastName,
      t.user.email,
      t.specialisation || "General",
      t.hourlyRate || 0,
      t.user.country || "Unknown",
      t.user.timezone || "UTC",
      t.user.status,
      new Date(t.user.createdAt).toLocaleDateString()
    ]);

    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" 
      + [headers.join(","), ...rows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(","))].join("\n");
      
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Teachers_Report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Handle Add Teacher Form Submission
  const handleAddTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalBusy(true);
    setModalStatus(null);

    try {
      await createTeacher({
        firstName,
        lastName,
        email,
        password: password || undefined,
        specialisation,
        hourlyRate: hourlyRate || undefined,
        bio: bio || undefined,
        country,
        timezone,
        courseId: courseId || undefined,
        subjects: courseIds,
      });
      setModalStatus({ type: "success", message: "Teacher account created successfully!" });
      
      // Reset form fields
      setFirstName("");
      setLastName("");
      setEmail("");
      setPassword("");
      setHourlyRate("");
      setBio("");
      setCourseId("");
      setCourseIds([]);
      
      // Reload lists
      loadTeachers();
      loadStats();

      setTimeout(() => setShowAddModal(false), 800);
    } catch (err) {
      setModalStatus({
        type: "error",
        message: err instanceof ApiError ? err.message : "Failed to create teacher account"
      });
    } finally {
      setModalBusy(false);
    }
  };

  // Open Edit Profile modal
  const openDetailModal = (teacher: TeacherProfile, initialTab: "overview" | "edit" = "overview") => {
    setSelectedTeacher(teacher);
    setDetailTab(initialTab);
    setManageFirstName(teacher.user.firstName);
    setManageLastName(teacher.user.lastName);
    setManageEmail(teacher.user.email);
    setManageSpecialisation(teacher.specialisation || "Quran");
    setManageHourlyRate(teacher.hourlyRate || "");
    setManageBio(teacher.bio || "");
    setManageCountry(teacher.user.country || "");
    setManageTimezone(teacher.user.timezone || "");
    setManageStatus(teacher.user.status);
    setManageCourseId(teacher.courseId || "");
    setManageCourseIds(teacher.subjects || []);
    setManagePassword("");
    setManageStatusMsg(null);
    setActiveMenuId(null);
  };

  // Handle Edit Profile Form Submission
  const handleUpdateTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTeacher) return;
    setManageBusy(true);
    setManageStatusMsg(null);

    try {
      const updated = await updateTeacher(selectedTeacher.id, {
        firstName: manageFirstName,
        lastName: manageLastName,
        specialisation: undefined,
        hourlyRate: manageHourlyRate || undefined,
        bio: manageBio || undefined,
        country: manageCountry || undefined,
        timezone: manageTimezone || undefined,
        status: manageStatus,
        courseId: manageCourseId || null,
        password: managePassword || undefined,
        subjects: manageCourseIds,
      });
      setManageStatusMsg({ type: "success", message: "Teacher configurations updated successfully!" });
      setSelectedTeacher(updated); // Sync details
      loadTeachers();
      loadStats();
      setTimeout(() => setDetailTab("overview"), 800);
    } catch (err) {
      setManageStatusMsg({
        type: "error",
        message: err instanceof ApiError ? err.message : "Failed to update profile settings"
      });
    } finally {
      setManageBusy(false);
    }
  };

  // Block / Unblock Teacher Profile Account
  const handleToggleBlockTeacher = async (teacher: TeacherProfile) => {
    const isBlocked = teacher.user.status === "INACTIVE";
    const newStatus = isBlocked ? "ACTIVE" : "INACTIVE";
    const actionLabel = isBlocked ? "unblock" : "block";

    const result = await Swal.fire({
      title: `${isBlocked ? "Unblock" : "Block"} Instructor?`,
      text: `Are you sure you want to ${actionLabel} ${teacher.user.firstName} ${teacher.user.lastName}? ${isBlocked ? "They will regain access to their portal." : "They will be force logged out and blocked from logging in."}`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: `Yes, ${actionLabel}`,
      cancelButtonText: "Cancel",
      confirmButtonColor: isBlocked ? "#10b981" : "#f85a6b",
      background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff",
      color: document.documentElement.classList.contains("dark") ? "#f4f4f5" : "#13222e"
    });

    if (result.isConfirmed) {
      try {
        await updateTeacher(teacher.id, { status: newStatus });
        Swal.fire({
          title: isBlocked ? "Unblocked!" : "Blocked!",
          text: `Instructor has been ${isBlocked ? "unblocked" : "blocked"} successfully.`,
          icon: "success",
          background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff",
        });
        loadTeachers();
        loadStats();
        // Sync selectedTeacher if it is open
        if (selectedTeacher && selectedTeacher.id === teacher.id) {
          setSelectedTeacher(prev => prev ? { ...prev, user: { ...prev.user, status: newStatus } } : null);
        }
      } catch (err) {
        Swal.fire({
          title: "Failed!",
          text: err instanceof ApiError ? err.message : `Could not ${actionLabel} instructor.`,
          icon: "error",
          background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff",
        });
      }
    }
  };

  // Handle Delete Teacher account
  const handleDeleteTeacher = async (teacher: TeacherProfile) => {
    setActiveMenuId(null);
    const result = await Swal.fire({
      title: "Are you sure?",
      text: `This will permanently delete the profile and credentials of ${teacher.user.firstName} ${teacher.user.lastName}.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#f85a6b",
      background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff",
      color: document.documentElement.classList.contains("dark") ? "#f4f4f5" : "#13222e"
    });

    if (result.isConfirmed) {
      try {
        await deleteTeacher(teacher.id);
        Swal.fire({
          title: "Deleted!",
          text: "Teacher account has been successfully removed.",
          icon: "success",
          timer: 1500,
          showConfirmButton: false,
          background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff",
        });
        loadTeachers();
        loadStats();
      } catch (err) {
        Swal.fire({
          title: "Failed!",
          text: err instanceof ApiError ? err.message : "Could not delete user account",
          icon: "error",
          background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff",
        });
      }
    }
  };

  // Load active login sessions
  const loadSessions = async (teacher: TeacherProfile) => {
    setSessionsTeacher(teacher);
    setLoadingSessions(true);
    setSessions([]);
    try {
      const data = await fetchTeacherSessions(teacher.id);
      setSessions(data);
    } catch (err) {
      console.error("Failed to load active sessions:", err);
    } finally {
      setLoadingSessions(false);
    }
  };

  // Revoke specific refresh token session
  const handleRevokeSession = async (sessionId: string) => {
    if (!sessionsTeacher) return;
    try {
      await revokeTeacherSession(sessionsTeacher.id, sessionId);
      setSessions(prev => prev.filter(s => s.id !== sessionId));
    } catch (err) {
      console.error("Failed to revoke session:", err);
    }
  };

  // ─── Employee Loaders & Handlers ──────────────────────────────────────────────

  // Load employee statistics
  const loadEmployeeStats = async () => {
    setLoadingEmployeeStats(true);
    try {
      const data = await fetchEmployeeStats();
      setEmployeeStats(data);
    } catch (err) {
      console.error("Failed to load employee stats:", err);
    } finally {
      setLoadingEmployeeStats(false);
    }
  };

  // Load employees list
  const loadEmployees = async () => {
    setLoadingEmployees(true);
    try {
      const data = await fetchEmployees({
        page: employeePage,
        limit: employeeLimit,
        search: employeeQuery || undefined,
        status: employeeStatusFilter === "All" ? undefined : employeeStatusFilter.toUpperCase(),
        role: employeeRoleFilter === "All" ? undefined : employeeRoleFilter,
        sortBy: employeeSortBy
      });
      setEmployees(data.items);
      setEmployeeTotal(data.meta.total);
      setEmployeeTotalPages(data.meta.pages);
    } catch (err) {
      console.error("Failed to fetch employees:", err);
    } finally {
      setLoadingEmployees(false);
    }
  };

  useEffect(() => {
    if (activeTab === "others") {
      loadEmployees();
    }
  }, [employeePage, employeeStatusFilter, employeeRoleFilter, employeeSortBy, activeTab, employeeLimit]);

  // Debounced search trigger for employees
  useEffect(() => {
    if (activeTab !== "others") return;
    const delay = setTimeout(() => {
      setEmployeePage(1);
      loadEmployees();
    }, 400);
    return () => clearTimeout(delay);
  }, [employeeQuery]);

  // Load employee stats when tab changes to others
  useEffect(() => {
    if (activeTab === "others") {
      loadEmployeeStats();
    }
  }, [activeTab]);

  // Handle Employee CSV Export
  const handleExportEmployeesCSV = () => {
    if (employees.length === 0) {
      Swal.fire({
        title: "No Data",
        text: "There are no employee accounts available to export.",
        icon: "warning",
        background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff",
        color: document.documentElement.classList.contains("dark") ? "#f4f4f5" : "#13222e"
      });
      return;
    }

    const headers = ["Employee Code", "First Name", "Last Name", "Email", "Role", "Salary (USD)", "Phone", "Gender", "Country", "Timezone", "Status", "Date Joined"];
    const rows = employees.map(e => [
      `EMP-${e.id.substring(0, 5).toUpperCase()}`,
      e.firstName,
      e.lastName,
      e.email,
      e.role,
      e.salary || 0,
      e.phone || "N/A",
      e.gender || "N/A",
      e.country || "Unknown",
      e.timezone || "UTC",
      e.status,
      new Date(e.createdAt).toLocaleDateString()
    ]);

    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" 
      + [headers.join(","), ...rows.map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(","))].join("\n");
      
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Employees_Report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Handle Add Employee Form Submission
  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmpModalBusy(true);
    setEmpModalStatus(null);

    try {
      await createEmployee({
        firstName: empFirstName,
        lastName: empLastName,
        email: empEmail,
        password: empPassword,
        role: empRole,
        phone: empPhone || undefined,
        gender: empGender || undefined,
        joiningDate: empJoiningDate || undefined,
        salary: empSalary ? Number(empSalary) : undefined,
        country: empCountry,
        timezone: empTimezone
      });
      setEmpModalStatus({ type: "success", message: "Employee account created successfully!" });
      
      // Reset form fields
      setEmpFirstName("");
      setEmpLastName("");
      setEmpEmail("");
      setEmpPassword("");
      setEmpPhone("");
      setEmpSalary("");
      setEmpJoiningDate("");
      
      // Reload lists
      loadEmployees();
      loadEmployeeStats();

      setTimeout(() => setShowAddEmployeeModal(false), 800);
    } catch (err) {
      setEmpModalStatus({
        type: "error",
        message: err instanceof ApiError ? err.message : "Failed to create employee account"
      });
    } finally {
      setEmpModalBusy(false);
    }
  };

  // Open Edit Employee Modal
  const openEmployeeDetailModal = (employee: EmployeeProfile, initialTab: "overview" | "edit" = "overview") => {
    setSelectedEmployee(employee);
    setDetailEmployeeTab(initialTab);
    setManageEmpFirstName(employee.firstName);
    setManageEmpLastName(employee.lastName);
    setManageEmpEmail(employee.email);
    setManageEmpRole(employee.role);
    setManageEmpStatus(employee.status);
    setManageEmpPhone(employee.phone || "");
    setManageEmpGender(employee.gender || "Male");
    setManageEmpJoiningDate(employee.joiningDate ? employee.joiningDate.split('T')[0] : "");
    setManageEmpSalary(employee.salary || "");
    setManageEmpCountry(employee.country || "");
    setManageEmpTimezone(employee.timezone || "");
    setManageEmpPassword("");
    setManageEmpStatusMsg(null);
    setActiveEmployeeMenuId(null);
  };

  // Handle Edit Employee Form Submission
  const handleUpdateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployee) return;
    setManageEmpBusy(true);
    setManageEmpStatusMsg(null);

    try {
      const updated = await updateEmployee(selectedEmployee.id, {
        firstName: manageEmpFirstName,
        lastName: manageEmpLastName,
        email: manageEmpEmail,
        role: manageEmpRole,
        status: manageEmpStatus,
        phone: manageEmpPhone || undefined,
        gender: manageEmpGender || undefined,
        joiningDate: manageEmpJoiningDate || undefined,
        salary: manageEmpSalary ? Number(manageEmpSalary) : null,
        country: manageEmpCountry || undefined,
        timezone: manageEmpTimezone || undefined,
        password: manageEmpPassword || undefined
      });
      setManageEmpStatusMsg({ type: "success", message: "Employee profile updated successfully!" });
      setSelectedEmployee(updated); // Sync details
      loadEmployees();
      loadEmployeeStats();
      setTimeout(() => setDetailEmployeeTab("overview"), 800);
    } catch (err) {
      setManageEmpStatusMsg({
        type: "error",
        message: err instanceof ApiError ? err.message : "Failed to update employee profile"
      });
    } finally {
      setManageEmpBusy(false);
    }
  };

  // Block / Unblock Employee Account
  const handleToggleBlockEmployee = async (employee: EmployeeProfile) => {
    const isBlocked = employee.status === "INACTIVE";
    const newStatus = isBlocked ? "ACTIVE" : "INACTIVE";
    const actionLabel = isBlocked ? "unblock" : "block";

    const result = await Swal.fire({
      title: `${isBlocked ? "Unblock" : "Block"} Employee?`,
      text: `Are you sure you want to ${actionLabel} ${employee.firstName} ${employee.lastName}? ${isBlocked ? "They will regain access to their portal." : "They will be force logged out and blocked from logging in."}`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: `Yes, ${actionLabel}`,
      cancelButtonText: "Cancel",
      confirmButtonColor: isBlocked ? "#10b981" : "#f85a6b",
      background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff",
      color: document.documentElement.classList.contains("dark") ? "#f4f4f5" : "#13222e"
    });

    if (result.isConfirmed) {
      try {
        await updateEmployee(employee.id, { status: newStatus });
        Swal.fire({
          title: isBlocked ? "Unblocked!" : "Blocked!",
          text: `Employee has been ${isBlocked ? "unblocked" : "blocked"} successfully.`,
          icon: "success",
          background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff",
        });
        loadEmployees();
        loadEmployeeStats();
        // Sync if open
        if (selectedEmployee && selectedEmployee.id === employee.id) {
          setSelectedEmployee(prev => prev ? { ...prev, status: newStatus } : null);
        }
      } catch (err) {
        Swal.fire({
          title: "Failed!",
          text: err instanceof ApiError ? err.message : `Could not ${actionLabel} employee.`,
          icon: "error",
          background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff",
        });
      }
    }
  };

  // Handle Delete Employee account
  const handleDeleteEmployee = async (employee: EmployeeProfile) => {
    const result = await Swal.fire({
      title: "Delete Employee Account?",
      text: `Are you sure you want to completely delete the account of ${employee.firstName} ${employee.lastName}? This operation is permanent and all data will be purged.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, Delete Account",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#f85a6b",
      background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff",
      color: document.documentElement.classList.contains("dark") ? "#f4f4f5" : "#13222e"
    });

    if (result.isConfirmed) {
      try {
        await deleteEmployee(employee.id);
        Swal.fire({
          title: "Deleted!",
          text: "Employee account has been successfully removed.",
          icon: "success",
          background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff",
        });
        loadEmployees();
        loadEmployeeStats();
        if (selectedEmployee && selectedEmployee.id === employee.id) {
          setSelectedEmployee(null);
        }
      } catch (err) {
        Swal.fire({
          title: "Failed!",
          text: err instanceof ApiError ? err.message : "Could not delete employee account.",
          icon: "error",
          background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff",
        });
      }
    }
  };

  // Open active sessions modal for employee
  const openEmployeeSessionsModal = async (employee: EmployeeProfile) => {
    setSessionsEmployee(employee);
    setLoadingEmployeeSessions(true);
    setEmployeeSessions([]);
    try {
      const data = await fetchEmployeeSessions(employee.id);
      setEmployeeSessions(data);
    } catch (err) {
      console.error("Failed to load employee sessions:", err);
    } finally {
      setLoadingEmployeeSessions(false);
    }
  };

  // Revoke specific refresh token session for employee
  const handleRevokeEmployeeSession = async (sessionId: string) => {
    if (!sessionsEmployee) return;
    try {
      await revokeEmployeeSession(sessionsEmployee.id, sessionId);
      setEmployeeSessions(prev => prev.filter(s => s.id !== sessionId));
    } catch (err) {
      console.error("Failed to revoke session:", err);
    }
  };

  // ─── Candidates Loaders & Handlers ──────────────────────────────────────────

  // Load candidate stats
  const loadCandidateStats = async () => {
    setLoadingCandidateStats(true);
    try {
      const data = await fetchCandidateStats();
      setCandidateStats(data);
    } catch (err) {
      console.error("Failed to load candidate stats:", err);
    } finally {
      setLoadingCandidateStats(false);
    }
  };

  // Load candidates list
  const loadCandidates = async () => {
    setLoadingCandidates(true);
    try {
      const data = await fetchCandidates({
        page: candidatePage,
        limit: candidateLimit,
        search: candidateQuery || undefined,
        status: candidateStatusFilter,
        sortBy: candidateSortBy
      });
      setCandidates(data.items);
      setCandidateTotal(data.meta.total);
      setCandidateTotalPages(data.meta.pages);
    } catch (err) {
      console.error("Failed to fetch candidates:", err);
    } finally {
      setLoadingCandidates(false);
    }
  };

  // Trigger loading list when filter parameters or tab changes
  useEffect(() => {
    if (activeTab === "recruitment") {
      loadCandidates();
    }
  }, [candidatePage, candidateStatusFilter, candidateSortBy, activeTab, candidateLimit]);

  // Debounced search trigger for candidates
  useEffect(() => {
    if (activeTab !== "recruitment") return;
    const delay = setTimeout(() => {
      setCandidatePage(1);
      loadCandidates();
    }, 400);
    return () => clearTimeout(delay);
  }, [candidateQuery]);

  // Load stats when tab switches to recruitment
  useEffect(() => {
    if (activeTab === "recruitment") {
      loadCandidateStats();
    }
  }, [activeTab]);

  // Seeding realistic recruitment dummy applicants
  const handleSeedCandidates = async () => {
    try {
      const res = await seedCandidates();
      Swal.fire({
        title: "Seed Complete!",
        text: `Successfully seeded ${res.count} realistic candidate applications.`,
        icon: "success",
        background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff",
      });
      loadCandidates();
      loadCandidateStats();
    } catch (err) {
      Swal.fire({
        title: "Failed!",
        text: err instanceof ApiError ? err.message : "Could not seed candidates database.",
        icon: "error",
        background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff",
      });
    }
  };

  // Update applicant status (Shortlist, Reject, Waitlist, Approve/Hire)
  const handleUpdateCandidateStatus = async (candidate: Candidate, newStatus: CandidateStatus) => {
    const actionLabelMap: Record<string, string> = {
      SHORTLISTED: "shortlist",
      REJECTED: "reject",
      WAITING: "waitlist",
      APPROVED: "approve and hire"
    };
    const actionLabel = actionLabelMap[newStatus] || "update";

    const result = await Swal.fire({
      title: `Confirm ${newStatus}?`,
      text: `Are you sure you want to ${actionLabel} ${candidate.firstName} ${candidate.lastName}?`,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Confirm Action",
      cancelButtonText: "Cancel",
      background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff",
      color: document.documentElement.classList.contains("dark") ? "#f4f4f5" : "#13222e"
    });

    if (result.isConfirmed) {
      try {
        await updateCandidate(candidate.id, { status: newStatus });
        
        // If they are hired, let's notify the user
        if (newStatus === "APPROVED") {
          Swal.fire({
            title: "Applicant Approved!",
            text: `${candidate.firstName} ${candidate.lastName} has been approved. You can now register them as a Teacher in the Teachers console!`,
            icon: "success",
            background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff",
          });
        } else {
          Swal.fire({
            title: "Status Updated!",
            text: `Applicant status set to ${newStatus} successfully.`,
            icon: "success",
            background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff",
          });
        }
        
        loadCandidates();
        loadCandidateStats();
        // Sync if selected modal is open
        if (selectedCandidate && selectedCandidate.id === candidate.id) {
          setSelectedCandidate(prev => prev ? { ...prev, status: newStatus } : null);
        }
      } catch (err) {
        Swal.fire({
          title: "Error!",
          text: err instanceof ApiError ? err.message : "Failed to update candidate status.",
          icon: "error",
          background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff",
        });
      }
    }
  };

  // Delete candidate application
  const handleDeleteCandidate = async (candidate: Candidate) => {
    const result = await Swal.fire({
      title: "Delete Application?",
      text: `Are you sure you want to delete ${candidate.firstName} ${candidate.lastName}'s application? This action is permanent.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, Delete",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#f85a6b",
      background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff",
      color: document.documentElement.classList.contains("dark") ? "#f4f4f5" : "#13222e"
    });

    if (result.isConfirmed) {
      try {
        await deleteCandidate(candidate.id);
        Swal.fire({
          title: "Deleted!",
          text: "Applicant file successfully deleted.",
          icon: "success",
          background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff",
        });
        loadCandidates();
        loadCandidateStats();
        if (selectedCandidate && selectedCandidate.id === candidate.id) {
          setSelectedCandidate(null);
        }
      } catch (err) {
        Swal.fire({
          title: "Error!",
          text: err instanceof ApiError ? err.message : "Failed to delete candidate.",
          icon: "error",
          background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff",
        });
      }
    }
  };

  // Update candidate notes
  const handleSaveCandidateNotes = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCandidate) return;
    setManageCandidateBusy(true);
    try {
      const updated = await updateCandidate(selectedCandidate.id, {
        notes: manageCandidateNotes
      });
      setSelectedCandidate(updated);
      Swal.fire({
        title: "Notes Saved!",
        text: "Applicant notes updated successfully.",
        icon: "success",
        toast: true,
        position: "top-end",
        showConfirmButton: false,
        timer: 3000,
        background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff",
      });
      loadCandidates();
    } catch (err) {
      console.error(err);
    } finally {
      setManageCandidateBusy(false);
    }
  };

  const openCandidateOverviewModal = (candidate: Candidate) => {
    setSelectedCandidate(candidate);
    setManageCandidateNotes(candidate.notes || "");
    setActiveCandidateMenuId(null);
  };

  // ─── Leave Requests Loaders & Handlers ─────────────────────────────────────

  // Load leave stats
  const loadLeaveStatsData = async () => {
    setLoadingLeaveStats(true);
    try {
      const data = await fetchLeaveStats();
      setLeaveStats(data);
    } catch (err) {
      console.error("Failed to load leave stats:", err);
    } finally {
      setLoadingLeaveStats(false);
    }
  };

  // Load leaves list
  const loadLeavesData = async () => {
    setLoadingLeaves(true);
    try {
      const data = await fetchLeaves({
        page: leavePage,
        limit: leaveLimit,
        search: leaveQuery || undefined,
        status: leaveStatusFilter,
        sortBy: leaveSortBy
      });
      setLeaves(data.items);
      setLeaveTotal(data.meta.total);
      setLeaveTotalPages(data.meta.pages);
    } catch (err) {
      console.error("Failed to fetch leaves:", err);
    } finally {
      setLoadingLeaves(false);
    }
  };

  // Trigger loading list when filters or tab changes
  useEffect(() => {
    if (activeTab === "leave") {
      loadLeavesData();
    }
  }, [leavePage, leaveStatusFilter, leaveSortBy, activeTab, leaveLimit]);

  // Debounced search trigger for leaves
  useEffect(() => {
    if (activeTab !== "leave") return;
    const delay = setTimeout(() => {
      setLeavePage(1);
      loadLeavesData();
    }, 400);
    return () => clearTimeout(delay);
  }, [leaveQuery]);

  // Load stats when tab switches to leave
  useEffect(() => {
    if (activeTab === "leave") {
      loadLeaveStatsData();
    }
  }, [activeTab]);

  // Seeding leave requests helper
  const handleSeedLeavesData = async () => {
    try {
      const res = await seedLeaves();
      Swal.fire({
        title: "Seed Complete!",
        text: `Successfully seeded ${res.seededCount} leave requests for evaluation.`,
        icon: "success",
        background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff",
      });
      loadLeavesData();
      loadLeaveStatsData();
    } catch (err) {
      Swal.fire({
        title: "Failed!",
        text: err instanceof ApiError ? err.message : "Could not seed leaves database.",
        icon: "error",
        background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff",
      });
    }
  };

  // Update leave request status (Approve / Decline)
  const handleUpdateLeaveStatus = async (leave: LeaveRequest, newStatus: LeaveRequestStatus) => {
    const actionLabel = newStatus === "APPROVED" ? "approve" : "decline";
    const result = await Swal.fire({
      title: `Confirm ${newStatus}?`,
      text: `Are you sure you want to ${actionLabel} the leave request for ${leave.user.firstName} ${leave.user.lastName}?`,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: `Yes, ${actionLabel}`,
      cancelButtonText: "Cancel",
      background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff",
      color: document.documentElement.classList.contains("dark") ? "#f4f4f5" : "#13222e"
    });

    if (result.isConfirmed) {
      try {
        await updateLeave(leave.id, { status: newStatus });
        Swal.fire({
          title: "Status Updated!",
          text: `Leave request status set to ${newStatus} successfully.`,
          icon: "success",
          background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff",
        });
        loadLeavesData();
        loadLeaveStatsData();
        if (selectedLeave && selectedLeave.id === leave.id) {
          setSelectedLeave(prev => prev ? { ...prev, status: newStatus } : null);
        }
      } catch (err) {
        Swal.fire({
          title: "Error!",
          text: err instanceof ApiError ? err.message : "Failed to update leave status.",
          icon: "error",
          background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff",
        });
      }
    }
  };

  // Save Leave Admin Notes
  const handleSaveLeaveNotes = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLeave) return;
    setManageLeaveBusy(true);
    try {
      const updated = await updateLeave(selectedLeave.id, {
        adminNotes: manageLeaveNotes
      });
      setSelectedLeave(updated);
      Swal.fire({
        title: "Notes Saved!",
        text: "Leave administrator notes updated successfully.",
        icon: "success",
        toast: true,
        position: "top-end",
        showConfirmButton: false,
        timer: 3000,
        background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff",
      });
      loadLeavesData();
    } catch (err) {
      console.error(err);
    } finally {
      setManageLeaveBusy(false);
    }
  };

  // Delete leave request record
  const handleDeleteLeave = async (leave: LeaveRequest) => {
    const result = await Swal.fire({
      title: "Delete Leave Request?",
      text: `Are you sure you want to permanently delete the leave request for ${leave.user.firstName} ${leave.user.lastName}?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, Delete",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#f85a6b",
      background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff",
      color: document.documentElement.classList.contains("dark") ? "#f4f4f5" : "#13222e"
    });

    if (result.isConfirmed) {
      try {
        await deleteLeave(leave.id);
        Swal.fire({
          title: "Deleted!",
          text: "Leave request record deleted successfully.",
          icon: "success",
          background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff",
        });
        loadLeavesData();
        loadLeaveStatsData();
        if (selectedLeave && selectedLeave.id === leave.id) {
          setSelectedLeave(null);
        }
      } catch (err) {
        Swal.fire({
          title: "Error!",
          text: err instanceof ApiError ? err.message : "Failed to delete leave request.",
          icon: "error",
          background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff",
        });
      }
    }
  };

  const openLeaveOverviewModal = (leave: LeaveRequest) => {
    setSelectedLeave(leave);
    setManageLeaveNotes(leave.adminNotes || "");
    setActiveLeaveMenuId(null);
  };

  return (
    <>
      <Topbar title={TAB_META[activeTab].title} subtitle={TAB_META[activeTab].subtitle} />

      <div className="animate-fade-up p-4 sm:p-6 space-y-6">
        {activeTab === "teachers" ? (
          <>
            {/* Summary statistics row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Total/Status Counts card */}
              <Card className="p-5 flex flex-col justify-between border-hairline shadow-md bg-surface hover:shadow-lg transition-all duration-300 relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-24 h-24 bg-accent/5 rounded-full blur-xl group-hover:bg-accent/10 transition-all duration-300" />
                <div className="flex items-center justify-between border-b border-hairline pb-3.5 mb-3.5 relative">
                  <div>
                    <h3 className="font-extrabold text-ink text-sm">Teachers Status</h3>
                    <span className="text-[10px] text-ink-3">Live employee counts</span>
                  </div>
                  <div className="size-9 rounded-xl bg-accent/8 flex items-center justify-center text-accent">
                    <UserCheck className="size-4.5" />
                  </div>
                </div>
                
                {loadingStats ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="size-5 animate-spin text-ink-3" />
                  </div>
                ) : (
                  <div className="space-y-3.5 relative">
                    <div className="flex items-center justify-between p-2 rounded-xl hover:bg-surface-2/45 transition">
                      <div className="flex items-center gap-2.5">
                        <span className="size-2.5 rounded-full bg-good shadow-[0_0_8px_#10b981]" />
                        <span className="text-xs font-bold text-ink-2">Active Teachers</span>
                      </div>
                      <span className="text-sm font-black text-ink">{stats?.active ?? 0}</span>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded-xl hover:bg-surface-2/45 transition">
                      <div className="flex items-center gap-2.5">
                        <span className="size-2.5 rounded-full bg-neutral shadow-[0_0_8px_#6b7280]" />
                        <span className="text-xs font-bold text-ink-2">Inactive Teachers</span>
                      </div>
                      <span className="text-sm font-black text-ink">{stats?.inactive ?? 0}</span>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded-xl hover:bg-surface-2/45 transition">
                      <div className="flex items-center gap-2.5">
                        <span className="size-2.5 rounded-full bg-warning shadow-[0_0_8px_#ffb822]" />
                        <span className="text-xs font-bold text-ink-2">Teachers on Leave</span>
                      </div>
                      <span className="text-sm font-black text-ink">{stats?.onLeave ?? 0}</span>
                    </div>
                  </div>
                )}
              </Card>

              {/* Specialisation chart card */}
              <Card className="p-5 flex flex-col justify-between border-hairline shadow-md bg-surface hover:shadow-lg transition-all duration-300 relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-24 h-24 bg-good/5 rounded-full blur-xl group-hover:bg-good/10 transition-all duration-300" />
                <div className="flex items-center justify-between border-b border-hairline pb-3.5 mb-2 relative">
                  <div>
                    <h3 className="font-extrabold text-ink text-sm">Specialisation Fields</h3>
                    <span className="text-[10px] text-ink-3">Subjects handled by teachers</span>
                  </div>
                  <div className="size-9 rounded-xl bg-good/8 flex items-center justify-center text-good-ink">
                    <GraduationCap className="size-4.5" />
                  </div>
                </div>

                {loadingStats ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="size-5 animate-spin text-ink-3" />
                  </div>
                ) : stats?.specialisations && stats.specialisations.length > 0 ? (
                  <div className="h-32 w-full flex items-center justify-between gap-2 relative">
                    <div className="w-1/2 h-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={stats.specialisations}
                            dataKey="count"
                            nameKey="specialisation"
                            cx="50%"
                            cy="50%"
                            innerRadius={25}
                            outerRadius={45}
                            paddingAngle={2}
                          >
                            {stats.specialisations.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={STATS_COLORS[index % STATS_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip 
                            contentStyle={{ fontSize: "10px", borderRadius: "8px" }} 
                            formatter={(value, name) => [value, name]}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="w-1/2 overflow-y-auto max-h-full space-y-1.5 scrollbar-thin">
                      {stats.specialisations.map((spec, i) => (
                        <div key={spec.specialisation} className="flex items-center justify-between gap-1 p-1 rounded-lg hover:bg-surface-2/30 transition">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span 
                              className="size-2 rounded-full shrink-0" 
                              style={{ backgroundColor: STATS_COLORS[i % STATS_COLORS.length] }} 
                            />
                            <span className="text-[10px] font-bold text-ink-2 truncate">{spec.specialisation}</span>
                          </div>
                          <span className="text-[10px] font-black text-ink">{spec.count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-6 text-xs text-ink-3 relative">No specialisation data available</div>
                )}
              </Card>

              {/* Countries card */}
              <Card className="p-5 flex flex-col justify-between border-hairline shadow-md bg-surface hover:shadow-lg transition-all duration-300 relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-24 h-24 bg-warning/5 rounded-full blur-xl group-hover:bg-warning/10 transition-all duration-300" />
                <div className="flex items-center justify-between border-b border-hairline pb-3.5 mb-2 relative">
                  <div>
                    <h3 className="font-extrabold text-ink text-sm">Instructor Locations</h3>
                    <span className="text-[10px] text-ink-3">Country metrics</span>
                  </div>
                  <div className="size-9 rounded-xl bg-warning/8 flex items-center justify-center text-warning-ink">
                    <Globe className="size-4.5" />
                  </div>
                </div>

                {loadingStats ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="size-5 animate-spin text-ink-3" />
                  </div>
                ) : stats?.countries && stats.countries.length > 0 ? (
                  <div className="space-y-2 overflow-y-auto max-h-32 pr-1 scrollbar-thin relative">
                    {stats.countries.slice(0, 4).map((c) => (
                      <div key={c.country} className="flex items-center justify-between py-1.5 border-b border-hairline last:border-0 hover:bg-surface-2/15 px-1 rounded transition">
                        <span className="text-xs font-semibold text-ink-2 flex items-center gap-1.5">
                          <MapPin className="size-3.5 text-ink-3" />
                          {c.country}
                        </span>
                        <Badge tone="accent" className="font-black text-[10px] px-2.5 py-0.5">{c.count} {c.count === 1 ? 'teacher' : 'teachers'}</Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6 text-xs text-ink-3 relative">No location data available</div>
                )}
              </Card>
            </div>

            {/* Actions & Filters section */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-surface p-4 border border-hairline rounded-2xl shadow-sm">
              <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
                {/* Search query box */}
                <div className="relative w-full sm:w-60">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-ink-3" />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search by name, email, code..."
                    className="h-10 w-full rounded-xl border border-hairline bg-surface-2/45 pl-10 pr-4 text-xs text-ink focus:outline-none focus:border-accent transition-all duration-200"
                  />
                  {query && (
                    <button onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-3 hover:text-ink">
                      <X className="size-4" />
                    </button>
                  )}
                </div>

                {/* Status Filter */}
                <select
                  value={filter}
                  onChange={(e) => { setFilter(e.target.value as any); setPage(1); }}
                  className="h-10 rounded-xl border border-hairline bg-surface-2/45 px-3 text-xs font-bold text-ink-2 focus:outline-none"
                >
                  <option value="All">All Statuses</option>
                  {STATUS_FILTERS.slice(1).map(f => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>

                {/* Specialisation Filter */}
                <select
                  value={selectedSpec}
                  onChange={(e) => { setSelectedSpec(e.target.value); setPage(1); }}
                  className="h-10 rounded-xl border border-hairline bg-surface-2/45 px-3 text-xs font-bold text-ink-2 focus:outline-none"
                >
                  <option value="All">All Subjects</option>
                  {stats?.specialisations.map(s => (
                    <option key={s.specialisation} value={s.specialisation}>{s.specialisation}</option>
                  ))}
                </select>

                {/* Sort Option */}
                <select
                  value={sortBy}
                  onChange={(e) => { setSortBy(e.target.value); setPage(1); }}
                  className="h-10 rounded-xl border border-hairline bg-surface-2/45 px-3 text-xs font-bold text-ink-2 focus:outline-none"
                >
                  <option value="name_asc">Sort: Name (A-Z)</option>
                  <option value="name_desc">Sort: Name (Z-A)</option>
                  <option value="rate_asc">Sort: Rate (Low-High)</option>
                  <option value="rate_desc">Sort: Rate (High-Low)</option>
                  <option value="date_desc">Sort: Join Date (Newest)</option>
                  <option value="date_asc">Sort: Join Date (Oldest)</option>
                </select>
              </div>

              {/* Action Buttons: Export & Add */}
              <div className="flex items-center gap-2 shrink-0">
                {teachers.length > 0 && (
                  <label className="flex items-center gap-1.5 px-3 py-2 border border-hairline rounded-xl text-xs font-bold text-ink-2 bg-surface hover:bg-surface-2 cursor-pointer transition select-none mr-1">
                    <input 
                      type="checkbox"
                      checked={selectedIds.length === teachers.length && teachers.length > 0}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      className="rounded border-hairline text-accent size-4 cursor-pointer focus:ring-0"
                    />
                    <span>Select All</span>
                  </label>
                )}
                <Button
                  onClick={handleExportCSV}
                  variant="outline"
                  className="h-10 rounded-xl border border-hairline font-bold text-xs text-ink-2 px-4 shadow-sm hover:bg-surface-2 shrink-0 cursor-pointer"
                >
                  <Download className="size-4 mr-1.5 stroke-[2.5]" />
                  Export CSV
                </Button>

                <Button
                  onClick={() => { setModalStatus(null); setShowAddModal(true); }}
                  className="h-10 rounded-xl bg-accent font-bold text-white px-5 shadow-sm hover:scale-[1.01] active:scale-[0.99] transition-all shrink-0 cursor-pointer animate-fade-in"
                >
                  <Plus className="size-4 mr-1.5 stroke-[2.5]" />
                  Add Teacher
                </Button>
              </div>
            </div>

            {/* Loading Grid spinner */}
            {loading ? (
              <div className="border border-hairline/80 rounded-3xl bg-surface py-20 text-center shadow-sm">
                <Loader2 className="size-8 animate-spin mx-auto text-ink-3" />
                <p className="text-sm font-bold text-ink-3 mt-3">Loading teachers directory...</p>
              </div>
            ) : teachers.length > 0 ? (
              <div className="space-y-6">
                {/* Teachers Grid layout */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6 animate-fade-up">
                  {teachers.map((teacher) => {
                    const stars = (teacher.id.charCodeAt(0) % 2) + 4; // stable mock rating [4-5 stars]
                    const activeCount = teacher._count?.enrollments ?? 0;
                    const classesCount = teacher._count?.classes ?? 0;
                    const isSelected = selectedIds.includes(teacher.id);

                    return (
                      <Card 
                        key={teacher.id} 
                        className={cn(
                          "group border border-hairline/80 rounded-3xl bg-surface hover:shadow-xl hover:border-accent/40 transition-all duration-300 flex flex-col justify-between relative",
                          isSelected && "ring-2 ring-accent border-accent/60 shadow-lg bg-accent-soft/5"
                        )}
                      >
                        {/* Select Checkbox Overlay */}
                        <div className="absolute top-3.5 right-10 z-10">
                          <input 
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => handleSelectRow(teacher.id, e.target.checked)}
                            className="rounded border-hairline text-accent size-4 cursor-pointer focus:ring-0 bg-white/95"
                          />
                        </div>

                        {/* Hourly Rate Pill Badge */}
                        <div className="absolute top-3 left-3 z-10">
                          <Badge tone="accent" className="font-extrabold text-[10px] px-2 py-0.5 shadow-sm">
                            ${teacher.hourlyRate || 0}/hr
                          </Badge>
                        </div>

                        {/* Profile header visual decoration */}
                        <div className="h-14 bg-gradient-to-r from-accent/20 to-[#386FA4]/20 rounded-t-[22px] relative" />

                        {/* Profile Info block */}
                        <div className="px-5 pb-5 pt-0 text-center flex-1 flex flex-col items-center justify-between relative -mt-9">
                          {/* Avatar icon */}
                          <div className={cn(
                            "size-18 rounded-2xl border-4 border-surface bg-surface-2 shadow-sm flex items-center justify-center font-bold text-xl text-accent-hover tracking-wide group-hover:scale-105 transition-transform duration-300 relative overflow-hidden select-none mb-3.5",
                            teacher.user.status === "ACTIVE" ? "ring-2 ring-good/40 ring-offset-2" : ""
                          )}>
                            {teacher.user.avatarUrl ? (
                              <img src={teacher.user.avatarUrl} alt="Avatar" className="size-full object-cover" />
                            ) : (
                              initials(`${teacher.user.firstName} ${teacher.user.lastName}`)
                            )}
                          </div>

                          <div className="space-y-1 w-full flex-1 flex flex-col items-center justify-start">
                            {/* Status label */}
                            <Badge tone={statusTone[teacher.user.status] || "neutral"} className="text-[9px] uppercase tracking-wider scale-90 mb-1">
                              {teacher.user.status}
                            </Badge>

                            {/* Code */}
                            <span className="block text-[10px] font-mono text-ink-3">{teacher.teacherCode}</span>

                            {/* Name */}
                            <h4 className="font-extrabold text-ink text-sm truncate pt-1 leading-snug group-hover:text-accent transition">
                              {teacher.user.firstName} {teacher.user.lastName}
                            </h4>

                            {/* Specialization */}
                            <span className="block text-xs font-extrabold text-ink-3 leading-normal">
                              Instructor{teacher.archived ? " · Archived" : ""}
                            </span>

                            {/* Subjects */}
                            {teacher.subjects && teacher.subjects.length > 0 && (
                              <div className="flex flex-wrap justify-center gap-1 mt-1.5">
                                {teacher.subjects.slice(0, 3).map((s) => (
                                  <span key={s} className="rounded-md bg-accent/10 px-1.5 py-0.5 text-[9px] font-bold text-accent">{s}</span>
                                ))}
                                {teacher.subjects.length > 3 && <span className="text-[9px] font-bold text-ink-3">+{teacher.subjects.length - 3}</span>}
                              </div>
                            )}

                            {/* Stars rating */}
                            <div className="flex justify-center gap-0.5 py-1">
                              {Array.from({ length: 5 }).map((_, i) => (
                                <svg 
                                  key={i} 
                                  className={cn("size-3.5", i < stars ? "text-warning fill-warning" : "text-surface-3 fill-surface-3")}
                                  xmlns="http://www.w3.org/2000/svg" 
                                  viewBox="0 0 24 24"
                                >
                                  <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                                </svg>
                              ))}
                            </div>

                            {/* Real Counts Row */}
                            <div className="flex items-center justify-center gap-4 w-full mt-2.5 py-1.5 border-y border-hairline/45 bg-surface-2/15 rounded-xl">
                              <div className="text-center">
                                <span className="flex items-center justify-center gap-1 text-[10px] text-ink-3 font-semibold">
                                  <Users className="size-3 text-accent" />
                                  Students
                                </span>
                                <span className="text-xs font-black text-ink leading-none block mt-0.5">{activeCount}</span>
                              </div>
                              <div className="h-5 w-hairline bg-hairline/60" />
                              <div className="text-center">
                                <span className="flex items-center justify-center gap-1 text-[10px] text-ink-3 font-semibold">
                                  <BookOpen className="size-3 text-good" />
                                  Classes
                                </span>
                                <span className="text-xs font-black text-ink leading-none block mt-0.5">{classesCount}</span>
                              </div>
                            </div>
                          </div>

                          {/* Quick buttons */}
                          <div className="w-full space-y-2 mt-4 pt-3 border-t border-hairline/60">
                            {/* Portal Access Button */}
                            <button
                              onClick={() => loadSessions(teacher)}
                              className="w-full h-8.5 rounded-lg border border-hairline bg-surface hover:bg-surface-2 text-ink-2 font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                            >
                              <Key className="size-3.5 text-accent" />
                              Portal Access
                            </button>

                            {/* View Profile Button */}
                            <button
                              onClick={() => openDetailModal(teacher, "overview")}
                              className="w-full h-8.5 rounded-lg bg-accent/5 hover:bg-accent hover:text-white text-accent font-extrabold text-xs transition cursor-pointer"
                            >
                              View Profile
                            </button>
                          </div>
                        </div>

                        {/* Card Hover dropdown trigger */}
                        <div className="absolute top-2 right-2">
                          <button
                            onClick={() => setActiveMenuId(prev => prev === teacher.id ? null : teacher.id)}
                            className="size-7 rounded-lg bg-surface/80 hover:bg-surface border border-hairline/40 flex items-center justify-center text-ink-3 hover:text-ink focus:outline-none cursor-pointer"
                          >
                            <MoreVertical className="size-4" />
                          </button>
                          {activeMenuId === teacher.id && (
                            <>
                              <div className="fixed inset-0 z-10" onClick={() => setActiveMenuId(null)} />
                              <div className="absolute right-0 mt-1 w-40 rounded-xl border border-hairline bg-surface shadow-pop p-1 z-20 animate-fade-in">
                                <button
                                  onClick={() => {
                                    setActiveMenuId(null);
                                    router.push(`/teachers/${teacher.id}`);
                                  }}
                                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-semibold text-ink hover:bg-surface-2 transition cursor-pointer"
                                >
                                  <GraduationCap className="size-3.5 text-accent" />
                                  Manage
                                </button>
                                <button
                                  onClick={() => {
                                    setActiveMenuId(null);
                                    setDetailsTeacher(teacher);
                                  }}
                                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-semibold text-ink hover:bg-surface-2 transition cursor-pointer"
                                >
                                  <FileText className="size-3.5 text-accent" />
                                  Full Details
                                </button>
                                <button
                                  onClick={() => openDetailModal(teacher, "edit")}
                                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-semibold text-ink hover:bg-surface-2 transition cursor-pointer"
                                >
                                  <Edit2 className="size-3.5 text-accent" />
                                  Edit details
                                </button>
                                <button
                                  onClick={() => {
                                    setActiveMenuId(null);
                                    handleToggleBlockTeacher(teacher);
                                  }}
                                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-semibold text-ink hover:bg-surface-2 transition cursor-pointer"
                                >
                                  <Lock className="size-3.5 text-accent" />
                                  {teacher.user.status === "INACTIVE" ? "Unblock account" : "Block account"}
                                </button>
                                <button
                                  onClick={async () => {
                                    setActiveMenuId(null);
                                    const target = !teacher.archived;
                                    const ok = await Swal.fire({ title: target ? "Archive teacher?" : "Unarchive teacher?", text: target ? "Account will be deactivated but not deleted." : "Account will be reactivated.", icon: "question", showCancelButton: true, confirmButtonText: target ? "Archive" : "Unarchive", background: (typeof document !== "undefined" && document.documentElement.classList.contains("dark")) ? "#18181b" : "#ffffff" });
                                    if (!ok.isConfirmed) return;
                                    try { await archiveTeacher(teacher.id, target); loadTeachers(); } catch { Swal.fire({ title: "Failed", icon: "error" }); }
                                  }}
                                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-semibold text-ink hover:bg-surface-2 transition cursor-pointer"
                                >
                                  <FileText className="size-3.5 text-accent" />
                                  {teacher.archived ? "Unarchive" : "Archive"}
                                </button>
                                {isAdmin && (
                                <button
                                  onClick={() => handleDeleteTeacher(teacher)}
                                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-semibold text-critical hover:bg-critical/5 transition cursor-pointer"
                                >
                                  <Trash2 className="size-3.5" />
                                  Delete profile
                                </button>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      </Card>
                    );
                  })}
                </div>

                {/* Pagination Controls */}
                <div className="flex items-center justify-between border-t border-hairline pt-6 flex-wrap gap-4 select-none">
                  <div className="flex items-center gap-4 flex-wrap">
                    <span className="text-xs text-ink-3 font-medium">
                      Showing {teachers.length} of {total} instructors
                    </span>
                    <div className="flex items-center gap-1.5 text-xs text-ink-3 font-semibold">
                      <span>Show:</span>
                      <select
                        value={teacherLimit}
                        onChange={(e) => {
                          setTeacherLimit(Number(e.target.value));
                          setPage(1);
                        }}
                        className="h-7 rounded-lg border border-hairline bg-surface px-1.5 text-xs font-bold text-ink-2 focus:outline-none cursor-pointer"
                      >
                        <option value={10}>10</option>
                        <option value={20}>20</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                      </select>
                    </div>
                  </div>
                  {totalPages > 1 && (
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page === 1}
                        onClick={() => setPage(p => p - 1)}
                        className="rounded-xl border-hairline font-bold text-xs h-9 text-ink-2 cursor-pointer"
                      >
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page === totalPages}
                        onClick={() => setPage(p => p + 1)}
                        className="rounded-xl border-hairline font-bold text-xs h-9 text-ink-2 cursor-pointer"
                      >
                        Next
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="border border-hairline/80 rounded-3xl bg-surface py-20 text-center shadow-sm">
                <Users className="size-10 mx-auto text-ink-3 stroke-1 animate-pulse" />
                <h3 className="font-bold text-ink mt-4 text-base">No Teachers Found</h3>
                <p className="text-xs text-ink-3 max-w-sm mx-auto mt-1.5 leading-relaxed">
                  We couldn't find any teacher accounts matching your active filters. Try refining your search query or status criteria.
                </p>
                <Button
                  onClick={() => { setQuery(""); setFilter("All"); setSelectedSpec("All"); setSortBy("name_asc"); }}
                  className="mt-5 h-9 rounded-xl border border-hairline hover:bg-surface-2 text-ink-2 font-bold text-xs px-4 cursor-pointer"
                >
                  Reset Filters
                </Button>
              </div>
            )}
          </>
        ) : activeTab === "others" ? (
          <>
            {/* Summary statistics row for Employees */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Employee Status Card */}
              <Card className="p-5 flex flex-col justify-between border-hairline shadow-md bg-surface hover:shadow-lg transition-all duration-300 relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-24 h-24 bg-accent/5 rounded-full blur-xl group-hover:bg-accent/10 transition-all duration-300" />
                <div className="flex items-center justify-between border-b border-hairline pb-3.5 mb-3.5 relative">
                  <div>
                    <h3 className="font-extrabold text-ink text-sm">Employees Status</h3>
                    <span className="text-[10px] text-ink-3">Live staff counts</span>
                  </div>
                  <div className="size-9 rounded-xl bg-accent/8 flex items-center justify-center text-accent">
                    <UserCheck className="size-4.5" />
                  </div>
                </div>
                {loadingEmployeeStats ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="size-5 animate-spin text-ink-3" />
                  </div>
                ) : (
                  <div className="space-y-3.5 relative">
                    <div className="flex items-center justify-between p-2 rounded-xl hover:bg-surface-2/45 transition">
                      <div className="flex items-center gap-2.5">
                        <span className="size-2.5 rounded-full bg-good shadow-[0_0_8px_#10b981]" />
                        <span className="text-xs font-bold text-ink-2">Active Staff</span>
                      </div>
                      <span className="text-sm font-black text-ink">{employeeStats?.active ?? 0}</span>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded-xl hover:bg-surface-2/45 transition">
                      <div className="flex items-center gap-2.5">
                        <span className="size-2.5 rounded-full bg-neutral shadow-[0_0_8px_#6b7280]" />
                        <span className="text-xs font-bold text-ink-2">Inactive Staff</span>
                      </div>
                      <span className="text-sm font-black text-ink">{employeeStats?.inactive ?? 0}</span>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded-xl hover:bg-surface-2/45 transition">
                      <div className="flex items-center gap-2.5">
                        <span className="size-2.5 rounded-full bg-warning shadow-[0_0_8px_#ffb822]" />
                        <span className="text-xs font-bold text-ink-2">Pending Staff</span>
                      </div>
                      <span className="text-sm font-black text-ink">{employeeStats?.pending ?? 0}</span>
                    </div>
                  </div>
                )}
              </Card>

              {/* Role distribution card */}
              <Card className="p-5 flex flex-col justify-between border-hairline shadow-md bg-surface hover:shadow-lg transition-all duration-300 relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-24 h-24 bg-good/5 rounded-full blur-xl group-hover:bg-good/10 transition-all duration-300" />
                <div className="flex items-center justify-between border-b border-hairline pb-3.5 mb-2 relative">
                  <div>
                    <h3 className="font-extrabold text-ink text-sm">Role Distribution</h3>
                    <span className="text-[10px] text-ink-3">Staff assigned role metrics</span>
                  </div>
                  <div className="size-9 rounded-xl bg-good/8 flex items-center justify-center text-good-ink">
                    <Users className="size-4.5" />
                  </div>
                </div>
                {loadingEmployeeStats ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="size-5 animate-spin text-ink-3" />
                  </div>
                ) : (
                  <div className="space-y-3.5 relative">
                    <div className="flex items-center justify-between p-2 rounded-xl hover:bg-surface-2/45 transition">
                      <div className="flex items-center gap-2.5">
                        <span className="size-2.5 rounded-full bg-[#133C55] shadow-[0_0_8px_#133C55]" />
                        <span className="text-xs font-bold text-ink-2">Administrators</span>
                      </div>
                      <span className="text-sm font-black text-ink">{employeeStats?.adminsCount ?? 0}</span>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded-xl hover:bg-surface-2/45 transition">
                      <div className="flex items-center gap-2.5">
                        <span className="size-2.5 rounded-full bg-[#386FA4] shadow-[0_0_8px_#386FA4]" />
                        <span className="text-xs font-bold text-ink-2">Supervisors</span>
                      </div>
                      <span className="text-sm font-black text-ink">{employeeStats?.supervisorsCount ?? 0}</span>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded-xl hover:bg-surface-2/45 transition">
                      <div className="flex items-center gap-2.5">
                        <span className="size-2.5 rounded-full bg-[#59A5D8] shadow-[0_0_8px_#59A5D8]" />
                        <span className="text-xs font-bold text-ink-2">Academic Coaches</span>
                      </div>
                      <span className="text-sm font-black text-ink">{employeeStats?.coachesCount ?? 0}</span>
                    </div>
                  </div>
                )}
              </Card>

              {/* Payroll overview card */}
              <Card className="p-5 flex flex-col justify-between border-hairline shadow-md bg-surface hover:shadow-lg transition-all duration-300 relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-24 h-24 bg-warning/5 rounded-full blur-xl group-hover:bg-warning/10 transition-all duration-300" />
                <div className="flex items-center justify-between border-b border-hairline pb-3.5 mb-2 relative">
                  <div>
                    <h3 className="font-extrabold text-ink text-sm">Payroll Overview</h3>
                    <span className="text-[10px] text-ink-3">Salary expenditures scale</span>
                  </div>
                  <div className="size-9 rounded-xl bg-warning/8 flex items-center justify-center text-warning-ink">
                    <DollarSign className="size-4.5" />
                  </div>
                </div>
                {loadingEmployeeStats ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="size-5 animate-spin text-ink-3" />
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col justify-center items-center py-4 relative">
                    <span className="text-3xl font-black text-ink tracking-tight">
                      ${(employeeStats?.totalSalary ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    <span className="text-[10px] font-bold text-ink-3 uppercase tracking-wider mt-1.5">Total Monthly Payroll</span>
                  </div>
                )}
              </Card>
            </div>

            {/* Actions & Filters section for Employees */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-surface p-4 border border-hairline rounded-2xl shadow-sm">
              <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
                <div className="relative flex-1 sm:flex-initial">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-ink-3" />
                  <input
                    type="text"
                    value={employeeQuery}
                    onChange={(e) => setEmployeeQuery(e.target.value)}
                    placeholder="Search by name, email, code..."
                    className="h-10 w-full sm:w-64 pl-9 pr-3 rounded-xl border border-hairline bg-surface text-xs text-ink focus:outline-none focus:border-accent"
                  />
                </div>
                <select
                  value={employeeStatusFilter}
                  onChange={(e) => { setEmployeeStatusFilter(e.target.value); setEmployeePage(1); }}
                  className="h-10 rounded-xl border border-hairline bg-surface px-3 text-xs font-semibold text-ink-2 focus:outline-none"
                >
                  <option value="All">All Statuses</option>
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                  <option value="Pending">Pending</option>
                </select>
                <select
                  value={employeeRoleFilter}
                  onChange={(e) => { setEmployeeRoleFilter(e.target.value); setEmployeePage(1); }}
                  className="h-10 rounded-xl border border-hairline bg-surface px-3 text-xs font-semibold text-ink-2 focus:outline-none"
                >
                  <option value="All">All Roles</option>
                  <option value="ADMIN">Administrator</option>
                  <option value="SUPERVISOR">Supervisor</option>
                  <option value="ACADEMIC_COACH">Academic Coach</option>
                </select>
                <select
                  value={employeeSortBy}
                  onChange={(e) => { setEmployeeSortBy(e.target.value); setEmployeePage(1); }}
                  className="h-10 rounded-xl border border-hairline bg-surface px-3 text-xs font-semibold text-ink-2 focus:outline-none"
                >
                  <option value="name_asc">Sort: Name (A-Z)</option>
                  <option value="name_desc">Sort: Name (Z-A)</option>
                  <option value="salary_asc">Sort: Salary (Low to High)</option>
                  <option value="salary_desc">Sort: Salary (High to Low)</option>
                </select>
              </div>

              <div className="flex gap-2 shrink-0">
                <Button
                  variant="outline"
                  onClick={handleExportEmployeesCSV}
                  className="h-10 rounded-xl border border-hairline font-bold text-xs hover:bg-surface-2 text-ink-2 cursor-pointer flex items-center gap-1.5"
                >
                  <Download className="size-3.5" />
                  Export CSV
                </Button>
                <Button
                  variant="primary"
                  onClick={() => setShowAddEmployeeModal(true)}
                  className="h-10 rounded-xl bg-accent font-bold text-white text-xs cursor-pointer flex items-center gap-1.5"
                >
                  <Plus className="size-4" />
                  Add Employee
                </Button>
              </div>
            </div>

            {/* Employees list grid */}
            {loadingEmployees ? (
              <div className="py-20 text-center text-sm font-bold text-ink-3">
                <Loader2 className="size-8 animate-spin mx-auto text-ink-3 mb-3" />
                Fetching employee records...
              </div>
            ) : employees.length > 0 ? (
              <div className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6">
                  {employees.map((employee) => (
                    <Card
                      key={employee.id}
                      className="border border-hairline rounded-3xl bg-surface hover:shadow-lg transition-all duration-300 overflow-hidden flex flex-col group"
                    >
                      <div className="h-14 bg-gradient-to-r from-accent/20 to-[#386FA4]/20 rounded-t-[22px] relative" />
                      <div className="px-5 pb-5 pt-0 text-center flex-1 flex flex-col items-center justify-between relative -mt-9">
                        <div className={cn(
                          "size-18 rounded-2xl border-4 border-surface bg-surface-2 shadow-sm flex items-center justify-center font-bold text-xl text-accent-hover tracking-wide group-hover:scale-105 transition-transform duration-300 relative overflow-hidden select-none mb-3.5",
                          employee.status === "ACTIVE" ? "ring-2 ring-good/40 ring-offset-2" : ""
                        )}>
                          {employee.avatarUrl ? (
                            <img src={employee.avatarUrl} alt="Avatar" className="size-full object-cover" />
                          ) : (
                            initials(`${employee.firstName} ${employee.lastName}`)
                          )}
                        </div>

                        {/* Employee Actions Popup Trigger */}
                        <div className="absolute top-4 right-4">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveEmployeeMenuId(activeEmployeeMenuId === employee.id ? null : employee.id);
                            }}
                            className="size-7 hover:bg-surface-3 rounded-lg flex items-center justify-center text-ink-3 hover:text-ink cursor-pointer"
                          >
                            <MoreVertical className="size-4" />
                          </button>
                          
                          {activeEmployeeMenuId === employee.id && (
                            <>
                              <div className="fixed inset-0 z-10" onClick={() => setActiveEmployeeMenuId(null)} />
                              <div className="absolute right-0 mt-1 w-44 rounded-xl border border-hairline bg-surface shadow-pop p-1 z-20 animate-fade-in text-left">
                                <button
                                  onClick={() => openEmployeeDetailModal(employee, "overview")}
                                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-ink-2 hover:bg-surface-2 transition cursor-pointer"
                                >
                                  <User className="size-3.5" />
                                  View Profile
                                </button>
                                <button
                                  onClick={() => openEmployeeDetailModal(employee, "edit")}
                                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-ink-2 hover:bg-surface-2 transition cursor-pointer"
                                >
                                  <Edit2 className="size-3.5" />
                                  Edit Profile
                                </button>
                                <button
                                  onClick={() => {
                                    setActiveEmployeeMenuId(null);
                                    openEmployeeSessionsModal(employee);
                                  }}
                                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-ink-2 hover:bg-surface-2 transition cursor-pointer"
                                >
                                  <Key className="size-3.5" />
                                  Portal Access
                                </button>
                                <div className="h-px bg-hairline my-1" />
                                {isAdmin && (
                                <button
                                  onClick={() => {
                                    setActiveEmployeeMenuId(null);
                                    handleDeleteEmployee(employee);
                                  }}
                                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold text-critical hover:bg-critical/5 transition cursor-pointer"
                                >
                                  <Trash2 className="size-3.5" />
                                  Remove Staff
                                </button>
                                )}
                              </div>
                            </>
                          )}
                        </div>

                        <div className="space-y-1 w-full flex-1 flex flex-col items-center justify-start">
                          <Badge tone={statusTone[employee.status] || "neutral"} className="text-[9px] uppercase tracking-wider scale-90 mb-1">
                            {employee.status}
                          </Badge>
                          <span className="block text-[10px] font-mono text-ink-3">EMP-{employee.id.substring(0, 5).toUpperCase()}</span>
                          <h4 className="font-extrabold text-ink text-sm tracking-tight leading-snug line-clamp-1">
                            {employee.firstName} {employee.lastName}
                          </h4>
                          <span className="text-[10px] font-bold text-accent uppercase tracking-wider">{employee.role.replace('_', ' ')}</span>
                          
                          {/* Info Fields */}
                          <div className="w-full border-t border-hairline/60 pt-3 mt-3.5 space-y-2 text-left text-xs font-semibold text-ink-2">
                            <div className="flex items-center gap-2">
                              <Mail className="size-3.5 text-ink-3 shrink-0" />
                              <span className="truncate" title={employee.email}>{employee.email}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Laptop className="size-3.5 text-ink-3 shrink-0" />
                              <span>{employee.phone || "No phone added"}</span>
                            </div>
                            <div className="flex items-center justify-between border-t border-hairline/40 pt-2.5 mt-2">
                              <span className="text-[10px] text-ink-3 uppercase">Salary</span>
                              <span className="text-ink font-black">${(employee.salary || 0).toLocaleString(undefined, { minimumFractionDigits: 0 })}/mo</span>
                            </div>
                          </div>
                        </div>

                        <div className="mt-4.5 w-full pt-1.5 flex gap-2">
                          <Button
                            variant="outline"
                            onClick={() => openEmployeeDetailModal(employee, "overview")}
                            className="flex-1 rounded-xl border border-hairline hover:bg-surface-2 font-bold text-[10px] h-9 text-ink-2 cursor-pointer"
                          >
                            View Profile
                          </Button>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>

                {/* Pagination */}
                <div className="flex items-center justify-between border-t border-hairline pt-4 bg-surface p-4 rounded-2xl shadow-sm flex-wrap gap-4 select-none">
                  <div className="flex items-center gap-4 flex-wrap">
                    <span className="text-xs text-ink-3 font-medium">
                      Showing {employees.length} of {employeeTotal} employees
                    </span>
                    <div className="flex items-center gap-1.5 text-xs text-ink-3 font-semibold">
                      <span>Show:</span>
                      <select
                        value={employeeLimit}
                        onChange={(e) => {
                          setEmployeeLimit(Number(e.target.value));
                          setEmployeePage(1);
                        }}
                        className="h-7 rounded-lg border border-hairline bg-surface px-1.5 text-xs font-bold text-ink-2 focus:outline-none cursor-pointer"
                      >
                        <option value={10}>10</option>
                        <option value={20}>20</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                      </select>
                    </div>
                  </div>
                  {employeeTotalPages > 1 && (
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={employeePage === 1}
                        onClick={() => setEmployeePage(p => p - 1)}
                        className="rounded-xl border-hairline font-bold text-xs h-9 text-ink-2 cursor-pointer"
                      >
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={employeePage === employeeTotalPages}
                        onClick={() => setEmployeePage(p => p + 1)}
                        className="rounded-xl border-hairline font-bold text-xs h-9 text-ink-2 cursor-pointer"
                      >
                        Next
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="border border-hairline/80 rounded-3xl bg-surface py-20 text-center shadow-sm">
                <Users className="size-10 mx-auto text-ink-3 stroke-1 animate-pulse" />
                <h3 className="font-bold text-ink mt-4 text-base">No Employees Found</h3>
                <p className="text-xs text-ink-3 max-w-sm mx-auto mt-1.5 leading-relaxed">
                  We couldn't find any employee accounts matching your active filters. Try refining your search query or status criteria.
                </p>
                <Button
                  onClick={() => { setEmployeeQuery(""); setEmployeeStatusFilter("All"); setEmployeeRoleFilter("All"); setEmployeeSortBy("name_asc"); }}
                  className="mt-5 h-9 rounded-xl border border-hairline hover:bg-surface-2 text-ink-2 font-bold text-xs px-4 cursor-pointer"
                >
                  Reset Filters
                </Button>
              </div>
            )}
          </>
        ) : activeTab === "recruitment" ? (
          <>
            {/* Summary statistics row for Recruitment */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* Total Applications Card */}
              <Card className="p-5 flex flex-col justify-between border-hairline shadow-md bg-surface hover:shadow-lg transition-all duration-300 relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-20 h-20 bg-accent/5 rounded-full blur-xl group-hover:bg-accent/10 transition-all duration-300" />
                <div className="relative">
                  <span className="block text-[10px] font-bold text-ink-3 uppercase tracking-wider">Total Applications</span>
                  <span className="text-3xl font-black text-ink mt-2 block">
                    {loadingCandidateStats ? <Loader2 className="size-5 animate-spin text-ink-3" /> : (candidateStats?.total ?? 0)}
                  </span>
                </div>
              </Card>

              {/* Shortlisted Candidates Card */}
              <Card className="p-5 flex flex-col justify-between border-hairline shadow-md bg-surface hover:shadow-lg transition-all duration-300 relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-20 h-20 bg-[#386FA4]/5 rounded-full blur-xl group-hover:bg-[#386FA4]/10 transition-all duration-300" />
                <div className="relative">
                  <span className="block text-[10px] font-bold text-ink-3 uppercase tracking-wider">Shortlisted Candidates</span>
                  <span className="text-3xl font-black text-[#386FA4] mt-2 block">
                    {loadingCandidateStats ? <Loader2 className="size-5 animate-spin text-ink-3" /> : (candidateStats?.shortlisted ?? 0)}
                  </span>
                </div>
              </Card>

              {/* Rejected Candidates Card */}
              <Card className="p-5 flex flex-col justify-between border-hairline shadow-md bg-surface hover:shadow-lg transition-all duration-300 relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-20 h-20 bg-critical/5 rounded-full blur-xl group-hover:bg-critical/10 transition-all duration-300" />
                <div className="relative">
                  <span className="block text-[10px] font-bold text-ink-3 uppercase tracking-wider">Rejected Candidates</span>
                  <span className="text-3xl font-black text-critical mt-2 block">
                    {loadingCandidateStats ? <Loader2 className="size-5 animate-spin text-ink-3" /> : (candidateStats?.rejected ?? 0)}
                  </span>
                </div>
              </Card>

              {/* Waiting Candidates Card */}
              <Card className="p-5 flex flex-col justify-between border-hairline shadow-md bg-surface hover:shadow-lg transition-all duration-300 relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-20 h-20 bg-warning/5 rounded-full blur-xl group-hover:bg-warning/10 transition-all duration-300" />
                <div className="relative">
                  <span className="block text-[10px] font-bold text-ink-3 uppercase tracking-wider">Waiting Candidates</span>
                  <span className="text-3xl font-black text-warning-ink mt-2 block">
                    {loadingCandidateStats ? <Loader2 className="size-5 animate-spin text-ink-3" /> : (candidateStats?.waiting ?? 0)}
                  </span>
                </div>
              </Card>
            </div>

            {/* Category Pills Navigation (Reference matched) */}
            <div className="flex gap-2 sm:gap-3 flex-wrap border-b border-hairline pb-1">
              {[
                { filter: "All", label: "All" },
                { filter: "NEW", label: "NewCandidates" },
                { filter: "SHORTLISTED", label: "Shortlisted" },
                { filter: "REJECTED", label: "Rejected" },
                { filter: "WAITING", label: "Waiting" },
                { filter: "APPROVED", label: "Approved (Hired)" }
              ].map(item => (
                <button
                  key={item.filter}
                  onClick={() => { setCandidateStatusFilter(item.filter); setCandidatePage(1); }}
                  className={cn(
                    "px-4 py-2 text-xs font-bold rounded-xl transition duration-150 cursor-pointer select-none",
                    candidateStatusFilter === item.filter
                      ? "bg-accent text-white shadow-sm"
                      : "bg-surface text-ink-3 hover:text-ink-2 border border-hairline"
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {/* Search Sub-Toolbar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-surface p-4 border border-hairline rounded-2xl shadow-sm">
              <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
                <div className="relative flex-1 sm:flex-initial">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-ink-3" />
                  <input
                    type="text"
                    value={candidateQuery}
                    onChange={(e) => setCandidateQuery(e.target.value)}
                    placeholder="Search by name, email, position..."
                    className="h-10 w-full sm:w-64 pl-9 pr-3 rounded-xl border border-hairline bg-surface text-xs text-ink focus:outline-none focus:border-accent"
                  />
                </div>
                <select
                  value={candidateSortBy}
                  onChange={(e) => { setCandidateSortBy(e.target.value); setCandidatePage(1); }}
                  className="h-10 rounded-xl border border-hairline bg-surface px-3 text-xs font-semibold text-ink-2 focus:outline-none"
                >
                  <option value="date_desc">Applied: Newest First</option>
                  <option value="date_asc">Applied: Oldest First</option>
                  <option value="name_asc">Name: (A-Z)</option>
                  <option value="name_desc">Name: (Z-A)</option>
                </select>

                {candidateTotal === 0 && !loadingCandidates && (
                  <Button
                    onClick={handleSeedCandidates}
                    className="h-10 rounded-xl border border-accent/20 bg-accent/5 hover:bg-accent/10 font-bold text-xs text-accent px-4 cursor-pointer"
                  >
                    Seed Candidates
                  </Button>
                )}
              </div>

              <div className="text-xs font-bold text-ink-3 shrink-0 self-center">
                Showing {candidates.length > 0 ? (candidatePage - 1) * 8 + 1 : 0} to {Math.min(candidatePage * 8, candidateTotal)} of {candidateTotal} Applications
              </div>
            </div>

            {/* Tabular Candidates List */}
            {loadingCandidates ? (
              <div className="py-20 text-center text-sm font-bold text-ink-3 bg-surface border border-hairline rounded-3xl shadow-sm">
                <Loader2 className="size-8 animate-spin mx-auto text-ink-3 mb-3" />
                Loading applicant dossiers...
              </div>
            ) : candidates.length > 0 ? (
              <div className="space-y-6">
                <div className="border border-hairline rounded-3xl bg-surface overflow-hidden shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-surface-2/65 border-b border-hairline text-[10px] font-bold text-ink-3 uppercase tracking-wider select-none">
                          <th className="py-4 px-5">Application Date</th>
                          <th className="py-4 px-4">Application Name</th>
                          <th className="py-4 px-4">Contact</th>
                          <th className="py-4 px-4">E-Mail</th>
                          <th className="py-4 px-4">Position Applied</th>
                          <th className="py-4 px-4">Resume</th>
                          <th className="py-4 px-4">Status</th>
                          <th className="py-4 px-4 text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-hairline text-xs font-semibold text-ink-2">
                        {candidates.map((candidate) => (
                          <tr key={candidate.id} className="hover:bg-surface-2/20 transition duration-150">
                            <td className="py-4 px-5 font-mono text-[11px] text-ink-3">
                              {new Date(candidate.appliedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                            </td>
                            <td className="py-4 px-4 font-bold text-ink">
                              {candidate.firstName} {candidate.lastName}
                            </td>
                            <td className="py-4 px-4 font-mono text-[11px] text-ink-3">{candidate.phone || "N/A"}</td>
                            <td className="py-4 px-4 text-ink-2 truncate max-w-[150px]">{candidate.email}</td>
                            <td className="py-4 px-4 text-accent">{candidate.position}</td>
                            <td className="py-4 px-4">
                              {candidate.resumeUrl ? (
                                <a
                                  href={candidate.resumeUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-accent hover:underline flex items-center gap-1 font-bold text-[10px]"
                                >
                                  <FileText className="size-3.5" />
                                  View Resume
                                </a>
                              ) : (
                                <span className="text-ink-3 font-normal text-[10px]">No attachment</span>
                              )}
                            </td>
                            <td className="py-4 px-4">
                              <Badge
                                tone={
                                  candidate.status === "NEW" ? "neutral" :
                                  candidate.status === "APPROVED" ? "good" :
                                  candidate.status === "REJECTED" ? "critical" :
                                  candidate.status === "SHORTLISTED" ? "accent" :
                                  "warning" // WAITING
                                }
                                className="text-[10px] font-black uppercase tracking-wider scale-95"
                              >
                                {candidate.status === "NEW" ? "NEWAPPLICATION" : candidate.status}
                              </Badge>
                            </td>
                            <td className="py-4 px-4 text-center relative">
                              <button
                                type="button"
                                onClick={() => setActiveCandidateMenuId(activeCandidateMenuId === candidate.id ? null : candidate.id)}
                                className="size-8 rounded-lg hover:bg-surface-3 flex items-center justify-center mx-auto text-ink-3 hover:text-ink cursor-pointer"
                              >
                                <MoreVertical className="size-4.5" />
                              </button>

                              {activeCandidateMenuId === candidate.id && (
                                <>
                                  <div className="fixed inset-0 z-10" onClick={() => setActiveCandidateMenuId(null)} />
                                  <div className="absolute right-4 mt-1 w-48 rounded-xl border border-hairline bg-surface shadow-pop p-1 z-20 animate-fade-in text-left">
                                    <button
                                      onClick={() => openCandidateOverviewModal(candidate)}
                                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-ink-2 hover:bg-surface-2 transition cursor-pointer"
                                    >
                                      <User className="size-3.5" />
                                      View Details & Notes
                                    </button>
                                    <div className="h-px bg-hairline my-1" />
                                    {candidate.status !== "SHORTLISTED" && (
                                      <button
                                        onClick={() => {
                                          setActiveCandidateMenuId(null);
                                          handleUpdateCandidateStatus(candidate, "SHORTLISTED");
                                        }}
                                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-ink-2 hover:bg-surface-2 transition cursor-pointer"
                                      >
                                        <CheckCircle2 className="size-3.5 text-accent" />
                                        Shortlist Candidate
                                      </button>
                                    )}
                                    {candidate.status !== "WAITING" && (
                                      <button
                                        onClick={() => {
                                          setActiveCandidateMenuId(null);
                                          handleUpdateCandidateStatus(candidate, "WAITING");
                                        }}
                                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-ink-2 hover:bg-surface-2 transition cursor-pointer"
                                      >
                                        <Clock className="size-3.5 text-warning-ink" />
                                        Place on Waitlist
                                      </button>
                                    )}
                                    {candidate.status !== "REJECTED" && (
                                      <button
                                        onClick={() => {
                                          setActiveCandidateMenuId(null);
                                          handleUpdateCandidateStatus(candidate, "REJECTED");
                                        }}
                                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-critical hover:bg-critical/5 transition cursor-pointer"
                                      >
                                        <X className="size-3.5" />
                                        Reject Application
                                      </button>
                                    )}
                                    {candidate.status !== "APPROVED" && (
                                      <button
                                        onClick={() => {
                                          setActiveCandidateMenuId(null);
                                          handleUpdateCandidateStatus(candidate, "APPROVED");
                                        }}
                                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold text-good hover:bg-good/5 transition cursor-pointer"
                                      >
                                        <UserCheck className="size-3.5" />
                                        Approve / Onboard
                                      </button>
                                    )}
                                    <div className="h-px bg-hairline my-1" />
                                    <button
                                      onClick={() => {
                                        setActiveCandidateMenuId(null);
                                        handleDeleteCandidate(candidate);
                                      }}
                                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold text-critical hover:bg-critical/5 transition cursor-pointer"
                                    >
                                      <Trash2 className="size-3.5" />
                                      Remove File
                                    </button>
                                  </div>
                                </>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Pagination */}
                <div className="flex items-center justify-between border-t border-hairline pt-4 bg-surface p-4 rounded-2xl shadow-sm flex-wrap gap-4 select-none">
                  <div className="flex items-center gap-4 flex-wrap">
                    <span className="text-xs text-ink-3 font-medium">
                      Showing {candidates.length} of {candidateTotal} applications
                    </span>
                    <div className="flex items-center gap-1.5 text-xs text-ink-3 font-semibold">
                      <span>Show:</span>
                      <select
                        value={candidateLimit}
                        onChange={(e) => {
                          setCandidateLimit(Number(e.target.value));
                          setCandidatePage(1);
                        }}
                        className="h-7 rounded-lg border border-hairline bg-surface px-1.5 text-xs font-bold text-ink-2 focus:outline-none cursor-pointer"
                      >
                        <option value={10}>10</option>
                        <option value={20}>20</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                      </select>
                    </div>
                  </div>
                  {candidateTotalPages > 1 && (
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={candidatePage === 1}
                        onClick={() => setCandidatePage(p => p - 1)}
                        className="rounded-xl border-hairline font-bold text-xs h-9 text-ink-2 cursor-pointer"
                      >
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={candidatePage === candidateTotalPages}
                        onClick={() => setCandidatePage(p => p + 1)}
                        className="rounded-xl border-hairline font-bold text-xs h-9 text-ink-2 cursor-pointer"
                      >
                        Next
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="border border-hairline/80 rounded-3xl bg-surface py-20 text-center shadow-sm">
                <Users className="size-10 mx-auto text-ink-3 stroke-1 animate-pulse" />
                <h3 className="font-bold text-ink mt-4 text-base">No Applications Found</h3>
                <p className="text-xs text-ink-3 max-w-sm mx-auto mt-1.5 leading-relaxed">
                  We couldn't find any candidate files matching the selected criteria. Seed candidate records or refine filters.
                </p>
                <div className="flex gap-3 justify-center mt-5">
                  <Button
                    onClick={() => { setCandidateQuery(""); setCandidateStatusFilter("All"); setCandidateSortBy("date_desc"); }}
                    className="h-9 rounded-xl border border-hairline hover:bg-surface-2 text-ink-2 font-bold text-xs px-4 cursor-pointer"
                  >
                    Reset Filters
                  </Button>
                  <Button
                    onClick={handleSeedCandidates}
                    className="h-9 rounded-xl bg-accent font-bold text-white px-4 text-xs cursor-pointer"
                  >
                    Seed Candidates
                  </Button>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            {/* Summary statistics row for Leave Requests */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* Total Leave Requests Card */}
              <Card className="p-5 flex flex-col justify-between border-hairline shadow-md bg-surface hover:shadow-lg transition-all duration-300 relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-20 h-20 bg-accent/5 rounded-full blur-xl group-hover:bg-accent/10 transition-all duration-300" />
                <div className="relative">
                  <span className="block text-[10px] font-bold text-ink-3 uppercase tracking-wider">Total Leave Requests</span>
                  <span className="text-3xl font-black text-ink mt-2 block">
                    {loadingLeaveStats ? <Loader2 className="size-5 animate-spin text-ink-3" /> : (leaveStats?.total ?? 0)}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 mt-4 text-[10px] font-bold text-accent">
                  <Calendar className="size-3.5" />
                  <span>Leaves Registered</span>
                </div>
              </Card>

              {/* Total Approved Card */}
              <Card className="p-5 flex flex-col justify-between border-hairline shadow-md bg-surface hover:shadow-lg transition-all duration-300 relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-20 h-20 bg-good/5 rounded-full blur-xl group-hover:bg-good/10 transition-all duration-300" />
                <div className="relative">
                  <span className="block text-[10px] font-bold text-ink-3 uppercase tracking-wider font-semibold">Total Approved</span>
                  <span className="text-3xl font-black text-good mt-2 block">
                    {loadingLeaveStats ? <Loader2 className="size-5 animate-spin text-ink-3" /> : (leaveStats?.approved ?? 0)}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 mt-4 text-[10px] font-bold text-good">
                  <CheckCircle2 className="size-3.5" />
                  <span>Leaves Granted</span>
                </div>
              </Card>

              {/* Total Declined Card */}
              <Card className="p-5 flex flex-col justify-between border-hairline shadow-md bg-surface hover:shadow-lg transition-all duration-300 relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-20 h-20 bg-critical/5 rounded-full blur-xl group-hover:bg-critical/10 transition-all duration-300" />
                <div className="relative">
                  <span className="block text-[10px] font-bold text-ink-3 uppercase tracking-wider font-semibold">Total Declined</span>
                  <span className="text-3xl font-black text-critical mt-2 block">
                    {loadingLeaveStats ? <Loader2 className="size-5 animate-spin text-ink-3" /> : (leaveStats?.declined ?? 0)}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 mt-4 text-[10px] font-bold text-critical">
                  <XCircle className="size-3.5" />
                  <span>Leaves Rejected</span>
                </div>
              </Card>

              {/* Pending Approvals Card */}
              <Card className="p-5 flex flex-col justify-between border-hairline shadow-md bg-surface hover:shadow-lg transition-all duration-300 relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-20 h-20 bg-warning/5 rounded-full blur-xl group-hover:bg-warning/10 transition-all duration-300" />
                <div className="relative">
                  <span className="block text-[10px] font-bold text-ink-3 uppercase tracking-wider font-semibold">Pending Approvals</span>
                  <span className="text-3xl font-black text-warning mt-2 block">
                    {loadingLeaveStats ? <Loader2 className="size-5 animate-spin text-ink-3" /> : (leaveStats?.pending ?? 0)}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 mt-4 text-[10px] font-bold text-warning">
                  <Clock className="size-3.5" />
                  <span>Awaiting Review</span>
                </div>
              </Card>
            </div>

            {/* Actions & Filters section for Leaves */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-surface p-4 border border-hairline rounded-2xl shadow-sm">
              <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
                <div className="relative flex-1 sm:flex-initial">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-ink-3" />
                  <input
                    type="text"
                    value={leaveQuery}
                    onChange={(e) => setLeaveQuery(e.target.value)}
                    placeholder="Search employee name..."
                    className="h-10 w-full sm:w-64 pl-9 pr-3 rounded-xl border border-hairline bg-surface text-xs text-ink focus:outline-none focus:border-accent"
                  />
                </div>
                <select
                  value={leaveStatusFilter}
                  onChange={(e) => { setLeaveStatusFilter(e.target.value); setLeavePage(1); }}
                  className="h-10 rounded-xl border border-hairline bg-surface px-3 text-xs font-semibold text-ink-2 focus:outline-none"
                >
                  <option value="All">All Statuses</option>
                  <option value="PENDING">Pending</option>
                  <option value="APPROVED">Approved</option>
                  <option value="DECLINED">Declined</option>
                </select>
                <select
                  value={leaveSortBy}
                  onChange={(e) => { setLeaveSortBy(e.target.value); setLeavePage(1); }}
                  className="h-10 rounded-xl border border-hairline bg-surface px-3 text-xs font-semibold text-ink-2 focus:outline-none"
                >
                  <option value="date_desc">Sort: Newest First</option>
                  <option value="date_asc">Sort: Oldest First</option>
                </select>
              </div>

              <div className="flex gap-2 shrink-0">
                <Button
                  onClick={handleSeedLeavesData}
                  className="h-10 rounded-xl border border-hairline bg-surface hover:bg-surface-2 text-ink-2 font-bold text-xs flex items-center gap-1.5 px-4 cursor-pointer"
                >
                  <RefreshCw className="size-3.5 text-ink-3" />
                  Reset & Seed Leaves
                </Button>
              </div>
            </div>

            {/* Tabular Leaves List */}
            {loadingLeaves ? (
              <div className="py-20 text-center text-sm font-bold text-ink-3 bg-surface border border-hairline rounded-3xl shadow-sm">
                <Loader2 className="size-8 animate-spin mx-auto text-ink-3 mb-3" />
                Loading leave requests...
              </div>
            ) : leaves.length > 0 ? (
              <div className="space-y-6">
                <div className="border border-hairline rounded-3xl bg-surface overflow-hidden shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-surface-2/65 border-b border-hairline text-[10px] font-bold text-ink-3 uppercase tracking-wider select-none">
                          <th className="py-4 px-5">Employee ID</th>
                          <th className="py-4 px-4">Employee Name</th>
                          <th className="py-4 px-4">Role</th>
                          <th className="py-4 px-4">Leave Type</th>
                          <th className="py-4 px-4">Date Range</th>
                          <th className="py-4 px-4">Reason For Leave</th>
                          <th className="py-4 px-4">Status</th>
                          <th className="py-4 px-4 text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-hairline text-xs font-semibold text-ink-2">
                        {leaves.map((leave) => (
                          <tr key={leave.id} className="hover:bg-surface-2/20 transition duration-150">
                            <td className="py-4 px-5 font-mono text-[10px] text-ink-3">
                              EMP-{leave.userId.substring(0, 5).toUpperCase()}
                            </td>
                            <td className="py-4 px-4 font-bold text-ink">
                              {leave.user.firstName} {leave.user.lastName}
                            </td>
                            <td className="py-4 px-4">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-ink-3">
                                {leave.user.role.replace('_', ' ')}
                              </span>
                            </td>
                            <td className="py-4 px-4 text-accent font-extrabold">{leave.leaveType}</td>
                            <td className="py-4 px-4 font-mono text-[11px] text-ink-2">
                              {new Date(leave.startDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} - {new Date(leave.endDate).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                            </td>
                            <td className="py-4 px-4 text-ink-2 max-w-[200px] truncate" title={leave.reason}>
                              {leave.reason}
                            </td>
                            <td className="py-4 px-4">
                              <Badge
                                tone={
                                  leave.status === "APPROVED" ? "good" :
                                  leave.status === "DECLINED" ? "critical" :
                                  "warning" // PENDING
                                }
                                className="text-[10px] font-black uppercase tracking-wider scale-95"
                              >
                                {leave.status}
                              </Badge>
                            </td>
                            <td className="py-4 px-4 text-center relative">
                              <button
                                type="button"
                                onClick={() => setActiveLeaveMenuId(activeLeaveMenuId === leave.id ? null : leave.id)}
                                className="size-8 rounded-lg hover:bg-surface-3 flex items-center justify-center mx-auto text-ink-3 hover:text-ink cursor-pointer"
                              >
                                <MoreVertical className="size-4.5" />
                              </button>

                              {activeLeaveMenuId === leave.id && (
                                <>
                                  <div className="fixed inset-0 z-10" onClick={() => setActiveLeaveMenuId(null)} />
                                  <div className="absolute right-4 mt-1 w-48 rounded-xl border border-hairline bg-surface shadow-pop p-1 z-20 animate-fade-in text-left">
                                    <button
                                      onClick={() => openLeaveOverviewModal(leave)}
                                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-ink-2 hover:bg-surface-2 transition cursor-pointer"
                                    >
                                      <User className="size-3.5" />
                                      View Details & Notes
                                    </button>
                                    <div className="h-px bg-hairline my-1" />
                                    {leave.status !== "APPROVED" && (
                                      <button
                                        onClick={() => {
                                          setActiveLeaveMenuId(null);
                                          handleUpdateLeaveStatus(leave, "APPROVED");
                                        }}
                                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold text-good hover:bg-good/5 transition cursor-pointer"
                                      >
                                        <CheckCircle2 className="size-3.5 text-good" />
                                        Approve Request
                                      </button>
                                    )}
                                    {leave.status !== "DECLINED" && (
                                      <button
                                        onClick={() => {
                                          setActiveLeaveMenuId(null);
                                          handleUpdateLeaveStatus(leave, "DECLINED");
                                        }}
                                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold text-critical hover:bg-critical/5 transition cursor-pointer"
                                      >
                                        <XCircle className="size-3.5" />
                                        Decline Request
                                      </button>
                                    )}
                                    <div className="h-px bg-hairline my-1" />
                                    <button
                                      onClick={() => {
                                        setActiveLeaveMenuId(null);
                                        handleDeleteLeave(leave);
                                      }}
                                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold text-critical hover:bg-critical/5 transition cursor-pointer"
                                    >
                                      <Trash2 className="size-3.5" />
                                      Delete Request
                                    </button>
                                  </div>
                                </>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Pagination */}
                <div className="flex items-center justify-between border-t border-hairline pt-4 bg-surface p-4 rounded-2xl shadow-sm flex-wrap gap-4 select-none">
                  <div className="flex items-center gap-4 flex-wrap">
                    <span className="text-xs text-ink-3 font-medium">
                      Showing {leaves.length} of {leaveTotal} requests
                    </span>
                    <div className="flex items-center gap-1.5 text-xs text-ink-3 font-semibold">
                      <span>Show:</span>
                      <select
                        value={leaveLimit}
                        onChange={(e) => {
                          setLeaveLimit(Number(e.target.value));
                          setLeavePage(1);
                        }}
                        className="h-7 rounded-lg border border-hairline bg-surface px-1.5 text-xs font-bold text-ink-2 focus:outline-none cursor-pointer"
                      >
                        <option value={10}>10</option>
                        <option value={20}>20</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                      </select>
                    </div>
                  </div>
                  {leaveTotalPages > 1 && (
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={leavePage === 1}
                        onClick={() => setLeavePage(p => p - 1)}
                        className="rounded-xl border-hairline font-bold text-xs h-9 text-ink-2 cursor-pointer"
                      >
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={leavePage === leaveTotalPages}
                        onClick={() => setLeavePage(p => p + 1)}
                        className="rounded-xl border-hairline font-bold text-xs h-9 text-ink-2 cursor-pointer"
                      >
                        Next
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="border border-hairline/80 rounded-3xl bg-surface py-20 text-center shadow-sm">
                <CalendarCheck className="size-10 mx-auto text-ink-3 stroke-1 animate-pulse" />
                <h3 className="font-bold text-ink mt-4 text-base">No Leave Requests Found</h3>
                <p className="text-xs text-ink-3 max-w-sm mx-auto mt-1.5 leading-relaxed">
                  We couldn't find any leave requests matching the active filters. Click the button below to seed data.
                </p>
                <div className="flex gap-3 justify-center mt-5">
                  <Button
                    onClick={() => { setLeaveQuery(""); setLeaveStatusFilter("All"); }}
                    className="h-9 rounded-xl border border-hairline hover:bg-surface-2 text-ink-2 font-bold text-xs px-4 cursor-pointer"
                  >
                    Reset Filters
                  </Button>
                  <Button
                    onClick={handleSeedLeavesData}
                    className="h-9 rounded-xl bg-accent font-bold text-white px-4 text-xs cursor-pointer"
                  >
                    Seed Leaves
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Add Teacher Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-fade-in">
          <div className="bg-surface border border-hairline rounded-3xl w-full max-w-2xl shadow-pop max-h-[90vh] overflow-y-auto p-6 scrollbar-thin space-y-6 animate-fade-up">
            <div className="flex items-center justify-between border-b border-hairline pb-4">
              <div>
                <h2 className="font-extrabold text-lg text-ink">Add Teaching Employee</h2>
                <p className="text-xs text-ink-3 mt-0.5">Register a new teacher user account profile and hourly fee scale</p>
              </div>
              <button onClick={() => setShowAddModal(false)} className="size-8 hover:bg-surface-2 rounded-xl flex items-center justify-center text-ink-3 cursor-pointer">
                <X className="size-5" />
              </button>
            </div>

            {modalStatus && (
              <div className={cn("p-4 rounded-xl border text-sm font-semibold flex items-center gap-2", 
                modalStatus.type === "success" ? "bg-good/5 border-good/20 text-good-ink" : "bg-critical/5 border-critical/20 text-critical"
              )}>
                {modalStatus.type === "success" ? <CheckCircle2 className="size-4 shrink-0" /> : <AlertCircle className="size-4 shrink-0" />}
                {modalStatus.message}
              </div>
            )}

            <form onSubmit={handleAddTeacher} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-xs font-bold text-ink-2">First Name</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-ink-3" />
                    <input type="text" required value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="e.g. Bilal" className="h-10 w-full pl-9 pr-3 rounded-lg border border-hairline bg-surface text-xs text-ink focus:outline-none focus:border-accent" />
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-bold text-ink-2">Last Name</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-ink-3" />
                    <input type="text" required value={lastName} onChange={e => setLastName(e.target.value)} placeholder="e.g. Ahmed" className="h-10 w-full pl-9 pr-3 rounded-lg border border-hairline bg-surface text-xs text-ink focus:outline-none focus:border-accent" />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-xs font-bold text-ink-2">Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-ink-3" />
                    <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="e.g. bilal@lms.local" className="h-10 w-full pl-9 pr-3 rounded-lg border border-hairline bg-surface text-xs text-ink focus:outline-none focus:border-accent" />
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-bold text-ink-2">Temporary Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-ink-3" />
                    <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Leave blank for auto-generate" className="h-10 w-full pl-9 pr-3 rounded-lg border border-hairline bg-surface text-xs text-ink focus:outline-none focus:border-accent" />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="mb-1.5 block text-xs font-bold text-ink-2">Hourly Rate (USD / hr)</label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-ink-3" />
                    <input type="number" required value={hourlyRate} onChange={e => setHourlyRate(e.target.value ? Number(e.target.value) : "")} placeholder="e.g. 18" className="h-10 w-full pl-9 pr-3 rounded-lg border border-hairline bg-surface text-xs text-ink focus:outline-none focus:border-accent" />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-xs font-bold text-ink-2">Location Country</label>
                  <select value={country} onChange={e => handleCountryChange(e.target.value)} className="h-10 w-full px-3 rounded-lg border border-hairline bg-surface text-xs text-ink focus:outline-none focus:border-accent">
                    <option value="">Select Country</option>
                    {COUNTRIES.map(c => (
                      <option key={c.name} value={c.name}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-bold text-ink-2">Timezone Key</label>
                  <input type="text" value={timezone} onChange={e => setTimezone(e.target.value)} placeholder="e.g. Africa/Cairo" className="h-10 w-full px-3 rounded-lg border border-hairline bg-surface text-xs text-ink focus:outline-none focus:border-accent" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-xs font-bold text-ink-2">Courses to Teach (Optional)</label>
                  <div className="border border-hairline rounded-lg bg-surface p-2 max-h-36 overflow-y-auto space-y-1.5 scrollbar-thin">
                    {availableCourses.map(c => {
                      const isSelected = courseIds.includes(c.id);
                      return (
                        <label key={c.id} className="flex items-center gap-2 px-1.5 py-1 rounded-md hover:bg-surface-2 cursor-pointer transition-colors">
                          <input 
                            type="checkbox" 
                            checked={isSelected} 
                            onChange={() => handleCourseToggle(c.id)} 
                            className="rounded border-hairline text-accent size-4 focus:ring-0 cursor-pointer"
                          />
                          <span className="text-xs text-ink-2 font-medium">{c.title}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-bold text-ink-2">Profession / Role</label>
                  <input
                    type="text"
                    readOnly
                    value="Teacher"
                    className="h-10 w-full px-3 rounded-lg border border-hairline bg-surface-2 opacity-75 text-xs text-ink-3 cursor-not-allowed"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold text-ink-2">Teacher Biography</label>
                <textarea rows={3} value={bio} onChange={e => setBio(e.target.value)} placeholder="Enter brief profile details or credentials summary..." className="w-full p-3 rounded-lg border border-hairline bg-surface text-xs text-ink focus:outline-none focus:border-accent" />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-hairline">
                <Button type="button" variant="ghost" onClick={() => setShowAddModal(false)} className="rounded-xl border border-hairline font-bold text-xs h-10 px-5 cursor-pointer">
                  Cancel
                </Button>
                <Button type="submit" disabled={modalBusy} className="rounded-xl bg-accent font-bold text-white h-10 px-6 cursor-pointer">
                  {modalBusy ? <Loader2 className="size-4 animate-spin mr-1.5" /> : null}
                  Create Profile
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Dual Tab Profile View & Edit Modal */}
      {selectedTeacher && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-fade-in">
          <div className="bg-surface border border-hairline rounded-3xl w-full max-w-2xl shadow-pop max-h-[90vh] overflow-y-auto p-6 scrollbar-thin space-y-6 animate-fade-up">
            
            {/* Header section */}
            <div className="flex items-start justify-between border-b border-hairline pb-4">
              <div className="flex items-center gap-4">
                <div className="size-14 rounded-xl bg-accent/8 text-accent font-bold text-base flex items-center justify-center border border-accent/20">
                  {initials(`${selectedTeacher.user.firstName} ${selectedTeacher.user.lastName}`)}
                </div>
                <div>
                  <h2 className="font-extrabold text-lg text-ink">
                    {selectedTeacher.user.firstName} {selectedTeacher.user.lastName}
                  </h2>
                  <span className="text-xs font-mono text-ink-3">{selectedTeacher.teacherCode}</span>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <button onClick={() => setSelectedTeacher(null)} className="size-8 hover:bg-surface-2 rounded-xl flex items-center justify-center text-ink-3 cursor-pointer">
                  <X className="size-5" />
                </button>
              </div>
            </div>

            {/* Modal Tabs navigation */}
            <div className="flex gap-4 border-b border-hairline/60">
              <button
                type="button"
                onClick={() => setDetailTab("overview")}
                className={cn(
                  "pb-2.5 font-bold text-xs border-b-2 transition cursor-pointer px-1",
                  detailTab === "overview" ? "border-accent text-accent" : "border-transparent text-ink-3 hover:text-ink-2"
                )}
              >
                <div className="flex items-center gap-1.5">
                  <FileText className="size-3.5" />
                  Overview
                </div>
              </button>
              <button
                type="button"
                onClick={() => setDetailTab("edit")}
                className={cn(
                  "pb-2.5 font-bold text-xs border-b-2 transition cursor-pointer px-1",
                  detailTab === "edit" ? "border-accent text-accent" : "border-transparent text-ink-3 hover:text-ink-2"
                )}
              >
                <div className="flex items-center gap-1.5">
                  <Edit2 className="size-3.5" />
                  Edit Settings
                </div>
              </button>
            </div>

            {detailTab === "overview" ? (
              <div className="space-y-5 animate-fade-in">
                {/* Visual stats cards row */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="p-3 border border-hairline/60 rounded-xl bg-surface-2/15 text-center">
                    <span className="block text-[10px] text-ink-3 font-semibold">Active Rate</span>
                    <span className="text-sm font-black text-accent mt-0.5 block">${selectedTeacher.hourlyRate || 0}/hr</span>
                  </div>
                  <div className="p-3 border border-hairline/60 rounded-xl bg-surface-2/15 text-center">
                    <span className="block text-[10px] text-ink-3 font-semibold">Total Students</span>
                    <span className="text-sm font-black text-good mt-0.5 block">{selectedTeacher._count?.enrollments ?? 0}</span>
                  </div>
                  <div className="p-3 border border-hairline/60 rounded-xl bg-surface-2/15 text-center">
                    <span className="block text-[10px] text-ink-3 font-semibold">Classes Logged</span>
                    <span className="text-sm font-black text-ink mt-0.5 block">{selectedTeacher._count?.classes ?? 0}</span>
                  </div>
                </div>

                {/* Details list */}
                <div className="space-y-3.5 bg-surface-2/15 border border-hairline/60 p-4 rounded-2xl">
                  <h4 className="font-extrabold text-ink text-xs uppercase tracking-wider border-b border-hairline pb-2 mb-2">Teacher Details</h4>
                  
                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <div>
                      <span className="text-ink-3 font-bold block">Email Address</span>
                      <span className="text-ink font-semibold mt-0.5 block truncate">{selectedTeacher.user.email}</span>
                    </div>
                    <div>
                      <span className="text-ink-3 font-bold block">Course Assigned</span>
                      <span className="text-ink font-semibold mt-0.5 block">
                        {selectedTeacher.course?.title || <span className="text-ink-3 italic">None</span>}
                      </span>
                    </div>
                    <div>
                      <span className="text-ink-3 font-bold block">Country Location</span>
                      <span className="text-ink font-semibold mt-0.5 block flex items-center gap-1">
                        <Globe className="size-3.5 text-accent" />
                        {selectedTeacher.user.country || "India"}
                      </span>
                    </div>
                    <div>
                      <span className="text-ink-3 font-bold block">Timezone Key</span>
                      <span className="text-ink font-semibold mt-0.5 block">{selectedTeacher.user.timezone || "Asia/Kolkata"}</span>
                    </div>
                    <div>
                      <span className="text-ink-3 font-bold block">Account Status</span>
                      <Badge tone={statusTone[selectedTeacher.user.status] || "neutral"} className="mt-1">
                        {selectedTeacher.user.status}
                      </Badge>
                    </div>
                    <div>
                      <span className="text-ink-3 font-bold block">Member Since</span>
                      <span className="text-ink font-semibold mt-0.5 block">
                        {new Date(selectedTeacher.user.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Bio section */}
                <div className="space-y-1.5">
                  <h4 className="font-extrabold text-ink text-xs uppercase tracking-wider">Teacher Biography</h4>
                  <p className="text-xs text-ink-2 bg-surface-2/20 border border-hairline/50 p-3 rounded-xl min-h-[4.5rem] leading-relaxed">
                    {selectedTeacher.bio || "No biography details provided for this employee profile yet."}
                  </p>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-hairline">
                  <Button type="button" onClick={() => setSelectedTeacher(null)} className="rounded-xl border border-hairline hover:bg-surface-2 font-bold text-xs h-10 px-5 text-ink-2 cursor-pointer">
                    Close
                  </Button>
                  <Button 
                    type="button" 
                    onClick={() => handleToggleBlockTeacher(selectedTeacher)}
                    className={cn("rounded-xl font-bold text-xs h-10 px-5 cursor-pointer text-white", 
                      selectedTeacher.user.status === "INACTIVE" ? "bg-good hover:bg-good/90" : "bg-critical hover:bg-critical/90"
                    )}
                  >
                    {selectedTeacher.user.status === "INACTIVE" ? "Unblock Account" : "Block Account"}
                  </Button>
                  <Button type="button" onClick={() => setDetailTab("edit")} className="rounded-xl bg-accent font-bold text-white h-10 px-5 cursor-pointer">
                    Edit Profile settings
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4 animate-fade-in">
                {manageStatusMsg && (
                  <div className={cn("p-4 rounded-xl border text-sm font-semibold flex items-center gap-2", 
                    manageStatusMsg.type === "success" ? "bg-good/5 border-good/20 text-good-ink" : "bg-critical/5 border-critical/20 text-critical"
                  )}>
                    {manageStatusMsg.type === "success" ? <CheckCircle2 className="size-4 shrink-0" /> : <AlertCircle className="size-4 shrink-0" />}
                    {manageStatusMsg.message}
                  </div>
                )}

                <form onSubmit={handleUpdateTeacher} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="mb-1.5 block text-xs font-bold text-ink-2">First Name</label>
                      <input type="text" required value={manageFirstName} onChange={e => setManageFirstName(e.target.value)} className="h-10 w-full px-3 rounded-lg border border-hairline bg-surface text-xs text-ink focus:outline-none focus:border-accent" />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-bold text-ink-2">Last Name</label>
                      <input type="text" required value={manageLastName} onChange={e => setManageLastName(e.target.value)} className="h-10 w-full px-3 rounded-lg border border-hairline bg-surface text-xs text-ink focus:outline-none focus:border-accent" />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="mb-1.5 block text-xs font-bold text-ink-2">Email Address (Read-only)</label>
                      <input type="email" disabled value={manageEmail} className="h-10 w-full px-3 rounded-lg border border-hairline bg-surface-2 text-xs text-ink-3" />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-bold text-ink-2">Account Status</label>
                      <select value={manageStatus} onChange={e => setManageStatus(e.target.value)} className="h-10 w-full px-3 rounded-lg border border-hairline bg-surface text-xs text-ink focus:outline-none">
                        <option value="ACTIVE">ACTIVE</option>
                        <option value="INACTIVE">INACTIVE</option>
                        <option value="PENDING">PENDING (ON LEAVE)</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="mb-1.5 block text-xs font-bold text-ink-2">Hourly Rate (USD / hr)</label>
                      <input type="number" required value={manageHourlyRate} onChange={e => setManageHourlyRate(e.target.value ? Number(e.target.value) : "")} className="h-10 w-full px-3 rounded-lg border border-hairline bg-surface text-xs text-ink focus:outline-none focus:border-accent" />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-bold text-ink-2">Update Password</label>
                      <input type="password" value={managePassword} onChange={e => setManagePassword(e.target.value)} placeholder="Leave blank to keep unchanged" className="h-10 w-full px-3 rounded-lg border border-hairline bg-surface text-xs text-ink focus:outline-none focus:border-accent" />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="mb-1.5 block text-xs font-bold text-ink-2">Country Location</label>
                      <select value={manageCountry} onChange={e => handleManageCountryChange(e.target.value)} className="h-10 w-full px-3 rounded-lg border border-hairline bg-surface text-xs text-ink focus:outline-none focus:border-accent">
                        <option value="">Select Country</option>
                        {COUNTRIES.map(c => (
                          <option key={c.name} value={c.name}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-bold text-ink-2">Timezone</label>
                      <input type="text" value={manageTimezone} onChange={e => setManageTimezone(e.target.value)} className="h-10 w-full px-3 rounded-lg border border-hairline bg-surface text-xs text-ink focus:outline-none focus:border-accent" />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="mb-1.5 block text-xs font-bold text-ink-2">Courses to Teach (Optional)</label>
                      <div className="border border-hairline rounded-lg bg-surface p-2 max-h-36 overflow-y-auto space-y-1.5 scrollbar-thin">
                        {availableCourses.map(c => {
                          const isSelected = manageCourseIds.includes(c.id);
                          return (
                            <label key={c.id} className="flex items-center gap-2 px-1.5 py-1 rounded-md hover:bg-surface-2 cursor-pointer transition-colors">
                              <input 
                                type="checkbox" 
                                checked={isSelected} 
                                onChange={() => handleManageCourseToggle(c.id)} 
                                className="rounded border-hairline text-accent size-4 focus:ring-0 cursor-pointer"
                              />
                              <span className="text-xs text-ink-2 font-medium">{c.title}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-bold text-ink-2">Profession / Role</label>
                      <input
                        type="text"
                        readOnly
                        value="Teacher"
                        className="h-10 w-full px-3 rounded-lg border border-hairline bg-surface-2 opacity-75 text-xs text-ink-3 cursor-not-allowed"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-bold text-ink-2">Teacher Biography</label>
                    <textarea rows={3} value={manageBio} onChange={e => setManageBio(e.target.value)} className="w-full p-3 rounded-lg border border-hairline bg-surface text-xs text-ink focus:outline-none focus:border-accent" />
                  </div>

                  <div className="flex justify-end gap-3 pt-4 border-t border-hairline">
                    <Button type="button" variant="ghost" onClick={() => setDetailTab("overview")} className="rounded-xl border border-hairline font-bold text-xs h-10 px-5 cursor-pointer">
                      Back to Overview
                    </Button>
                    <Button type="submit" disabled={manageBusy} className="rounded-xl bg-accent font-bold text-white h-10 px-6 cursor-pointer">
                      {manageBusy ? <Loader2 className="size-4 animate-spin mr-1.5" /> : null}
                      Save Changes
                    </Button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Sessions Portal Access Modal */}
      {sessionsTeacher && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-fade-in">
          <div className="bg-surface border border-hairline rounded-3xl w-full max-w-lg shadow-pop p-6 space-y-5 animate-fade-up">
            <div className="flex items-center justify-between border-b border-hairline pb-3">
              <div>
                <h2 className="font-extrabold text-base text-ink">Active Login Sessions</h2>
                <p className="text-[10px] text-ink-3">Manage portals access for {sessionsTeacher.user.firstName} {sessionsTeacher.user.lastName}</p>
              </div>
              <button onClick={() => setSessionsTeacher(null)} className="size-8 hover:bg-surface-2 rounded-xl flex items-center justify-center text-ink-3 cursor-pointer">
                <X className="size-5" />
              </button>
            </div>

            {loadingSessions ? (
              <div className="py-8 text-center text-xs text-ink-3">
                <Loader2 className="size-5 animate-spin mx-auto text-ink-3 mb-2" />
                Retrieving active access keys...
              </div>
            ) : sessions.length > 0 ? (
              <div className="space-y-3.5 max-h-80 overflow-y-auto scrollbar-thin pr-1">
                {sessions.map((sess) => (
                  <div key={sess.id} className="flex items-center justify-between p-3.5 border border-hairline bg-surface-2/15 rounded-xl hover:bg-surface-2/30 transition">
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-ink-2">
                        <Laptop className="size-3.5 text-accent" />
                        {sess.ipAddress || "0.0.0.0"}
                      </div>
                      <span className="block text-[10px] text-ink-3 max-w-[280px] truncate" title={sess.userAgent || "Unknown Browser Agent"}>{parseUserAgent(sess.userAgent)}</span>
                      <div className="flex items-center gap-1 text-[9px] text-ink-3">
                        <Clock className="size-3" />
                        Logged in: {new Date(sess.createdAt).toLocaleString()}
                      </div>
                    </div>

                    {isAdmin && (
                    <button
                      onClick={() => handleRevokeSession(sess.id)}
                      className="h-8 rounded-lg hover:bg-critical/10 text-critical border border-critical/10 font-bold text-[10px] px-2.5 transition shrink-0 cursor-pointer"
                    >
                      Revoke
                    </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-ink-3">
                No active login sessions detected. This user is currently logged out.
              </div>
            )}

            <div className="flex justify-end pt-3 border-t border-hairline">
              <Button onClick={() => setSessionsTeacher(null)} className="rounded-xl border border-hairline hover:bg-surface-2 font-bold text-xs h-9.5 px-4 text-ink-2 cursor-pointer">
                Done
              </Button>
            </div>
          </div>
        </div>
      )}
      {/* Add Employee Modal */}
      {showAddEmployeeModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-fade-in">
          <div className="bg-surface border border-hairline rounded-3xl w-full max-w-2xl shadow-pop max-h-[90vh] overflow-y-auto p-6 scrollbar-thin space-y-6 animate-fade-up">
            <div className="flex items-center justify-between border-b border-hairline pb-4">
              <div>
                <h2 className="font-extrabold text-lg text-ink">Add Staff Employee</h2>
                <p className="text-xs text-ink-3 mt-0.5">Register a new administrator, supervisor or academic coach profile</p>
              </div>
              <button onClick={() => setShowAddEmployeeModal(false)} className="size-8 hover:bg-surface-2 rounded-xl flex items-center justify-center text-ink-3 cursor-pointer">
                <X className="size-5" />
              </button>
            </div>

            {empModalStatus && (
              <div className={cn("p-4 rounded-xl border text-sm font-semibold flex items-center gap-2", 
                empModalStatus.type === "success" ? "bg-good/5 border-good/20 text-good-ink" : "bg-critical/5 border-critical/20 text-critical"
              )}>
                {empModalStatus.type === "success" ? <CheckCircle2 className="size-4 shrink-0" /> : <AlertCircle className="size-4 shrink-0" />}
                {empModalStatus.message}
              </div>
            )}

            <form onSubmit={handleAddEmployee} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-xs font-bold text-ink-2">First Name</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-ink-3" />
                    <input type="text" required value={empFirstName} onChange={e => setEmpFirstName(e.target.value)} placeholder="e.g. Bilal" className="h-10 w-full pl-9 pr-3 rounded-lg border border-hairline bg-surface text-xs text-ink focus:outline-none focus:border-accent" />
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-bold text-ink-2">Last Name</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-ink-3" />
                    <input type="text" required value={empLastName} onChange={e => setEmpLastName(e.target.value)} placeholder="e.g. Ahmed" className="h-10 w-full pl-9 pr-3 rounded-lg border border-hairline bg-surface text-xs text-ink focus:outline-none focus:border-accent" />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-xs font-bold text-ink-2">Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-ink-3" />
                    <input type="email" required value={empEmail} onChange={e => setEmpEmail(e.target.value)} placeholder="e.g. bilal@lms.local" className="h-10 w-full pl-9 pr-3 rounded-lg border border-hairline bg-surface text-xs text-ink focus:outline-none focus:border-accent" />
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-bold text-ink-2">Temporary Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-ink-3" />
                    <input type="password" required minLength={8} value={empPassword} onChange={e => setEmpPassword(e.target.value)} placeholder="e.g. Pass123!" className="h-10 w-full pl-9 pr-3 rounded-lg border border-hairline bg-surface text-xs text-ink focus:outline-none focus:border-accent" />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-xs font-bold text-ink-2">Staff Role Type</label>
                  <select value={empRole} onChange={e => setEmpRole(e.target.value)} className="h-10 w-full px-3 rounded-lg border border-hairline bg-surface text-xs text-ink focus:outline-none">
                    <option value="ACADEMIC_COACH">Academic Coach</option>
                    <option value="SUPERVISOR">Supervisor</option>
                    <option value="ADMIN">Other</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-bold text-ink-2">Monthly Salary (USD)</label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-ink-3" />
                    <input type="number" required value={empSalary} onChange={e => setEmpSalary(e.target.value ? Number(e.target.value) : "")} placeholder="e.g. 3500" className="h-10 w-full pl-9 pr-3 rounded-lg border border-hairline bg-surface text-xs text-ink focus:outline-none focus:border-accent" />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-xs font-bold text-ink-2">Contact Number</label>
                  <input type="text" value={empPhone} onChange={e => setEmpPhone(e.target.value)} placeholder="e.g. +919999999999" className="h-10 w-full px-3 rounded-lg border border-hairline bg-surface text-xs text-ink focus:outline-none focus:border-accent" />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-bold text-ink-2">Gender</label>
                  <select value={empGender} onChange={e => setEmpGender(e.target.value)} className="h-10 w-full px-3 rounded-lg border border-hairline bg-surface text-xs text-ink focus:outline-none">
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="mb-1.5 block text-xs font-bold text-ink-2">Joining Date</label>
                  <input type="date" value={empJoiningDate} onChange={e => setEmpJoiningDate(e.target.value)} className="h-10 w-full px-3 rounded-lg border border-hairline bg-surface text-xs text-ink focus:outline-none focus:border-accent" />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-bold text-ink-2">Country Location</label>
                  <input type="text" value={empCountry} onChange={e => setEmpCountry(e.target.value)} placeholder="e.g. India" className="h-10 w-full px-3 rounded-lg border border-hairline bg-surface text-xs text-ink focus:outline-none focus:border-accent" />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-bold text-ink-2">Timezone</label>
                  <input type="text" value={empTimezone} onChange={e => setEmpTimezone(e.target.value)} placeholder="e.g. Asia/Kolkata" className="h-10 w-full px-3 rounded-lg border border-hairline bg-surface text-xs text-ink focus:outline-none focus:border-accent" />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-hairline">
                <Button type="button" variant="ghost" onClick={() => setShowAddEmployeeModal(false)} className="rounded-xl border border-hairline font-bold text-xs h-10 px-5 cursor-pointer">
                  Cancel
                </Button>
                <Button type="submit" disabled={empModalBusy} className="rounded-xl bg-accent font-bold text-white h-10 px-6 cursor-pointer">
                  {empModalBusy ? <Loader2 className="size-4 animate-spin mr-1.5" /> : null}
                  Create Profile
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Dual Tab Profile View & Edit Employee Modal */}
      {selectedEmployee && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-fade-in">
          <div className="bg-surface border border-hairline rounded-3xl w-full max-w-2xl shadow-pop max-h-[90vh] overflow-y-auto p-6 scrollbar-thin space-y-6 animate-fade-up">
            
            {/* Header section */}
            <div className="flex items-start justify-between border-b border-hairline pb-4">
              <div className="flex items-center gap-4">
                <div className="size-14 rounded-xl bg-accent/8 text-accent font-bold text-base flex items-center justify-center border border-accent/20">
                  {selectedEmployee.avatarUrl ? (
                    <img src={selectedEmployee.avatarUrl} alt="Avatar" className="size-full object-cover rounded-xl" />
                  ) : (
                    initials(`${selectedEmployee.firstName} ${selectedEmployee.lastName}`)
                  )}
                </div>
                <div>
                  <h2 className="font-extrabold text-lg text-ink">
                    {selectedEmployee.firstName} {selectedEmployee.lastName}
                  </h2>
                  <span className="text-xs font-mono text-ink-3">EMP-{selectedEmployee.id.substring(0, 5).toUpperCase()}</span>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <button onClick={() => setSelectedEmployee(null)} className="size-8 hover:bg-surface-2 rounded-xl flex items-center justify-center text-ink-3 cursor-pointer">
                  <X className="size-5" />
                </button>
              </div>
            </div>

            {/* Modal Tabs navigation */}
            <div className="flex gap-4 border-b border-hairline/60">
              <button
                type="button"
                onClick={() => setDetailEmployeeTab("overview")}
                className={cn(
                  "pb-2.5 font-bold text-xs border-b-2 transition cursor-pointer px-1",
                  detailEmployeeTab === "overview" ? "border-accent text-accent" : "border-transparent text-ink-3 hover:text-ink-2"
                )}
              >
                <div className="flex items-center gap-1.5">
                  <FileText className="size-3.5" />
                  Overview
                </div>
              </button>
              <button
                type="button"
                onClick={() => setDetailEmployeeTab("edit")}
                className={cn(
                  "pb-2.5 font-bold text-xs border-b-2 transition cursor-pointer px-1",
                  detailEmployeeTab === "edit" ? "border-accent text-accent" : "border-transparent text-ink-3 hover:text-ink-2"
                )}
              >
                <div className="flex items-center gap-1.5">
                  <Edit2 className="size-3.5" />
                  Edit Settings
                </div>
              </button>
            </div>

            {detailEmployeeTab === "overview" ? (
              <div className="space-y-5 animate-fade-in">
                {/* Visual stats cards row */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="p-3 border border-hairline/60 rounded-xl bg-surface-2/15 text-center">
                    <span className="block text-[10px] text-ink-3 font-semibold">Monthly Salary (USD)</span>
                    <span className="text-sm font-black text-accent mt-0.5 block">${selectedEmployee.salary || 0}</span>
                  </div>
                  <div className="p-3 border border-hairline/60 rounded-xl bg-surface-2/15 text-center">
                    <span className="block text-[10px] text-ink-3 font-semibold">Staff Role</span>
                    <span className="text-[11px] font-black text-good mt-1 block uppercase truncate">{selectedEmployee.role.replace('_', ' ')}</span>
                  </div>
                  <div className="p-3 border border-hairline/60 rounded-xl bg-surface-2/15 text-center">
                    <span className="block text-[10px] text-ink-3 font-semibold">Location</span>
                    <span className="text-sm font-black text-ink mt-0.5 block truncate">{selectedEmployee.country || "UTC"}</span>
                  </div>
                </div>

                {/* Details list */}
                <div className="space-y-3.5 bg-surface-2/15 border border-hairline/60 p-4 rounded-2xl">
                  <h4 className="font-extrabold text-ink text-xs uppercase tracking-wider border-b border-hairline pb-2 mb-2">Employee Details</h4>
                  
                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <div>
                      <span className="text-ink-3 font-bold block">Email Address</span>
                      <span className="text-ink font-semibold mt-0.5 block truncate">{selectedEmployee.email}</span>
                    </div>
                    <div>
                      <span className="text-ink-3 font-bold block">Contact Phone</span>
                      <span className="text-ink font-semibold mt-0.5 block">{selectedEmployee.phone || "No phone added"}</span>
                    </div>
                    <div>
                      <span className="text-ink-3 font-bold block">Gender</span>
                      <span className="text-ink font-semibold mt-0.5 block">{selectedEmployee.gender || "Male"}</span>
                    </div>
                    <div>
                      <span className="text-ink-3 font-bold block">Country Location</span>
                      <span className="text-ink font-semibold mt-0.5 block flex items-center gap-1">
                        <Globe className="size-3.5 text-accent" />
                        {selectedEmployee.country || "India"}
                      </span>
                    </div>
                    <div>
                      <span className="text-ink-3 font-bold block">Timezone Key</span>
                      <span className="text-ink font-semibold mt-0.5 block">{selectedEmployee.timezone || "Asia/Kolkata"}</span>
                    </div>
                    <div>
                      <span className="text-ink-3 font-bold block">Account Status</span>
                      <Badge tone={statusTone[selectedEmployee.status] || "neutral"} className="mt-1">
                        {selectedEmployee.status}
                      </Badge>
                    </div>
                    <div>
                      <span className="text-ink-3 font-bold block">Joining Date</span>
                      <span className="text-ink font-semibold mt-0.5 block">
                        {selectedEmployee.joiningDate ? new Date(selectedEmployee.joiningDate).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : "N/A"}
                      </span>
                    </div>
                    <div>
                      <span className="text-ink-3 font-bold block">Created At</span>
                      <span className="text-ink font-semibold mt-0.5 block">
                        {new Date(selectedEmployee.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-hairline">
                  <Button type="button" onClick={() => setSelectedEmployee(null)} className="rounded-xl border border-hairline hover:bg-surface-2 font-bold text-xs h-10 px-5 text-ink-2 cursor-pointer">
                    Close
                  </Button>
                  <Button 
                    type="button" 
                    onClick={() => handleToggleBlockEmployee(selectedEmployee)}
                    className={cn("rounded-xl font-bold text-xs h-10 px-5 cursor-pointer text-white", 
                      selectedEmployee.status === "INACTIVE" ? "bg-good hover:bg-good/90" : "bg-critical hover:bg-critical/90"
                    )}
                  >
                    {selectedEmployee.status === "INACTIVE" ? "Unblock Account" : "Block Account"}
                  </Button>
                  <Button type="button" onClick={() => setDetailEmployeeTab("edit")} className="rounded-xl bg-accent font-bold text-white h-10 px-5 cursor-pointer">
                    Edit Profile Settings
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4 animate-fade-in">
                {manageEmpStatusMsg && (
                  <div className={cn("p-4 rounded-xl border text-sm font-semibold flex items-center gap-2", 
                    manageEmpStatusMsg.type === "success" ? "bg-good/5 border-good/20 text-good-ink" : "bg-critical/5 border-critical/20 text-critical"
                  )}>
                    {manageEmpStatusMsg.type === "success" ? <CheckCircle2 className="size-4 shrink-0" /> : <AlertCircle className="size-4 shrink-0" />}
                    {manageEmpStatusMsg.message}
                  </div>
                )}

                <form onSubmit={handleUpdateEmployee} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="mb-1.5 block text-xs font-bold text-ink-2">First Name</label>
                      <input type="text" required value={manageEmpFirstName} onChange={e => setManageEmpFirstName(e.target.value)} className="h-10 w-full px-3 rounded-lg border border-hairline bg-surface text-xs text-ink focus:outline-none focus:border-accent" />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-bold text-ink-2">Last Name</label>
                      <input type="text" required value={manageEmpLastName} onChange={e => setManageEmpLastName(e.target.value)} className="h-10 w-full px-3 rounded-lg border border-hairline bg-surface text-xs text-ink focus:outline-none focus:border-accent" />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="mb-1.5 block text-xs font-bold text-ink-2">Email Address (Read-only)</label>
                      <input type="email" disabled value={manageEmpEmail} className="h-10 w-full px-3 rounded-lg border border-hairline bg-surface-2 text-xs text-ink-3" />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-bold text-ink-2">Account Status</label>
                      <select value={manageEmpStatus} onChange={e => setManageEmpStatus(e.target.value)} className="h-10 w-full px-3 rounded-lg border border-hairline bg-surface text-xs text-ink focus:outline-none">
                        <option value="ACTIVE">ACTIVE</option>
                        <option value="INACTIVE">INACTIVE</option>
                        <option value="PENDING">PENDING (ON LEAVE)</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="mb-1.5 block text-xs font-bold text-ink-2">Staff Role Type</label>
                      <select value={manageEmpRole} onChange={e => setManageEmpRole(e.target.value)} className="h-10 w-full px-3 rounded-lg border border-hairline bg-surface text-xs text-ink focus:outline-none">
                        <option value="ACADEMIC_COACH">Academic Coach</option>
                        <option value="SUPERVISOR">Supervisor</option>
                        <option value="ADMIN">Other</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-bold text-ink-2">Monthly Salary (USD)</label>
                      <input type="number" required value={manageEmpSalary} onChange={e => setManageEmpSalary(e.target.value ? Number(e.target.value) : "")} className="h-10 w-full px-3 rounded-lg border border-hairline bg-surface text-xs text-ink focus:outline-none focus:border-accent" />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="mb-1.5 block text-xs font-bold text-ink-2">Contact Phone</label>
                      <input type="text" value={manageEmpPhone} onChange={e => setManageEmpPhone(e.target.value)} className="h-10 w-full px-3 rounded-lg border border-hairline bg-surface text-xs text-ink focus:outline-none focus:border-accent" />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-bold text-ink-2">Gender</label>
                      <select value={manageEmpGender} onChange={e => setManageEmpGender(e.target.value)} className="h-10 w-full px-3 rounded-lg border border-hairline bg-surface text-xs text-ink focus:outline-none">
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="mb-1.5 block text-xs font-bold text-ink-2">Joining Date</label>
                      <input type="date" value={manageEmpJoiningDate} onChange={e => setManageEmpJoiningDate(e.target.value)} className="h-10 w-full px-3 rounded-lg border border-hairline bg-surface text-xs text-ink focus:outline-none focus:border-accent" />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-bold text-ink-2">Country Location</label>
                      <input type="text" value={manageEmpCountry} onChange={e => setManageEmpCountry(e.target.value)} className="h-10 w-full px-3 rounded-lg border border-hairline bg-surface text-xs text-ink focus:outline-none focus:border-accent" />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-bold text-ink-2">Timezone</label>
                      <input type="text" value={manageEmpTimezone} onChange={e => setManageEmpTimezone(e.target.value)} className="h-10 w-full px-3 rounded-lg border border-hairline bg-surface text-xs text-ink focus:outline-none focus:border-accent" />
                    </div>
                  </div>

                  <div className="border border-hairline bg-surface-2/20 p-4 rounded-xl space-y-2">
                    <label className="mb-1 block text-xs font-extrabold text-ink-2">Reset Password (Optional)</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-ink-3" />
                      <input type="password" value={manageEmpPassword} onChange={e => setManageEmpPassword(e.target.value)} placeholder="Type new password to rotate settings" className="h-10 w-full pl-9 pr-3 rounded-lg border border-hairline bg-surface text-xs text-ink focus:outline-none focus:border-accent" />
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 pt-4 border-t border-hairline">
                    <Button type="button" variant="ghost" onClick={() => setDetailEmployeeTab("overview")} className="rounded-xl border border-hairline font-bold text-xs h-10 px-5 cursor-pointer">
                      Back to Overview
                    </Button>
                    <Button type="submit" disabled={manageEmpBusy} className="rounded-xl bg-accent font-bold text-white h-10 px-6 cursor-pointer">
                      {manageEmpBusy ? <Loader2 className="size-4 animate-spin mr-1.5" /> : null}
                      Save Changes
                    </Button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Sessions Portal Access Employee Modal */}
      {sessionsEmployee && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-fade-in">
          <div className="bg-surface border border-hairline rounded-3xl w-full max-w-lg shadow-pop p-6 space-y-5 animate-fade-up">
            <div className="flex items-center justify-between border-b border-hairline pb-3">
              <div>
                <h2 className="font-extrabold text-base text-ink">Active Login Sessions</h2>
                <p className="text-[10px] text-ink-3">Manage portals access for {sessionsEmployee.firstName} {sessionsEmployee.lastName}</p>
              </div>
              <button onClick={() => setSessionsEmployee(null)} className="size-8 hover:bg-surface-2 rounded-xl flex items-center justify-center text-ink-3 cursor-pointer">
                <X className="size-5" />
              </button>
            </div>

            {loadingEmployeeSessions ? (
              <div className="py-8 text-center text-xs text-ink-3">
                <Loader2 className="size-5 animate-spin mx-auto text-ink-3 mb-2" />
                Retrieving active access keys...
              </div>
            ) : employeeSessions.length > 0 ? (
              <div className="space-y-3.5 max-h-80 overflow-y-auto scrollbar-thin pr-1">
                {employeeSessions.map((sess) => (
                  <div key={sess.id} className="flex items-center justify-between p-3.5 border border-hairline bg-surface-2/15 rounded-xl hover:bg-surface-2/30 transition">
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-ink-2">
                        <Laptop className="size-3.5 text-accent" />
                        {sess.ipAddress || "0.0.0.0"}
                      </div>
                      <span className="block text-[10px] text-ink-3 max-w-[280px] truncate" title={sess.userAgent || "Unknown Browser Agent"}>{parseUserAgent(sess.userAgent)}</span>
                      <div className="flex items-center gap-1 text-[9px] text-ink-3">
                        <Clock className="size-3" />
                        Logged in: {new Date(sess.createdAt).toLocaleString()}
                      </div>
                    </div>

                    {isAdmin && (
                    <button
                      onClick={() => handleRevokeEmployeeSession(sess.id)}
                      className="h-8 rounded-lg hover:bg-critical/10 text-critical border border-critical/10 font-bold text-[10px] px-2.5 transition shrink-0 cursor-pointer"
                    >
                      Revoke
                    </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-ink-3">
                No active login sessions detected. This user is currently logged out.
              </div>
            )}

            <div className="flex justify-end pt-3 border-t border-hairline">
              <Button onClick={() => setSessionsEmployee(null)} className="rounded-xl border border-hairline hover:bg-surface-2 font-bold text-xs h-9.5 px-4 text-ink-2 cursor-pointer">
                Done
              </Button>
            </div>
          </div>
        </div>
      )}
      {/* Candidate Overview & Notes Modal */}
      {selectedCandidate && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-fade-in">
          <div className="bg-surface border border-hairline rounded-3xl w-full max-w-xl shadow-pop max-h-[90vh] overflow-y-auto p-6 scrollbar-thin space-y-6 animate-fade-up">
            <div className="flex items-center justify-between border-b border-hairline pb-4">
              <div>
                <h2 className="font-extrabold text-lg text-ink">Applicant File Overview</h2>
                <p className="text-xs text-ink-3 mt-0.5">Recruitment metrics for {selectedCandidate.firstName} {selectedCandidate.lastName}</p>
              </div>
              <button onClick={() => setSelectedCandidate(null)} className="size-8 hover:bg-surface-2 rounded-xl flex items-center justify-center text-ink-3 cursor-pointer">
                <X className="size-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-4 bg-surface-2/15 border border-hairline/60 p-4 rounded-2xl font-semibold text-ink-2">
                <div>
                  <span className="text-ink-3 font-bold block text-[10px] uppercase">Applied Date</span>
                  <span className="text-ink font-mono text-[11px] mt-1 block">
                    {new Date(selectedCandidate.appliedAt).toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="text-ink-3 font-bold block text-[10px] uppercase">Position</span>
                  <span className="text-accent font-bold mt-1 block">{selectedCandidate.position}</span>
                </div>
                <div>
                  <span className="text-ink-3 font-bold block text-[10px] uppercase">Email Address</span>
                  <span className="text-ink font-bold mt-1 block truncate">{selectedCandidate.email}</span>
                </div>
                <div>
                  <span className="text-ink-3 font-bold block text-[10px] uppercase">Phone Number</span>
                  <span className="text-ink font-mono mt-1 block">{selectedCandidate.phone || "N/A"}</span>
                </div>
                <div>
                  <span className="text-ink-3 font-bold block text-[10px] uppercase">Current Status</span>
                  <div>
                    <Badge
                      tone={
                        selectedCandidate.status === "NEW" ? "neutral" :
                        selectedCandidate.status === "APPROVED" ? "good" :
                        selectedCandidate.status === "REJECTED" ? "critical" :
                        selectedCandidate.status === "SHORTLISTED" ? "accent" :
                        "warning"
                      }
                      className="mt-1 text-[9px] font-black uppercase tracking-wider scale-95 origin-left"
                    >
                      {selectedCandidate.status === "NEW" ? "NEWAPPLICATION" : selectedCandidate.status}
                    </Badge>
                  </div>
                </div>
                <div>
                  <span className="text-ink-3 font-bold block text-[10px] uppercase">Resume Link</span>
                  {selectedCandidate.resumeUrl ? (
                    <a
                      href={selectedCandidate.resumeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent hover:underline inline-flex items-center gap-1 font-bold mt-1"
                    >
                      <FileText className="size-3.5" />
                      Download Resume File
                    </a>
                  ) : (
                    <span className="text-ink-3 font-normal mt-1 block">No attachment</span>
                  )}
                </div>
              </div>

              {/* Edit Notes section */}
              <form onSubmit={handleSaveCandidateNotes} className="space-y-3.5">
                <label className="block text-xs font-bold text-ink-2">Evaluation Notes & Comments</label>
                <textarea
                  rows={4}
                  value={manageCandidateNotes}
                  onChange={(e) => setManageCandidateNotes(e.target.value)}
                  placeholder="Record application review notes, interview feedback, or onboarding criteria here..."
                  className="w-full p-3 rounded-xl border border-hairline bg-surface text-xs text-ink focus:outline-none focus:border-accent leading-relaxed"
                />
                <div className="flex justify-between items-center pt-2">
                  <div className="flex gap-2">
                    {selectedCandidate.status !== "SHORTLISTED" && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => handleUpdateCandidateStatus(selectedCandidate, "SHORTLISTED")}
                        className="rounded-lg h-8 text-[10px] font-bold cursor-pointer"
                      >
                        Shortlist
                      </Button>
                    )}
                    {selectedCandidate.status !== "APPROVED" && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => handleUpdateCandidateStatus(selectedCandidate, "APPROVED")}
                        className="rounded-lg h-8 text-[10px] font-bold text-good border-good/20 hover:bg-good/5 cursor-pointer"
                      >
                        Approve/Hire
                      </Button>
                    )}
                  </div>
                  
                  <Button
                    type="submit"
                    disabled={manageCandidateBusy}
                    className="rounded-xl bg-accent font-bold text-white h-9 px-4 cursor-pointer text-xs flex items-center gap-1"
                  >
                    {manageCandidateBusy && <Loader2 className="size-3.5 animate-spin" />}
                    Save Comments
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
      {/* Leave Request Overview & Notes Modal */}
      {selectedLeave && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-fade-in">
          <div className="bg-surface border border-hairline rounded-3xl w-full max-w-xl shadow-pop max-h-[90vh] overflow-y-auto p-6 scrollbar-thin space-y-6 animate-fade-up">
            <div className="flex items-center justify-between border-b border-hairline pb-4">
              <div>
                <h2 className="font-extrabold text-lg text-ink">Leave Request Details</h2>
                <p className="text-xs text-ink-3 mt-0.5">Dossier for {selectedLeave.user.firstName} {selectedLeave.user.lastName}</p>
              </div>
              <button onClick={() => setSelectedLeave(null)} className="size-8 hover:bg-surface-2 rounded-xl flex items-center justify-center text-ink-3 cursor-pointer">
                <X className="size-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-4 bg-surface-2/15 border border-hairline/60 p-4 rounded-2xl font-semibold text-ink-2">
                <div>
                  <span className="text-ink-3 font-bold block text-[10px] uppercase">Employee Name</span>
                  <span className="text-ink font-bold mt-1 block">
                    {selectedLeave.user.firstName} {selectedLeave.user.lastName}
                  </span>
                </div>
                <div>
                  <span className="text-ink-3 font-bold block text-[10px] uppercase">Role Type</span>
                  <span className="text-ink font-bold mt-1 block uppercase text-[10px] text-ink-3">
                    {selectedLeave.user.role.replace('_', ' ')}
                  </span>
                </div>
                <div>
                  <span className="text-ink-3 font-bold block text-[10px] uppercase">Leave Type</span>
                  <span className="text-accent font-extrabold mt-1 block">{selectedLeave.leaveType}</span>
                </div>
                <div>
                  <span className="text-ink-3 font-bold block text-[10px] uppercase">Current Status</span>
                  <div>
                    <Badge
                      tone={
                        selectedLeave.status === "APPROVED" ? "good" :
                        selectedLeave.status === "DECLINED" ? "critical" :
                        "warning"
                      }
                      className="mt-1 text-[9px] font-black uppercase tracking-wider scale-95 origin-left"
                    >
                      {selectedLeave.status}
                    </Badge>
                  </div>
                </div>
                <div className="col-span-2">
                  <span className="text-ink-3 font-bold block text-[10px] uppercase">Requested Date Range</span>
                  <span className="text-ink font-mono text-[11px] mt-1 block">
                    {new Date(selectedLeave.startDate).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })} to {new Date(selectedLeave.endDate).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
                  </span>
                </div>
                <div className="col-span-2">
                  <span className="text-ink-3 font-bold block text-[10px] uppercase">Reason Specified</span>
                  <span className="text-ink-2 font-normal text-xs leading-relaxed mt-1.5 block whitespace-pre-wrap bg-surface border border-hairline/45 rounded-xl p-3">
                    {selectedLeave.reason}
                  </span>
                </div>
              </div>

              {/* Edit Admin Notes section */}
              <form onSubmit={handleSaveLeaveNotes} className="space-y-3.5">
                <label className="block text-xs font-bold text-ink-2">Administrator Decision Notes</label>
                <textarea
                  rows={3}
                  value={manageLeaveNotes}
                  onChange={(e) => setManageLeaveNotes(e.target.value)}
                  placeholder="Record leave approval details, scheduling overrides, or coverage notes here..."
                  className="w-full p-3 rounded-xl border border-hairline bg-surface text-xs text-ink focus:outline-none focus:border-accent leading-relaxed"
                />
                <div className="flex justify-between items-center pt-2">
                  <div className="flex gap-2">
                    {selectedLeave.status !== "APPROVED" && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => handleUpdateLeaveStatus(selectedLeave, "APPROVED")}
                        className="rounded-lg h-8 text-[10px] font-bold text-good border-good/25 hover:bg-good/5 cursor-pointer"
                      >
                        Approve Request
                      </Button>
                    )}
                    {selectedLeave.status !== "DECLINED" && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => handleUpdateLeaveStatus(selectedLeave, "DECLINED")}
                        className="rounded-lg h-8 text-[10px] font-bold text-critical border-critical/25 hover:bg-critical/5 cursor-pointer"
                      >
                        Decline Request
                      </Button>
                    )}
                  </div>
                  
                  <Button
                    type="submit"
                    disabled={manageLeaveBusy}
                    className="rounded-xl bg-accent font-bold text-white h-9 px-4 cursor-pointer text-xs flex items-center gap-1"
                  >
                    {manageLeaveBusy && <Loader2 className="size-3.5 animate-spin" />}
                    Save Notes
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {selectedIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 bg-surface border border-hairline px-5 py-3 rounded-2xl shadow-2xl animate-fade-in select-none">
          <div className="text-xs font-bold text-ink flex items-center gap-2">
            <Users className="size-4 text-accent" />
            <span>Selected <span className="tnum font-extrabold text-accent">{selectedIds.length}</span> instructors</span>
          </div>
          <div className="h-5 w-hairline bg-hairline" />
          <div className="flex items-center gap-2">
            <Button
              onClick={() => handleBulkStatusUpdate("ACTIVE")}
              className="bg-good hover:bg-good/95 text-white font-bold text-xs h-8.5 px-3.5 rounded-xl flex items-center gap-1.5 cursor-pointer"
            >
              <CheckCircle2 className="size-3.5" />
              Unblock
            </Button>
            <Button
              onClick={() => handleBulkStatusUpdate("INACTIVE")}
              className="bg-surface-3 hover:bg-surface-4 text-ink-2 font-bold text-xs h-8.5 px-3.5 rounded-xl flex items-center gap-1.5 cursor-pointer"
            >
              <Lock className="size-3.5" />
              Block
            </Button>
            {isAdmin && (
            <Button
              onClick={handleBulkDelete}
              className="bg-critical hover:bg-critical/95 text-white font-bold text-xs h-8.5 px-3.5 rounded-xl flex items-center gap-1.5 cursor-pointer"
            >
              <Trash2 className="size-3.5" />
              Delete
            </Button>
            )}
            <button
              onClick={() => setSelectedIds([])}
              className="text-xs font-bold text-ink-3 hover:text-ink hover:underline px-2 cursor-pointer"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {detailsTeacher && (
        <FullDetailsDrawer
          open={!!detailsTeacher}
          onClose={() => setDetailsTeacher(null)}
          title={`${detailsTeacher.user.firstName} ${detailsTeacher.user.lastName}`}
          subtitle={`${detailsTeacher.teacherCode} · application details`}
          sections={TEACHER_DETAIL_SECTIONS}
          load={() => fetchTeacherRegistrationByProfile(detailsTeacher.id)}
          save={(patch) => updateTeacherRegistrationByProfile(detailsTeacher.id, patch)}
          resolveDoc={resolveTeacherDocSrc}
        />
      )}
    </>
  );
}
