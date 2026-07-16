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
  Filter,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Sparkles,
  BookOpen,
  FolderPlus,
  FileText,
  Download,
  Database,
  Link,
  Video,
  FileDown,
  Volume2
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

// Initial Mock Resources Data (30 items with independent knowledgebase categories)
const INITIAL_RESOURCES: any[] = [];

const INITIAL_CATEGORIES: string[] = [];
const FORMATS = ["All", "PDF", "Audio", "Video", "Doc", "Link"] as const;
const STATUSES = ["All", "Active", "Draft", "Closed"] as const;

const statusBadgeTone: Record<string, Tone> = {
  Active: "good",
  Draft: "warning",
  Closed: "critical"
};

const formatIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  PDF: FileDown,
  Audio: Volume2,
  Video: Video,
  Doc: FileText,
  Link: Link
};

// Detects the resource format from a file's extension, so the admin never has
// to pick it (or the size) by hand — both come straight from the chosen file.
const detectFormat = (fileName: string): string => {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return "PDF";
  if (["mp3", "wav", "m4a", "aac", "ogg"].includes(ext)) return "Audio";
  if (["mp4", "mov", "avi", "mkv", "webm"].includes(ext)) return "Video";
  if (["doc", "docx", "txt", "rtf", "odt", "ppt", "pptx"].includes(ext)) return "Doc";
  return "Doc";
};

// Bytes → MB, rounded to 2 decimals (min 0.01 so a tiny file never reads 0).
const bytesToMB = (bytes: number): number =>
  Math.max(0.01, Math.round((bytes / 1024 / 1024) * 100) / 100);

export default function KnowledgebasePage() {
  const [resources, setResources] = useState(INITIAL_RESOURCES);
  const [categories, setCategories] = useState(INITIAL_CATEGORIES);
  const [categoryIds, setCategoryIds] = useState<Record<string, string>>({});

  const [showCategoriesModal, setShowCategoriesModal] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");

  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000/api";

  // Fetch categories on mount
  useEffect(() => {
    fetch(`${apiBase}/categories?type=KNOWLEDGEBASE`)
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

  // Fetch resources on mount
  useEffect(() => {
    fetch(`${apiBase}/lms-data/knowledgebase`)
      .then(res => res.json())
      .then((data: any[]) => {
        setResources(data);
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
  const [formatFilter, setFormatFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [sortBy, setSortBy] = useState("downloads-desc");

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedResource, setSelectedResource] = useState<typeof INITIAL_RESOURCES[0] | null>(null);

  // Add/Edit form fields
  const [formTitle, setFormTitle] = useState("");
  const [formCourseCode, setFormCourseCode] = useState("");
  const [formCategory, setFormCategory] = useState("");
  const [formFormat, setFormFormat] = useState("PDF");
  const [formSizeMB, setFormSizeMB] = useState<number>(1.0);
  const [formDownloads, setFormDownloads] = useState<number>(0);
  const [formStatus, setFormStatus] = useState("Active");
  const [formDescription, setFormDescription] = useState("");
  const [formFile, setFormFile] = useState<File | null>(null);
  // Holds the stored file reference (edit) or the external-link URL (Link format).
  const [formFileUrl, setFormFileUrl] = useState("");
  const [formFileName, setFormFileName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // Choosing a file fills in its size and format automatically.
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setFormFile(file);
    if (file) {
      setFormSizeMB(bytesToMB(file.size));
      setFormFormat(detectFormat(file.name));
    }
  };

  // Downloads the resource (the server streams the file / redirects a link and
  // counts one view); the local count is bumped optimistically to match.
  const handleDownload = (res: typeof INITIAL_RESOURCES[0]) => {
    if (!res.fileUrl) {
      Swal.fire({ title: "No File", text: "This resource has no file attached yet.", icon: "info" });
      return;
    }
    window.open(`${apiBase}/lms-data/knowledgebase/${res.id}/download`, "_blank");
    setResources(prev => prev.map(r => (r.id === res.id ? { ...r, downloads: r.downloads + 1 } : r)));
  };

  // Reset page when filter triggers
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, courseFilter, categoryFilter, formatFilter, statusFilter, pageSize]);

  // Compute Stats
  const totalResourcesCount = resources.length;
  const totalDownloadsCount = resources.reduce((sum, r) => sum + r.downloads, 0);
  const totalStorageMB = Math.round(resources.reduce((sum, r) => sum + r.sizeMB, 0) * 10) / 10;
  const avgDownloads = totalResourcesCount > 0 ? Math.round(totalDownloadsCount / totalResourcesCount) : 0;

  // Filter & Sort Logic
  const filteredResources = resources
    .filter(res => {
      const matchesSearch = 
        res.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
        res.courseTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
        res.courseCode.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCourse = courseFilter === "All" || res.courseCode === courseFilter;
      const matchesCategory = categoryFilter === "All" || res.category === categoryFilter;
      const matchesFormat = formatFilter === "All" || res.format.toLowerCase() === formatFilter.toLowerCase();
      const matchesStatus = statusFilter === "All" || res.status === statusFilter;
      return matchesSearch && matchesCourse && matchesCategory && matchesFormat && matchesStatus;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case "title-asc":
          return a.title.localeCompare(b.title);
        case "title-desc":
          return b.title.localeCompare(a.title);
        case "downloads-desc":
          return b.downloads - a.downloads;
        case "size-desc":
          return b.sizeMB - a.sizeMB;
        case "students-desc":
          return b.studentsCount - a.studentsCount;
        default:
          return 0;
      }
    });

  // Pagination Bounds
  const totalItems = filteredResources.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedResources = filteredResources.slice(startIndex, startIndex + pageSize);

  // CRUD handlers
  const handleDelete = (id: string, name: string) => {
    Swal.fire({
      title: "Delete Resource?",
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
        fetch(`${apiBase}/lms-data/knowledgebase/${id}`, { method: "DELETE", headers: authHeader() })
          .then(() => {
            setResources(prev => prev.filter(r => r.id !== id));
            Swal.fire({
              title: "Deleted!",
              text: "The resource has been deleted from the knowledgebase.",
              icon: "success",
              background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff"
            });
          })
          .catch(err => {
            Swal.fire({ title: "Error", text: "Could not delete resource.", icon: "error" });
          });
      }
    });
  };

  const handleOpenAddModal = () => {
    setFormTitle("");
    setFormCourseCode(availableCourses[0]?.code || "");
    setFormCategory(categories[0] || "");
    setFormFormat("PDF");
    setFormSizeMB(0);
    setFormDownloads(0);
    setFormStatus("Active");
    setFormDescription("");
    setFormFile(null);
    setFormFileUrl("");
    setFormFileName(null);
    setShowAddModal(true);
  };

  // Uploads the chosen file and returns its stored reference + real size.
  const uploadFile = async (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`${apiBase}/lms-data/knowledgebase/upload`, {
      method: "POST",
      headers: authHeader(),
      body: fd,
    });
    if (!res.ok) throw new Error("Upload failed");
    return res.json() as Promise<{ fileUrl: string; fileName: string; sizeMB: number }>;
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle) {
      Swal.fire({ title: "Fields Required", text: "Please enter a resource title.", icon: "error" });
      return;
    }
    if (!formCategory) {
      Swal.fire({ title: "Category Required", text: "Please select or add a category first using 'Manage Categories'.", icon: "error" });
      return;
    }
    // A link needs a URL; every other format needs an actual file.
    if (formFormat === "Link") {
      if (!formFileUrl.trim() || !/^https?:\/\//i.test(formFileUrl.trim())) {
        Swal.fire({ title: "URL Required", text: "Please enter a valid link starting with http:// or https://", icon: "error" });
        return;
      }
    } else if (!formFile) {
      Swal.fire({ title: "File Required", text: "Please choose a file to upload for this resource.", icon: "error" });
      return;
    }

    const courseObj = availableCourses.find(c => c.code === formCourseCode) || {
      code: formCourseCode,
      title: "Unknown Course",
      studentsCount: 0
    };

    try {
      // Resolve the file reference: upload for files, the raw URL for links.
      let fileUrl = formFormat === "Link" ? formFileUrl.trim() : "";
      let fileName: string | null = null;
      let sizeMB = formFormat === "Link" ? 0 : Number(formSizeMB) || 0;

      if (formFormat !== "Link" && formFile) {
        setUploading(true);
        const meta = await uploadFile(formFile);
        fileUrl = meta.fileUrl;
        fileName = meta.fileName;
        sizeMB = meta.sizeMB;
      }

      // downloads is a tracked metric — it starts at 0 and is set by the server.
      const newResource = {
        title: formTitle,
        courseCode: courseObj.code,
        courseTitle: courseObj.title,
        format: formFormat,
        sizeMB,
        category: formCategory,
        status: formStatus,
        description: formDescription || "No description provided.",
        fileUrl,
        fileName,
      };

      const res = await fetch(`${apiBase}/lms-data/knowledgebase`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify(newResource),
      });
      if (!res.ok) throw new Error("Save failed");
      const savedResource = await res.json();
      setResources([savedResource, ...resources]);
      setShowAddModal(false);
      Swal.fire({
        title: "Added",
        text: "New resource successfully added to the knowledgebase!",
        icon: "success",
        background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff"
      });
    } catch {
      Swal.fire({ title: "Error", text: "Could not upload or save the resource.", icon: "error" });
    } finally {
      setUploading(false);
    }
  };

  const handleOpenEditModal = (res: typeof INITIAL_RESOURCES[0]) => {
    setSelectedResource(res);
    setFormTitle(res.title);
    setFormCourseCode(res.courseCode);
    setFormCategory(res.category || categories[0] || "");
    setFormFormat(res.format);
    setFormSizeMB(res.sizeMB);
    setFormDownloads(res.downloads);
    setFormStatus(res.status);
    setFormDescription(res.description);
    setFormFile(null);
    setFormFileUrl(res.fileUrl ?? "");
    setFormFileName(res.fileName ?? null);
    setShowEditModal(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedResource) return;
    if (!formTitle) {
      Swal.fire({ title: "Fields Required", text: "Please enter a resource title.", icon: "error" });
      return;
    }
    if (formFormat === "Link" && (!formFileUrl.trim() || !/^https?:\/\//i.test(formFileUrl.trim()))) {
      Swal.fire({ title: "URL Required", text: "Please enter a valid link starting with http:// or https://", icon: "error" });
      return;
    }

    const courseObj = availableCourses.find(c => c.code === formCourseCode) || {
      code: formCourseCode,
      title: "Unknown Course",
      studentsCount: 0
    };

    try {
      // Keep the existing file unless a new one is picked; links use their URL.
      let fileUrl = formFormat === "Link" ? formFileUrl.trim() : formFileUrl;
      let fileName = formFileName;
      let sizeMB = formFormat === "Link" ? 0 : Number(formSizeMB) || 0;

      if (formFormat !== "Link" && formFile) {
        setUploading(true);
        const meta = await uploadFile(formFile);
        fileUrl = meta.fileUrl;
        fileName = meta.fileName;
        sizeMB = meta.sizeMB;
      }

      // downloads is intentionally omitted — the server preserves the tracked count.
      const updatedPayload = {
        title: formTitle,
        courseCode: courseObj.code,
        courseTitle: courseObj.title,
        format: formFormat,
        sizeMB,
        category: formCategory,
        status: formStatus,
        description: formDescription || "No description provided.",
        fileUrl,
        fileName,
      };

      const res = await fetch(`${apiBase}/lms-data/knowledgebase/${selectedResource.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify(updatedPayload),
      });
      if (!res.ok) throw new Error("Update failed");
      const updatedResource = await res.json();
      setResources(prev => prev.map(r => r.id === updatedResource.id ? updatedResource : r));
      setShowEditModal(false);
      Swal.fire({
        title: "Updated",
        text: "Resource details updated successfully!",
        icon: "success",
        background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff"
      });
    } catch {
      Swal.fire({ title: "Error", text: "Could not upload or update the resource.", icon: "error" });
    } finally {
      setUploading(false);
    }
  };


  const handleOpenViewDetails = (res: typeof INITIAL_RESOURCES[0]) => {
    setSelectedResource(res);
    Swal.fire({
      title: `<span class="text-lg font-bold">${res.title}</span>`,
      html: `
        <div class="text-left mt-3 text-sm space-y-2">
          <p><strong>Category:</strong> ${res.category || "General"}</p>
          <p><strong>Associated Course:</strong> ${res.courseTitle} (${res.courseCode})</p>
          <p><strong>Students in Course:</strong> ${res.studentsCount} Students</p>
          <p><strong>File Format:</strong> ${res.format}</p>
          <p><strong>File Size:</strong> ${res.sizeMB} MB</p>
          <p><strong>Downloads/Views count:</strong> ${res.downloads}</p>
          <p><strong>Status:</strong> ${res.status}</p>
          <p class="mt-4 border-t pt-2 text-ink-2"><strong>Resource Description:</strong></p>
          <p class="text-xs text-ink-3 italic bg-surface-2 p-2.5 rounded-lg border">${res.description}</p>
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
      <Topbar title="Knowledgebase Dashboard" subtitle="Manage and distribute digital syllabus textbooks, audio resources, and guides" />
      
      <div className="animate-fade-up p-4 sm:p-6 space-y-6">
        
        {/* Statistics section */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Card className="hover:scale-[1.01] transition-transform duration-200">
            <CardBody className="flex items-center gap-4 py-5">
              <span className="grid size-12 place-items-center rounded-xl bg-accent/10 text-accent">
                <FileText className="size-6" />
              </span>
              <div>
                <p className="text-2xl font-bold tracking-tight text-ink">{totalResourcesCount}</p>
                <p className="text-xs font-semibold text-ink-3">Total Resources</p>
              </div>
            </CardBody>
          </Card>
          
          <Card className="hover:scale-[1.01] transition-transform duration-200">
            <CardBody className="flex items-center gap-4 py-5">
              <span className="grid size-12 place-items-center rounded-xl bg-emerald-500/10 text-emerald-500">
                <Download className="size-6" />
              </span>
              <div>
                <p className="text-2xl font-bold tracking-tight text-ink">{totalDownloadsCount}</p>
                <p className="text-xs font-semibold text-ink-3">Downloads / Views</p>
              </div>
            </CardBody>
          </Card>

          <Card className="hover:scale-[1.01] transition-transform duration-200">
            <CardBody className="flex items-center gap-4 py-5">
              <span className="grid size-12 place-items-center rounded-xl bg-amber-500/10 text-amber-500">
                <Database className="size-6" />
              </span>
              <div>
                <p className="text-2xl font-bold tracking-tight text-ink">{totalStorageMB} MB</p>
                <p className="text-xs font-semibold text-ink-3">Storage Consumed</p>
              </div>
            </CardBody>
          </Card>

          <Card className="hover:scale-[1.01] transition-transform duration-200">
            <CardBody className="flex items-center gap-4 py-5">
              <span className="grid size-12 place-items-center rounded-xl bg-violet-500/10 text-violet-500">
                <Sparkles className="size-6" />
              </span>
              <div>
                <p className="text-2xl font-bold tracking-tight text-ink">{avgDownloads}</p>
                <p className="text-xs font-semibold text-ink-3">Avg Downloads/Resource</p>
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
                  placeholder="Search resources or courses..."
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

                {/* Format Filter */}
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-ink-3">Format:</span>
                  <select
                    value={formatFilter}
                    onChange={(e) => setFormatFilter(e.target.value)}
                    className="h-9 rounded-xl border border-hairline bg-surface px-2.5 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                  >
                    {FORMATS.map(f => (
                      <option key={f} value={f}>{f}</option>
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
                    <option value="downloads-desc">Views/Downloads (High to Low)</option>
                    <option value="title-asc">Title (A-Z)</option>
                    <option value="title-desc">Title (Z-A)</option>
                    <option value="size-desc">File Size (High to Low)</option>
                    <option value="students-desc">Course Students (High to Low)</option>
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

                {/* Add resource button */}
                <Button 
                  variant="primary" 
                  size="md" 
                  onClick={handleOpenAddModal} 
                  className="rounded-xl flex items-center gap-2"
                >
                  <Plus className="size-4" />
                  <span>Add Resource</span>
                </Button>
              </div>
            </div>

            {/* Resources Table Grid */}
            <div className="overflow-x-auto border border-hairline rounded-xl">
              <table className="w-full border-collapse text-left text-sm text-ink-2">
                <thead className="bg-surface-2 text-xs font-bold text-ink-3 uppercase border-b border-hairline">
                  <tr>
                    <th scope="col" className="px-6 py-4">Resource Detail</th>
                    <th scope="col" className="px-6 py-4">Course Name (Code) & Students Count</th>
                    <th scope="col" className="px-6 py-4">File Format & Size</th>
                    <th scope="col" className="px-6 py-4">Downloads/Views</th>
                    <th scope="col" className="px-6 py-4">Status</th>
                    <th scope="col" className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline bg-surface">
                  {paginatedResources.length > 0 ? (
                    paginatedResources.map((res) => {
                      const FormatIcon = formatIcons[res.format] || FileText;

                      return (
                        <tr 
                          key={res.id} 
                          className="hover:bg-surface-2/60 transition-colors"
                        >
                          <td className="px-6 py-4 max-w-xs">
                            <div className="font-semibold text-ink">{res.title}</div>
                            <div className="mt-1">
                              <Badge tone="neutral" className="text-[10px] py-0 px-1.5 font-bold uppercase tracking-wider">
                                {res.category || "General"}
                              </Badge>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="font-semibold text-ink flex items-center gap-1.5">
                              <BookOpen className="size-3.5 text-accent" />
                              {res.courseTitle}
                            </div>
                            <div className="text-xs text-ink-3 font-semibold mt-1 flex items-center gap-2">
                              <span className="font-mono bg-surface-3 px-1 py-0.5 rounded text-[10px] border border-hairline">{res.courseCode}</span>
                              <span className="flex items-center gap-1 text-[11px]"><Users className="size-3 text-emerald-500/80" /> {res.studentsCount} Students in Course</span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2 text-xs font-bold text-ink">
                              <FormatIcon className="size-4 text-accent" />
                              <span>{res.format} Format</span>
                            </div>
                            <div className="text-xs text-ink-3 font-semibold mt-1">
                              {res.sizeMB} MB
                            </div>
                          </td>
                          <td className="px-6 py-4 font-mono font-bold text-ink text-xs">
                            <span className="bg-surface-2 border border-hairline rounded px-2.5 py-1">
                              {res.downloads} views
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <Badge tone={statusBadgeTone[res.status] || "neutral"}>
                              {res.status}
                            </Badge>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex justify-end gap-1.5">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDownload(res)}
                                disabled={!res.fileUrl}
                                className="rounded-lg text-ink-3 hover:text-emerald-500 hover:bg-surface-3 size-8 disabled:opacity-30 disabled:cursor-not-allowed"
                                title={res.fileUrl ? "Download / Open" : "No file attached"}
                              >
                                <Download className="size-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleOpenViewDetails(res)}
                                className="rounded-lg text-ink-3 hover:text-ink hover:bg-surface-3 size-8"
                                title="View Details"
                              >
                                <Info className="size-4.5" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                onClick={() => handleOpenEditModal(res)}
                                className="rounded-lg text-ink-3 hover:text-accent hover:bg-surface-3 size-8"
                                title="Edit Resource"
                              >
                                <Edit2 className="size-4" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                onClick={() => handleDelete(res.id, res.title)}
                                className="rounded-lg text-ink-3 hover:text-critical hover:bg-surface-3 size-8"
                                title="Delete Resource"
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
                          <p className="font-semibold text-sm">No knowledgebase resources matched the search parameters.</p>
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
                <span>of {totalItems} filtered resources</span>
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

      {/* Add Resource Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-[2px]">
          <div className="relative w-full max-w-lg rounded-2xl border border-hairline bg-surface shadow-2xl overflow-hidden animate-fade-in text-ink">
            <header className="flex items-center justify-between border-b border-hairline px-6 py-4">
              <h3 className="text-base font-bold text-ink">Add Knowledgebase Resource</h3>
              <button 
                onClick={() => setShowAddModal(false)}
                className="rounded-lg p-1 text-ink-3 hover:bg-surface-2 hover:text-ink"
              >
                <X className="size-5" />
              </button>
            </header>
            
            <form onSubmit={handleAddSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-ink-3 uppercase mb-1">Resource Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Chapter 1 PDF Handout"
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
                  <label className="block text-xs font-bold text-ink-3 uppercase mb-1">File Format</label>
                  <select
                    value={formFormat}
                    onChange={(e) => setFormFormat(e.target.value)}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                  >
                    <option value="PDF">PDF Document</option>
                    <option value="Audio">Audio Guide (MP3)</option>
                    <option value="Video">Video Guide (MP4)</option>
                    <option value="Doc">Word Document</option>
                    <option value="Link">External Link</option>
                  </select>
                </div>
              </div>

              {/* File — size and format come straight from the chosen file, so
                  the admin never guesses them. External links carry no file. */}
              {formFormat === "Link" ? (
                <div>
                  <label className="block text-xs font-bold text-ink-3 uppercase mb-1">External Link URL</label>
                  <input
                    type="url"
                    placeholder="https://example.com/resource"
                    value={formFileUrl}
                    onChange={(e) => setFormFileUrl(e.target.value)}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-ink-3 uppercase mb-1">Upload File</label>
                    <input
                      type="file"
                      onChange={handleFileChange}
                      className="w-full rounded-xl border border-hairline bg-surface-2 px-3 py-2 text-sm text-ink file:mr-3 file:rounded-lg file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-accent-ink focus:outline-none focus:ring-2 focus:ring-accent"
                    />
                    {formFile && (
                      <p className="mt-1 text-[11px] font-semibold text-ink-3 truncate">{formFile.name}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-ink-3 uppercase mb-1">File Size · auto</label>
                    <input
                      type="text"
                      readOnly
                      value={formSizeMB ? `${formSizeMB} MB` : "— pick a file —"}
                      className="h-10 w-full rounded-xl border border-hairline bg-surface-3/60 px-3.5 text-sm text-ink-3 cursor-not-allowed focus:outline-none"
                    />
                  </div>
                </div>
              )}

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

              <div>
                <label className="block text-xs font-bold text-ink-3 uppercase mb-1">Description / File Meta</label>
                <textarea
                  placeholder="Enter details on the resource content..."
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
                <Button type="submit" variant="primary" disabled={uploading}>
                  {uploading ? "Uploading..." : "Upload Resource"}
                </Button>
              </footer>
            </form>
          </div>
        </div>
      )}

      {/* Edit Resource Modal */}
      {showEditModal && selectedResource && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-[2px]">
          <div className="relative w-full max-w-lg rounded-2xl border border-hairline bg-surface shadow-2xl overflow-hidden animate-fade-in text-ink">
            <header className="flex items-center justify-between border-b border-hairline px-6 py-4">
              <h3 className="text-base font-bold text-ink">Edit Knowledgebase Resource</h3>
              <button 
                onClick={() => setShowEditModal(false)}
                className="rounded-lg p-1 text-ink-3 hover:bg-surface-2 hover:text-ink"
              >
                <X className="size-5" />
              </button>
            </header>
            
            <form onSubmit={handleEditSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-ink-3 uppercase mb-1">Resource Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Chapter 1 PDF Handout"
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
                  <label className="block text-xs font-bold text-ink-3 uppercase mb-1">File Format</label>
                  <select
                    value={formFormat}
                    onChange={(e) => setFormFormat(e.target.value)}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                  >
                    <option value="PDF">PDF Document</option>
                    <option value="Audio">Audio Guide (MP3)</option>
                    <option value="Video">Video Guide (MP4)</option>
                    <option value="Doc">Word Document</option>
                    <option value="Link">External Link</option>
                  </select>
                </div>
              </div>

              {/* Replacing the file re-derives size + format; leave it empty to
                  keep the current file. Downloads is read-only — it is tracked. */}
              {formFormat === "Link" ? (
                <div>
                  <label className="block text-xs font-bold text-ink-3 uppercase mb-1">External Link URL</label>
                  <input
                    type="url"
                    placeholder="https://example.com/resource"
                    value={formFileUrl}
                    onChange={(e) => setFormFileUrl(e.target.value)}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-ink-3 uppercase mb-1">Replace File (optional)</label>
                    <input
                      type="file"
                      onChange={handleFileChange}
                      className="w-full rounded-xl border border-hairline bg-surface-2 px-3 py-2 text-sm text-ink file:mr-3 file:rounded-lg file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-accent-ink focus:outline-none focus:ring-2 focus:ring-accent"
                    />
                    {formFile ? (
                      <p className="mt-1 text-[11px] font-semibold text-ink-3 truncate">{formFile.name}</p>
                    ) : formFileName ? (
                      <p className="mt-1 text-[11px] font-semibold text-ink-3 truncate">Current: {formFileName}</p>
                    ) : null}
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-ink-3 uppercase mb-1">File Size · auto</label>
                    <input
                      type="text"
                      readOnly
                      value={formSizeMB ? `${formSizeMB} MB` : "—"}
                      className="h-10 w-full rounded-xl border border-hairline bg-surface-3/60 px-3.5 text-sm text-ink-3 cursor-not-allowed focus:outline-none"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-ink-3 uppercase mb-1">Downloads / Views · tracked</label>
                <input
                  type="text"
                  readOnly
                  value={`${formDownloads} downloads`}
                  className="h-10 w-full rounded-xl border border-hairline bg-surface-3/60 px-3.5 text-sm text-ink-3 cursor-not-allowed focus:outline-none"
                />
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

              <div>
                <label className="block text-xs font-bold text-ink-3 uppercase mb-1">Description / File Meta</label>
                <textarea
                  placeholder="Enter details on the resource content..."
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
                <Button type="submit" variant="primary" disabled={uploading}>
                  {uploading ? "Uploading..." : "Save Changes"}
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
                      body: JSON.stringify({ name: trimmed, type: "KNOWLEDGEBASE" }),
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
                    const usageCount = resources.filter(r => r.category === cat).length;

                    return (
                      <div key={cat} className="flex items-center justify-between px-4 py-2.5 text-sm">
                        <span className="font-semibold text-ink flex items-center gap-2">
                          <span className="size-2 rounded-full bg-accent" />
                          {cat}
                          <span className="text-[10px] text-ink-3 font-bold bg-surface-2 px-1.5 py-0.5 rounded-md border border-hairline">
                            {usageCount} {usageCount === 1 ? "resource" : "resources"}
                          </span>
                        </span>
                        
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            if (usageCount > 0) {
                              Swal.fire({
                                title: "Cannot Delete",
                                text: `Category "${cat}" is in use by ${usageCount} resource(s). Please delete or reassign those first.`,
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
