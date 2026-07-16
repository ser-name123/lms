"use client";

import { authHeader } from "@/lib/api";

import { useState, useEffect } from "react";
import { 
  Plus, 
  Search, 
  X, 
  Users, 
  Edit2, 
  Trash2, 
  Info,
  Calendar,
  Filter,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Sparkles,
  CheckCircle,
  Clock,
  BookOpen,
  FolderPlus,
  Timer,
  FileText
} from "lucide-react";
import Swal from "sweetalert2";

import { Topbar } from "@/components/layout/topbar";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// Course List (for linking in dropdowns)
const AVAILABLE_COURSES = [
  { code: "QRN-101", title: "Basic Quran Reading", studentsCount: 42 },
  { code: "TAJ-202", title: "Advanced Tajweed Rules", studentsCount: 28 },
  { code: "ARB-101", title: "Arabic Grammar Level 1", studentsCount: 35 },
  { code: "ISL-301", title: "Seerah of Prophet Muhammad", studentsCount: 56 },
  { code: "QRN-401", title: "Quran Memorization Hifz", studentsCount: 18 },
  { code: "QRN-099", title: "Noorani Qaida for Kids", studentsCount: 84 },
  { code: "ARB-201", title: "Arabic Conversational Skills", studentsCount: 22 },
  { code: "ISL-202", title: "Fiqh of Worship", studentsCount: 40 },
  { code: "ISL-102", title: "Introduction to Hadith", studentsCount: 30 },
  { code: "ARB-302", title: "Advanced Arabic Rhetoric", studentsCount: 12 },
  { code: "ARB-150", title: "Quranic Arabic Vocabulary", studentsCount: 48 },
  { code: "TAJ-150", title: "Intermediate Tajweed Practice", studentsCount: 32 },
  { code: "ISL-101", title: "Islamic Creed Aqeedah", studentsCount: 50 },
  { code: "ISL-050", title: "Pillars of Islam Course", studentsCount: 15 },
  { code: "QRN-250", title: "Tafseer of Juz Amma", studentsCount: 65 },
  { code: "ISL-401", title: "Advanced Seerah Analysis", studentsCount: 9 },
  { code: "ARB-099", title: "Arabic Handwriting Naskh", studentsCount: 19 },
  { code: "ISL-250", title: "Rulings of Hajj & Umrah", studentsCount: 72 },
  { code: "QRN-102", title: "Quran Recitation Correction", studentsCount: 60 },
  { code: "ISL-080", title: "Basic Islamic Manners Akhlaq", studentsCount: 44 },
  { code: "TAJ-101", title: "Tajweed Rules for Kids", studentsCount: 75 },
  { code: "ARB-401", title: "Advanced Arabic Syntax", studentsCount: 8 },
  { code: "ISL-302", title: "Fiqh of Transactions Muamalat", studentsCount: 14 },
  { code: "ISL-350", title: "History of Islamic Caliphates", studentsCount: 25 },
  { code: "TAJ-301", title: "Tajweed Masterclass", studentsCount: 16 },
  { code: "ARB-350", title: "Arabic Media Translation", studentsCount: 11 },
  { code: "QRN-301", title: "Quranic Reflections", studentsCount: 38 },
  { code: "QRN-202", title: "Intro to Quran Sciences", studentsCount: 29 },
  { code: "ISL-220", title: "Islamic History & Heritage", studentsCount: 31 },
  { code: "TAJ-099", title: "Introduction to Tajweed", studentsCount: 90 }
];

// Initial Mock Assessments Data (30 items)
const INITIAL_ASSESSMENTS: any[] = [];

const INITIAL_CATEGORIES: string[] = [];
const STATUSES = ["All", "Active", "Draft", "Closed"] as const;

const statusBadgeTone: Record<string, Tone> = {
  Active: "good",
  Draft: "warning",
  Closed: "critical"
};

export default function AssessmentsPage() {
  const [assessments, setAssessments] = useState(INITIAL_ASSESSMENTS);
  const [categories, setCategories] = useState(INITIAL_CATEGORIES);
  const [categoryIds, setCategoryIds] = useState<Record<string, string>>({});

  const [showCategoriesModal, setShowCategoriesModal] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");

  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000/api";

  // Fetch categories on mount
  useEffect(() => {
    fetch(`${apiBase}/categories?type=ASSESSMENT`)
      .then(res => res.json())
      .then((data: any[]) => {
        setCategories(data.map(item => item.name));
        const ids: Record<string, string> = {};
        data.forEach(item => {
          ids[item.name.toLowerCase()] = item.id;
        });
        setCategoryIds(ids);
      })
      .catch(console.error);
  }, [apiBase]);

  const [availableCourses, setAvailableCourses] = useState<any[]>([]);

  // Fetch assessments on mount
  useEffect(() => {
    fetch(`${apiBase}/lms-data/assessments`)
      .then(res => res.json())
      .then((data: any[]) => {
        setAssessments(data);
      })
      .catch(console.error);

    fetch(`${apiBase}/lms-data/courses`)
      .then(res => res.json())
      .then((data: any[]) => {
        setAvailableCourses(data);
        if (data.length > 0) {
          setFormCourseCode(data[0].code);
        }
      })
      .catch(console.error);
  }, [apiBase]);

  // Filters, sorting, and pagination
  const [searchQuery, setSearchQuery] = useState("");
  const [courseFilter, setCourseFilter] = useState("All");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [sortBy, setSortBy] = useState("title-asc");

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedAssessment, setSelectedAssessment] = useState<typeof INITIAL_ASSESSMENTS[0] | null>(null);

  // Add/Edit form fields
  const [formTitle, setFormTitle] = useState("");
  const [formCourseCode, setFormCourseCode] = useState("");
  const [formCategory, setFormCategory] = useState("");
  const [formQuestions, setFormQuestions] = useState<number>(10);
  const [formDuration, setFormDuration] = useState<number>(30);
  const [formAvgScore, setFormAvgScore] = useState<number>(0);
  const [formStatus, setFormStatus] = useState("Active");
  const [formDescription, setFormDescription] = useState("");

  // Reset page when filter triggers
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, courseFilter, categoryFilter, statusFilter, pageSize]);

  // Compute Stats
  const totalAssessmentsCount = assessments.length;
  const gradedAssessments = assessments.filter(a => a.avgScore > 0);
  const avgPerformanceScore = gradedAssessments.length > 0 
    ? Math.round(gradedAssessments.reduce((sum, a) => sum + a.avgScore, 0) / gradedAssessments.length) 
    : 0;
  const totalStudentsEvaluated = assessments.reduce((sum, a) => sum + a.studentsCount, 0);
  // Passing rate represents the ratio of assessments with average score >= 80%
  const passingAssessmentsCount = assessments.filter(a => a.avgScore >= 80).length;
  const passingRate = totalAssessmentsCount > 0 
    ? Math.round((passingAssessmentsCount / totalAssessmentsCount) * 100) 
    : 0;

  // Filter & Sort Logic
  const filteredAssessments = assessments
    .filter(asm => {
      const matchesSearch = 
        asm.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
        asm.courseTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
        asm.courseCode.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCourse = courseFilter === "All" || asm.courseCode === courseFilter;
      const matchesCategory = categoryFilter === "All" || asm.category === categoryFilter;
      const matchesStatus = statusFilter === "All" || asm.status === statusFilter;
      return matchesSearch && matchesCourse && matchesCategory && matchesStatus;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case "title-asc":
          return a.title.localeCompare(b.title);
        case "title-desc":
          return b.title.localeCompare(a.title);
        case "score-desc":
          return b.avgScore - a.avgScore;
        case "questions-desc":
          return b.questionsCount - a.questionsCount;
        case "duration-desc":
          return b.duration - a.duration;
        case "students-desc":
          return b.studentsCount - a.studentsCount;
        default:
          return 0;
      }
    });

  // Pagination Bounds
  const totalItems = filteredAssessments.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedAssessments = filteredAssessments.slice(startIndex, startIndex + pageSize);

  // CRUD handlers
  const handleDelete = (id: string, name: string) => {
    Swal.fire({
      title: "Delete Assessment?",
      text: `Are you sure you want to delete "${name}"? This action cannot be undone.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, Delete",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#f85a6b",
      background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff",
      color: document.documentElement.classList.contains("dark") ? "#f4f4f5" : "#13222e"
    }).then((result) => {
      if (result.isConfirmed) {
        fetch(`${apiBase}/lms-data/assessments/${id}`, { method: "DELETE", headers: authHeader() })
          .then(() => {
            setAssessments(prev => prev.filter(a => a.id !== id));
            Swal.fire({
              title: "Deleted!",
              text: "The assessment has been deleted.",
              icon: "success",
              background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff"
            });
          })
          .catch(err => {
            Swal.fire({ title: "Error", text: "Could not delete assessment.", icon: "error" });
          });
      }
    });
  };

  const handleOpenAddModal = () => {
    setFormTitle("");
    setFormCourseCode(availableCourses[0]?.code || "");
    setFormCategory(categories[0] || "");
    setFormQuestions(15);
    setFormDuration(30);
    setFormAvgScore(0);
    setFormStatus("Active");
    setFormDescription("");
    setShowAddModal(true);
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle) {
      Swal.fire({ title: "Fields Required", text: "Please enter an assessment title.", icon: "error" });
      return;
    }
    if (!formCategory) {
      Swal.fire({ title: "Category Required", text: "Please select or add a category first using 'Manage Categories'.", icon: "error" });
      return;
    }

    const courseObj = availableCourses.find(c => c.code === formCourseCode) || {
      code: formCourseCode,
      title: "Unknown Course",
      studentsCount: 0
    };

    const newAssessment = {
      title: formTitle,
      courseCode: courseObj.code,
      courseTitle: courseObj.title,
      questionsCount: Number(formQuestions) || 10,
      duration: Number(formDuration) || 30,
      category: formCategory,
      avgScore: Number(formAvgScore) || 0,
      status: formStatus,
      description: formDescription || "No description provided."
    };

    fetch(`${apiBase}/lms-data/assessments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body: JSON.stringify(newAssessment),
    })
      .then(res => res.json())
      .then(savedAssessment => {
        setAssessments([savedAssessment, ...assessments]);
        setShowAddModal(false);
        Swal.fire({
          title: "Created",
          text: "New assessment successfully published!",
          icon: "success",
          background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff"
        });
      })
      .catch(err => {
        Swal.fire({ title: "Error", text: "Could not save assessment.", icon: "error" });
      });
  };

  const handleOpenEditModal = (asm: typeof INITIAL_ASSESSMENTS[0]) => {
    setSelectedAssessment(asm);
    setFormTitle(asm.title);
    setFormCourseCode(asm.courseCode);
    setFormCategory(asm.category || categories[0] || "");
    setFormQuestions(asm.questionsCount);
    setFormDuration(asm.duration);
    setFormAvgScore(asm.avgScore);
    setFormStatus(asm.status);
    setFormDescription(asm.description);
    setShowEditModal(true);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAssessment) return;
    if (!formTitle) {
      Swal.fire({ title: "Fields Required", text: "Please enter an assessment title.", icon: "error" });
      return;
    }

    const courseObj = availableCourses.find(c => c.code === formCourseCode) || {
      code: formCourseCode,
      title: "Unknown Course",
      studentsCount: 0
    };

    const updatedPayload = {
      title: formTitle,
      courseCode: courseObj.code,
      courseTitle: courseObj.title,
      questionsCount: Number(formQuestions) || 10,
      duration: Number(formDuration) || 30,
      category: formCategory,
      avgScore: Number(formAvgScore) || 0,
      status: formStatus,
      description: formDescription || "No description provided."
    };

    fetch(`${apiBase}/lms-data/assessments/${selectedAssessment.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body: JSON.stringify(updatedPayload),
    })
      .then(res => res.json())
      .then(updatedAssessment => {
        setAssessments(prev => prev.map(a => a.id === updatedAssessment.id ? updatedAssessment : a));
        setShowEditModal(false);
        Swal.fire({
          title: "Updated",
          text: "Assessment details saved successfully!",
          icon: "success",
          background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff"
        });
      })
      .catch(err => {
        Swal.fire({ title: "Error", text: "Could not update assessment.", icon: "error" });
      });
  };


  const handleOpenViewDetails = (asm: typeof INITIAL_ASSESSMENTS[0]) => {
    setSelectedAssessment(asm);
    Swal.fire({
      title: `<span class="text-lg font-bold">${asm.title}</span>`,
      html: `
        <div class="text-left mt-3 text-sm space-y-2">
          <p><strong>Category:</strong> ${asm.category || "General"}</p>
          <p><strong>Course:</strong> ${asm.courseTitle} (${asm.courseCode})</p>
          <p><strong>Total Students in Course:</strong> ${asm.studentsCount} Students</p>
          <p><strong>Questions Count:</strong> ${asm.questionsCount} Questions</p>
          <p><strong>Time Duration:</strong> ${asm.duration} Minutes</p>
          <p><strong>Average Class Score:</strong> ${asm.avgScore > 0 ? `${asm.avgScore}%` : "Not Graded Yet"}</p>
          <p><strong>Status:</strong> ${asm.status}</p>
          <p class="mt-4 border-t pt-2 text-ink-2"><strong>Instructions:</strong></p>
          <p class="text-xs text-ink-3 italic bg-surface-2 p-2.5 rounded-lg border">${asm.description}</p>
        </div>
      `,
      icon: "info",
      showCloseButton: true,
      confirmButtonText: "Close",
      background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff",
      color: document.documentElement.classList.contains("dark") ? "#f4f4f5" : "#13222e",
      confirmButtonColor: "#59A5D8"
    });
  };

  return (
    <>
      <Topbar title="Assessments Console" subtitle="Build tests, manage academic evaluations, and review student scorecards" />
      
      <div className="animate-fade-up p-4 sm:p-6 space-y-6">
        
        {/* Statistics section */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Card className="hover:scale-[1.01] transition-transform duration-200">
            <CardBody className="flex items-center gap-4 py-5">
              <span className="grid size-12 place-items-center rounded-xl bg-accent/10 text-accent">
                <FileText className="size-6" />
              </span>
              <div>
                <p className="text-2xl font-bold tracking-tight text-ink">{totalAssessmentsCount}</p>
                <p className="text-xs font-semibold text-ink-3">Total Assessments</p>
              </div>
            </CardBody>
          </Card>
          
          <Card className="hover:scale-[1.01] transition-transform duration-200">
            <CardBody className="flex items-center gap-4 py-5">
              <span className="grid size-12 place-items-center rounded-xl bg-emerald-500/10 text-emerald-500">
                <CheckCircle className="size-6" />
              </span>
              <div>
                <p className="text-2xl font-bold tracking-tight text-ink">{avgPerformanceScore}%</p>
                <p className="text-xs font-semibold text-ink-3">Average Score</p>
              </div>
            </CardBody>
          </Card>

          <Card className="hover:scale-[1.01] transition-transform duration-200">
            <CardBody className="flex items-center gap-4 py-5">
              <span className="grid size-12 place-items-center rounded-xl bg-amber-500/10 text-amber-500">
                <Users className="size-6" />
              </span>
              <div>
                <p className="text-2xl font-bold tracking-tight text-ink">{totalStudentsEvaluated}</p>
                <p className="text-xs font-semibold text-ink-3">Students Evaluated</p>
              </div>
            </CardBody>
          </Card>

          <Card className="hover:scale-[1.01] transition-transform duration-200">
            <CardBody className="flex items-center gap-4 py-5">
              <span className="grid size-12 place-items-center rounded-xl bg-violet-500/10 text-violet-500">
                <Sparkles className="size-6" />
              </span>
              <div>
                <p className="text-2xl font-bold tracking-tight text-ink">{passingRate}%</p>
                <p className="text-xs font-semibold text-ink-3">High Pass Rate (≥80%)</p>
              </div>
            </CardBody>
          </Card>
        </div>

        {/* Filters and Actions */}
        <Card>
          <CardBody className="pt-5 space-y-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              
              {/* Search field */}
              <div className="relative flex-1 max-w-sm">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" />
                <input
                  type="text"
                  placeholder="Search assessments or courses..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-10 w-full rounded-xl border border-hairline bg-surface-2 pr-4 pl-10 text-sm text-ink placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-accent focus:bg-surface-3 transition-all"
                />
              </div>

              {/* Filters */}
              <div className="flex flex-wrap items-center gap-2">
                
                {/* Course Filter */}
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-ink-3 flex items-center gap-1"><Filter className="size-3" /> Course:</span>
                  <select
                    value={courseFilter}
                    onChange={(e) => setCourseFilter(e.target.value)}
                    className="h-9 max-w-[140px] rounded-xl border border-hairline bg-surface px-2.5 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                  >
                    <option value="All">All Courses</option>
                    {availableCourses.map(c => (
                      <option key={c.code} value={c.code}>{c.code}</option>
                    ))}
                  </select>
                </div>

                {/* Category Filter */}
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-ink-3 flex items-center gap-1"><Filter className="size-3" /> Cat:</span>
                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="h-9 rounded-xl border border-hairline bg-surface px-2.5 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                  >
                    {["All", ...categories].map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                {/* Status Filter */}
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-ink-3">Status:</span>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="h-9 rounded-xl border border-hairline bg-surface px-2.5 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                  >
                    {STATUSES.map(st => (
                      <option key={st} value={st}>{st}</option>
                    ))}
                  </select>
                </div>

                {/* Sort selector */}
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-ink-3 flex items-center gap-1"><ArrowUpDown className="size-3" /> Sort:</span>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="h-9 rounded-xl border border-hairline bg-surface px-2.5 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                  >
                    <option value="title-asc">Title (A-Z)</option>
                    <option value="title-desc">Title (Z-A)</option>
                    <option value="score-desc">Average Score (High to Low)</option>
                    <option value="questions-desc">Questions count (High to Low)</option>
                    <option value="duration-desc">Duration (High to Low)</option>
                    <option value="students-desc">Students Count (High to Low)</option>
                  </select>
                </div>

                {/* Manage Categories Button */}
                <Button 
                  variant="outline" 
                  size="md" 
                  onClick={() => setShowCategoriesModal(true)} 
                  className="rounded-xl flex items-center gap-2 border border-hairline hover:bg-surface-2"
                >
                  <FolderPlus className="size-4" />
                  <span>Manage Categories</span>
                </Button>

                {/* Add assessment button */}
                <Button 
                  variant="primary" 
                  size="md" 
                  onClick={handleOpenAddModal} 
                  className="rounded-xl flex items-center gap-2"
                >
                  <Plus className="size-4" />
                  <span>Add Assessment</span>
                </Button>
              </div>
            </div>

            {/* Table Grid */}
            <div className="overflow-x-auto border border-hairline rounded-xl">
              <table className="w-full border-collapse text-left text-sm text-ink-2">
                <thead className="bg-surface-2 text-xs font-bold text-ink-3 uppercase border-b border-hairline">
                  <tr>
                    <th scope="col" className="px-6 py-4">Assessment Detail</th>
                    <th scope="col" className="px-6 py-4">Course Name (Code) & Students Count</th>
                    <th scope="col" className="px-6 py-4">Questions & Duration</th>
                    <th scope="col" className="px-6 py-4">Performance Score</th>
                    <th scope="col" className="px-6 py-4">Status</th>
                    <th scope="col" className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline bg-surface">
                  {paginatedAssessments.length > 0 ? (
                    paginatedAssessments.map((asm) => {
                      return (
                        <tr 
                          key={asm.id} 
                          className="hover:bg-surface-2/60 transition-colors"
                        >
                          <td className="px-6 py-4 max-w-xs">
                            <div className="font-semibold text-ink">{asm.title}</div>
                            <div className="mt-1">
                              <Badge tone="neutral" className="text-[10px] py-0 px-1.5 font-bold uppercase tracking-wider">
                                {asm.category || "General"}
                              </Badge>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="font-semibold text-ink flex items-center gap-1.5">
                              <BookOpen className="size-3.5 text-accent" />
                              {asm.courseTitle}
                            </div>
                            <div className="text-xs text-ink-3 font-semibold mt-1 flex items-center gap-2">
                              <span className="font-mono bg-surface-3 px-1 py-0.5 rounded text-[10px] border border-hairline">{asm.courseCode}</span>
                              <span className="flex items-center gap-1 text-[11px]"><Users className="size-3 text-emerald-500/80" /> {asm.studentsCount} Students in Course</span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-xs font-bold text-ink">
                              {asm.questionsCount} Questions
                            </div>
                            <div className="text-xs text-ink-3 flex items-center gap-1 mt-1 font-semibold">
                              <Timer className="size-3 text-accent" /> {asm.duration} Mins
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            {asm.avgScore > 0 ? (
                              <div>
                                <div className="flex items-center justify-between text-xs font-bold mb-1">
                                  <span className="text-ink">{asm.avgScore}% Class Avg</span>
                                </div>
                                <div className="h-1.5 w-24 bg-surface-3 rounded-full overflow-hidden border border-hairline">
                                  <div 
                                    className={cn(
                                      "h-full rounded-full transition-all duration-300",
                                      asm.avgScore >= 85 ? "bg-emerald-500" : asm.avgScore >= 75 ? "bg-accent" : "bg-amber-500"
                                    )}
                                    style={{ width: `${asm.avgScore}%` }}
                                  />
                                </div>
                              </div>
                            ) : (
                              <span className="text-xs text-ink-3 italic font-semibold">No grades published</span>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <Badge tone={statusBadgeTone[asm.status] || "neutral"}>
                              {asm.status}
                            </Badge>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex justify-end gap-1.5">
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                onClick={() => handleOpenViewDetails(asm)}
                                className="rounded-lg text-ink-3 hover:text-ink hover:bg-surface-3 size-8"
                                title="View Details"
                              >
                                <Info className="size-4.5" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                onClick={() => handleOpenEditModal(asm)}
                                className="rounded-lg text-ink-3 hover:text-accent hover:bg-surface-3 size-8"
                                title="Edit Assessment"
                              >
                                <Edit2 className="size-4" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                onClick={() => handleDelete(asm.id, asm.title)}
                                className="rounded-lg text-ink-3 hover:text-critical hover:bg-surface-3 size-8"
                                title="Delete Assessment"
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-ink-3">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <ClipboardList className="size-8 text-ink-3/60" />
                          <p className="font-semibold text-sm">No assessments matched the search parameters.</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination controls */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pt-4 border-t border-hairline text-xs font-semibold text-ink-3">
              
              {/* Page Size selector */}
              <div className="flex items-center gap-2">
                <span>Show:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="h-8 rounded-lg border border-hairline bg-surface px-2 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  <option value={5}>5 per page</option>
                  <option value={10}>10 per page</option>
                  <option value={20}>20 per page</option>
                  <option value={50}>50 per page</option>
                  <option value={100}>100 per page</option>
                </select>
                <span>of {totalItems} filtered assessments</span>
              </div>

              {/* Showing stats */}
              <div>
                Showing {totalItems > 0 ? startIndex + 1 : 0} to {Math.min(startIndex + pageSize, totalItems)} of {totalItems} items
              </div>

              {/* Pages selectors */}
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="rounded-lg p-1.5 h-8 size-8 justify-center disabled:opacity-40"
                >
                  <ChevronLeft className="size-4" />
                </Button>
                
                {Array.from({ length: totalPages }).map((_, idx) => {
                  const pNum = idx + 1;
                  const isCurrent = currentPage === pNum;
                  return (
                    <Button
                      key={pNum}
                      variant={isCurrent ? "primary" : "outline"}
                      size="sm"
                      onClick={() => setCurrentPage(pNum)}
                      className={cn(
                        "rounded-lg text-xs size-8 justify-center h-8 font-bold",
                        isCurrent ? "bg-accent text-accent-ink" : "text-ink hover:bg-surface-2"
                      )}
                    >
                      {pNum}
                    </Button>
                  );
                })}

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  className="rounded-lg p-1.5 h-8 size-8 justify-center disabled:opacity-40"
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Add Assessment Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-[2px]">
          <div className="relative w-full max-w-lg rounded-2xl border border-hairline bg-surface shadow-2xl overflow-hidden animate-fade-in text-ink">
            <header className="flex items-center justify-between border-b border-hairline px-6 py-4">
              <h3 className="text-base font-bold text-ink">Add New Assessment</h3>
              <button 
                onClick={() => setShowAddModal(false)}
                className="rounded-lg p-1 text-ink-3 hover:bg-surface-2 hover:text-ink"
              >
                <X className="size-5" />
              </button>
            </header>
            
            <form onSubmit={handleAddSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-ink-3 uppercase mb-1">Assessment Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Midterm Examination"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-ink-3 uppercase mb-1">Link to Course</label>
                  <select
                    value={formCourseCode}
                    onChange={(e) => setFormCourseCode(e.target.value)}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                  >
                    {availableCourses.map(c => (
                      <option key={c.code} value={c.code}>
                        {c.code}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-ink-3 uppercase mb-1">Category</label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                  >
                    {categories.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-ink-3 uppercase mb-1">Status</label>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value)}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                  >
                    <option value="Active">Active</option>
                    <option value="Draft">Draft</option>
                    <option value="Closed">Closed</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-ink-3 uppercase mb-1">Questions Count</label>
                  <input
                    type="number"
                    min="1"
                    value={formQuestions}
                    onChange={(e) => setFormQuestions(Number(e.target.value))}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-ink-3 uppercase mb-1">Duration (Mins)</label>
                  <input
                    type="number"
                    min="1"
                    value={formDuration}
                    onChange={(e) => setFormDuration(Number(e.target.value))}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-ink-3 uppercase mb-1">Avg Score (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={formAvgScore}
                    onChange={(e) => setFormAvgScore(Number(e.target.value))}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-ink-3 uppercase mb-1">Instructions / Description</label>
                <textarea
                  placeholder="Enter details on what students need to prepare..."
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  rows={3}
                  className="w-full rounded-xl border border-hairline bg-surface-2 p-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent resize-none"
                />
              </div>

              <footer className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setShowAddModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary">
                  Publish Assessment
                </Button>
              </footer>
            </form>
          </div>
        </div>
      )}

      {/* Edit Assessment Modal */}
      {showEditModal && selectedAssessment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-[2px]">
          <div className="relative w-full max-w-lg rounded-2xl border border-hairline bg-surface shadow-2xl overflow-hidden animate-fade-in text-ink">
            <header className="flex items-center justify-between border-b border-hairline px-6 py-4">
              <h3 className="text-base font-bold text-ink">Edit Assessment</h3>
              <button 
                onClick={() => setShowEditModal(false)}
                className="rounded-lg p-1 text-ink-3 hover:bg-surface-2 hover:text-ink"
              >
                <X className="size-5" />
              </button>
            </header>
            
            <form onSubmit={handleEditSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-ink-3 uppercase mb-1">Assessment Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Midterm Examination"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-ink-3 uppercase mb-1">Linked Course</label>
                  <select
                    value={formCourseCode}
                    onChange={(e) => setFormCourseCode(e.target.value)}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                  >
                    {availableCourses.map(c => (
                      <option key={c.code} value={c.code}>
                        {c.code}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-ink-3 uppercase mb-1">Category</label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                  >
                    {categories.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-ink-3 uppercase mb-1">Status</label>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value)}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                  >
                    <option value="Active">Active</option>
                    <option value="Draft">Draft</option>
                    <option value="Closed">Closed</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-ink-3 uppercase mb-1">Questions Count</label>
                  <input
                    type="number"
                    min="1"
                    value={formQuestions}
                    onChange={(e) => setFormQuestions(Number(e.target.value))}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-ink-3 uppercase mb-1">Duration (Mins)</label>
                  <input
                    type="number"
                    min="1"
                    value={formDuration}
                    onChange={(e) => setFormDuration(Number(e.target.value))}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-ink-3 uppercase mb-1">Avg Score (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={formAvgScore}
                    onChange={(e) => setFormAvgScore(Number(e.target.value))}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-ink-3 uppercase mb-1">Instructions / Description</label>
                <textarea
                  placeholder="Enter details on what students need to prepare..."
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  rows={3}
                  className="w-full rounded-xl border border-hairline bg-surface-2 p-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent resize-none"
                />
              </div>

              <footer className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setShowEditModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary">
                  Save Changes
                </Button>
              </footer>
            </form>
          </div>
        </div>
      )}

      {/* Manage Categories Modal */}
      {showCategoriesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-[2px]">
          <div className="relative w-full max-w-md rounded-2xl border border-hairline bg-surface shadow-2xl overflow-hidden animate-fade-in text-ink">
            <header className="flex items-center justify-between border-b border-hairline px-6 py-4">
              <h3 className="text-base font-bold text-ink">Manage Categories</h3>
              <button 
                onClick={() => setShowCategoriesModal(false)}
                className="rounded-lg p-1 text-ink-3 hover:bg-surface-2 hover:text-ink"
              >
                <X className="size-5" />
              </button>
            </header>
            
            <div className="p-6 space-y-4">
              {/* Add category input */}
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Enter new category name..."
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  className="h-10 flex-1 rounded-xl border border-hairline bg-surface-2 px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                />
                <Button
                  variant="primary"
                  onClick={() => {
                    const trimmed = newCategoryName.trim();
                    if (!trimmed) return;
                    if (categories.some(cat => cat.toLowerCase() === trimmed.toLowerCase())) {
                      Swal.fire({
                        title: "Category Exists",
                        text: `The category "${trimmed}" already exists.`,
                        icon: "warning",
                        background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff",
                      });
                      return;
                    }
                    fetch(`${apiBase}/categories`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json", ...authHeader() },
                      body: JSON.stringify({ name: trimmed, type: "ASSESSMENT" }),
                    })
                      .then(res => res.json())
                      .then(item => {
                        setCategories([...categories, item.name]);
                        setCategoryIds({ ...categoryIds, [item.name.toLowerCase()]: item.id });
                        setNewCategoryName("");
                        Swal.fire({
                          title: "Success",
                          text: `Category "${trimmed}" has been added.`,
                          icon: "success",
                          toast: true,
                          position: "top-end",
                          showConfirmButton: false,
                          timer: 2000,
                          background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff",
                        });
                      })
                      .catch(err => {
                        Swal.fire({
                          title: "Error",
                          text: "Could not add category.",
                          icon: "error",
                          background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff",
                        });
                      });
                  }}
                >
                  Add
                </Button>
              </div>

              {/* Categories list */}
              <div>
                <label className="block text-xs font-bold text-ink-3 uppercase mb-2">Current Categories</label>
                <div className="border border-hairline rounded-xl divide-y divide-hairline bg-surface max-h-60 overflow-y-auto">
                  {categories.map(cat => {
                    const usageCount = assessments.filter(a => a.category === cat).length;

                    return (
                      <div key={cat} className="flex items-center justify-between px-4 py-2.5 text-sm">
                        <span className="font-semibold text-ink flex items-center gap-2">
                          <span className="size-2 rounded-full bg-accent" />
                          {cat}
                          <span className="text-[10px] text-ink-3 font-bold bg-surface-2 px-1.5 py-0.5 rounded-md border border-hairline">
                            {usageCount} {usageCount === 1 ? "assessment" : "assessments"}
                          </span>
                        </span>
                        
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            if (usageCount > 0) {
                              Swal.fire({
                                title: "Cannot Delete",
                                text: `Category "${cat}" is in use by ${usageCount} assessment(s). Please delete or reassign those first.`,
                                icon: "error",
                                background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff",
                              });
                              return;
                            }

                            Swal.fire({
                              title: "Delete Category?",
                              text: `Are you sure you want to delete category "${cat}"?`,
                              icon: "question",
                              showCancelButton: true,
                              confirmButtonText: "Yes, Delete",
                              cancelButtonText: "Cancel",
                              confirmButtonColor: "#f85a6b",
                              background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff",
                            }).then((result) => {
                              if (result.isConfirmed) {
                                const categoryId = categoryIds[cat.toLowerCase()];
                                if (categoryId) {
                                  fetch(`${apiBase}/categories/${categoryId}`, {
                                    method: "DELETE", headers: authHeader(),
                                  })
                                    .then(() => {
                                      setCategories(categories.filter(c => c !== cat));
                                      const updatedIds = { ...categoryIds };
                                      delete updatedIds[cat.toLowerCase()];
                                      setCategoryIds(updatedIds);
                                      Swal.fire({
                                        title: "Deleted!",
                                        text: `Category "${cat}" has been deleted.`,
                                        icon: "success",
                                        background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff",
                                      });
                                    })
                                    .catch(err => {
                                      Swal.fire({
                                        title: "Error",
                                        text: "Could not delete category.",
                                        icon: "error",
                                        background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff",
                                      });
                                    });
                                } else {
                                  setCategories(categories.filter(c => c !== cat));
                                }
                              }
                            });
                          }}
                          className="text-ink-3 hover:text-critical size-7 rounded-lg"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
