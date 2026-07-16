"use client";

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
  BookOpen,
  FolderPlus,
  Video,
  Clock,
  ExternalLink,
  GraduationCap,
  CheckCircle2
} from "lucide-react";
import Swal from "sweetalert2";

import { Topbar } from "@/components/layout/topbar";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { fetchStudentsTeachers, authHeader } from "@/lib/api";

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

const TEACHERS = [
  "Sheikh Abdul Rahman",
  "Ustadha Fatima",
  "Sheikh Muhammad Al-Mansoori",
  "Ustadha Zaynab",
  "Sheikh Yasir Qadhi"
];

// Initial Mock Classes Data (30 items with independent categories)
const INITIAL_CLASSES: any[] = [];

const INITIAL_CATEGORIES = ["Regular Class", "1-on-1 Session", "Revision Session", "Guest Lecture", "Trial Class", "Quiz"];
const STATUSES = ["All", "Upcoming", "Live", "Completed", "Cancelled"] as const;

const statusBadgeTone: Record<string, Tone> = {
  Live: "good",
  Upcoming: "accent",
  Completed: "neutral",
  Cancelled: "critical"
};

export default function ClassesPage() {
  const [classes, setClasses] = useState(INITIAL_CLASSES);
  const [categories, setCategories] = useState(INITIAL_CATEGORIES);

  const [showCategoriesModal, setShowCategoriesModal] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");

  // Filters, sorting, and pagination
  const [searchQuery, setSearchQuery] = useState("");
  const [courseFilter, setCourseFilter] = useState("All");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [sortBy, setSortBy] = useState("time-asc");

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedClass, setSelectedClass] = useState<typeof INITIAL_CLASSES[0] | null>(null);

  // Add/Edit form fields
  const [formTopic, setFormTopic] = useState("");
  const [formCourseCode, setFormCourseCode] = useState(AVAILABLE_COURSES[0].code);
  const [formTeacher, setFormTeacher] = useState(TEACHERS[0]);
  const [formCategory, setFormCategory] = useState("Regular Class");
  const [formCapacity, setFormCapacity] = useState<number>(15);
  const [formEnrolled, setFormEnrolled] = useState<number>(0);
  const [formTimeStart, setFormTimeStart] = useState("");
  const [formTimeEnd, setFormTimeEnd] = useState("");
  const [formLink, setFormLink] = useState("");
  const [formStatus, setFormStatus] = useState("Upcoming");
  const [formDescription, setFormDescription] = useState("");

  const [teachersList, setTeachersList] = useState<string[]>(TEACHERS);
  const [coursesList, setCoursesList] = useState(AVAILABLE_COURSES);

  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000/api";

  // Load classes from the database.
  useEffect(() => {
    fetch(`${apiBase}/lms-data/classes`, { headers: authHeader() })
      .then(res => res.json())
      .then((data: any[]) => setClasses(data))
      .catch(console.error);
  }, [apiBase]);

  useEffect(() => {
    // Fetch teachers from backend
    fetchStudentsTeachers()
      .then(data => {
        if (data && data.length > 0) {
          const names = data.map(t => `${t.user.firstName} ${t.user.lastName}`);
          setTeachersList(names);
        }
      })
      .catch(err => console.warn("Failed to fetch teachers from API, using fallback data", err));

    // Courses come from the admin's Learning-Management catalogue (LmsCourse),
    // so the dropdown shows real course codes/titles — never a database UUID.
    fetch(`${apiBase}/lms-data/courses`)
      .then(res => res.json())
      .then((data: any[]) => {
        if (data && data.length > 0) {
          const formatted = data.map(c => ({
            code: c.code,
            title: c.title,
            studentsCount: c.studentsCount ?? 0,
          }));
          setCoursesList(formatted);
        }
      })
      .catch(err => console.warn("Failed to fetch courses from API, using fallback data", err));
  }, [apiBase]);

  // Reset page when filter triggers
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, courseFilter, categoryFilter, statusFilter, pageSize]);

  // Compute Stats
  const totalClassesCount = classes.length;
  const liveClassesCount = classes.filter(c => c.status === "Live").length;
  const completedCount = classes.filter(c => c.status === "Completed").length;
  const totalActiveStudents = classes.reduce((sum, c) => sum + c.enrolled, 0);

  // Filter & Sort Logic
  const filteredClasses = classes
    .filter(cls => {
      const matchesSearch = 
        cls.topic.toLowerCase().includes(searchQuery.toLowerCase()) || 
        cls.courseTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
        cls.teacher.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCourse = courseFilter === "All" || cls.courseCode === courseFilter;
      const matchesCategory = categoryFilter === "All" || cls.category === categoryFilter;
      const matchesStatus = statusFilter === "All" || cls.status === statusFilter;
      return matchesSearch && matchesCourse && matchesCategory && matchesStatus;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case "time-asc":
          return a.timeStart.localeCompare(b.timeStart);
        case "time-desc":
          return b.timeStart.localeCompare(a.timeStart);
        case "title-asc":
          return a.topic.localeCompare(b.topic);
        case "title-desc":
          return b.topic.localeCompare(a.topic);
        case "capacity-desc":
          return b.capacity - a.capacity;
        case "enrolled-desc":
          return b.enrolled - a.enrolled;
        default:
          return 0;
      }
    });

  // Pagination Bounds
  const totalItems = filteredClasses.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedClasses = filteredClasses.slice(startIndex, startIndex + pageSize);

  // CRUD handlers
  const handleDelete = (id: string, name: string) => {
    Swal.fire({
      title: "Cancel and Delete Class?",
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
        fetch(`${apiBase}/lms-data/classes/${id}`, { method: "DELETE", headers: authHeader() })
          .then(() => {
            setClasses(prev => prev.filter(c => c.id !== id));
            Swal.fire({
              title: "Deleted!",
              text: "The class has been deleted.",
              icon: "success",
              background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff"
            });
          })
          .catch(() => Swal.fire({ title: "Error", text: "Could not delete class.", icon: "error" }));
      }
    });
  };

  const handleOpenAddModal = () => {
    setFormTopic("");
    setFormCourseCode(coursesList[0]?.code || AVAILABLE_COURSES[0].code);
    setFormTeacher(teachersList[0] || TEACHERS[0]);
    setFormCategory(categories[0] || "Regular Class");
    setFormCapacity(15);
    setFormEnrolled(0);
    setFormTimeStart(new Date().toISOString().slice(0, 16));
    setFormTimeEnd(new Date(Date.now() + 3600000).toISOString().slice(0, 16));
    setFormLink("https://zoom.us/j/1234567890");
    setFormStatus("Upcoming");
    setFormDescription("");
    setShowAddModal(true);
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTopic || !formTimeStart || !formTimeEnd || !formLink) {
      Swal.fire({ title: "Fields Required", text: "Please enter a topic, scheduling times, and class link.", icon: "error" });
      return;
    }

    if (formEnrolled > formCapacity) {
      Swal.fire({ title: "Invalid Capacity", text: "Enrolled student counts cannot exceed class capacity.", icon: "error" });
      return;
    }

    const courseObj = coursesList.find(c => c.code === formCourseCode) || AVAILABLE_COURSES.find(c => c.code === formCourseCode)!;

    const payload = {
      topic: formTopic,
      courseCode: courseObj.code,
      courseTitle: courseObj.title,
      teacher: formTeacher,
      capacity: Number(formCapacity) || 15,
      enrolled: Number(formEnrolled) || 0,
      category: formCategory,
      timeStart: formTimeStart,
      timeEnd: formTimeEnd,
      link: formLink,
      status: formStatus,
      description: formDescription || "No description provided."
    };

    fetch(`${apiBase}/lms-data/classes`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body: JSON.stringify(payload),
    })
      .then(res => res.json())
      .then(saved => {
        setClasses(prev => [saved, ...prev]);
        setShowAddModal(false);
        Swal.fire({
          title: "Scheduled",
          text: "New class successfully scheduled!",
          icon: "success",
          background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff"
        });
      })
      .catch(() => Swal.fire({ title: "Error", text: "Could not schedule class.", icon: "error" }));
  };

  const handleOpenEditModal = (cls: typeof INITIAL_CLASSES[0]) => {
    setSelectedClass(cls);
    setFormTopic(cls.topic);
    setFormCourseCode(cls.courseCode);
    setFormTeacher(cls.teacher);
    setFormCategory(cls.category || categories[0] || "Regular Class");
    setFormCapacity(cls.capacity);
    setFormEnrolled(cls.enrolled);
    setFormTimeStart(cls.timeStart);
    setFormTimeEnd(cls.timeEnd);
    setFormLink(cls.link);
    setFormStatus(cls.status);
    setFormDescription(cls.description);
    setShowEditModal(true);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClass) return;
    if (!formTopic || !formTimeStart || !formTimeEnd || !formLink) {
      Swal.fire({ title: "Fields Required", text: "Please enter a topic, scheduling times, and class link.", icon: "error" });
      return;
    }

    if (formEnrolled > formCapacity) {
      Swal.fire({ title: "Invalid Capacity", text: "Enrolled student counts cannot exceed class capacity.", icon: "error" });
      return;
    }

    const courseObj = coursesList.find(c => c.code === formCourseCode) || AVAILABLE_COURSES.find(c => c.code === formCourseCode)!;

    const payload = {
      topic: formTopic,
      courseCode: courseObj.code,
      courseTitle: courseObj.title,
      teacher: formTeacher,
      capacity: Number(formCapacity) || 15,
      enrolled: Number(formEnrolled) || 0,
      category: formCategory,
      timeStart: formTimeStart,
      timeEnd: formTimeEnd,
      link: formLink,
      status: formStatus,
      description: formDescription
    };

    fetch(`${apiBase}/lms-data/classes/${selectedClass.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body: JSON.stringify(payload),
    })
      .then(res => res.json())
      .then(saved => {
        setClasses(prev => prev.map(c => (c.id === saved.id ? saved : c)));
        setShowEditModal(false);
        Swal.fire({
          title: "Updated",
          text: "Class schedule updated successfully!",
          icon: "success",
          background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff"
        });
      })
      .catch(() => Swal.fire({ title: "Error", text: "Could not update class.", icon: "error" }));
  };

  const handleOpenViewDetails = (cls: typeof INITIAL_CLASSES[0]) => {
    setSelectedClass(cls);
    const startStr = new Date(cls.timeStart).toLocaleString();
    const endStr = new Date(cls.timeEnd).toLocaleTimeString();
    Swal.fire({
      title: `<span class="text-lg font-bold">${cls.topic}</span>`,
      html: `
        <div class="text-left mt-3 text-sm space-y-2">
          <p><strong>Category:</strong> ${cls.category || "General"}</p>
          <p><strong>Course:</strong> ${cls.courseTitle} (${cls.courseCode})</p>
          <p><strong>Teacher:</strong> ${cls.teacher}</p>
          <p><strong>Schedule Time:</strong> ${startStr} - ${endStr}</p>
          <p><strong>Seats Capacity:</strong> ${cls.enrolled}/${cls.capacity} students filled</p>
          <p><strong>Class Status:</strong> ${cls.status}</p>
          <p><strong>Class Location:</strong> <a href="${cls.link}" target="_blank" class="text-accent underline inline-flex items-center gap-1">Open Video Class <svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3"/></svg></a></p>
          <p class="mt-4 border-t pt-2 text-ink-2"><strong>Class Description / Notes:</strong></p>
          <p class="text-xs text-ink-3 italic bg-surface-2 p-2.5 rounded-lg border">${cls.description}</p>
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
      <Topbar title="Classes Management" subtitle="Schedule and manage online class lectures, trial sessions, and doubt-clearing calls" />
      
      <div className="animate-fade-up p-4 sm:p-6 space-y-6">
        
        {/* Statistics section */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Card className="hover:scale-[1.01] transition-transform duration-200">
            <CardBody className="flex items-center gap-4 py-5">
              <span className="grid size-12 place-items-center rounded-xl bg-accent/10 text-accent">
                <Calendar className="size-6" />
              </span>
              <div>
                <p className="text-2xl font-bold tracking-tight text-ink">{totalClassesCount}</p>
                <p className="text-xs font-semibold text-ink-3">Total Classes Scheduled</p>
              </div>
            </CardBody>
          </Card>
          
          <Card className="hover:scale-[1.01] transition-transform duration-200">
            <CardBody className="flex items-center gap-4 py-5">
              <span className="grid size-12 place-items-center rounded-xl bg-emerald-500/10 text-emerald-500 animate-pulse">
                <Video className="size-6" />
              </span>
              <div>
                <p className="text-2xl font-bold tracking-tight text-ink">{liveClassesCount}</p>
                <p className="text-xs font-semibold text-ink-3">Live Sessions Now</p>
              </div>
            </CardBody>
          </Card>

          <Card className="hover:scale-[1.01] transition-transform duration-200">
            <CardBody className="flex items-center gap-4 py-5">
              <span className="grid size-12 place-items-center rounded-xl bg-amber-500/10 text-amber-500">
                <CheckCircle2 className="size-6" />
              </span>
              <div>
                <p className="text-2xl font-bold tracking-tight text-ink">{completedCount}</p>
                <p className="text-xs font-semibold text-ink-3">Completed Sessions</p>
              </div>
            </CardBody>
          </Card>

          <Card className="hover:scale-[1.01] transition-transform duration-200">
            <CardBody className="flex items-center gap-4 py-5">
              <span className="grid size-12 place-items-center rounded-xl bg-violet-500/10 text-violet-500">
                <Users className="size-6" />
              </span>
              <div>
                <p className="text-2xl font-bold tracking-tight text-ink">{totalActiveStudents}</p>
                <p className="text-xs font-semibold text-ink-3">Students in Classes</p>
              </div>
            </CardBody>
          </Card>
        </div>

        {/* Filters and Actions */}
        <Card>
          <CardBody className="pt-5 space-y-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              
              {/* Search field */}
              <div className="relative flex-1 max-w-xs">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" />
                <input
                  type="text"
                  placeholder="Search topic or teacher..."
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
                    {coursesList.map(c => (
                      <option key={c.code} value={c.code}>{c.title}</option>
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
                    <option value="time-asc">Time (Earliest First)</option>
                    <option value="time-desc">Time (Latest First)</option>
                    <option value="title-asc">Topic (A-Z)</option>
                    <option value="title-desc">Topic (Z-A)</option>
                    <option value="capacity-desc">Seat Capacity (High to Low)</option>
                    <option value="enrolled-desc">Students Enrolled (High to Low)</option>
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

                {/* Add class button */}
                <Button 
                  variant="primary" 
                  size="md" 
                  onClick={handleOpenAddModal} 
                  className="rounded-xl flex items-center gap-2"
                >
                  <Plus className="size-4" />
                  <span>Schedule Class</span>
                </Button>
              </div>
            </div>

            {/* Classes Table Grid */}
            <div className="overflow-x-auto border border-hairline rounded-xl">
              <table className="w-full border-collapse text-left text-sm text-ink-2">
                <thead className="bg-surface-2 text-xs font-bold text-ink-3 uppercase border-b border-hairline">
                  <tr>
                    <th scope="col" className="px-6 py-4">Topic Detail</th>
                    <th scope="col" className="px-6 py-4">Course Name (Code)</th>
                    <th scope="col" className="px-6 py-4">Teacher Name</th>
                    <th scope="col" className="px-6 py-4">Class Schedule (Start - End)</th>
                    <th scope="col" className="px-6 py-4">Capacity / Attendance</th>
                    <th scope="col" className="px-6 py-4">Status</th>
                    <th scope="col" className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline bg-surface">
                  {paginatedClasses.length > 0 ? (
                    paginatedClasses.map((cls) => {
                      const fillPercent = cls.capacity > 0 ? Math.round((cls.enrolled / cls.capacity) * 100) : 0;
                      const startTime = new Date(cls.timeStart).toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: true
                      });
                      const endTime = new Date(cls.timeEnd).toLocaleTimeString("en-US", {
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: true
                      });

                      return (
                        <tr 
                          key={cls.id} 
                          className="hover:bg-surface-2/60 transition-colors"
                        >
                          <td className="px-6 py-4 max-w-xs">
                            <div className="font-semibold text-ink">{cls.topic}</div>
                            <div className="mt-1">
                              <Badge tone="neutral" className="text-[10px] py-0 px-1.5 font-bold uppercase tracking-wider">
                                {cls.category || "General"}
                              </Badge>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="font-semibold text-ink flex items-center gap-1.5">
                              <BookOpen className="size-3.5 text-accent" />
                              {cls.courseTitle}
                            </div>
                            <div className="text-xs text-ink-3 font-semibold mt-1">
                              <span className="font-mono bg-surface-3 px-1 py-0.5 rounded text-[10px] border border-hairline">{cls.courseCode}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 font-semibold text-ink">
                            <div className="flex items-center gap-1.5 text-xs font-bold text-ink">
                              <GraduationCap className="size-4 text-zinc-400" />
                              <span>{cls.teacher}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-1 text-xs font-bold text-ink">
                              <Clock className="size-3.5 text-accent" />
                              <span>{startTime} - {endTime}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div>
                              <div className="flex items-center justify-between text-xs font-bold mb-1">
                                <span className="text-ink">{cls.enrolled}/{cls.capacity} ({fillPercent}%)</span>
                              </div>
                              <div className="h-1.5 w-24 bg-surface-3 rounded-full overflow-hidden border border-hairline">
                                <div 
                                  className={cn(
                                    "h-full rounded-full transition-all duration-300",
                                    fillPercent >= 90 ? "bg-amber-500" : fillPercent >= 50 ? "bg-accent" : "bg-emerald-500"
                                  )}
                                  style={{ width: `${Math.min(100, fillPercent)}%` }}
                                />
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <Badge tone={statusBadgeTone[cls.status] || "neutral"}>
                              {cls.status}
                            </Badge>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex justify-end gap-1.5">
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                onClick={() => handleOpenViewDetails(cls)}
                                className="rounded-lg text-ink-3 hover:text-ink hover:bg-surface-3 size-8"
                                title="View Details"
                              >
                                <Info className="size-4.5" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                onClick={() => handleOpenEditModal(cls)}
                                className="rounded-lg text-ink-3 hover:text-accent hover:bg-surface-3 size-8"
                                title="Edit Schedule"
                              >
                                <Edit2 className="size-4" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                onClick={() => handleDelete(cls.id, cls.topic)}
                                className="rounded-lg text-ink-3 hover:text-critical hover:bg-surface-3 size-8"
                                title="Cancel Class"
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
                      <td colSpan={7} className="px-6 py-12 text-center text-ink-3">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <ClipboardList className="size-8 text-ink-3/60" />
                          <p className="font-semibold text-sm">No scheduled classes matched the search parameters.</p>
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
                <span>of {totalItems} filtered classes</span>
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

      {/* Add Class Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-[2px]">
          <div className="relative w-full max-w-lg rounded-2xl border border-hairline bg-surface shadow-2xl overflow-hidden animate-fade-in text-ink max-h-[90vh] overflow-y-auto">
            <header className="flex items-center justify-between border-b border-hairline px-6 py-4 sticky top-0 bg-surface z-10">
              <h3 className="text-base font-bold text-ink">Schedule New Class</h3>
              <button 
                onClick={() => setShowAddModal(false)}
                className="rounded-lg p-1 text-ink-3 hover:bg-surface-2 hover:text-ink"
              >
                <X className="size-5" />
              </button>
            </header>
            
            <form onSubmit={handleAddSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-ink-3 uppercase mb-1">Class Topic / Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Throat articulation practice"
                  value={formTopic}
                  onChange={(e) => setFormTopic(e.target.value)}
                  className="h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-ink-3 uppercase mb-1">Link to Course</label>
                  <select
                    value={formCourseCode}
                    onChange={(e) => setFormCourseCode(e.target.value)}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                  >
                    {coursesList.map(c => (
                      <option key={c.code} value={c.code}>
                        {c.title}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-ink-3 uppercase mb-1">Instructor / Teacher</label>
                  <select
                    value={formTeacher}
                    onChange={(e) => setFormTeacher(e.target.value)}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                  >
                    {teachersList.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
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
                  <label className="block text-xs font-bold text-ink-3 uppercase mb-1">Seats Capacity</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={formCapacity}
                    onChange={(e) => setFormCapacity(Number(e.target.value))}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-ink-3 uppercase mb-1">Enrolled</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={formEnrolled}
                    onChange={(e) => setFormEnrolled(Number(e.target.value))}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-ink-3 uppercase mb-1">Start Time</label>
                  <input
                    type="datetime-local"
                    required
                    value={formTimeStart}
                    onChange={(e) => setFormTimeStart(e.target.value)}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-ink-3 uppercase mb-1">End Time</label>
                  <input
                    type="datetime-local"
                    required
                    value={formTimeEnd}
                    onChange={(e) => setFormTimeEnd(e.target.value)}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-ink-3 uppercase mb-1">Zoom / Meeting Link</label>
                  <input
                    type="url"
                    required
                    placeholder="https://zoom.us/j/..."
                    value={formLink}
                    onChange={(e) => setFormLink(e.target.value)}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-ink-3 uppercase mb-1">Status</label>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value)}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                  >
                    <option value="Upcoming">Upcoming</option>
                    <option value="Live">Live</option>
                    <option value="Completed">Completed</option>
                    <option value="Cancelled">Cancelled</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-ink-3 uppercase mb-1">Description / Notes</label>
                <textarea
                  placeholder="Enter details on what homework or items to prepare..."
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  rows={2.5}
                  className="w-full rounded-xl border border-hairline bg-surface-2 p-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent resize-none"
                />
              </div>

              <footer className="flex justify-end gap-2 pt-2 border-t border-hairline">
                <Button type="button" variant="outline" onClick={() => setShowAddModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary">
                  Publish Class
                </Button>
              </footer>
            </form>
          </div>
        </div>
      )}

      {/* Edit Class Modal */}
      {showEditModal && selectedClass && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-[2px]">
          <div className="relative w-full max-w-lg rounded-2xl border border-hairline bg-surface shadow-2xl overflow-hidden animate-fade-in text-ink max-h-[90vh] overflow-y-auto">
            <header className="flex items-center justify-between border-b border-hairline px-6 py-4 sticky top-0 bg-surface z-10">
              <h3 className="text-base font-bold text-ink">Edit Class Schedule</h3>
              <button 
                onClick={() => setShowEditModal(false)}
                className="rounded-lg p-1 text-ink-3 hover:bg-surface-2 hover:text-ink"
              >
                <X className="size-5" />
              </button>
            </header>
            
            <form onSubmit={handleEditSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-ink-3 uppercase mb-1">Class Topic / Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Throat articulation practice"
                  value={formTopic}
                  onChange={(e) => setFormTopic(e.target.value)}
                  className="h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-ink-3 uppercase mb-1">Link to Course</label>
                  <select
                    value={formCourseCode}
                    onChange={(e) => setFormCourseCode(e.target.value)}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                  >
                    {coursesList.map(c => (
                      <option key={c.code} value={c.code}>
                        {c.title}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-ink-3 uppercase mb-1">Instructor / Teacher</label>
                  <select
                    value={formTeacher}
                    onChange={(e) => setFormTeacher(e.target.value)}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                  >
                    {teachersList.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
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
                  <label className="block text-xs font-bold text-ink-3 uppercase mb-1">Seats Capacity</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={formCapacity}
                    onChange={(e) => setFormCapacity(Number(e.target.value))}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-ink-3 uppercase mb-1">Enrolled</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={formEnrolled}
                    onChange={(e) => setFormEnrolled(Number(e.target.value))}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-ink-3 uppercase mb-1">Start Time</label>
                  <input
                    type="datetime-local"
                    required
                    value={formTimeStart}
                    onChange={(e) => setFormTimeStart(e.target.value)}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-ink-3 uppercase mb-1">End Time</label>
                  <input
                    type="datetime-local"
                    required
                    value={formTimeEnd}
                    onChange={(e) => setFormTimeEnd(e.target.value)}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-ink-3 uppercase mb-1">Zoom / Meeting Link</label>
                  <input
                    type="url"
                    required
                    placeholder="https://zoom.us/j/..."
                    value={formLink}
                    onChange={(e) => setFormLink(e.target.value)}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-ink-3 uppercase mb-1">Status</label>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value)}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                  >
                    <option value="Upcoming">Upcoming</option>
                    <option value="Live">Live</option>
                    <option value="Completed">Completed</option>
                    <option value="Cancelled">Cancelled</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-ink-3 uppercase mb-1">Description / Notes</label>
                <textarea
                  placeholder="Enter details on what homework or items to prepare..."
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  rows={2.5}
                  className="w-full rounded-xl border border-hairline bg-surface-2 p-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent resize-none"
                />
              </div>

              <footer className="flex justify-end gap-2 pt-2 border-t border-hairline">
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
              <h3 className="text-base font-bold text-ink">Manage Class Categories</h3>
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
                    setCategories([...categories, trimmed]);
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
                    const usageCount = classes.filter(c => c.category === cat).length;

                    return (
                      <div key={cat} className="flex items-center justify-between px-4 py-2.5 text-sm">
                        <span className="font-semibold text-ink flex items-center gap-2">
                          <span className="size-2 rounded-full bg-accent" />
                          {cat}
                          <span className="text-[10px] text-ink-3 font-bold bg-surface-2 px-1.5 py-0.5 rounded-md border border-hairline">
                            {usageCount} {usageCount === 1 ? "class" : "classes"}
                          </span>
                        </span>
                        
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            if (usageCount > 0) {
                              Swal.fire({
                                title: "Cannot Delete",
                                text: `Category "${cat}" is in use by ${usageCount} scheduled class(es). Please delete or reassign those first.`,
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
                                setCategories(categories.filter(c => c !== cat));
                                Swal.fire({
                                  title: "Deleted!",
                                  text: `Category "${cat}" has been deleted.`,
                                  icon: "success",
                                  background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff",
                                });
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
