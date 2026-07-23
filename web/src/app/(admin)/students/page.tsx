"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight, 
  Download, 
  Plus, 
  Search, 
  SlidersHorizontal, 
  X, 
  Loader2, 
  User, 
  Users,
  Mail, 
  Lock, 
  Phone, 
  Globe, 
  CheckCircle2, 
  AlertCircle,
  Trash2,
  Edit2,
  Briefcase,
  DollarSign,
  Calendar,
  Key,
  Laptop,
  MapPin,
  Clock,
  MoreVertical,
  FileText
} from "lucide-react";
import Swal from "sweetalert2";

import { Topbar } from "@/components/layout/topbar";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { 
  fetchStudents, 
  createStudent, 
  updateStudent, 
  deleteStudent, 
  fetchStudentsCourses,
  fetchStudentsTeachers,
  fetchBatches,
  fetchCoaches,
  fetchLmsCourses,
  fetchStudentStats,
  fetchStudentSessions,
  revokeStudentSession,
  fetchStudentRegistration,
  updateStudentRegistration,
  StudentProfile,
  StudentStats,
  StudentSession,
  ApiError
} from "@/lib/api";
import { cn, initials, parseUserAgent } from "@/lib/utils";
import { useAuth } from "@/store/auth";
import { FullDetailsDrawer } from "@/components/admin/full-details-drawer";
import { STUDENT_DETAIL_SECTIONS } from "@/components/admin/registration-detail-config";

const FILTERS = ["All", "Active", "Trial", "Pending", "Paused"] as const;
// Default items per page limit config
const DEFAULT_PER_PAGE = 20;

const statusTone: Record<string, Tone> = {
  Active: "good",
  Trial: "accent",
  Pending: "warning",
  Paused: "neutral",
  ACTIVE: "good",
  INACTIVE: "neutral",
  PENDING: "warning",
  TRIAL: "accent",
  PAUSED: "neutral",
  SUSPENDED: "critical"
};

export default function StudentsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const isAdmin = user?.role === "ADMIN";

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(DEFAULT_PER_PAGE);
  
  // Dynamic API states
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);

  // Multi-select state
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(students.map((s) => s.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectRow = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedIds((prev) => [...prev, id]);
    } else {
      setSelectedIds((prev) => prev.filter((x) => x !== id));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;

    const result = await Swal.fire({
      title: `Delete ${selectedIds.length} Students?`,
      text: `Are you sure you want to permanently delete the profiles for the selected ${selectedIds.length} students? This action is irreversible.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, delete all",
      cancelButtonText: "Cancel",
      customClass: {
        popup: "rounded-3xl border border-hairline bg-surface text-ink",
        title: "text-lg font-bold text-ink",
        htmlContainer: "text-sm text-ink-3",
        confirmButton: "bg-critical text-white px-5 py-2.5 rounded-xl font-bold hover:shadow-lg transition-all cursor-pointer",
        cancelButton: "bg-surface-3 text-ink-2 px-5 py-2.5 rounded-xl font-bold hover:bg-surface-4 transition-all ml-3 cursor-pointer"
      },
      buttonsStyling: false
    });

    if (result.isConfirmed) {
      setLoading(true);
      try {
        await Promise.all(selectedIds.map((id) => deleteStudent(id)));
        Swal.fire({
          title: "Deleted!",
          text: `${selectedIds.length} student profiles deleted successfully.`,
          icon: "success",
          customClass: {
            popup: "rounded-3xl border border-hairline bg-surface text-ink",
            title: "text-lg font-bold text-ink",
            confirmButton: "bg-accent text-white px-5 py-2.5 rounded-xl font-bold hover:shadow-lg transition-all cursor-pointer"
          },
          buttonsStyling: false
        });
        setSelectedIds([]);
        loadStudents();
      } catch (err) {
        Swal.fire({
          title: "Failed!",
          text: err instanceof ApiError ? err.message : "Failed to delete student profiles.",
          icon: "error",
          customClass: {
            popup: "rounded-3xl border border-hairline bg-surface text-ink",
            title: "text-lg font-bold text-ink",
            confirmButton: "bg-accent text-white px-5 py-2.5 rounded-xl font-bold hover:shadow-lg transition-all cursor-pointer"
          },
          buttonsStyling: false
        });
      } finally {
        setLoading(false);
      }
    }
  };

  const handleBulkStatusUpdate = async (newStatus: "ACTIVE" | "INACTIVE") => {
    if (selectedIds.length === 0) return;
    const actionLabel = newStatus === "ACTIVE" ? "activate" : "block";

    const result = await Swal.fire({
      title: `${newStatus === "ACTIVE" ? "Activate" : "Block"} ${selectedIds.length} Students?`,
      text: `Are you sure you want to ${actionLabel} the selected ${selectedIds.length} students?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: `Yes, ${actionLabel} all`,
      cancelButtonText: "Cancel",
      customClass: {
        popup: "rounded-3xl border border-hairline bg-surface text-ink",
        title: "text-lg font-bold text-ink",
        htmlContainer: "text-sm text-ink-3",
        confirmButton: "bg-accent text-white px-5 py-2.5 rounded-xl font-bold hover:shadow-lg transition-all cursor-pointer",
        cancelButton: "bg-surface-3 text-ink-2 px-5 py-2.5 rounded-xl font-bold hover:bg-surface-4 transition-all ml-3 cursor-pointer"
      },
      buttonsStyling: false
    });

    if (result.isConfirmed) {
      setLoading(true);
      try {
        await Promise.all(selectedIds.map((id) => updateStudent(id, { status: newStatus })));
        Swal.fire({
          title: "Status Updated!",
          text: `${selectedIds.length} student profiles ${newStatus === "ACTIVE" ? "activated" : "blocked"} successfully.`,
          icon: "success",
          customClass: {
            popup: "rounded-3xl border border-hairline bg-surface text-ink",
            title: "text-lg font-bold text-ink",
            confirmButton: "bg-accent text-white px-5 py-2.5 rounded-xl font-bold hover:shadow-lg transition-all cursor-pointer"
          },
          buttonsStyling: false
        });
        setSelectedIds([]);
        loadStudents();
      } catch (err) {
        Swal.fire({
          title: "Failed!",
          text: err instanceof ApiError ? err.message : `Failed to ${actionLabel} students.`,
          icon: "error",
          customClass: {
            popup: "rounded-3xl border border-hairline bg-surface text-ink",
            title: "text-lg font-bold text-ink",
            confirmButton: "bg-accent text-white px-5 py-2.5 rounded-xl font-bold hover:shadow-lg transition-all cursor-pointer"
          },
          buttonsStyling: false
        });
      } finally {
        setLoading(false);
      }
    };
  };

  // Stats Dashboard
  const [stats, setStats] = useState<StudentStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);

  // Active Dropdown Action Row
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  // Advanced Filters Panel states
  const [showFiltersPanel, setShowFiltersPanel] = useState(false);
  const [coursesList, setCoursesList] = useState<{ id: string; title: string }[]>([]);
  const [teachersList, setTeachersList] = useState<{ id: string; user: { firstName: string; lastName: string } }[]>([]);
  const [batchesList, setBatchesList] = useState<{ id: string; code: string; name: string }[]>([]);
  const [coachesList, setCoachesList] = useState<{ id: string; name: string }[]>([]);

  // Active Filter states used in the API call
  const [selectedCourse, setSelectedCourse] = useState("");
  const [selectedTeacher, setSelectedTeacher] = useState("");
  const [selectedBatch, setSelectedBatch] = useState("");
  const [selectedCoach, setSelectedCoach] = useState("");
  const [selectedTrialConverted, setSelectedTrialConverted] = useState("");
  const [selectedCountry, setSelectedCountry] = useState("");
  const [joiningStart, setJoiningStart] = useState("");
  const [joiningEnd, setJoiningEnd] = useState("");
  const [paymentDueStart, setPaymentDueStart] = useState("");
  const [paymentDueEnd, setPaymentDueEnd] = useState("");

  // Temporary inputs inside the Filters panel
  const [tempCourse, setTempCourse] = useState("");
  const [tempTeacher, setTempTeacher] = useState("");
  const [tempBatch, setTempBatch] = useState("");
  const [tempCoach, setTempCoach] = useState("");
  const [tempTrialConverted, setTempTrialConverted] = useState("");
  const [tempCountry, setTempCountry] = useState("");
  const [tempJoiningStart, setTempJoiningStart] = useState("");
  const [tempJoiningEnd, setTempJoiningEnd] = useState("");
  const [tempPaymentDueStart, setTempPaymentDueStart] = useState("");
  const [tempPaymentDueEnd, setTempPaymentDueEnd] = useState("");

  // Add Student Modal states
  const [showModal, setShowModal] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [gender, setGender] = useState("Male");
  const [country, setCountry] = useState("India");
  const [guardianName, setGuardianName] = useState("");
  const [profession, setProfession] = useState("Student");
  const [fees, setFees] = useState<number | "">("");
  const [joiningDate, setJoiningDate] = useState("");
  const [lastPaymentDate, setLastPaymentDate] = useState("");
  const [nextPaymentDate, setNextPaymentDate] = useState("");
  // Optional enrolment at creation time (both may be left blank).
  const [formCourseCode, setFormCourseCode] = useState("");
  const [formTeacherId, setFormTeacherId] = useState("");
  const [catalogCourses, setCatalogCourses] = useState<{ id: string; code: string; title: string }[]>([]);
  const [modalBusy, setModalBusy] = useState(false);
  const [modalStatus, setModalStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Manage Student Modal states
  const [selectedStudent, setSelectedStudent] = useState<StudentProfile | null>(null);
  const [manageFirstName, setManageFirstName] = useState("");
  const [manageLastName, setManageLastName] = useState("");
  const [managePhone, setManagePhone] = useState("");
  const [manageGender, setManageGender] = useState("Male");
  const [manageCountry, setManageCountry] = useState("");
  const [manageGuardianName, setManageGuardianName] = useState("");
  const [manageProfession, setManageProfession] = useState("Student");
  const [manageFees, setManageFees] = useState<number | "">("");
  const [manageJoiningDate, setManageJoiningDate] = useState("");
  const [manageLastPaymentDate, setManageLastPaymentDate] = useState("");
  const [manageNextPaymentDate, setManageNextPaymentDate] = useState("");
  const [manageCourseCode, setManageCourseCode] = useState("");
  const [manageTeacherId, setManageTeacherId] = useState("");
  const [manageStatus, setManageStatus] = useState("ACTIVE");
  const [manageBusy, setManageBusy] = useState(false);
  const [manageStatusMsg, setManageStatusMsg] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Full registration-details drawer (all the data the student registered with).
  const [detailsStudent, setDetailsStudent] = useState<StudentProfile | null>(null);

  // Sessions Modal states
  const [sessionsStudent, setSessionsStudent] = useState<StudentProfile | null>(null);
  const [sessions, setSessions] = useState<StudentSession[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);

  // Password reset modal states
  const [pwdResetStudent, setPwdResetStudent] = useState<StudentProfile | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [pwdResetBusy, setPwdResetBusy] = useState(false);
  const [pwdResetMsg, setPwdResetMsg] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Load courses and teachers list on initial render
  useEffect(() => {
    const loadFilterHelpers = async () => {
      try {
        const [courses, teachers, catalog, batches, coaches] = await Promise.all([
          fetchStudentsCourses(),
          fetchStudentsTeachers(),
          fetchLmsCourses(),
          fetchBatches(),
          fetchCoaches(),
        ]);
        setCoursesList(courses);
        setTeachersList(teachers);
        setCatalogCourses(catalog.map(c => ({ id: c.id, code: c.code, title: c.title })));
        setBatchesList(batches.map(b => ({ id: b.id, code: b.code, name: b.name })));
        setCoachesList(coaches.map(c => ({ id: c.id, name: c.name })));
      } catch (err) {
        console.error("Failed to load search filter options:", err);
      }
    };
    loadFilterHelpers();
  }, []);

  // Fetch Summary statistics
  const loadStats = async () => {
    setLoadingStats(true);
    try {
      const data = await fetchStudentStats();
      setStats(data);
    } catch (err) {
      console.error("Failed to load metrics statistics:", err);
    } finally {
      setLoadingStats(false);
    }
  };

  // Load students from database
  const loadStudents = async () => {
    setLoading(true);
    setSelectedIds([]);
    try {
      const data = await fetchStudents({
        page,
        limit,
        search: query,
        status: filter === "All" ? undefined : filter.toUpperCase(),
        courseId: selectedCourse || undefined,
        teacherId: selectedTeacher || undefined,
        batchId: selectedBatch || undefined,
        coachId: selectedCoach || undefined,
        trialConverted: selectedTrialConverted || undefined,
        country: selectedCountry || undefined,
        joiningDateStart: joiningStart || undefined,
        joiningDateEnd: joiningEnd || undefined,
        nextPaymentDateStart: paymentDueStart || undefined,
        nextPaymentDateEnd: paymentDueEnd || undefined,
      });
      setStudents(data.items);
      setTotal(data.meta.total);
      setTotalPages(data.meta.pages);
    } catch (err) {
      console.error("Failed to load students:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStudents();
  }, [
    page, 
    limit,
    query, 
    filter, 
    selectedCourse, 
    selectedTeacher, 
    selectedCountry,
    joiningStart,
    joiningEnd,
    paymentDueStart,
    paymentDueEnd,
    selectedBatch,
    selectedCoach,
    selectedTrialConverted,
  ]);

  useEffect(() => {
    loadStats();
  }, [students]);

  const resetPage = (fn: () => void) => {
    fn();
    setPage(1);
  };

  // Submit Add Student form
  const handleAddStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalBusy(true);
    setModalStatus(null);

    try {
      await createStudent({
        email,
        password,
        firstName,
        lastName,
        phone: phone || undefined,
        gender: gender || undefined,
        country: country || undefined,
        guardianName: guardianName || undefined,
        profession: profession || undefined,
        fees: fees !== "" ? Number(fees) : undefined,
        joiningDate: joiningDate || undefined,
        lastPaymentDate: lastPaymentDate || undefined,
        nextPaymentDate: nextPaymentDate || undefined,
        courseCode: formCourseCode || undefined,
        teacherId: formTeacherId || undefined,
      });

      setModalStatus({ type: "success", message: "Student added successfully!" });
      
      // Reset form fields
      setFirstName("");
      setLastName("");
      setEmail("");
      setPassword("");
      setPhone("");
      setGender("Male");
      setCountry("India");
      setGuardianName("");
      setProfession("");
      setFees("");
      setJoiningDate("");
      setLastPaymentDate("");
      setNextPaymentDate("");
      setFormCourseCode("");
      setFormTeacherId("");

      // Reload list & close modal
      loadStudents();
      setTimeout(() => {
        setShowModal(false);
        setModalStatus(null);
      }, 1500);

    } catch (err) {
      setModalStatus({
        type: "error",
        message: err instanceof ApiError ? err.message : "Failed to add student."
      });
    } finally {
      setModalBusy(false);
    }
  };

  const formatDateForInput = (d: string | null) => {
    if (!d) return "";
    return d.split("T")[0];
  };

  // Open Manage Modal
  const openManageModal = (student: StudentProfile) => {
    setSelectedStudent(student);
    setManageFirstName(student.user.firstName);
    setManageLastName(student.user.lastName);
    setManagePhone(student.phone || "");
    setManageGender(student.gender || "Male");
    setManageCountry(student.user.country || "India");
    setManageGuardianName(student.guardianName || "");
    setManageProfession(student.profession || "");
    setManageFees(student.fees !== null ? student.fees : "");
    setManageJoiningDate(formatDateForInput(student.joiningDate));
    setManageLastPaymentDate(formatDateForInput(student.lastPaymentDate));
    setManageNextPaymentDate(formatDateForInput(student.nextPaymentDate));
    setManageStatus(student.user.status);
    // Pre-fill course + teacher from the student's first existing enrolment.
    const firstEnr = student.enrollments?.[0];
    const matchedCourse = firstEnr
      ? catalogCourses.find(c => c.title === firstEnr.course.title)
      : undefined;
    setManageCourseCode(matchedCourse?.code || "");
    setManageTeacherId(firstEnr?.teacher?.id || "");
    setManageStatusMsg(null);
  };

  // Open Sessions list
  const openSessionsModal = (student: StudentProfile) => {
    setSessionsStudent(student);
    setSessions([]);
    loadSessions(student.id);
  };

  const loadSessions = async (studentId: string) => {
    setLoadingSessions(true);
    try {
      const data = await fetchStudentSessions(studentId);
      setSessions(data);
    } catch (err) {
      console.error("Failed to load sessions:", err);
    } finally {
      setLoadingSessions(false);
    }
  };

  const handleRevokeSession = async (sessionId: string) => {
    if (!sessionsStudent) return;
    try {
      await revokeStudentSession(sessionsStudent.id, sessionId);
      loadSessions(sessionsStudent.id);
    } catch (err) {
      console.error("Failed to revoke session:", err);
    }
  };

  // Update Student Form Handler
  const handleUpdateStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudent) return;
    setManageBusy(true);
    setManageStatusMsg(null);

    try {
      await updateStudent(selectedStudent.id, {
        firstName: manageFirstName,
        lastName: manageLastName,
        phone: managePhone || null,
        gender: manageGender || null,
        country: manageCountry || null,
        guardianName: manageGuardianName || null,
        profession: manageProfession || null,
        fees: manageFees !== "" ? Number(manageFees) : null,
        joiningDate: manageJoiningDate || null,
        lastPaymentDate: manageLastPaymentDate || null,
        nextPaymentDate: manageNextPaymentDate || null,
        status: manageStatus,
        courseCode: manageCourseCode || undefined,
        teacherId: manageTeacherId || undefined,
      });

      setManageStatusMsg({ type: "success", message: "Student configurations saved successfully." });
      loadStudents();
      setTimeout(() => {
        setSelectedStudent(null);
      }, 1200);
    } catch (err) {
      setManageStatusMsg({
        type: "error",
        message: err instanceof ApiError ? err.message : "Failed to update student profile details."
      });
    } finally {
      setManageBusy(false);
    }
  };

  // Block / Unblock Student Profile Account
  const handleToggleBlockStudent = async (student: StudentProfile) => {
    const isBlocked = student.user.status === "INACTIVE";
    const newStatus = isBlocked ? "ACTIVE" : "INACTIVE";
    const actionLabel = isBlocked ? "unblock" : "block";

    const result = await Swal.fire({
      title: `${isBlocked ? "Unblock" : "Block"} Student?`,
      text: `Are you sure you want to ${actionLabel} ${student.user.firstName} ${student.user.lastName}? ${isBlocked ? "They will be allowed to log back in." : "They will be force logged out and prevented from signing in."}`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: `Yes, ${actionLabel}`,
      cancelButtonText: "Cancel",
      customClass: {
        popup: "rounded-3xl border border-hairline bg-surface text-ink",
        title: "text-lg font-bold text-ink",
        htmlContainer: "text-sm text-ink-3",
        confirmButton: "bg-accent text-white px-5 py-2.5 rounded-xl font-bold hover:shadow-lg transition-all cursor-pointer",
        cancelButton: "bg-surface-3 text-ink-2 px-5 py-2.5 rounded-xl font-bold hover:bg-surface-4 transition-all ml-3 cursor-pointer"
      },
      buttonsStyling: false
    });

    if (result.isConfirmed) {
      try {
        await updateStudent(student.id, { status: newStatus });
        Swal.fire({
          title: isBlocked ? "Unblocked!" : "Blocked!",
          text: `Student account has been ${isBlocked ? "unblocked" : "blocked"} successfully.`,
          icon: "success",
          customClass: {
            popup: "rounded-3xl border border-hairline bg-surface text-ink",
            title: "text-lg font-bold text-ink",
            htmlContainer: "text-sm text-ink-3",
            confirmButton: "bg-accent text-white px-5 py-2.5 rounded-xl font-bold hover:shadow-lg transition-all cursor-pointer"
          },
          buttonsStyling: false
        });
        loadStudents();
      } catch (err) {
        Swal.fire({
          title: "Failed!",
          text: err instanceof ApiError ? err.message : `Could not ${actionLabel} student.`,
          icon: "error",
          customClass: {
            popup: "rounded-3xl border border-hairline bg-surface text-ink",
            title: "text-lg font-bold text-ink",
            htmlContainer: "text-sm text-ink-3",
            confirmButton: "bg-accent text-white px-5 py-2.5 rounded-xl font-bold hover:shadow-lg transition-all cursor-pointer"
          },
          buttonsStyling: false
        });
      }
    }
  };

  // Delete Student Profile (called from list or modal)
  const handleDeleteStudent = async (studentToDelete?: StudentProfile) => {
    const target = studentToDelete || selectedStudent;
    if (!target) return;
    
    Swal.fire({
      title: "Delete Student Profile?",
      text: `Are you sure you want to permanently delete the profile for ${target.user.firstName} ${target.user.lastName}? This operation is irreversible.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
      customClass: {
        popup: "rounded-3xl border border-hairline bg-surface text-ink",
        title: "text-lg font-bold text-ink",
        htmlContainer: "text-sm text-ink-3",
        confirmButton: "bg-critical text-white px-5 py-2.5 rounded-xl font-bold hover:shadow-lg transition-all cursor-pointer",
        cancelButton: "bg-surface-3 text-ink-2 px-5 py-2.5 rounded-xl font-bold hover:bg-surface-4 transition-all ml-3 cursor-pointer"
      },
      buttonsStyling: false
    }).then(async (result) => {
      if (result.isConfirmed) {
        if (!studentToDelete) setManageBusy(true);

        try {
          await deleteStudent(target.id);
          Swal.fire({
            title: "Deleted!",
            text: "Student account deleted successfully.",
            icon: "success",
            customClass: {
              popup: "rounded-3xl border border-hairline bg-surface text-ink",
              title: "text-lg font-bold text-ink",
              htmlContainer: "text-sm text-ink-3",
              confirmButton: "bg-accent text-white px-5 py-2.5 rounded-xl font-bold hover:shadow-lg transition-all cursor-pointer"
            },
            buttonsStyling: false
          });
          loadStudents();
          setSelectedStudent(null);
        } catch (err) {
          const msg = err instanceof ApiError ? err.message : "Failed to delete student profile.";
          Swal.fire({
            title: "Error!",
            text: msg,
            icon: "error",
            customClass: {
              popup: "rounded-3xl border border-hairline bg-surface text-ink",
              title: "text-lg font-bold text-ink",
              htmlContainer: "text-sm text-ink-3",
              confirmButton: "bg-accent text-white px-5 py-2.5 rounded-xl font-bold hover:shadow-lg transition-all cursor-pointer"
            },
            buttonsStyling: false
          });
        } finally {
          if (!studentToDelete) setManageBusy(false);
        }
      }
    });
  };

  const formatDateLabel = (d: string | null) => {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric"
    });
  };

  // Advanced Filters Handler
  const handleApplyFilters = () => {
    setSelectedCourse(tempCourse);
    setSelectedTeacher(tempTeacher);
    setSelectedBatch(tempBatch);
    setSelectedCoach(tempCoach);
    setSelectedTrialConverted(tempTrialConverted);
    setSelectedCountry(tempCountry);
    setJoiningStart(tempJoiningStart);
    setJoiningEnd(tempJoiningEnd);
    setPaymentDueStart(tempPaymentDueStart);
    setPaymentDueEnd(tempPaymentDueEnd);
    setPage(1);
  };

  const handleClearFilters = () => {
    setTempCourse("");
    setTempTeacher("");
    setTempBatch("");
    setTempCoach("");
    setTempTrialConverted("");
    setTempCountry("");
    setTempJoiningStart("");
    setTempJoiningEnd("");
    setTempPaymentDueStart("");
    setTempPaymentDueEnd("");

    setSelectedCourse("");
    setSelectedTeacher("");
    setSelectedBatch("");
    setSelectedCoach("");
    setSelectedTrialConverted("");
    setSelectedCountry("");
    setJoiningStart("");
    setJoiningEnd("");
    setPaymentDueStart("");
    setPaymentDueEnd("");
    setPage(1);
  };

  const hasActiveFilters =
    selectedCourse !== "" ||
    selectedTeacher !== "" ||
    selectedBatch !== "" ||
    selectedCoach !== "" ||
    selectedTrialConverted !== "" ||
    selectedCountry !== "" ||
    joiningStart !== "" ||
    joiningEnd !== "" ||
    paymentDueStart !== "" ||
    paymentDueEnd !== "";

  return (
    <>
      <Topbar title="Students" subtitle={`${total} students registered across courses`} />

      <div className="animate-fade-up space-y-6 p-4 sm:p-6">
        
        {/* Advanced Overview Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Card 1: Student Record (Bar Chart) */}
          <Card className="p-5 border border-hairline bg-surface shadow-sm rounded-2xl flex flex-col justify-between h-[300px]">
            <div>
              <h3 className="text-sm font-bold text-ink">Student Record</h3>
              <p className="text-[10px] text-ink-3">Distribution of student accounts by status</p>
            </div>
            
            {/* Custom SVG Bar Chart */}
            <div className="flex-1 flex items-end justify-between gap-2.5 px-2 mt-4 mb-2 h-[150px]">
              {(() => {
                const totalVal = stats?.total || 0;
                const activeVal = stats?.active || 0;
                const pendingVal = stats?.pending || 0;
                const trialVal = stats?.trial || 0;
                const pausedVal = stats?.paused || 0;

                const maxVal = Math.max(totalVal, activeVal, pendingVal, trialVal, pausedVal, 1);

                const data = [
                  { label: "Total", value: totalVal, color: "from-[#386FA4] to-[#133C55]" },
                  { label: "Active", value: activeVal, color: "from-good/70 to-good" },
                  { label: "Trial", value: trialVal, color: "from-accent/70 to-accent" },
                  { label: "Pending", value: pendingVal, color: "from-warning/70 to-warning" },
                  { label: "Paused", value: pausedVal, color: "from-neutral/70 to-neutral" },
                ];

                return data.map((item, idx) => {
                  const percentage = (item.value / maxVal) * 100;
                  return (
                    <div key={idx} className="flex-1 flex flex-col items-center group h-full justify-end">
                      <span className="text-[10px] font-bold text-ink mb-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">{item.value}</span>
                      <div className="w-full relative rounded-t-lg bg-surface-2 overflow-hidden flex items-end" style={{ height: `${Math.max(percentage, 8)}%` }}>
                        <div className={`w-full h-full bg-gradient-to-t ${item.color} rounded-t-lg transition-all duration-500`} />
                      </div>
                      <span className="text-[10px] font-bold text-ink-3 mt-2 truncate w-full text-center">{item.label}</span>
                    </div>
                  );
                });
              })()}
            </div>
          </Card>

          {/* Card 2: Gender (Radial/Circular Progress Chart) */}
          <Card className="p-5 border border-hairline bg-surface shadow-sm rounded-2xl flex flex-col justify-between h-[300px]">
            <div>
              <h3 className="text-sm font-bold text-ink">Gender</h3>
              <p className="text-[10px] text-ink-3">Ratio of male to female students</p>
            </div>

            <div className="flex-1 flex items-center justify-center relative mt-2">
              {(() => {
                const maleCount = stats?.male || 0;
                const femaleCount = stats?.female || 0;
                const totalCount = maleCount + femaleCount || 1;
                const malePct = Math.round((maleCount / totalCount) * 100);
                const femalePct = Math.round((femaleCount / totalCount) * 100);

                // SVG dimensions
                const radius = 50;
                const circumference = 2 * Math.PI * radius;
                const strokeDashoffset = circumference - (malePct / 100) * circumference;

                return (
                  <div className="flex items-center gap-6 w-full px-2">
                    {/* Ring Container */}
                    <div className="relative size-28 flex items-center justify-center shrink-0">
                      <svg className="size-full -rotate-90">
                        {/* Background track circle */}
                        <circle
                          cx="56"
                          cy="56"
                          r={radius}
                          className="stroke-surface-3 fill-none"
                          strokeWidth="10"
                        />
                        {/* Male arc (Yale Blue accent) */}
                        <circle
                          cx="56"
                          cy="56"
                          r={radius}
                          className="stroke-accent fill-none transition-all duration-1000 ease-out"
                          strokeWidth="10"
                          strokeDasharray={circumference}
                          strokeDashoffset={strokeDashoffset}
                          strokeLinecap="round"
                        />
                      </svg>
                      {/* Centered % */}
                      <div className="absolute flex flex-col items-center justify-center text-center">
                        <span className="text-lg font-black text-ink">{malePct}%</span>
                        <span className="text-[8px] font-bold text-ink-3 uppercase tracking-wider">Male</span>
                      </div>
                    </div>

                    {/* Stats List */}
                    <div className="flex-1 space-y-3">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className="size-2.5 rounded-full bg-accent" />
                          <span className="font-bold text-ink-2">Male</span>
                        </div>
                        <span className="tnum font-extrabold text-ink">{maleCount} ({malePct}%)</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className="size-2.5 rounded-full bg-surface-3" />
                          <span className="font-bold text-ink-2">Female</span>
                        </div>
                        <span className="tnum font-extrabold text-ink">{femaleCount} ({femalePct}%)</span>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </Card>

          {/* Card 3: Countries Leaderboard */}
          <Card className="p-5 border border-hairline bg-surface shadow-sm rounded-2xl flex flex-col justify-between h-[300px]">
            <div>
              <h3 className="text-sm font-bold text-ink">Countries</h3>
              <p className="text-[10px] text-ink-3">Top student geographical distributions</p>
            </div>

            <div className="flex-1 flex flex-col justify-center space-y-3 mt-4">
              {stats?.countries && stats.countries.length > 0 ? (
                stats.countries.map((c, idx) => {
                  return (
                    <div key={idx} className="space-y-1">
                      <div className="flex items-center justify-between text-xs font-bold">
                        <span className="text-ink-2 flex items-center gap-2">
                          <span className="grid size-5 place-items-center rounded bg-surface-2 text-[10px]">📍</span>
                          {c.country}
                        </span>
                        <span className="tnum text-ink">{c.count}</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-surface-2 overflow-hidden">
                        <div className="h-full bg-accent rounded-full transition-all duration-700" style={{ width: `${(c.count / (stats.total || 1)) * 100}%` }} />
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-6 text-xs font-bold text-ink-3">No location data available</div>
              )}
            </div>
          </Card>

        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3">
          <label className="relative min-w-56 flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-3" />
            <input
              value={query}
              onChange={(e) => resetPage(() => setQuery(e.target.value))}
              placeholder="Search name, email, course…"
              className="h-9 w-full rounded-xl border border-hairline bg-surface pr-3 pl-10 text-sm text-ink placeholder:text-ink-3 focus:bg-surface focus:shadow-sm focus:border-accent/30 transition-all duration-300 focus:outline-none"
            />
          </label>

          <div className="inline-flex rounded-xl border border-hairline bg-surface p-0.5 shadow-sm">
            {FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => resetPage(() => setFilter(f))}
                className={cn(
                  "rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all duration-200 cursor-pointer",
                  f === filter
                    ? "bg-accent text-accent-ink shadow-sm"
                    : "text-ink-3 hover:text-ink",
                )}
              >
                {f}
              </button>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              className={cn(
                "rounded-xl cursor-pointer transition-all",
                (showFiltersPanel || hasActiveFilters) && "border-accent bg-accent-soft text-accent font-bold"
              )}
              onClick={() => setShowFiltersPanel(!showFiltersPanel)}
            >
              <SlidersHorizontal className="size-3.5" />
              Filters {hasActiveFilters && "•"}
            </Button>
            <Button variant="outline" size="sm" className="rounded-xl">
              <Download className="size-3.5" />
              Export
            </Button>
            <Button 
              variant="primary" 
              size="sm" 
              className="rounded-xl bg-accent hover:bg-accent-hover font-bold text-white transition-all duration-200 shadow-sm"
              onClick={() => { setShowModal(true); setModalStatus(null); }}
            >
              <Plus className="size-3.5 mr-1" />
              Add student
            </Button>
          </div>
        </div>

        {/* Collapsible Advanced Filters Drawer Card */}
        {showFiltersPanel && (
          <Card className="p-5 border border-hairline bg-surface shadow-md rounded-2xl animate-fade-in space-y-4">
            <div className="flex items-center justify-between border-b border-hairline pb-3">
              <h4 className="font-bold text-sm text-ink flex items-center gap-1.5">
                <SlidersHorizontal className="size-4 text-accent" />
                Advanced Filters Drawer
              </h4>
              <button 
                onClick={() => setShowFiltersPanel(false)}
                className="text-xs font-bold text-ink-3 hover:text-ink cursor-pointer bg-surface-2 px-2.5 py-1.2 rounded-lg"
              >
                Close Drawer
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Course Selection */}
              <div>
                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-ink-3">Filter by Course</label>
                <select
                  value={tempCourse}
                  onChange={(e) => setTempCourse(e.target.value)}
                  className="h-10.5 w-full rounded-xl border border-hairline bg-surface px-3.5 text-sm text-ink focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all"
                >
                  <option value="">All Courses</option>
                  {coursesList.map((c) => (
                    <option key={c.id} value={c.id}>{c.title}</option>
                  ))}
                </select>
              </div>

              {/* Teacher Selection */}
              <div>
                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-ink-3">Filter by Teacher</label>
                <select
                  value={tempTeacher}
                  onChange={(e) => setTempTeacher(e.target.value)}
                  className="h-10.5 w-full rounded-xl border border-hairline bg-surface px-3.5 text-sm text-ink focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all"
                >
                  <option value="">All Teachers</option>
                  {teachersList.map((t) => (
                    <option key={t.id} value={t.id}>{t.user.firstName} {t.user.lastName}</option>
                  ))}
                </select>
              </div>

              {/* Batch Selection */}
              <div>
                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-ink-3">Filter by Batch</label>
                <select
                  value={tempBatch}
                  onChange={(e) => setTempBatch(e.target.value)}
                  className="h-10.5 w-full rounded-xl border border-hairline bg-surface px-3.5 text-sm text-ink focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all"
                >
                  <option value="">All Batches</option>
                  {batchesList.map((b) => (
                    <option key={b.id} value={b.id}>{b.code} · {b.name}</option>
                  ))}
                </select>
              </div>

              {/* Academic Coach Selection */}
              <div>
                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-ink-3">Filter by Academic Coach</label>
                <select
                  value={tempCoach}
                  onChange={(e) => setTempCoach(e.target.value)}
                  className="h-10.5 w-full rounded-xl border border-hairline bg-surface px-3.5 text-sm text-ink focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all"
                >
                  <option value="">All Coaches</option>
                  {coachesList.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {/* Trial Converted */}
              <div>
                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-ink-3">Trial Converted</label>
                <select
                  value={tempTrialConverted}
                  onChange={(e) => setTempTrialConverted(e.target.value)}
                  className="h-10.5 w-full rounded-xl border border-hairline bg-surface px-3.5 text-sm text-ink focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all"
                >
                  <option value="">All Students</option>
                  <option value="true">Only Trial-Converted</option>
                </select>
              </div>

              {/* Country Selection */}
              <div>
                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-ink-3">Filter by Country</label>
                <div className="relative">
                  <Globe className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-3" />
                  <input
                    type="text"
                    value={tempCountry}
                    onChange={(e) => setTempCountry(e.target.value)}
                    placeholder="Search Country (e.g. India)"
                    className="h-10.5 w-full rounded-xl border border-hairline bg-surface pr-3.5 pl-10 text-sm text-ink focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-hairline pt-4">
              {/* Joining Date Range */}
              <div>
                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-ink-3">Register / Joining Date (Between Dates)</label>
                <div className="grid grid-cols-2 gap-3.5">
                  <div className="relative">
                    <Calendar className="pointer-events-none absolute top-1/2 left-3.5 size-3.5 -translate-y-1/2 text-ink-3" />
                    <input
                      type="date"
                      value={tempJoiningStart}
                      onChange={(e) => setTempJoiningStart(e.target.value)}
                      className="h-10 w-full rounded-xl border border-hairline bg-surface pr-3 pl-10 text-xs text-ink focus:outline-none focus:border-accent"
                    />
                  </div>
                  <div className="relative">
                    <Calendar className="pointer-events-none absolute top-1/2 left-3.5 size-3.5 -translate-y-1/2 text-ink-3" />
                    <input
                      type="date"
                      value={tempJoiningEnd}
                      onChange={(e) => setTempJoiningEnd(e.target.value)}
                      className="h-10 w-full rounded-xl border border-hairline bg-surface pr-3 pl-10 text-xs text-ink focus:outline-none focus:border-accent"
                    />
                  </div>
                </div>
              </div>

              {/* Payment Due Date Range */}
              <div>
                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-ink-3">Payment Due Date (Between Dates)</label>
                <div className="grid grid-cols-2 gap-3.5">
                  <div className="relative">
                    <Calendar className="pointer-events-none absolute top-1/2 left-3.5 size-3.5 -translate-y-1/2 text-ink-3" />
                    <input
                      type="date"
                      value={tempPaymentDueStart}
                      onChange={(e) => setTempPaymentDueStart(e.target.value)}
                      className="h-10 w-full rounded-xl border border-hairline bg-surface pr-3 pl-10 text-xs text-ink focus:outline-none focus:border-accent"
                    />
                  </div>
                  <div className="relative">
                    <Calendar className="pointer-events-none absolute top-1/2 left-3.5 size-3.5 -translate-y-1/2 text-ink-3" />
                    <input
                      type="date"
                      value={tempPaymentDueEnd}
                      onChange={(e) => setTempPaymentDueEnd(e.target.value)}
                      className="h-10 w-full rounded-xl border border-hairline bg-surface pr-3 pl-10 text-xs text-ink focus:outline-none focus:border-accent"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3 border-t border-hairline pt-4">
              <Button
                onClick={handleClearFilters}
                variant="outline"
                size="sm"
                className="rounded-xl border-hairline hover:bg-surface-2 font-bold cursor-pointer"
              >
                Clear All Filters
              </Button>
              <Button
                onClick={handleApplyFilters}
                variant="primary"
                size="sm"
                className="rounded-xl bg-accent hover:bg-accent-hover font-bold text-white transition-all duration-200 cursor-pointer"
              >
                Apply Filters
              </Button>
            </div>
          </Card>
        )}

        <Card className="overflow-hidden border border-hairline bg-surface shadow-sm">
          <div className="overflow-x-auto min-h-[300px]">
            {loading ? (
              <div className="flex justify-center items-center py-16 text-sm font-bold text-ink-3">
                <Loader2 className="size-5 animate-spin mr-2" />
                Loading students...
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-hairline bg-surface-2 text-left">
                    <th className="px-4 py-3 w-4">
                      <input 
                        type="checkbox" 
                        checked={selectedIds.length === students.length && students.length > 0}
                        onChange={(e) => handleSelectAll(e.target.checked)}
                        className="rounded border-hairline text-accent size-4 cursor-pointer focus:ring-0"
                      />
                    </th>
                    <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-ink-3">Student Name</th>
                    <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-ink-3">Student ID</th>
                    <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-ink-3">Parent</th>
                    <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-ink-3">Package</th>
                    <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-ink-3">Date of Joining</th>
                    <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-ink-3">Preferred Days</th>
                    <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-ink-3">Preferred Time</th>
                    <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-ink-3">Teacher Name</th>
                    <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-ink-3">Batch</th>
                    <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-ink-3">Course Name</th>
                    <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-ink-3">Contact</th>
                    <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-ink-3">Scheduled Classes</th>
                    <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-ink-3">Attendance</th>
                    <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-ink-3">Status</th>
                    <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-ink-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((row) => {
                    const firstEnrollment = row.enrollments?.[0];
                    const courseName = firstEnrollment ? firstEnrollment.course.title : "Not Enrolled";
                    // A course can be assigned without a teacher, so guard `teacher`.
                    const teacherName = firstEnrollment?.teacher
                      ? `${firstEnrollment.teacher.user.firstName} ${firstEnrollment.teacher.user.lastName}`
                      : "Not Assigned";
                    const packageName = firstEnrollment?.package?.name || "—";
                    const classesCount = firstEnrollment?.package?.classesPerMonth ?? null;
                    const statusText = row.user.status;
                    const isSelected = selectedIds.includes(row.id);

                    return (
                      <tr
                        key={row.id}
                        className={cn(
                          "border-b border-hairline last:border-0 hover:bg-surface-2/30 transition-colors duration-150 relative",
                          isSelected && "bg-accent-soft/20 hover:bg-accent-soft/25"
                        )}
                      >
                        <td className="px-4 py-3 w-4">
                          <input 
                            type="checkbox" 
                            checked={isSelected}
                            onChange={(e) => handleSelectRow(row.id, e.target.checked)}
                            className="rounded border-hairline text-accent size-4 cursor-pointer focus:ring-0"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-to-tr from-accent via-[#386FA4] to-[#59A5D8] text-[11px] font-bold text-white shadow-sm shadow-accent/10">
                              {initials(`${row.user.firstName} ${row.user.lastName}`)}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-ink text-sm flex items-center gap-1.5">
                                {row.user.firstName} {row.user.lastName}
                                {row.gender && (
                                  <span className="text-[10px] px-1.5 py-0.2 bg-surface-3 rounded-full text-ink-2 font-black uppercase">
                                    {row.gender.charAt(0)}
                                  </span>
                                )}
                              </p>
                              <p className="truncate text-xs text-ink-3">{row.user.email}</p>
                            </div>
                          </div>
                        </td>

                        {/* Student ID */}
                        <td className="tnum px-4 py-3 text-xs font-bold text-ink-3">{row.studentCode}</td>

                        {/* Parent */}
                        <td className="px-4 py-3 text-xs text-ink-2 font-medium">{row.parentName || row.guardianName || "—"}</td>

                        {/* Package */}
                        <td className="px-4 py-3 text-xs text-ink font-semibold">
                          <span className="px-2.5 py-1 bg-accent/5 border border-accent/10 rounded-xl text-accent font-black">
                            {packageName}
                          </span>
                        </td>

                        {/* Joining date */}
                        <td className="px-4 py-3 text-xs text-ink-2 font-medium">{formatDateLabel(row.joiningDate)}</td>

                        {/* Preferred Days */}
                        <td className="px-4 py-3 text-xs text-ink-2 font-medium">
                          {row.preferredDays?.length ? (
                            <div className="flex flex-wrap gap-1">
                              {row.preferredDays.map((d) => (
                                <span key={d} className="px-1.5 py-0.5 bg-surface-3 border border-hairline rounded text-[10px] font-bold text-ink-2 uppercase">
                                  {d.slice(0, 3)}
                                </span>
                              ))}
                            </div>
                          ) : (
                            "—"
                          )}
                        </td>

                        {/* Preferred Time */}
                        <td className="px-4 py-3 text-xs text-ink-2 font-semibold text-accent animate-pulse-subtle">
                          {row.preferredTime || "—"}
                        </td>

                        {/* Teacher Name */}
                        <td className="px-4 py-3 text-xs text-ink-2 font-medium">{teacherName}</td>

                        {/* Batch */}
                        <td className="px-4 py-3 text-xs text-ink-2 font-medium">{row.batchCode || "—"}</td>

                        {/* Course Name */}
                        <td className="px-4 py-3 text-xs text-ink-2 font-medium">{courseName}</td>

                        {/* Mobile Phone Number */}
                        <td className="px-4 py-3 text-xs text-ink-2 font-medium">{row.phone || "—"}</td>

                        {/* Scheduled Classes */}
                        <td className="tnum px-4 py-3 text-xs font-bold text-ink">{classesCount != null ? `${classesCount} Classes` : "—"}</td>

                        {/* Attendance */}
                        <td className="tnum px-4 py-3 text-xs font-bold text-ink-2">{row.attendanceRate != null ? `${row.attendanceRate}%` : "—"}</td>

                        {/* Account Status */}
                        <td className="px-4 py-3">
                          <Badge tone={statusTone[statusText] || "neutral"}>{statusText}</Badge>
                        </td>

                        {/* Actions Dropdown Menu */}
                        <td className="px-4 py-3 text-right">
                          <div className="relative inline-block text-left">
                            <button
                              onClick={() => setActiveMenuId(activeMenuId === row.id ? null : row.id)}
                              className="size-8 rounded-lg hover:bg-surface-3 flex items-center justify-center text-ink-2 cursor-pointer transition-colors"
                            >
                              <MoreVertical className="size-4" />
                            </button>

                            {/* Dropdown Options */}
                            {activeMenuId === row.id && (
                              <>
                                {/* Overlay to close dropdown */}
                                <div className="fixed inset-0 z-10" onClick={() => setActiveMenuId(null)} />
                                <div className="absolute right-0 mt-1.5 w-44 rounded-xl border border-hairline bg-surface shadow-lg z-20 py-1 animate-fade-in text-left">
                                  <button
                                    onClick={() => {
                                      setActiveMenuId(null);
                                      router.push(`/students/${row.id}`);
                                    }}
                                    className="flex w-full items-center gap-2 px-3 py-2 text-xs font-bold text-ink hover:bg-surface-2 transition-colors cursor-pointer"
                                  >
                                    <SlidersHorizontal className="size-3.5 text-accent" />
                                    Manage
                                  </button>
                                  <button
                                    onClick={() => {
                                      setActiveMenuId(null);
                                      setDetailsStudent(row);
                                    }}
                                    className="flex w-full items-center gap-2 px-3 py-2 text-xs font-bold text-ink hover:bg-surface-2 transition-colors cursor-pointer"
                                  >
                                    <FileText className="size-3.5 text-accent" />
                                    Full Details
                                  </button>
                                  <button
                                    onClick={() => {
                                      setActiveMenuId(null);
                                      openManageModal(row);
                                    }}
                                    className="flex w-full items-center gap-2 px-3 py-2 text-xs font-bold text-ink hover:bg-surface-2 transition-colors cursor-pointer"
                                  >
                                    <Edit2 className="size-3.5 text-accent" />
                                    Edit Profile
                                  </button>
                                  <button
                                    onClick={() => {
                                      setActiveMenuId(null);
                                      setPwdResetStudent(row);
                                      setNewPassword("");
                                      setPwdResetMsg(null);
                                    }}
                                    className="flex w-full items-center gap-2 px-3 py-2 text-xs font-bold text-ink hover:bg-surface-2 transition-colors cursor-pointer"
                                  >
                                    <Key className="size-3.5 text-accent" />
                                    Change Password
                                  </button>
                                  <button
                                    onClick={() => {
                                      setActiveMenuId(null);
                                      openSessionsModal(row);
                                    }}
                                    className="flex w-full items-center gap-2 px-3 py-2 text-xs font-bold text-ink hover:bg-surface-2 transition-colors cursor-pointer"
                                  >
                                    <Laptop className="size-3.5 text-accent" />
                                    Login History
                                  </button>
                                  <button
                                    onClick={() => {
                                      setActiveMenuId(null);
                                      handleToggleBlockStudent(row);
                                    }}
                                    className="flex w-full items-center gap-2 px-3 py-2 text-xs font-bold text-ink hover:bg-surface-2 transition-colors cursor-pointer"
                                  >
                                    <Lock className="size-3.5 text-accent" />
                                    {row.user.status === "INACTIVE" ? "Unblock Student" : "Block Student"}
                                  </button>
                                  <div className="border-t border-hairline my-1" />
                                  {isAdmin && (
                                  <button
                                    onClick={() => {
                                      setActiveMenuId(null);
                                      handleDeleteStudent(row);
                                    }}
                                    className="flex w-full items-center gap-2 px-3 py-2 text-xs font-bold text-critical hover:bg-critical/5 transition-colors cursor-pointer"
                                  >
                                    <Trash2 className="size-3.5" />
                                    Delete Student
                                  </button>
                                  )}
                                </div>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {students.length === 0 && (
                    <tr>
                      <td colSpan={13} className="px-5 py-16 text-center">
                        <p className="text-sm font-semibold text-ink">No students found</p>
                        <p className="mt-1 text-xs text-ink-3">
                          Try a different search term or clear the filters.
                        </p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between border-t border-hairline px-5 py-3 flex-wrap gap-4 select-none">
            <div className="flex items-center gap-4 flex-wrap">
              <p className="text-xs text-ink-3 font-medium">
                Showing <span className="tnum font-bold text-ink-2">{students.length}</span> of{" "}
                <span className="tnum font-bold text-ink-2">{total}</span> students
              </p>
              
              <div className="flex items-center gap-1.5 text-xs text-ink-3 font-semibold">
                <span>Show:</span>
                <select
                  value={limit}
                  onChange={(e) => {
                    setLimit(Number(e.target.value));
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
            <div className="flex items-center gap-1.5">
              <Button
                variant="ghost"
                size="icon"
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
                aria-label="Previous page"
                className="rounded-xl hover:bg-surface-2"
              >
                <ChevronLeft className="size-4" />
              </Button>
              <span className="tnum px-2 text-xs font-bold text-ink-2">
                {page} / {totalPages}
              </span>
              <Button
                variant="ghost"
                size="icon"
                disabled={page === totalPages}
                onClick={() => setPage(page + 1)}
                aria-label="Next page"
                className="rounded-xl hover:bg-surface-2"
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        </Card>
      </div>

      {/* Advanced Add Student Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-surface border border-hairline w-full max-w-lg rounded-3xl overflow-hidden shadow-2xl animate-scale-up">
            
            {/* Header */}
            <div className="flex items-center justify-between border-b border-hairline px-6 py-4.5">
              <div>
                <h3 className="font-bold text-base text-ink">Add New Student</h3>
                <p className="text-xs text-ink-3 mt-0.5">Register a fresh student account in the LMS database</p>
              </div>
              <button 
                onClick={() => setShowModal(false)}
                className="size-8 rounded-full bg-surface-2 hover:bg-surface-3 transition-colors grid place-items-center text-ink-2"
                aria-label="Close Modal"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Modal Body / Form */}
            <form onSubmit={handleAddStudent} className="p-6 space-y-4.5 overflow-y-auto max-h-[80vh] scrollbar-thin">
              
              {modalStatus && (
                <div className={`flex items-start gap-3 p-3.5 rounded-xl border animate-fade-in ${
                  modalStatus.type === "success" 
                    ? "bg-good/5 border-good/20 text-good-ink" 
                    : "bg-critical/5 border-critical/20 text-critical"
                }`}>
                  {modalStatus.type === "success" ? <CheckCircle2 className="size-5 shrink-0" /> : <AlertCircle className="size-5 shrink-0" />}
                  <span className="text-xs font-semibold">{modalStatus.message}</span>
                </div>
              )}

              {/* Name Details */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-ink-3">First Name</label>
                  <div className="relative">
                    <User className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-3" />
                    <input
                      type="text"
                      required
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="John"
                      className="h-11 w-full rounded-xl border border-hairline bg-surface pr-3 pl-10 text-sm text-ink focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-ink-3">Last Name</label>
                  <div className="relative">
                    <User className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-3" />
                    <input
                      type="text"
                      required
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="Doe"
                      className="h-11 w-full rounded-xl border border-hairline bg-surface pr-3 pl-10 text-sm text-ink focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all"
                    />
                  </div>
                </div>
              </div>

              {/* Email and Password */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-ink-3">Email Address</label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-3" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="john.doe@mail.com"
                      className="h-11 w-full rounded-xl border border-hairline bg-surface pr-3 pl-10 text-sm text-ink focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-ink-3">Initial Password</label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-3" />
                    <input
                      type="password"
                      required
                      minLength={8}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="h-11 w-full rounded-xl border border-hairline bg-surface pr-3 pl-10 text-sm text-ink focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all"
                    />
                  </div>
                </div>
              </div>

              {/* Mobile and Gender */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-ink-3">Mobile Number</label>
                  <div className="relative">
                    <Phone className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-3" />
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+91 98765 43210"
                      className="h-11 w-full rounded-xl border border-hairline bg-surface pr-3 pl-10 text-sm text-ink focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-ink-3">Gender</label>
                  <select
                    value={gender}
                    onChange={(e) => setGender(e.target.value)}
                    className="h-11 w-full rounded-xl border border-hairline bg-surface px-4 text-sm text-ink focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all"
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              {/* Country and Profession */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-ink-3">Country</label>
                  <div className="relative">
                    <Globe className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-3" />
                    <input
                      type="text"
                      value={country}
                      onChange={(e) => setCountry(e.target.value)}
                      placeholder="India"
                      className="h-11 w-full rounded-xl border border-hairline bg-surface pr-3 pl-10 text-sm text-ink focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-ink-3">Profession / Role</label>
                  <div className="relative">
                    <Briefcase className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-3" />
                    <input
                      type="text"
                      readOnly
                      value={profession}
                      className="h-11 w-full rounded-xl border border-hairline bg-surface-2 opacity-75 pr-3 pl-10 text-sm text-ink-3 cursor-not-allowed transition-all"
                    />
                  </div>
                </div>
              </div>

              {/* Fees & Guardian Name */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-ink-3">Fees Amount (₹)</label>
                  <div className="relative">
                    <DollarSign className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-3" />
                    <input
                      type="number"
                      value={fees}
                      onChange={(e) => setFees(e.target.value === "" ? "" : Number(e.target.value))}
                      placeholder="5000"
                      className="h-11 w-full rounded-xl border border-hairline bg-surface pr-3 pl-10 text-sm text-ink focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-ink-3">Guardian Name</label>
                  <div className="relative">
                    <User className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-3" />
                    <input
                      type="text"
                      value={guardianName}
                      onChange={(e) => setGuardianName(e.target.value)}
                      placeholder="Parent/Guardian Full Name"
                      className="h-11 w-full rounded-xl border border-hairline bg-surface pr-3 pl-10 text-sm text-ink focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all"
                    />
                  </div>
                </div>
              </div>

              {/* Joining Date & Last Payment */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-ink-3">Joining Date</label>
                  <div className="relative">
                    <Calendar className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-3" />
                    <input
                      type="date"
                      value={joiningDate}
                      onChange={(e) => setJoiningDate(e.target.value)}
                      className="h-11 w-full rounded-xl border border-hairline bg-surface pr-3 pl-10 text-sm text-ink focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-ink-3">Last Payment Date</label>
                  <div className="relative">
                    <Calendar className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-3" />
                    <input
                      type="date"
                      value={lastPaymentDate}
                      onChange={(e) => setLastPaymentDate(e.target.value)}
                      className="h-11 w-full rounded-xl border border-hairline bg-surface pr-3 pl-10 text-sm text-ink focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all"
                    />
                  </div>
                </div>
              </div>

              {/* Next Payment Date */}
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-ink-3">Next Payment Date</label>
                <div className="relative">
                  <Calendar className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-3" />
                  <input
                    type="date"
                    value={nextPaymentDate}
                    onChange={(e) => setNextPaymentDate(e.target.value)}
                    className="h-11 w-full rounded-xl border border-hairline bg-surface pr-3 pl-10 text-sm text-ink focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all"
                  />
                </div>
              </div>

              {/* Optional enrolment: assign a course + teacher (both optional) */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 border-t border-hairline pt-4">
                <div className="sm:col-span-2 -mb-1">
                  <p className="text-[11px] font-semibold text-ink-3">Enrolment <span className="font-normal">(optional — leave blank to add an unassigned student)</span></p>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-ink-3">Course</label>
                  <div className="relative">
                    <Briefcase className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-3" />
                    <select
                      value={formCourseCode}
                      onChange={(e) => setFormCourseCode(e.target.value)}
                      className="h-11 w-full rounded-xl border border-hairline bg-surface pr-3 pl-10 text-sm text-ink focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all cursor-pointer"
                    >
                      <option value="">— No course —</option>
                      {catalogCourses.map(c => (
                        <option key={c.id} value={c.code}>{c.title} ({c.code})</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-ink-3">Teacher</label>
                  <div className="relative">
                    <User className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-3" />
                    <select
                      value={formTeacherId}
                      onChange={(e) => setFormTeacherId(e.target.value)}
                      className="h-11 w-full rounded-xl border border-hairline bg-surface pr-3 pl-10 text-sm text-ink focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all cursor-pointer"
                    >
                      <option value="">— No teacher —</option>
                      {teachersList.map(t => (
                        <option key={t.id} value={t.id}>{t.user.firstName} {t.user.lastName}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Actions Bar */}
              <div className="flex items-center justify-end gap-3 border-t border-hairline pt-4.5 bg-surface">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setShowModal(false)}
                  className="h-10 px-4 font-bold text-ink-2 hover:bg-surface-2 rounded-xl"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={modalBusy}
                  className="h-10 px-6 font-bold text-white bg-accent hover:bg-accent-hover rounded-xl hover:shadow-[0_8px_16px_rgba(19,60,85,0.25)] transition-all duration-300"
                >
                  {modalBusy ? <Loader2 className="size-4 animate-spin mr-1.5" /> : null}
                  Create Account
                </Button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* Advanced Manage Student Modal */}
      {selectedStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-surface border border-hairline w-full max-w-lg rounded-3xl overflow-hidden shadow-2xl animate-scale-up">
            
            {/* Header */}
            <div className="flex items-center justify-between border-b border-hairline px-6 py-4.5">
              <div>
                <h3 className="font-bold text-base text-ink flex items-center gap-2">
                  <Edit2 className="size-4.5 text-accent" />
                  Manage Student Profile
                </h3>
                <p className="text-xs text-ink-3 mt-0.5">
                  Settings for {selectedStudent.user.firstName} {selectedStudent.user.lastName} ({selectedStudent.studentCode})
                </p>
              </div>
              <button 
                onClick={() => setSelectedStudent(null)}
                className="size-8 rounded-full bg-surface-2 hover:bg-surface-3 transition-colors grid place-items-center text-ink-2"
                aria-label="Close Modal"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Modal Body / Form */}
            <form onSubmit={handleUpdateStudent} className="p-6 space-y-4.5 overflow-y-auto max-h-[80vh] scrollbar-thin">
              
              {manageStatusMsg && (
                <div className={`flex items-start gap-3 p-3.5 rounded-xl border animate-fade-in ${
                  manageStatusMsg.type === "success" 
                    ? "bg-good/5 border-good/20 text-good-ink" 
                    : "bg-critical/5 border-critical/20 text-critical"
                }`}>
                  {manageStatusMsg.type === "success" ? <CheckCircle2 className="size-5 shrink-0" /> : <AlertCircle className="size-5 shrink-0" />}
                  <span className="text-xs font-semibold">{manageStatusMsg.message}</span>
                </div>
              )}

              {/* Name Details */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-ink-3">First Name</label>
                  <div className="relative">
                    <User className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-3" />
                    <input
                      type="text"
                      required
                      value={manageFirstName}
                      onChange={(e) => setManageFirstName(e.target.value)}
                      placeholder="First Name"
                      className="h-11 w-full rounded-xl border border-hairline bg-surface pr-3 pl-10 text-sm text-ink focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-ink-3">Last Name</label>
                  <div className="relative">
                    <User className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-3" />
                    <input
                      type="text"
                      required
                      value={manageLastName}
                      onChange={(e) => setManageLastName(e.target.value)}
                      placeholder="Last Name"
                      className="h-11 w-full rounded-xl border border-hairline bg-surface pr-3 pl-10 text-sm text-ink focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all"
                    />
                  </div>
                </div>
              </div>

              {/* Email (Readonly for reference) */}
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-ink-3">Email Address (Non-editable)</label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-3 opacity-60" />
                  <input
                    type="email"
                    disabled
                    value={selectedStudent.user.email}
                    className="h-11 w-full rounded-xl border border-hairline bg-surface-2 pr-3 pl-10 text-sm text-ink-3 cursor-not-allowed opacity-80"
                  />
                </div>
              </div>

              {/* Status & Gender */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-ink-3">Account Status</label>
                  <select
                    value={manageStatus}
                    onChange={(e) => setManageStatus(e.target.value)}
                    className="h-11.5 w-full rounded-xl border border-hairline bg-surface px-4 text-sm text-ink focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all duration-200"
                  >
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="INACTIVE">INACTIVE</option>
                    <option value="PENDING">PENDING</option>
                    <option value="TRIAL">TRIAL</option>
                    <option value="PAUSED">PAUSED</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-ink-3">Gender</label>
                  <select
                    value={manageGender}
                    onChange={(e) => setManageGender(e.target.value)}
                    className="h-11.5 w-full rounded-xl border border-hairline bg-surface px-4 text-sm text-ink focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all duration-200"
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              {/* Mobile and Country */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-ink-3">Mobile Number</label>
                  <div className="relative">
                    <Phone className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-3" />
                    <input
                      type="tel"
                      value={managePhone}
                      onChange={(e) => setManagePhone(e.target.value)}
                      placeholder="+91 98765 43210"
                      className="h-11 w-full rounded-xl border border-hairline bg-surface pr-3 pl-10 text-sm text-ink focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-ink-3">Country</label>
                  <div className="relative">
                    <Globe className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-3" />
                    <input
                      type="text"
                      value={manageCountry}
                      onChange={(e) => setManageCountry(e.target.value)}
                      placeholder="India"
                      className="h-11 w-full rounded-xl border border-hairline bg-surface pr-3 pl-10 text-sm text-ink focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all"
                    />
                  </div>
                </div>
              </div>

              {/* Profession and Fees */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-ink-3">Profession / Role</label>
                  <div className="relative">
                    <Briefcase className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-3" />
                    <input
                      type="text"
                      readOnly
                      value={manageProfession}
                      className="h-11 w-full rounded-xl border border-hairline bg-surface-2 opacity-75 pr-3 pl-10 text-sm text-ink-3 cursor-not-allowed transition-all"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-ink-3">Fees Amount (₹)</label>
                  <div className="relative">
                    <DollarSign className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-3" />
                    <input
                      type="number"
                      value={manageFees}
                      onChange={(e) => setManageFees(e.target.value === "" ? "" : Number(e.target.value))}
                      placeholder="5000"
                      className="h-11 w-full rounded-xl border border-hairline bg-surface pr-3 pl-10 text-sm text-ink focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all"
                    />
                  </div>
                </div>
              </div>

              {/* Joining Date & Last Payment */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-ink-3">Joining Date</label>
                  <div className="relative">
                    <Calendar className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-3" />
                    <input
                      type="date"
                      value={manageJoiningDate}
                      onChange={(e) => setManageJoiningDate(e.target.value)}
                      className="h-11 w-full rounded-xl border border-hairline bg-surface pr-3 pl-10 text-sm text-ink focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-ink-3">Last Payment Date</label>
                  <div className="relative">
                    <Calendar className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-3" />
                    <input
                      type="date"
                      value={manageLastPaymentDate}
                      onChange={(e) => setManageLastPaymentDate(e.target.value)}
                      className="h-11 w-full rounded-xl border border-hairline bg-surface pr-3 pl-10 text-sm text-ink focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all"
                    />
                  </div>
                </div>
              </div>

              {/* Next Payment & Guardian Name */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-ink-3">Next Payment Date</label>
                  <div className="relative">
                    <Calendar className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-3" />
                    <input
                      type="date"
                      value={manageNextPaymentDate}
                      onChange={(e) => setManageNextPaymentDate(e.target.value)}
                      className="h-11 w-full rounded-xl border border-hairline bg-surface pr-3 pl-10 text-sm text-ink focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-ink-3">Guardian Name</label>
                  <div className="relative">
                    <User className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-3" />
                    <input
                      type="text"
                      value={manageGuardianName}
                      onChange={(e) => setManageGuardianName(e.target.value)}
                      placeholder="Guardian Name"
                      className="h-11 w-full rounded-xl border border-hairline bg-surface pr-3 pl-10 text-sm text-ink focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all"
                    />
                  </div>
                </div>
              </div>

              {/* Optional enrolment: assign / change course + teacher (both optional) */}
              <div className="grid grid-cols-2 gap-4 border-t border-hairline pt-4">
                <div className="col-span-2 -mb-1">
                  <p className="text-[11px] font-semibold text-ink-3">Enrolment <span className="font-normal">(optional — assign or change the student's course &amp; teacher)</span></p>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-ink-3">Course</label>
                  <div className="relative">
                    <Briefcase className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-3" />
                    <select
                      value={manageCourseCode}
                      onChange={(e) => setManageCourseCode(e.target.value)}
                      className="h-11 w-full rounded-xl border border-hairline bg-surface pr-3 pl-10 text-sm text-ink focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all cursor-pointer"
                    >
                      <option value="">— No course —</option>
                      {catalogCourses.map(c => (
                        <option key={c.id} value={c.code}>{c.title} ({c.code})</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-ink-3">Teacher</label>
                  <div className="relative">
                    <User className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-3" />
                    <select
                      value={manageTeacherId}
                      onChange={(e) => setManageTeacherId(e.target.value)}
                      className="h-11 w-full rounded-xl border border-hairline bg-surface pr-3 pl-10 text-sm text-ink focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all cursor-pointer"
                    >
                      <option value="">— No teacher —</option>
                      {teachersList.map(t => (
                        <option key={t.id} value={t.id}>{t.user.firstName} {t.user.lastName}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Actions Bar */}
              <div className="flex items-center justify-between border-t border-hairline pt-4.5 bg-surface">
                {isAdmin && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleDeleteStudent()}
                  disabled={manageBusy}
                  className="h-10 px-4 font-bold text-critical border-critical/20 hover:bg-critical/5 rounded-xl flex items-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="size-4 shrink-0" />
                  Delete Student
                </Button>
                )}
                <div className="flex items-center gap-3">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setSelectedStudent(null)}
                    className="h-10 px-4 font-bold text-ink-2 hover:bg-surface-2 rounded-xl"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={manageBusy}
                    className="h-10 px-6 font-bold text-white bg-accent hover:bg-accent-hover rounded-xl hover:shadow-[0_8px_16px_rgba(19,60,85,0.25)] transition-all duration-300 cursor-pointer"
                  >
                    {manageBusy ? <Loader2 className="size-4 animate-spin mr-1.5" /> : null}
                    Save Settings
                  </Button>
                </div>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* Active Login Sessions Modal */}
      {sessionsStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-surface border border-hairline w-full max-w-md rounded-3xl overflow-hidden shadow-2xl animate-scale-up">
            <div className="flex items-center justify-between border-b border-hairline px-6 py-4.5">
              <div>
                <h3 className="font-bold text-base text-ink flex items-center gap-2">
                  <Laptop className="size-4.5 text-accent" />
                  Active Sessions & Location
                </h3>
                <p className="text-xs text-ink-3 mt-0.5">
                  Live logins for {sessionsStudent.user.firstName} {sessionsStudent.user.lastName}
                </p>
              </div>
              <button 
                onClick={() => setSessionsStudent(null)}
                className="size-8 rounded-full bg-surface-2 hover:bg-surface-3 transition-colors grid place-items-center text-ink-2"
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
              {loadingSessions ? (
                <div className="flex justify-center items-center py-8 text-xs font-bold text-ink-3">
                  <Loader2 className="size-4 animate-spin mr-2" />
                  Fetching sessions...
                </div>
              ) : sessions.length > 0 ? (
                <div className="space-y-3">
                  {sessions.map((s) => (
                    <div key={s.id} className="flex items-start justify-between p-3.5 rounded-2xl border border-hairline bg-surface-2/40 hover:bg-surface-2/70 transition-colors">
                      <div className="flex gap-3 min-w-0">
                        <div className="grid size-9.5 place-items-center rounded-xl bg-accent/10 text-accent shrink-0">
                          <Laptop className="size-4.5" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-ink truncate max-w-[200px]" title={s.userAgent || "Unknown Device"}>
                            {parseUserAgent(s.userAgent)}
                          </p>
                          <div className="flex flex-wrap items-center gap-x-2 mt-1 text-[10px] font-semibold text-ink-3">
                            <span className="flex items-center gap-1">
                              <MapPin className="size-3 text-accent" />
                              {s.ipAddress || "Unknown IP"}
                            </span>
                            <span>•</span>
                            <span className="flex items-center gap-1">
                              <Clock className="size-3 text-accent" />
                              {new Date(s.createdAt).toLocaleString()}
                            </span>
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={() => handleRevokeSession(s.id)}
                        className="text-xs font-bold text-critical hover:underline bg-critical/5 px-2.5 py-1 rounded-lg shrink-0 cursor-pointer"
                      >
                        Revoke
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-xs font-bold text-ink-3">
                  No active login sessions found for this student.
                </div>
              )}
            </div>

            <div className="flex justify-end border-t border-hairline px-6 py-4.5 bg-surface-2/40">
              <Button
                variant="ghost"
                onClick={() => setSessionsStudent(null)}
                className="h-10 px-4 font-bold text-ink-2 hover:bg-surface-2 rounded-xl"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Password Reset Modal */}
      {pwdResetStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-surface border border-hairline w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl animate-scale-up">
            <div className="flex items-center justify-between border-b border-hairline px-6 py-4.5">
              <div>
                <h3 className="font-bold text-base text-ink flex items-center gap-2">
                  <Key className="size-4.5 text-accent" />
                  Reset Password
                </h3>
                <p className="text-xs text-ink-3 mt-0.5">
                  Change password for {pwdResetStudent.user.firstName}
                </p>
              </div>
              <button 
                onClick={() => setPwdResetStudent(null)}
                className="size-8 rounded-full bg-surface-2 hover:bg-surface-3 transition-colors grid place-items-center text-ink-2"
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            </div>

            <form onSubmit={async (e) => {
              e.preventDefault();
              setPwdResetBusy(true);
              setPwdResetMsg(null);
              try {
                await updateStudent(pwdResetStudent.id, {
                  password: newPassword
                });
                setPwdResetMsg({ type: "success", message: "Password updated successfully!" });
                setNewPassword("");
                setTimeout(() => setPwdResetStudent(null), 1500);
              } catch (err) {
                setPwdResetMsg({ type: "error", message: err instanceof ApiError ? err.message : "Reset failed." });
              } finally {
                setPwdResetBusy(false);
              }
            }} className="p-6 space-y-4">
              
              {pwdResetMsg && (
                <div className={`flex items-start gap-2.5 p-3 rounded-xl border text-xs font-semibold ${
                  pwdResetMsg.type === "success" ? "bg-good/5 border-good/10 text-good-ink" : "bg-critical/5 border-critical/10 text-critical"
                }`}>
                  <AlertCircle className="size-4 shrink-0 mt-0.5" />
                  {pwdResetMsg.message}
                </div>
              )}

              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-ink-3">New Password</label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-3" />
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    className="h-11 w-full rounded-xl border border-hairline bg-surface pr-3 pl-10 text-sm text-ink focus:outline-none focus:border-accent"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 border-t border-hairline pt-4 bg-surface">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setPwdResetStudent(null)}
                  className="h-10 px-4 font-bold text-ink-2 hover:bg-surface-2 rounded-xl"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={pwdResetBusy}
                  className="h-10 px-6 font-bold text-white bg-accent hover:bg-accent-hover rounded-xl"
                >
                  {pwdResetBusy ? <Loader2 className="size-4 animate-spin mr-1.5" /> : null}
                  Reset
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 bg-surface border border-hairline px-5 py-3 rounded-2xl shadow-2xl animate-fade-in select-none">
          <div className="text-xs font-bold text-ink flex items-center gap-2">
            <Users className="size-4 text-accent" />
            <span>Selected <span className="tnum font-extrabold text-accent">{selectedIds.length}</span> students</span>
          </div>
          <div className="h-5 w-hairline bg-hairline" />
          <div className="flex items-center gap-2">
            <Button
              onClick={() => handleBulkStatusUpdate("ACTIVE")}
              className="bg-good hover:bg-good/95 text-white font-bold text-xs h-8.5 px-3.5 rounded-xl flex items-center gap-1.5 cursor-pointer"
            >
              <CheckCircle2 className="size-3.5" />
              Activate
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

      {detailsStudent && (
        <FullDetailsDrawer
          open={!!detailsStudent}
          onClose={() => setDetailsStudent(null)}
          title={`${detailsStudent.user.firstName} ${detailsStudent.user.lastName}`}
          subtitle={`${detailsStudent.studentCode} · registration details`}
          sections={STUDENT_DETAIL_SECTIONS}
          load={() => fetchStudentRegistration(detailsStudent.id)}
          save={(patch) => updateStudentRegistration(detailsStudent.id, patch)}
        />
      )}
    </>
  );
}
