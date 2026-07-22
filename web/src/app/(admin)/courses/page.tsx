"use client";

import { authHeader, bulkDeleteCourses } from "@/lib/api";

import { useState, useEffect, useCallback } from "react";
import { 
  Plus, 
  Search, 
  X, 
  Users, 
  GraduationCap, 
  Edit2, 
  Trash2, 
  Info,
  BookOpen,
  Filter,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  FileText,
  FolderPlus
} from "lucide-react";
import Swal from "sweetalert2";

import { Topbar } from "@/components/layout/topbar";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { useBulkSelect, SelectAllBox, SelectBox, BulkBar } from "@/components/ui/bulk-select";
import { cn } from "@/lib/utils";

// Initial Mock Course Data (30 courses)
const INITIAL_COURSES: any[] = [];

const INITIAL_CATEGORIES: string[] = [];
const LEVELS = ["All", "Beginner", "Intermediate", "Advanced"] as const;
const STATUSES = ["All", "Active", "Draft", "Archived"] as const;

const statusBadgeTone: Record<string, Tone> = {
  Active: "good",
  Draft: "warning",
  Archived: "neutral"
};

const levelBadgeTone: Record<string, Tone> = {
  Beginner: "neutral",
  Intermediate: "accent",
  Advanced: "critical"
};

/*
 * Every call here used to read the body without looking at the status, so a
 * refusal — "this course has 3 enrolled students" — arrived as a success:
 * the row vanished from the table and the dialog said "Deleted!". The course
 * was still there on reload. Now the server's reason is what gets shown.
 */
async function ok(res: Response) {
  if (res.ok) return res;
  const body = await res.json().catch(() => null);
  throw new Error(
    (Array.isArray(body?.message) ? body.message.join(", ") : body?.message) ||
      `Request failed (${res.status})`,
  );
}

export default function CoursesPage() {
  const [courses, setCourses] = useState(INITIAL_COURSES);
  const [categories, setCategories] = useState(INITIAL_CATEGORIES);
  const [categoryIds, setCategoryIds] = useState<Record<string, string>>({});
  const [showCategoriesModal, setShowCategoriesModal] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");

  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000/api";

  // Fetch categories on mount
  useEffect(() => {
    fetch(`${apiBase}/categories?type=COURSE`)
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

  const loadCourses = useCallback(() => {
    fetch(`${apiBase}/lms-data/courses`)
      .then(res => res.json())
      .then((data: any[]) => {
        setCourses(data);
      })
      .catch(console.error);
  }, [apiBase]);

  // Fetch courses on mount
  useEffect(() => {
    loadCourses();
  }, [loadCourses]);

  // Filters & Sorting & Pagination State
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [levelFilter, setLevelFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [sortBy, setSortBy] = useState("title-asc");
  
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Modal control states
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<typeof INITIAL_COURSES[0] | null>(null);

  // Add/Edit form fields
  const [formCode, setFormCode] = useState("");
  const [formTitle, setFormTitle] = useState("");
  const [formCategory, setFormCategory] = useState("");
  const [formLevel, setFormLevel] = useState("Beginner");
  /*
   * Price and duration belong to the relational Course a student is actually
   * enrolled in. Until this form carried them, creating a course here made a
   * catalogue entry and nothing else — nobody could be enrolled in it.
   *
   * The student and teacher counts that used to sit in these two slots were
   * typed in by hand and believed by the delete guard, so a course could claim
   * 20 students it did not have. They are now counted from real enrolments and
   * are not editable.
   */
  const [formPrice, setFormPrice] = useState<number>(0);
  const [formWeeks, setFormWeeks] = useState<number>(12);
  const [formStatus, setFormStatus] = useState("Active");
  const [formDescription, setFormDescription] = useState("");

  // Reset pagination when filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, categoryFilter, levelFilter, statusFilter, pageSize]);

  // Compute Stats
  const totalCourses = courses.length;
  const activeCourses = courses.filter(c => c.status === "Active");
  const totalStudents = activeCourses.reduce((sum, c) => sum + c.studentsCount, 0);
  const totalTeachers = activeCourses.reduce((sum, c) => sum + c.teachersCount, 0);
  const avgStudents = totalCourses > 0 ? Math.round(courses.reduce((sum, c) => sum + c.studentsCount, 0) / totalCourses) : 0;

  // Filter & Sort Logic
  const filteredCourses = courses
    .filter(course => {
      const matchesSearch = 
        course.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
        course.code.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = categoryFilter === "All" || course.category === categoryFilter;
      const matchesLevel = levelFilter === "All" || course.level === levelFilter;
      const matchesStatus = statusFilter === "All" || course.status === statusFilter;
      return matchesSearch && matchesCategory && matchesLevel && matchesStatus;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case "title-asc":
          return a.title.localeCompare(b.title);
        case "title-desc":
          return b.title.localeCompare(a.title);
        case "students-desc":
          return b.studentsCount - a.studentsCount;
        case "students-asc":
          return a.studentsCount - b.studentsCount;
        case "teachers-desc":
          return b.teachersCount - a.teachersCount;
        case "code-asc":
          return a.code.localeCompare(b.code);
        default:
          return 0;
      }
    });

  // Pagination bounds
  const totalItems = filteredCourses.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedCourses = filteredCourses.slice(startIndex, startIndex + pageSize);

  const { selected, ids, toggle, toggleAll, allShown, clear, busy, confirmAndDelete } =
    useBulkSelect(paginatedCourses);

  // CRUD actions
  const handleDelete = (id: string, name: string) => {
    Swal.fire({
      title: "Delete Course?",
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
        fetch(`${apiBase}/lms-data/courses/${id}`, { method: "DELETE", headers: authHeader() })
          .then(ok)
          .then(() => {
            setCourses(prev => prev.filter(c => c.id !== id));
            Swal.fire({
              title: "Deleted!",
              text: "The course has been successfully removed.",
              icon: "success",
              background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff"
            });
          })
          .catch(err => {
            Swal.fire({ title: "Could not delete", text: err.message, icon: "error" });
          });
      }
    });
  };

  const handleOpenAddModal = () => {
    setFormCode("");
    setFormTitle("");
    setFormCategory(categories[0] || "");
    setFormLevel("Beginner");
    setFormPrice(0);
    setFormWeeks(12);
    setFormStatus("Active");
    setFormDescription("");
    setShowAddModal(true);
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formCode || !formTitle) {
      Swal.fire({ title: "Fields Required", text: "Please provide both Course Code and Title.", icon: "error" });
      return;
    }
    if (!formCategory) {
      Swal.fire({ title: "Category Required", text: "Please select or add a category first using 'Manage Categories'.", icon: "error" });
      return;
    }
    // Check code unique
    if (courses.some(c => c.code.toUpperCase() === formCode.toUpperCase())) {
      Swal.fire({ title: "Duplicate Code", text: `A course with code "${formCode}" already exists.`, icon: "error" });
      return;
    }

    const newCourse = {
      code: formCode.toUpperCase(),
      title: formTitle,
      category: formCategory,
      level: formLevel,
      price: Number(formPrice) || 0,
      durationWeeks: Number(formWeeks) || 12,
      status: formStatus,
      createdAt: new Date().toISOString().split("T")[0],
      description: formDescription || "No description provided."
    };

    fetch(`${apiBase}/lms-data/courses`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body: JSON.stringify(newCourse),
    })
      .then(ok)
      .then(res => res.json())
      .then(savedCourse => {
        setCourses([savedCourse, ...courses]);
        setShowAddModal(false);
        Swal.fire({
          title: "Success",
          text: "New course created successfully!",
          icon: "success",
          background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff"
        });
      })
      .catch(err => {
        Swal.fire({ title: "Could not save", text: err.message, icon: "error" });
      });
  };

  const handleOpenEditModal = (course: typeof INITIAL_COURSES[0]) => {
    setSelectedCourse(course);
    setFormCode(course.code);
    setFormTitle(course.title);
    setFormCategory(course.category);
    setFormLevel(course.level);
    setFormPrice(Number(course.price) || 0);
    setFormWeeks(Number(course.durationWeeks) || 12);
    setFormStatus(course.status);
    setFormDescription(course.description);
    setShowEditModal(true);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCourse) return;
    if (!formTitle) {
      Swal.fire({ title: "Title Required", text: "Please provide a Course Title.", icon: "error" });
      return;
    }

    const updatedPayload = {
      title: formTitle,
      category: formCategory,
      level: formLevel,
      price: Number(formPrice) || 0,
      durationWeeks: Number(formWeeks) || 12,
      status: formStatus,
      description: formDescription || "No description provided."
    };

    fetch(`${apiBase}/lms-data/courses/${selectedCourse.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body: JSON.stringify(updatedPayload),
    })
      .then(ok)
      .then(res => res.json())
      .then(updatedCourse => {
        setCourses(prev => prev.map(c => c.id === updatedCourse.id ? updatedCourse : c));
        setShowEditModal(false);
        Swal.fire({
          title: "Updated",
          text: "Course details updated successfully!",
          icon: "success",
          background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff"
        });
      })
      .catch(err => {
        Swal.fire({ title: "Could not update", text: err.message, icon: "error" });
      });
  };

  const handleOpenViewDetails = (course: typeof INITIAL_COURSES[0]) => {
    setSelectedCourse(course);
    // Simple custom Swall alert for quick details view
    Swal.fire({
      title: `<span class="text-lg font-bold">${course.code}: ${course.title}</span>`,
      html: `
        <div class="text-left mt-3 text-sm space-y-2">
          <p><strong>Category:</strong> ${course.category}</p>
          <p><strong>Level:</strong> ${course.level}</p>
          <p><strong>Students Enrolled:</strong> ${course.studentsCount}</p>
          <p><strong>Teachers Teaching:</strong> ${course.teachersCount}</p>
          <p><strong>Status:</strong> ${course.status}</p>
          <p><strong>Date Added:</strong> ${course.createdAt}</p>
          <p class="mt-4 border-t pt-2 text-ink-2"><strong>Description:</strong></p>
          <p class="text-xs text-ink-3 italic bg-surface-2 p-2.5 rounded-lg border">${course.description}</p>
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
      <Topbar title="Courses Management" subtitle="Manage and monitor students & teachers per course" />
      
      <div className="animate-fade-up p-4 sm:p-6 space-y-6">
        
        {/* Statistics Section */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Card className="hover:scale-[1.01] transition-transform duration-200">
            <CardBody className="flex items-center gap-4 py-5">
              <span className="grid size-12 place-items-center rounded-xl bg-accent/10 text-accent">
                <BookOpen className="size-6" />
              </span>
              <div>
                <p className="text-2xl font-bold tracking-tight text-ink">{totalCourses}</p>
                <p className="text-xs font-semibold text-ink-3">Total Courses</p>
              </div>
            </CardBody>
          </Card>
          
          <Card className="hover:scale-[1.01] transition-transform duration-200">
            <CardBody className="flex items-center gap-4 py-5">
              <span className="grid size-12 place-items-center rounded-xl bg-emerald-500/10 text-emerald-500">
                <Users className="size-6" />
              </span>
              <div>
                <p className="text-2xl font-bold tracking-tight text-ink">{totalStudents}</p>
                <p className="text-xs font-semibold text-ink-3">Total Enrollments</p>
              </div>
            </CardBody>
          </Card>

          <Card className="hover:scale-[1.01] transition-transform duration-200">
            <CardBody className="flex items-center gap-4 py-5">
              <span className="grid size-12 place-items-center rounded-xl bg-violet-500/10 text-violet-500">
                <GraduationCap className="size-6" />
              </span>
              <div>
                <p className="text-2xl font-bold tracking-tight text-ink">{totalTeachers}</p>
                <p className="text-xs font-semibold text-ink-3">Active Faculty</p>
              </div>
            </CardBody>
          </Card>

          <Card className="hover:scale-[1.01] transition-transform duration-200">
            <CardBody className="flex items-center gap-4 py-5">
              <span className="grid size-12 place-items-center rounded-xl bg-amber-500/10 text-amber-500">
                <Sparkles className="size-6" />
              </span>
              <div>
                <p className="text-2xl font-bold tracking-tight text-ink">{avgStudents} std/crs</p>
                <p className="text-xs font-semibold text-ink-3">Avg Students/Course</p>
              </div>
            </CardBody>
          </Card>
        </div>

        {/* Filters and Actions */}
        <Card>
          <CardBody className="pt-5 space-y-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              
              {/* Search Field */}
              <div className="relative flex-1 max-w-sm">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" />
                <input
                  type="text"
                  placeholder="Search by name or code..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-10 w-full rounded-xl border border-hairline bg-surface-2 pr-4 pl-10 text-sm text-ink placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-accent focus:bg-surface-3 transition-all"
                />
              </div>

              {/* Category, Level, Status, Sort Filters */}
              <div className="flex flex-wrap items-center gap-2">
                
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

                {/* Level Filter */}
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-ink-3">Lvl:</span>
                  <select
                    value={levelFilter}
                    onChange={(e) => setLevelFilter(e.target.value)}
                    className="h-9 rounded-xl border border-hairline bg-surface px-2.5 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                  >
                    {LEVELS.map(lvl => (
                      <option key={lvl} value={lvl}>{lvl}</option>
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

                {/* Sort Filter */}
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-ink-3 flex items-center gap-1"><ArrowUpDown className="size-3" /> Sort:</span>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="h-9 rounded-xl border border-hairline bg-surface px-2.5 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                  >
                    <option value="title-asc">Name (A-Z)</option>
                    <option value="title-desc">Name (Z-A)</option>
                    <option value="students-desc">Students (High to Low)</option>
                    <option value="students-asc">Students (Low to High)</option>
                    <option value="teachers-desc">Faculty Count (High to Low)</option>
                    <option value="code-asc">Course Code</option>
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

                {/* Add New Course Button */}
                <Button 
                  variant="primary" 
                  size="md" 
                  onClick={handleOpenAddModal} 
                  className="rounded-xl flex items-center gap-2"
                >
                  <Plus className="size-4" />
                  <span>Add Course</span>
                </Button>
              </div>
            </div>

            <BulkBar
              count={ids.length}
              busy={busy}
              onClear={clear}
              noun="course"
              onDelete={() => confirmAndDelete("course", (c) => c.title, bulkDeleteCourses, loadCourses)}
            />

            {/* Courses Table Grid */}
            <div className="overflow-x-auto border border-hairline rounded-xl">
              <table className="w-full border-collapse text-left text-sm text-ink-2">
                <thead className="bg-surface-2 text-xs font-bold text-ink-3 uppercase border-b border-hairline">
                  <tr>
                    <th scope="col" className="px-6 py-4 w-10">
                      <SelectAllBox checked={allShown} onChange={toggleAll} />
                    </th>
                    <th scope="col" className="px-6 py-4">Code</th>
                    <th scope="col" className="px-6 py-4">Course Title & Category</th>
                    <th scope="col" className="px-6 py-4">Level</th>
                    <th scope="col" className="px-6 py-4">Students Enrolled</th>
                    <th scope="col" className="px-6 py-4">Teachers Count</th>
                    <th scope="col" className="px-6 py-4">Status</th>
                    <th scope="col" className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline bg-surface">
                  {paginatedCourses.length > 0 ? (
                    paginatedCourses.map((course) => (
                      <tr
                        key={course.id}
                        className={cn(
                          "hover:bg-surface-2/60 transition-colors",
                          selected.has(course.id) && "bg-accent/5"
                        )}
                      >
                        <td className="px-6 py-4">
                          <SelectBox
                            checked={selected.has(course.id)}
                            onChange={() => toggle(course.id)}
                            label={course.title}
                          />
                        </td>
                        <td className="px-6 py-4 font-mono text-xs font-bold text-accent">
                          {course.code}
                        </td>
                        <td className="px-6 py-4 max-w-xs">
                          <div className="font-semibold text-ink">{course.title}</div>
                          <div className="text-xs text-ink-3 font-semibold mt-0.5">{course.category}</div>
                        </td>
                        <td className="px-6 py-4">
                          <Badge tone={levelBadgeTone[course.level] || "neutral"}>
                            {course.level}
                          </Badge>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <Users className="size-4 text-emerald-500/80" />
                            <span className="font-bold text-ink">{course.studentsCount}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <GraduationCap className="size-4 text-violet-500/80" />
                            <span className="font-bold text-ink">{course.teachersCount}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <Badge tone={statusBadgeTone[course.status] || "neutral"}>
                            {course.status}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-1.5">
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              onClick={() => handleOpenViewDetails(course)}
                              className="rounded-lg text-ink-3 hover:text-ink hover:bg-surface-3 size-8"
                              title="View Details"
                            >
                              <Info className="size-4.5" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              onClick={() => handleOpenEditModal(course)}
                              className="rounded-lg text-ink-3 hover:text-accent hover:bg-surface-3 size-8"
                              title="Edit Course"
                            >
                              <Edit2 className="size-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              onClick={() => handleDelete(course.id, course.title)}
                              className="rounded-lg text-ink-3 hover:text-critical hover:bg-surface-3 size-8"
                              title="Delete Course"
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={8} className="px-6 py-12 text-center text-ink-3">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <FileText className="size-8 text-ink-3/60" />
                          <p className="font-semibold text-sm">No courses matches the filter criteria.</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination & Page-Size controls */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pt-4 border-t border-hairline text-xs font-semibold text-ink-3">
              
              {/* Page Size Options */}
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
                <span>of {totalItems} filtered courses</span>
              </div>

              {/* Showing stats */}
              <div>
                Showing {totalItems > 0 ? startIndex + 1 : 0} to {Math.min(startIndex + pageSize, totalItems)} of {totalItems} items
              </div>

              {/* Page selection buttons */}
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

      {/* Add Course Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-[2px]">
          <div className="relative w-full max-w-lg rounded-2xl border border-hairline bg-surface shadow-2xl overflow-hidden animate-fade-in text-ink">
            <header className="flex items-center justify-between border-b border-hairline px-6 py-4">
              <h3 className="text-base font-bold text-ink">Add New Course</h3>
              <button 
                onClick={() => setShowAddModal(false)}
                className="rounded-lg p-1 text-ink-3 hover:bg-surface-2 hover:text-ink"
              >
                <X className="size-5" />
              </button>
            </header>
            
            <form onSubmit={handleAddSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-ink-3 uppercase mb-1">Course Code</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. QRN-101"
                    value={formCode}
                    onChange={(e) => setFormCode(e.target.value)}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                  />
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
              </div>

              <div>
                <label className="block text-xs font-bold text-ink-3 uppercase mb-1">Course Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Basic Quran Memorization"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-ink-3 uppercase mb-1">Level</label>
                  <select
                    value={formLevel}
                    onChange={(e) => setFormLevel(e.target.value)}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                  >
                    <option value="Beginner">Beginner</option>
                    <option value="Intermediate">Intermediate</option>
                    <option value="Advanced">Advanced</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-ink-3 uppercase mb-1">Price ($ USD)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={formPrice}
                    onChange={(e) => setFormPrice(Number(e.target.value))}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                  <p className="mt-1 text-[10px] text-ink-3">Leave at 0 if the course is only ever sold inside a package.</p>
                </div>
                <div>
                  <label className="block text-xs font-bold text-ink-3 uppercase mb-1">Duration (weeks)</label>
                  <input
                    type="number"
                    min="1"
                    max="260"
                    value={formWeeks}
                    onChange={(e) => setFormWeeks(Number(e.target.value))}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                </div>
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
                  <option value="Archived">Archived</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-ink-3 uppercase mb-1">Description</label>
                <textarea
                  placeholder="Enter a brief syllabus or overview of the course syllabus..."
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
                  Create Course
                </Button>
              </footer>
            </form>
          </div>
        </div>
      )}

      {/* Edit Course Modal */}
      {showEditModal && selectedCourse && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-[2px]">
          <div className="relative w-full max-w-lg rounded-2xl border border-hairline bg-surface shadow-2xl overflow-hidden animate-fade-in text-ink">
            <header className="flex items-center justify-between border-b border-hairline px-6 py-4">
              <h3 className="text-base font-bold text-ink">Edit Course: {selectedCourse.code}</h3>
              <button 
                onClick={() => setShowEditModal(false)}
                className="rounded-lg p-1 text-ink-3 hover:bg-surface-2 hover:text-ink"
              >
                <X className="size-5" />
              </button>
            </header>
            
            <form onSubmit={handleEditSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-ink-3 uppercase mb-1">Course Code</label>
                  <input
                    type="text"
                    disabled
                    value={formCode}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface-2/65 px-3.5 text-sm text-ink opacity-70 cursor-not-allowed"
                  />
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
              </div>

              <div>
                <label className="block text-xs font-bold text-ink-3 uppercase mb-1">Course Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Basic Quran Memorization"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-ink-3 uppercase mb-1">Level</label>
                  <select
                    value={formLevel}
                    onChange={(e) => setFormLevel(e.target.value)}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                  >
                    <option value="Beginner">Beginner</option>
                    <option value="Intermediate">Intermediate</option>
                    <option value="Advanced">Advanced</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-ink-3 uppercase mb-1">Price ($ USD)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={formPrice}
                    onChange={(e) => setFormPrice(Number(e.target.value))}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                  <p className="mt-1 text-[10px] text-ink-3">Leave at 0 if the course is only ever sold inside a package.</p>
                </div>
                <div>
                  <label className="block text-xs font-bold text-ink-3 uppercase mb-1">Duration (weeks)</label>
                  <input
                    type="number"
                    min="1"
                    max="260"
                    value={formWeeks}
                    onChange={(e) => setFormWeeks(Number(e.target.value))}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                </div>
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
                  <option value="Archived">Archived</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-ink-3 uppercase mb-1">Description</label>
                <textarea
                  placeholder="Enter a brief syllabus or overview of the course syllabus..."
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
                      body: JSON.stringify({ name: trimmed, type: "COURSE" }),
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
                    const coursesUsingCat = courses.filter(c => c.category === cat);
                    const usageCount = coursesUsingCat.length;

                    return (
                      <div key={cat} className="flex items-center justify-between px-4 py-2.5 text-sm">
                        <span className="font-semibold text-ink flex items-center gap-2">
                          <span className="size-2 rounded-full bg-accent" />
                          {cat}
                          <span className="text-[10px] text-ink-3 font-bold bg-surface-2 px-1.5 py-0.5 rounded-md border border-hairline">
                            {usageCount} {usageCount === 1 ? "course" : "courses"}
                          </span>
                        </span>
                        
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            if (usageCount > 0) {
                              Swal.fire({
                                title: "Cannot Delete",
                                text: `Category "${cat}" is in use by ${usageCount} course(s). Please reassign or delete these courses first.`,
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
