"use client";

import { useEffect, useState } from "react";
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
  Calendar
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
  StudentProfile, 
  ApiError 
} from "@/lib/api";
import { cn, initials } from "@/lib/utils";

const FILTERS = ["All", "Active", "Trial", "Pending", "Paused"] as const;
const PER_PAGE = 8;

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
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [page, setPage] = useState(1);
  
  // Dynamic API states
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);

  // Advanced Filters Panel states
  const [showFiltersPanel, setShowFiltersPanel] = useState(false);
  const [coursesList, setCoursesList] = useState<{ id: string; title: string }[]>([]);
  const [teachersList, setTeachersList] = useState<{ id: string; user: { firstName: string; lastName: string } }[]>([]);
  
  // Active Filter states used in the API call
  const [selectedCourse, setSelectedCourse] = useState("");
  const [selectedTeacher, setSelectedTeacher] = useState("");
  const [selectedCountry, setSelectedCountry] = useState("");
  const [joiningStart, setJoiningStart] = useState("");
  const [joiningEnd, setJoiningEnd] = useState("");
  const [paymentDueStart, setPaymentDueStart] = useState("");
  const [paymentDueEnd, setPaymentDueEnd] = useState("");

  // Temporary inputs inside the Filters panel
  const [tempCourse, setTempCourse] = useState("");
  const [tempTeacher, setTempTeacher] = useState("");
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
  const [country, setCountry] = useState("India");
  const [guardianName, setGuardianName] = useState("");
  const [profession, setProfession] = useState("");
  const [fees, setFees] = useState<number | "">("");
  const [joiningDate, setJoiningDate] = useState("");
  const [lastPaymentDate, setLastPaymentDate] = useState("");
  const [nextPaymentDate, setNextPaymentDate] = useState("");
  const [modalBusy, setModalBusy] = useState(false);
  const [modalStatus, setModalStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Manage Student Modal states
  const [selectedStudent, setSelectedStudent] = useState<StudentProfile | null>(null);
  const [manageFirstName, setManageFirstName] = useState("");
  const [manageLastName, setManageLastName] = useState("");
  const [managePhone, setManagePhone] = useState("");
  const [manageCountry, setManageCountry] = useState("");
  const [manageGuardianName, setManageGuardianName] = useState("");
  const [manageProfession, setManageProfession] = useState("");
  const [manageFees, setManageFees] = useState<number | "">("");
  const [manageJoiningDate, setManageJoiningDate] = useState("");
  const [manageLastPaymentDate, setManageLastPaymentDate] = useState("");
  const [manageNextPaymentDate, setManageNextPaymentDate] = useState("");
  const [manageStatus, setManageStatus] = useState("ACTIVE");
  const [manageBusy, setManageBusy] = useState(false);
  const [manageStatusMsg, setManageStatusMsg] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Load courses and teachers list on initial render
  useEffect(() => {
    const loadFilterHelpers = async () => {
      try {
        const [courses, teachers] = await Promise.all([
          fetchStudentsCourses(),
          fetchStudentsTeachers()
        ]);
        setCoursesList(courses);
        setTeachersList(teachers);
      } catch (err) {
        console.error("Failed to load search filter options:", err);
      }
    };
    loadFilterHelpers();
  }, []);

  // Load students from database
  const loadStudents = async () => {
    setLoading(true);
    try {
      const data = await fetchStudents({
        page,
        limit: PER_PAGE,
        search: query,
        status: filter === "All" ? undefined : filter.toUpperCase(),
        courseId: selectedCourse || undefined,
        teacherId: selectedTeacher || undefined,
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
    query, 
    filter, 
    selectedCourse, 
    selectedTeacher, 
    selectedCountry, 
    joiningStart, 
    joiningEnd, 
    paymentDueStart, 
    paymentDueEnd
  ]);

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
        country: country || undefined,
        guardianName: guardianName || undefined,
        profession: profession || undefined,
        fees: fees !== "" ? Number(fees) : undefined,
        joiningDate: joiningDate || undefined,
        lastPaymentDate: lastPaymentDate || undefined,
        nextPaymentDate: nextPaymentDate || undefined,
      });

      setModalStatus({ type: "success", message: "Student added successfully!" });
      
      // Reset form fields
      setFirstName("");
      setLastName("");
      setEmail("");
      setPassword("");
      setPhone("");
      setCountry("India");
      setGuardianName("");
      setProfession("");
      setFees("");
      setJoiningDate("");
      setLastPaymentDate("");
      setNextPaymentDate("");

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
    setManageCountry(student.user.country || "India");
    setManageGuardianName(student.guardianName || "");
    setManageProfession(student.profession || "");
    setManageFees(student.fees !== null ? student.fees : "");
    setManageJoiningDate(formatDateForInput(student.joiningDate));
    setManageLastPaymentDate(formatDateForInput(student.lastPaymentDate));
    setManageNextPaymentDate(formatDateForInput(student.nextPaymentDate));
    setManageStatus(student.user.status);
    setManageStatusMsg(null);
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
        country: manageCountry || null,
        guardianName: manageGuardianName || null,
        profession: manageProfession || null,
        fees: manageFees !== "" ? Number(manageFees) : null,
        joiningDate: manageJoiningDate || null,
        lastPaymentDate: manageLastPaymentDate || null,
        nextPaymentDate: manageNextPaymentDate || null,
        status: manageStatus
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
    setTempCountry("");
    setTempJoiningStart("");
    setTempJoiningEnd("");
    setTempPaymentDueStart("");
    setTempPaymentDueEnd("");

    setSelectedCourse("");
    setSelectedTeacher("");
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
    selectedCountry !== "" || 
    joiningStart !== "" || 
    joiningEnd !== "" || 
    paymentDueStart !== "" || 
    paymentDueEnd !== "";

  return (
    <>
      <Topbar title="Students" subtitle={`${total} students registered across courses`} />

      <div className="animate-fade-up space-y-5 p-4 sm:p-6">
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
          <div className="overflow-x-auto">
            {loading ? (
              <div className="flex justify-center items-center py-16 text-sm font-bold text-ink-3">
                <Loader2 className="size-5 animate-spin mr-2" />
                Loading students...
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-hairline bg-surface-2 text-left">
                    <th className="px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-ink-3">Student</th>
                    <th className="px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-ink-3">ID</th>
                    <th className="px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-ink-3">Mobile</th>
                    <th className="px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-ink-3">Profession</th>
                    <th className="px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-ink-3">Course</th>
                    <th className="px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-ink-3">Fees</th>
                    <th className="px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-ink-3">Joining Date</th>
                    <th className="px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-ink-3">Last Payment</th>
                    <th className="px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-ink-3">Next Payment</th>
                    <th className="px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-ink-3">Status</th>
                    <th className="px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-ink-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((row) => {
                    const firstEnrollment = row.enrollments?.[0];
                    const courseName = firstEnrollment ? firstEnrollment.course.title : "Not Enrolled";
                    const statusText = row.user.status;

                    return (
                      <tr
                        key={row.id}
                        className="border-b border-hairline last:border-0 hover:bg-surface-2/30 transition-colors duration-150"
                      >
                        {/* Student Name */}
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-to-tr from-accent via-[#386FA4] to-[#59A5D8] text-[11px] font-bold text-white shadow-sm shadow-accent/10">
                              {initials(`${row.user.firstName} ${row.user.lastName}`)}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-ink text-sm">{row.user.firstName} {row.user.lastName}</p>
                              <p className="truncate text-xs text-ink-3">{row.user.email}</p>
                            </div>
                          </div>
                        </td>

                        {/* Student ID */}
                        <td className="tnum px-5 py-3.5 text-xs font-bold text-ink-3">{row.studentCode}</td>

                        {/* Mobile Phone Number */}
                        <td className="px-5 py-3.5 text-xs text-ink-2 font-medium">{row.phone || "—"}</td>

                        {/* Profession */}
                        <td className="px-5 py-3.5 text-xs text-ink-2 font-medium">{row.profession || "—"}</td>

                        {/* Course Name */}
                        <td className="px-5 py-3.5 text-xs text-ink-2 font-medium">{courseName}</td>

                        {/* Fees Amount */}
                        <td className="tnum px-5 py-3.5 text-xs font-bold text-ink">
                          {row.fees !== null ? `₹${Number(row.fees).toLocaleString()}` : "—"}
                        </td>

                        {/* Joining date */}
                        <td className="px-5 py-3.5 text-xs text-ink-2 font-medium">{formatDateLabel(row.joiningDate)}</td>

                        {/* Last payment date */}
                        <td className="px-5 py-3.5 text-xs text-ink-2 font-medium">{formatDateLabel(row.lastPaymentDate)}</td>

                        {/* Next payment date */}
                        <td className="px-5 py-3.5 text-xs text-ink-2 font-medium">{formatDateLabel(row.nextPaymentDate)}</td>

                        {/* Account Status */}
                        <td className="px-5 py-3.5">
                          <Badge tone={statusTone[statusText] || "neutral"}>{statusText}</Badge>
                        </td>

                        {/* Action Buttons */}
                        <td className="px-5 py-3.5 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => openManageModal(row)}
                              className="size-7.5 bg-surface border border-hairline rounded-lg text-ink-2 hover:bg-surface-2 hover:text-accent flex items-center justify-center transition-colors cursor-pointer"
                              aria-label="Edit Profile"
                            >
                              <Edit2 className="size-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteStudent(row)}
                              className="size-7.5 bg-surface border border-hairline rounded-lg text-critical hover:bg-critical/5 flex items-center justify-center transition-colors cursor-pointer"
                              aria-label="Delete Profile"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {students.length === 0 && (
                    <tr>
                      <td colSpan={11} className="px-5 py-16 text-center">
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
          <div className="flex items-center justify-between border-t border-hairline px-5 py-3">
            <p className="text-xs text-ink-3 font-medium">
              Showing <span className="tnum font-bold text-ink-2">{students.length}</span> of{" "}
              <span className="tnum font-bold text-ink-2">{total}</span> students
            </p>
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

              {/* Mobile and Country */}
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
              </div>

              {/* Profession and Fees */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-ink-3">Profession / Role</label>
                  <div className="relative">
                    <Briefcase className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-3" />
                    <input
                      type="text"
                      value={profession}
                      onChange={(e) => setProfession(e.target.value)}
                      placeholder="Student / Engineer"
                      className="h-11 w-full rounded-xl border border-hairline bg-surface pr-3 pl-10 text-sm text-ink focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all"
                    />
                  </div>
                </div>
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

              {/* Next Payment & Guardian */}
              <div className="grid grid-cols-2 gap-4">
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

      {/* Advanced Manage Student (Edit/Delete) Modal */}
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

              {/* Status Selector */}
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-ink-3">Account Status</label>
                <select
                  value={manageStatus}
                  onChange={(e) => setManageStatus(e.target.value)}
                  className="h-11.5 w-full rounded-xl border border-hairline bg-surface px-4 text-sm text-ink focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all duration-200"
                >
                  <option value="ACTIVE">ACTIVE (Enrolled & Authorized)</option>
                  <option value="INACTIVE">INACTIVE (Access Suspended)</option>
                  <option value="PENDING">PENDING (Approval Awaiting)</option>
                  <option value="TRIAL">TRIAL (Evaluation Period)</option>
                  <option value="PAUSED">PAUSED (Temporarily Paused)</option>
                </select>
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
                      value={manageProfession}
                      onChange={(e) => setManageProfession(e.target.value)}
                      placeholder="Student / Developer"
                      className="h-11 w-full rounded-xl border border-hairline bg-surface pr-3 pl-10 text-sm text-ink focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all"
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

              {/* Actions Bar */}
              <div className="flex items-center justify-between border-t border-hairline pt-4.5 bg-surface">
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
    </>
  );
}
