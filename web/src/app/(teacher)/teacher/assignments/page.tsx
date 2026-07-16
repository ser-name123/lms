"use client";

import { useEffect, useState } from "react";
import {
  ClipboardList,
  Search,
  Loader2,
  ExternalLink,
  Award,
  AlertCircle,
  CheckCircle,
  Filter,
  Eye,
  SlidersHorizontal,
  Plus,
  Trash2,
  Edit2,
  Calendar,
  X,
  BookOpen,
} from "lucide-react";
import Swal from "sweetalert2";

import { Topbar } from "@/components/layout/topbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  fetchTeacherAssignments,
  gradeStudentSubmission,
  resolveFileUrl,
  fetchLmsAssignments,
  fetchLmsCourses,
  createLmsAssignment,
  updateLmsAssignment,
  deleteLmsAssignment,
} from "@/lib/api";

export default function TeacherAssignments() {
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [courses, setCourses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"SUBMISSIONS" | "MANAGE">("SUBMISSIONS");

  // Filters for Submissions
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "PENDING" | "EVALUATED">("ALL");

  // Filters for Homework Manager
  const [assignmentSearch, setAssignmentSearch] = useState("");
  const [courseFilter, setCourseFilter] = useState("ALL");

  // Evaluation Modal State
  const [activeSubmission, setActiveSubmission] = useState<any | null>(null);
  const [score, setScore] = useState<number>(100);
  const [feedback, setFeedback] = useState("");
  const [submittingGrade, setSubmittingGrade] = useState(false);

  // Assignment Create/Edit Modal State
  const [assignmentModalOpen, setAssignmentModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"CREATE" | "EDIT">("CREATE");
  const [editingAssignmentId, setEditingAssignmentId] = useState<string | null>(null);
  const [assignmentTitle, setAssignmentTitle] = useState("");
  const [assignmentCourseCode, setAssignmentCourseCode] = useState("");
  const [assignmentDueDate, setAssignmentDueDate] = useState("");
  const [assignmentDescription, setAssignmentDescription] = useState("");
  const [assignmentCategory, setAssignmentCategory] = useState("Homework");
  const [savingAssignment, setSavingAssignment] = useState(false);

  const loadSubmissions = (isFirst = false) => {
    if (isFirst) setLoading(true);
    fetchTeacherAssignments()
      .then((res) => {
        setSubmissions(res);
      })
      .catch((err) => {
        console.error("Failed to load homework submissions", err);
      })
      .finally(() => {
        if (isFirst) setLoading(false);
      });
  };

  const loadAssignmentsAndCourses = () => {
    Promise.all([fetchLmsAssignments(), fetchLmsCourses()])
      .then(([asmRes, crsRes]) => {
        setAssignments(asmRes);
        setCourses(crsRes);
      })
      .catch((err) => {
        console.error("Failed to load homework templates list", err);
      });
  };

  useEffect(() => {
    loadSubmissions(true);
    loadAssignmentsAndCourses();
  }, []);

  const handleGradeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSubmission) return;

    setSubmittingGrade(true);
    try {
      await gradeStudentSubmission(activeSubmission.id, score, feedback.trim());
      Swal.fire({
        title: "Homework Graded!",
        text: "Student homework has been graded and status set to Evaluated.",
        icon: "success",
        toast: true,
        position: "top-end",
        showConfirmButton: false,
        timer: 3000,
      });
      setActiveSubmission(null);
      loadSubmissions(false);
    } catch (err) {
      Swal.fire("Error", "Could not submit grading evaluation.", "error");
    } finally {
      setSubmittingGrade(false);
    }
  };

  const handleSaveAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignmentTitle || !assignmentCourseCode || !assignmentDueDate) {
      Swal.fire("Validation Error", "Please fill in all required fields.", "warning");
      return;
    }

    setSavingAssignment(true);
    const selectedCourse = courses.find((c) => c.code === assignmentCourseCode);
    const payload = {
      title: assignmentTitle.trim(),
      courseCode: assignmentCourseCode,
      courseTitle: selectedCourse?.title || assignmentCourseCode,
      category: assignmentCategory,
      dueDate: assignmentDueDate,
      description: assignmentDescription.trim(),
    };

    try {
      if (modalMode === "CREATE") {
        await createLmsAssignment(payload);
        Swal.fire({
          title: "Assignment Created",
          text: "New homework template published successfully.",
          icon: "success",
          toast: true,
          position: "top-end",
          showConfirmButton: false,
          timer: 3000,
        });
      } else if (editingAssignmentId) {
        await updateLmsAssignment(editingAssignmentId, payload);
        Swal.fire({
          title: "Assignment Updated",
          text: "Homework template changes saved.",
          icon: "success",
          toast: true,
          position: "top-end",
          showConfirmButton: false,
          timer: 3000,
        });
      }
      setAssignmentModalOpen(false);
      loadAssignmentsAndCourses();
      // Clean states
      setAssignmentTitle("");
      setAssignmentCourseCode("");
      setAssignmentDueDate("");
      setAssignmentDescription("");
      setAssignmentCategory("Homework");
    } catch (err) {
      Swal.fire("Error", "Could not save assignment details.", "error");
    } finally {
      setSavingAssignment(false);
    }
  };

  const handleOpenEditModal = (asm: any) => {
    setModalMode("EDIT");
    setEditingAssignmentId(asm.id);
    setAssignmentTitle(asm.title);
    setAssignmentCourseCode(asm.courseCode);
    setAssignmentDueDate(asm.dueDate);
    setAssignmentDescription(asm.description || "");
    setAssignmentCategory(asm.category || "Homework");
    setAssignmentModalOpen(true);
  };

  const handleDeleteAssignment = (id: string) => {
    Swal.fire({
      title: "Delete Homework?",
      text: "Are you sure you want to remove this assignment template? This will delete associated submissions.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#EF4444",
      cancelButtonColor: "#6B7280",
      confirmButtonText: "Yes, Delete",
    }).then(async (result) => {
      if (result.isConfirmed) {
        try {
          await deleteLmsAssignment(id);
          Swal.fire("Deleted!", "Assignment template has been deleted.", "success");
          loadAssignmentsAndCourses();
        } catch (err) {
          Swal.fire("Error", "Failed to delete assignment template.", "error");
        }
      }
    });
  };

  const filteredSubmissions = submissions.filter((s) => {
    const q = searchQuery.toLowerCase();
    const studentName = `${s.student?.user?.firstName} ${s.student?.user?.lastName}`.toLowerCase();
    const matchesSearch =
      studentName.includes(q) ||
      s.assignment?.title?.toLowerCase().includes(q);

    const matchesStatus =
      statusFilter === "ALL" ||
      (statusFilter === "PENDING" && s.status !== "EVALUATED") ||
      (statusFilter === "EVALUATED" && s.status === "EVALUATED");

    return matchesSearch && matchesStatus;
  });

  const uniqueCourses = Array.from(new Set(assignments.map((asm) => asm.courseCode))).filter(Boolean);

  const filteredAssignments = assignments.filter((asm) => {
    const q = assignmentSearch.toLowerCase();
    const matchesSearch =
      asm.title?.toLowerCase().includes(q) ||
      asm.description?.toLowerCase().includes(q);

    const matchesCourse = courseFilter === "ALL" || asm.courseCode === courseFilter;

    return matchesSearch && matchesCourse;
  });

  if (loading) {
    return (
      <>
        <Topbar title="Assignments" subtitle="Review student tasks" />
        <div className="flex h-[calc(100vh-4.5rem)] items-center justify-center">
          <div className="text-center">
            <Loader2 className="mx-auto size-8 animate-spin text-accent" />
            <p className="mt-3 text-sm font-bold text-ink-3">Loading homework logs...</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Topbar title="Assignments" subtitle="Manage assignment templates and evaluate student submissions" />

      <main className="p-4 sm:p-6 lg:p-8 space-y-6 w-full max-w-full mx-auto">
        
        {/* Futuristic Tab Switcher */}
        <div className="flex border-b border-hairline/80 pb-px">
          <button
            onClick={() => setActiveTab("SUBMISSIONS")}
            className={`pb-3.5 text-xs font-black uppercase tracking-wider px-2.5 relative transition cursor-pointer ${
              activeTab === "SUBMISSIONS" ? "text-accent" : "text-ink-3 hover:text-ink"
            }`}
          >
            Submissions & Grading
            {activeTab === "SUBMISSIONS" && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent rounded-full" />
            )}
          </button>
          <button
            onClick={() => setActiveTab("MANAGE")}
            className={`pb-3.5 text-xs font-black uppercase tracking-wider px-2.5 ml-6 relative transition cursor-pointer ${
              activeTab === "MANAGE" ? "text-accent" : "text-ink-3 hover:text-ink"
            }`}
          >
            Homework Assignments List
            {activeTab === "MANAGE" && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent rounded-full" />
            )}
          </button>
        </div>

        {activeTab === "SUBMISSIONS" ? (
          <>
            {/* Interactive evaluation summary cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 animate-fade-up">
              <Card className="border border-hairline bg-surface rounded-3xl p-5 flex items-center gap-4 shadow-sm hover:shadow-md transition">
                <div className="size-12 rounded-2xl bg-accent-soft/20 text-accent flex items-center justify-center shrink-0">
                  <ClipboardList className="size-6" />
                </div>
                <div>
                  <span className="block text-[10px] font-extrabold text-ink-3 uppercase tracking-wider">Total Submissions</span>
                  <h4 className="text-xl font-black text-ink leading-none mt-1">{submissions.length} Tasks</h4>
                </div>
              </Card>

              <Card className="border border-hairline bg-surface rounded-3xl p-5 flex items-center gap-4 shadow-sm hover:shadow-md transition">
                <div className="size-12 rounded-2xl bg-warning-soft/20 text-warning flex items-center justify-center shrink-0">
                  <AlertCircle className="size-6 animate-pulse" />
                </div>
                <div>
                  <span className="block text-[10px] font-extrabold text-ink-3 uppercase tracking-wider">Ungraded Homework</span>
                  <h4 className="text-xl font-black text-ink leading-none mt-1">
                    {submissions.filter((s) => s.status !== "EVALUATED").length} Submissions
                  </h4>
                </div>
              </Card>

              <Card className="border border-hairline bg-surface rounded-3xl p-5 flex items-center gap-4 shadow-sm hover:shadow-md transition">
                <div className="size-12 rounded-2xl bg-good-soft/20 text-good flex items-center justify-center shrink-0">
                  <CheckCircle className="size-6" />
                </div>
                <div>
                  <span className="block text-[10px] font-extrabold text-ink-3 uppercase tracking-wider">Evaluated Submissions</span>
                  <h4 className="text-xl font-black text-ink leading-none mt-1">
                    {submissions.filter((s) => s.status === "EVALUATED").length} Tasks
                  </h4>
                </div>
              </Card>
            </div>

            {/* Filter Hub Panel */}
            <Card className="border border-hairline bg-surface rounded-3xl p-5 shadow-sm space-y-4 animate-fade-up">
              <div className="flex flex-col xl:flex-row gap-4 items-start xl:items-center justify-between">
                
                {/* Status Switchers */}
                <div className="flex items-center gap-2 overflow-x-auto w-full xl:w-auto pb-1 xl:pb-0 scrollbar-none select-none">
                  <button
                    onClick={() => setStatusFilter("ALL")}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                      statusFilter === "ALL"
                        ? "bg-accent text-white shadow-sm"
                        : "bg-surface-2/45 border border-hairline text-ink-2 hover:bg-surface-2"
                    }`}
                  >
                    All Submissions ({submissions.length})
                  </button>
                  <button
                    onClick={() => setStatusFilter("PENDING")}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                      statusFilter === "PENDING"
                        ? "bg-accent text-white shadow-sm"
                        : "bg-surface-2/45 border border-hairline text-ink-2 hover:bg-surface-2"
                    }`}
                  >
                    Pending evaluation ({submissions.filter((s) => s.status !== "EVALUATED").length})
                  </button>
                  <button
                    onClick={() => setStatusFilter("EVALUATED")}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                      statusFilter === "EVALUATED"
                        ? "bg-accent text-white shadow-sm"
                        : "bg-surface-2/45 border border-hairline text-ink-2 hover:bg-surface-2"
                    }`}
                  >
                    Evaluated ({submissions.filter((s) => s.status === "EVALUATED").length})
                  </button>
                </div>

                {/* Submissions Search Input */}
                <div className="relative w-full xl:w-80">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-ink-3 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Search student or homework title..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-9.5 w-full pl-9 pr-4 rounded-xl border border-hairline bg-surface text-xs focus:outline-none focus:ring-2 focus:ring-accent placeholder:text-ink-3"
                  />
                </div>

              </div>
            </Card>

            {/* Submissions Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-up">
              {filteredSubmissions.length > 0 ? (
                filteredSubmissions.map((s) => {
                  const studentName = `${s.student?.user?.firstName} ${s.student?.user?.lastName}`;
                  const isGraded = s.status === "EVALUATED";
                  
                  return (
                    <Card
                      key={s.id}
                      className="border border-hairline bg-surface rounded-3xl p-6 hover:shadow-md transition flex flex-col justify-between"
                    >
                      <div className="space-y-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h3 className="font-extrabold text-sm text-ink">{s.assignment?.title}</h3>
                            <span className="text-[10px] font-bold text-accent mt-0.5 block">{s.assignment?.courseTitle}</span>
                          </div>
                          <Badge tone={isGraded ? "good" : "warning"} className="font-black text-[9px] uppercase tracking-wider px-2 py-0.5">
                            {isGraded ? `Graded: ${s.grade} pts` : "Pending Evaluation"}
                          </Badge>
                        </div>

                        <div className="p-3.5 rounded-2xl bg-surface-2/45 border border-hairline space-y-1 text-xs">
                          <p className="text-ink-3 font-semibold">Submitted by: <strong className="text-ink-2">{studentName}</strong></p>
                          <p className="text-ink-3 font-semibold line-clamp-2">Answer Notes: <span className="text-ink font-semibold">{s.submissionNotes || "No notes attached."}</span></p>
                        </div>
                      </div>

                      <div className="pt-4 mt-4 border-t border-hairline/80 flex items-center justify-between gap-3 flex-wrap">
                        {s.submissionFileUrl ? (
                          <a
                            href={resolveFileUrl(s.submissionFileUrl)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-accent font-extrabold flex items-center gap-1 hover:underline cursor-pointer"
                          >
                            <ExternalLink className="size-3.5" />
                            View Attached File
                          </a>
                        ) : (
                          <span className="text-[10px] text-ink-3 font-bold">No file attachment</span>
                        )}

                        <Button
                          onClick={() => {
                            setActiveSubmission(s);
                            setScore(s.grade || 100);
                            setFeedback(s.feedback || "");
                          }}
                          className="bg-accent hover:bg-accent-hover text-white text-xs font-extrabold h-9 px-4.5 rounded-xl flex items-center gap-1.5 cursor-pointer shadow-sm ml-auto"
                        >
                          <Award className="size-3.5" />
                          {isGraded ? "Edit Evaluation" : "Evaluate"}
                        </Button>
                      </div>
                    </Card>
                  );
                })
              ) : (
                <Card className="border border-hairline bg-surface rounded-3xl p-12 text-center shadow-sm w-full lg:col-span-2 space-y-4">
                  <ClipboardList className="size-12 text-ink-3/40 mx-auto" />
                  <h3 className="font-extrabold text-sm text-ink">No Submissions Found</h3>
                  <p className="text-xs text-ink-3 leading-relaxed">
                    No student homework uploads found matching this filter category.
                  </p>
                </Card>
              )}
            </div>
          </>
        ) : (
          <>
            {/* Homework Assignment Templates Manager */}
            <Card className="border border-hairline bg-surface rounded-3xl p-5 shadow-sm space-y-4 animate-fade-up">
              <div className="flex flex-col xl:flex-row gap-4 items-start xl:items-center justify-between">
                
                {/* Create Trigger button */}
                <Button
                  onClick={() => {
                    setModalMode("CREATE");
                    setAssignmentTitle("");
                    setAssignmentCourseCode("");
                    setAssignmentDueDate("");
                    setAssignmentDescription("");
                    setAssignmentCategory("Homework");
                    setAssignmentModalOpen(true);
                  }}
                  className="bg-accent hover:bg-accent-hover text-white text-xs font-extrabold h-9.5 px-5 rounded-xl flex items-center gap-1.5 cursor-pointer shadow-sm"
                >
                  <Plus className="size-4" />
                  Create New Assignment
                </Button>

                {/* Filters */}
                <div className="flex flex-col sm:flex-row gap-3 w-full xl:w-auto items-stretch sm:items-center">
                  
                  {/* Course Dropdown */}
                  <div className="relative">
                    <Filter className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-ink-3 pointer-events-none" />
                    <select
                      value={courseFilter}
                      onChange={(e) => setCourseFilter(e.target.value)}
                      className="h-9.5 pl-9 pr-8 rounded-xl border border-hairline bg-surface text-xs font-bold text-ink-2 focus:outline-none focus:ring-2 focus:ring-accent cursor-pointer appearance-none min-w-[150px]"
                    >
                      <option value="ALL">All Courses</option>
                      {uniqueCourses.map((c: any) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Title Search */}
                  <div className="relative flex-1 sm:flex-initial sm:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-ink-3 pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Search assignment title..."
                      value={assignmentSearch}
                      onChange={(e) => setAssignmentSearch(e.target.value)}
                      className="h-9.5 w-full pl-9 pr-4 rounded-xl border border-hairline bg-surface text-xs focus:outline-none focus:ring-2 focus:ring-accent placeholder:text-ink-3"
                    />
                  </div>

                </div>

              </div>
            </Card>

            {/* Assignments Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fade-up">
              {filteredAssignments.length > 0 ? (
                filteredAssignments.map((asm) => {
                  return (
                    <Card
                      key={asm.id}
                      className="border border-hairline bg-surface rounded-3xl p-6 hover:shadow-md transition flex flex-col justify-between"
                    >
                      <div className="space-y-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h3 className="font-extrabold text-sm text-ink">{asm.title}</h3>
                            <span className="text-[10px] font-bold text-accent mt-0.5 block">{asm.courseTitle} ({asm.courseCode})</span>
                          </div>
                          <Badge tone="accent" className="font-black text-[9px] uppercase tracking-wider px-2 py-0.5">
                            {asm.category || "Homework"}
                          </Badge>
                        </div>

                        {asm.description && (
                          <p className="text-xs text-ink-3 leading-relaxed font-semibold line-clamp-3">
                            {asm.description}
                          </p>
                        )}

                        <div className="space-y-1.5 pt-2 border-t border-hairline text-xs font-bold text-ink-2 flex items-center gap-1.5">
                          <Calendar className="size-4 text-accent" />
                          <span>Due Date: {asm.dueDate}</span>
                        </div>
                      </div>

                      <div className="pt-4 mt-4 border-t border-hairline/80 flex items-center justify-end gap-2.5">
                        <Button
                          onClick={() => handleOpenEditModal(asm)}
                          className="bg-surface border border-hairline text-ink-2 hover:bg-surface-2 text-[10px] font-extrabold h-8.5 px-3 rounded-lg flex items-center gap-1 cursor-pointer shadow-xs"
                        >
                          <Edit2 className="size-3.5" />
                          Edit Details
                        </Button>
                        <Button
                          onClick={() => handleDeleteAssignment(asm.id)}
                          className="bg-bad-soft/20 text-bad hover:bg-bad-soft/40 text-[10px] font-extrabold h-8.5 px-3 rounded-lg flex items-center gap-1 cursor-pointer"
                        >
                          <Trash2 className="size-3.5" />
                          Delete
                        </Button>
                      </div>
                    </Card>
                  );
                })
              ) : (
                <Card className="border border-hairline bg-surface rounded-3xl p-12 text-center shadow-sm w-full md:col-span-2 space-y-4">
                  <ClipboardList className="size-12 text-ink-3/40 mx-auto" />
                  <h3 className="font-extrabold text-sm text-ink">No Assignments Published</h3>
                  <p className="text-xs text-ink-3 leading-relaxed">
                    You have not created any course homework templates yet. Click "Create New Assignment" above to publish one.
                  </p>
                </Card>
              )}
            </div>
          </>
        )}

      </main>

      {/* Futuristic Evaluation modal overlay */}
      {activeSubmission && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-fade-in">
          <Card className="bg-surface border border-hairline rounded-3xl w-full max-w-md shadow-2xl p-6 space-y-5 animate-scale-up">
            
            <div className="pb-3.5 border-b border-hairline flex items-center justify-between">
              <div>
                <h3 className="font-extrabold text-base text-ink flex items-center gap-2">
                  <Award className="size-5 text-accent" />
                  Homework Evaluation
                </h3>
                <p className="text-[10px] text-ink-3 font-semibold mt-0.5">
                  Assign marks for {activeSubmission.student?.user?.firstName} {activeSubmission.student?.user?.lastName}
                </p>
              </div>
              <button onClick={() => setActiveSubmission(null)} className="text-ink-3 hover:text-ink cursor-pointer">
                <X className="size-5" />
              </button>
            </div>

            <form onSubmit={handleGradeSubmit} className="space-y-4.5">
              
              <div>
                <label className="mb-1.5 block text-xs font-bold text-ink-2">
                  Score Points (Max {activeSubmission.assignment?.maxPoints || 100} pts)
                </label>
                <input
                  type="number"
                  required
                  min={0}
                  max={activeSubmission.assignment?.maxPoints || 100}
                  value={score}
                  onChange={(e) => setScore(Number(e.target.value))}
                  className="h-10 w-full px-3 rounded-lg border border-hairline bg-surface text-xs text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold text-ink-2">Feedback Commentary</label>
                <textarea
                  rows={4}
                  required
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="Provide guidance tips, remarks, and critique corrections..."
                  className="w-full p-3 rounded-lg border border-hairline bg-surface text-xs text-ink focus:outline-none focus:ring-2 focus:ring-accent placeholder:text-ink-3"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-hairline">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setActiveSubmission(null)}
                  className="rounded-xl border border-hairline font-bold text-xs h-10 px-5 cursor-pointer"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={submittingGrade}
                  className="rounded-xl bg-accent hover:bg-accent-hover text-white font-bold text-xs h-10 px-6 cursor-pointer"
                >
                  {submittingGrade ? <Loader2 className="size-4 animate-spin mr-1.5" /> : null}
                  Submit Grade Evaluation
                </Button>
              </div>

            </form>
          </Card>
        </div>
      )}

      {/* Assignment Create/Edit Modal */}
      {assignmentModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-fade-in">
          <Card className="bg-surface border border-hairline rounded-3xl w-full max-w-md shadow-2xl p-6 space-y-5 animate-scale-up">
            
            <div className="pb-3.5 border-b border-hairline flex items-center justify-between">
              <div>
                <h3 className="font-extrabold text-base text-ink flex items-center gap-2">
                  <BookOpen className="size-5 text-accent" />
                  {modalMode === "CREATE" ? "Publish Homework" : "Edit Homework"}
                </h3>
                <p className="text-[10px] text-ink-3 font-semibold mt-0.5">
                  Configure assignment criteria details
                </p>
              </div>
              <button onClick={() => setAssignmentModalOpen(false)} className="text-ink-3 hover:text-ink cursor-pointer">
                <X className="size-5" />
              </button>
            </div>

            <form onSubmit={handleSaveAssignment} className="space-y-4">
              
              <div>
                <label className="mb-1.5 block text-xs font-bold text-ink-2">Assignment Title *</label>
                <input
                  type="text"
                  required
                  value={assignmentTitle}
                  onChange={(e) => setAssignmentTitle(e.target.value)}
                  placeholder="e.g. Arabic Grammar Lesson 4 Exercises"
                  className="h-10 w-full px-3 rounded-lg border border-hairline bg-surface text-xs text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-xs font-bold text-ink-2">Course Code *</label>
                  <select
                    required
                    value={assignmentCourseCode}
                    onChange={(e) => setAssignmentCourseCode(e.target.value)}
                    className="h-10 w-full px-3 rounded-lg border border-hairline bg-surface text-xs text-ink focus:outline-none focus:ring-2 focus:ring-accent cursor-pointer"
                  >
                    <option value="">Select Course</option>
                    {courses.map((c) => (
                      <option key={c.id} value={c.code}>
                        {c.code} – {c.title}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-bold text-ink-2">Due Date *</label>
                  <input
                    type="date"
                    required
                    value={assignmentDueDate}
                    onChange={(e) => setAssignmentDueDate(e.target.value)}
                    className="h-10 w-full px-3 rounded-lg border border-hairline bg-surface text-xs text-ink focus:outline-none focus:ring-2 focus:ring-accent cursor-pointer"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold text-ink-2">Category *</label>
                <select
                  required
                  value={assignmentCategory}
                  onChange={(e) => setAssignmentCategory(e.target.value)}
                  className="h-10 w-full px-3 rounded-lg border border-hairline bg-surface text-xs text-ink focus:outline-none focus:ring-2 focus:ring-accent cursor-pointer"
                >
                  <option value="Homework">Homework</option>
                  <option value="Quiz">Quiz</option>
                  <option value="Exam">Exam</option>
                  <option value="Project">Project</option>
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold text-ink-2">Task Instructions / Description</label>
                <textarea
                  rows={4}
                  value={assignmentDescription}
                  onChange={(e) => setAssignmentDescription(e.target.value)}
                  placeholder="Describe homework task prompts, reference books, and grading metrics details..."
                  className="w-full p-3 rounded-lg border border-hairline bg-surface text-xs text-ink focus:outline-none focus:ring-2 focus:ring-accent placeholder:text-ink-3"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-hairline">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setAssignmentModalOpen(false)}
                  className="rounded-xl border border-hairline font-bold text-xs h-10 px-5 cursor-pointer"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={savingAssignment}
                  className="rounded-xl bg-accent hover:bg-accent-hover text-white font-bold text-xs h-10 px-6 cursor-pointer"
                >
                  {savingAssignment ? <Loader2 className="size-4 animate-spin mr-1.5" /> : null}
                  Publish Task
                </Button>
              </div>

            </form>
          </Card>
        </div>
      )}
    </>
  );
}
