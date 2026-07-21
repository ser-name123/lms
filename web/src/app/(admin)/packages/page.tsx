"use client";

import { authHeader, bulkDeletePackages } from "@/lib/api";

import { useState, useEffect, useCallback } from "react";
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
  DollarSign,
  Layers,
  Award,
  PlusCircle,
  MinusCircle,
  CheckCircle2,
  CalendarDays
} from "lucide-react";
import Swal from "sweetalert2";

import { Topbar } from "@/components/layout/topbar";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { useBulkSelect, SelectAllBox, SelectBox, BulkBar } from "@/components/ui/bulk-select";
import { cn } from "@/lib/utils";

// Initial Mock Packages Data (30 items with dynamic feature benefits lists and linked courses)
const INITIAL_PACKAGES: any[] = [];

const BILLING_CYCLES = ["All", "Monthly", "Quarterly", "Yearly", "One-time"] as const;
const TARGET_LEVELS = ["All", "Kids", "Adults", "All Levels"] as const;
const STATUSES = ["All", "Active", "Draft", "Inactive"] as const;

const statusBadgeTone: Record<string, Tone> = {
  Active: "good",
  Draft: "warning",
  Inactive: "critical"
};

export default function PackagesPage() {
  const [packages, setPackages] = useState(INITIAL_PACKAGES);

  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000/api";

  const [availableCourses, setAvailableCourses] = useState<any[]>([]);

  const loadPackages = useCallback(() => {
    fetch(`${apiBase}/lms-data/packages`)
      .then(res => res.json())
      .then((data: any[]) => {
        setPackages(data);
      })
      .catch(console.error);
  }, [apiBase]);

  // Fetch packages on mount
  useEffect(() => {
    loadPackages();

    fetch(`${apiBase}/lms-data/courses`)
      .then(res => res.json())
      .then((data: any[]) => {
        setAvailableCourses(data);
      })
      .catch(console.error);
  }, [apiBase, loadPackages]);

  // Filters, sorting, and pagination
  const [searchQuery, setSearchQuery] = useState("");
  const [billingFilter, setBillingFilter] = useState("All");
  const [levelFilter, setLevelFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [sortBy, setSortBy] = useState("price-desc");

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<typeof INITIAL_PACKAGES[0] | null>(null);

  // Add/Edit form fields
  const [formTitle, setFormTitle] = useState("");
  const [formPrice, setFormPrice] = useState<number>(29);
  const [formBilling, setFormBilling] = useState("Monthly");
  const [formLevel, setFormLevel] = useState("All");
  const [formCourses, setFormCourses] = useState<string[]>([]);
  const [formFeatures, setFormFeatures] = useState<string[]>([]);
  const [newFeatureText, setNewFeatureText] = useState("");
  const [formStatus, setFormStatus] = useState("Active");
  const [formDescription, setFormDescription] = useState("");

  // Reset page when filter triggers
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, billingFilter, levelFilter, statusFilter, pageSize]);

  // Compute Stats
  const totalPackagesCount = packages.length;
  const activePackagesCount = packages.filter(p => p.status === "Active").length;
  const avgPackagePrice = totalPackagesCount > 0 
    ? Math.round(packages.reduce((sum, p) => sum + p.price, 0) / totalPackagesCount) 
    : 0;
  const kidsAudienceCount = packages.filter(p => p.level === "Kids").length;

  // Filter & Sort Logic
  const filteredPackages = packages
    .filter(pkg => {
      const matchesSearch = 
        pkg.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
        pkg.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        pkg.features.some((f: any) => f.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesBilling = billingFilter === "All" || pkg.billing === billingFilter;
      
      let matchesLevel = true;
      if (levelFilter !== "All") {
        if (levelFilter === "All Levels") {
          matchesLevel = pkg.level === "All";
        } else {
          matchesLevel = pkg.level === levelFilter;
        }
      }

      const matchesStatus = statusFilter === "All" || pkg.status === statusFilter;
      return matchesSearch && matchesBilling && matchesLevel && matchesStatus;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case "price-desc":
          return b.price - a.price;
        case "price-asc":
          return a.price - b.price;
        case "title-asc":
          return a.title.localeCompare(b.title);
        case "title-desc":
          return b.title.localeCompare(a.title);
        case "courses-desc":
          return b.courses.length - a.courses.length;
        case "features-desc":
          return b.features.length - a.features.length;
        default:
          return 0;
      }
    });

  // Pagination Bounds
  const totalItems = filteredPackages.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedPackages = filteredPackages.slice(startIndex, startIndex + pageSize);

  const { selected, ids, toggle, toggleAll, allShown, clear, busy, confirmAndDelete } =
    useBulkSelect(paginatedPackages);

  // CRUD handlers
  const handleDelete = (id: string, name: string) => {
    Swal.fire({
      title: "Delete Package?",
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
        fetch(`${apiBase}/lms-data/packages/${id}`, { method: "DELETE", headers: authHeader() })
          .then(() => {
            setPackages(prev => prev.filter(p => p.id !== id));
            Swal.fire({
              title: "Deleted!",
              text: "The subscription package has been deleted.",
              icon: "success",
              background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff"
            });
          })
          .catch(err => {
            Swal.fire({ title: "Error", text: "Could not delete package.", icon: "error" });
          });
      }
    });
  };

  const handleOpenAddModal = () => {
    setFormTitle("");
    setFormPrice(29);
    setFormBilling("Monthly");
    setFormLevel("All");
    setFormCourses([]);
    setFormFeatures(["Course Access included", "Email support", "Completion Certificate"]);
    setNewFeatureText("");
    setFormStatus("Active");
    setFormDescription("");
    setShowAddModal(true);
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle || formPrice < 0) {
      Swal.fire({ title: "Fields Required", text: "Please enter a package title and valid price.", icon: "error" });
      return;
    }

    const newPkg = {
      title: formTitle,
      price: Number(formPrice) || 0,
      billing: formBilling,
      level: formLevel,
      courses: formCourses,
      features: formFeatures.length > 0 ? formFeatures : ["General Access"],
      status: formStatus,
      description: formDescription || "No description provided."
    };

    fetch(`${apiBase}/lms-data/packages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body: JSON.stringify(newPkg),
    })
      .then(res => res.json())
      .then(savedPkg => {
        setPackages([savedPkg, ...packages]);
        setShowAddModal(false);
        Swal.fire({
          title: "Created",
          text: "New subscription package published successfully!",
          icon: "success",
          background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff"
        });
      })
      .catch(err => {
        Swal.fire({ title: "Error", text: "Could not save package.", icon: "error" });
      });
  };

  const handleOpenEditModal = (pkg: typeof INITIAL_PACKAGES[0]) => {
    setSelectedPackage(pkg);
    setFormTitle(pkg.title);
    setFormPrice(pkg.price);
    setFormBilling(pkg.billing);
    setFormLevel(pkg.level);
    setFormCourses(pkg.courses);
    setFormFeatures(pkg.features);
    setNewFeatureText("");
    setFormStatus(pkg.status);
    setFormDescription(pkg.description);
    setShowEditModal(true);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPackage) return;
    if (!formTitle || formPrice < 0) {
      Swal.fire({ title: "Fields Required", text: "Please enter a package title and valid price.", icon: "error" });
      return;
    }

    const updatedPayload = {
      title: formTitle,
      price: Number(formPrice) || 0,
      billing: formBilling,
      level: formLevel,
      courses: formCourses,
      features: formFeatures.length > 0 ? formFeatures : ["General Access"],
      status: formStatus,
      description: formDescription || "No description provided."
    };

    fetch(`${apiBase}/lms-data/packages/${selectedPackage.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body: JSON.stringify(updatedPayload),
    })
      .then(res => res.json())
      .then(updatedPkg => {
        setPackages(prev => prev.map(p => p.id === updatedPkg.id ? updatedPkg : p));
        setShowEditModal(false);
        Swal.fire({
          title: "Updated",
          text: "Package updates saved successfully!",
          icon: "success",
          background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff"
        });
      })
      .catch(err => {
        Swal.fire({ title: "Error", text: "Could not update package.", icon: "error" });
      });
  };

  const handleCourseToggle = (code: string) => {
    setFormCourses(prev => 
      prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]
    );
  };

  const handleAddFeature = () => {
    const trimmed = newFeatureText.trim();
    if (!trimmed) return;
    if (formFeatures.includes(trimmed)) {
      Swal.fire({ title: "Feature Exists", text: "This feature benefit is already in the list.", icon: "warning" });
      return;
    }
    setFormFeatures([...formFeatures, trimmed]);
    setNewFeatureText("");
  };

  const handleRemoveFeature = (idx: number) => {
    setFormFeatures(formFeatures.filter((_, i) => i !== idx));
  };

  const handleOpenViewDetails = (pkg: typeof INITIAL_PACKAGES[0]) => {
    setSelectedPackage(pkg);
    const coursesStr = pkg.courses.length > 0 
      ? pkg.courses.map((c: any) => `<span class="bg-surface-3 border border-hairline font-mono rounded px-1.5 py-0.5 text-xs text-ink font-semibold">${c}</span>`).join(" ") 
      : `<span class="text-xs text-ink-3 italic">No courses restricted to this package</span>`;
    
    const featuresStr = pkg.features.map((f: any) => `<li class="flex items-start gap-1.5 text-xs text-ink-2"><span class="text-emerald-500 font-bold">✓</span> <span>${f}</span></li>`).join("");

    Swal.fire({
      title: `<span class="text-lg font-bold">${pkg.title}</span>`,
      html: `
        <div class="text-left mt-3 text-sm space-y-3.5">
          <div class="flex items-center justify-between border-b pb-2">
            <strong>Pricing Tier:</strong> 
            <span class="text-emerald-500 font-bold text-base">$${pkg.price} / ${pkg.billing}</span>
          </div>
          <p><strong>Audience Level:</strong> ${pkg.level === "All" ? "All Levels" : pkg.level}</p>
          <p><strong>Status:</strong> ${pkg.status}</p>
          
          <div class="border-t pt-2">
            <p class="text-ink-2 font-bold mb-1.5"><strong>Included Courses:</strong></p>
            <div class="flex flex-wrap gap-1.5">${coursesStr}</div>
          </div>
          
          <div class="border-t pt-2">
            <p class="text-ink-2 font-bold mb-1.5"><strong>Package Benefits / Features:</strong></p>
            <ul class="space-y-1">${featuresStr}</ul>
          </div>
          
          <div class="border-t pt-2">
            <p class="text-ink-2 font-bold mb-1"><strong>Description:</strong></p>
            <p class="text-xs text-ink-3 italic bg-surface-2 p-2.5 rounded-lg border">${pkg.description}</p>
          </div>
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
      <Topbar title="Membership Packages" subtitle="Create pricing bundles, manage subscriptions plans, and define benefit items" />
      
      <div className="animate-fade-up p-4 sm:p-6 space-y-6">
        
        {/* Statistics section */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Card className="hover:scale-[1.01] transition-transform duration-200">
            <CardBody className="flex items-center gap-4 py-5">
              <span className="grid size-12 place-items-center rounded-xl bg-accent/10 text-accent">
                <Layers className="size-6" />
              </span>
              <div>
                <p className="text-2xl font-bold tracking-tight text-ink">{totalPackagesCount}</p>
                <p className="text-xs font-semibold text-ink-3">Total Packages</p>
              </div>
            </CardBody>
          </Card>
          
          <Card className="hover:scale-[1.01] transition-transform duration-200">
            <CardBody className="flex items-center gap-4 py-5">
              <span className="grid size-12 place-items-center rounded-xl bg-emerald-500/10 text-emerald-500">
                <CheckCircle2 className="size-6" />
              </span>
              <div>
                <p className="text-2xl font-bold tracking-tight text-ink">{activePackagesCount}</p>
                <p className="text-xs font-semibold text-ink-3">Active Pricing Tiers</p>
              </div>
            </CardBody>
          </Card>

          <Card className="hover:scale-[1.01] transition-transform duration-200">
            <CardBody className="flex items-center gap-4 py-5">
              <span className="grid size-12 place-items-center rounded-xl bg-amber-500/10 text-amber-500">
                <DollarSign className="size-6" />
              </span>
              <div>
                <p className="text-2xl font-bold tracking-tight text-ink">${avgPackagePrice}</p>
                <p className="text-xs font-semibold text-ink-3">Average Bundle Price</p>
              </div>
            </CardBody>
          </Card>

          <Card className="hover:scale-[1.01] transition-transform duration-200">
            <CardBody className="flex items-center gap-4 py-5">
              <span className="grid size-12 place-items-center rounded-xl bg-violet-500/10 text-violet-500">
                <Award className="size-6" />
              </span>
              <div>
                <p className="text-2xl font-bold tracking-tight text-ink">{kidsAudienceCount}</p>
                <p className="text-xs font-semibold text-ink-3">Kids Bundles</p>
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
                  placeholder="Search packages or features..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-10 w-full rounded-xl border border-hairline bg-surface-2 pr-4 pl-10 text-sm text-ink placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-accent focus:bg-surface-3 transition-all"
                />
              </div>

              {/* Filters */}
              <div className="flex flex-wrap items-center gap-2">
                
                {/* Billing Filter */}
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-ink-3 flex items-center gap-1"><Filter className="size-3" /> Cycle:</span>
                  <select
                    value={billingFilter}
                    onChange={(e) => setBillingFilter(e.target.value)}
                    className="h-9 rounded-xl border border-hairline bg-surface px-2.5 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                  >
                    {BILLING_CYCLES.map(b => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </div>

                {/* Level Filter */}
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-ink-3">Audience:</span>
                  <select
                    value={levelFilter}
                    onChange={(e) => setLevelFilter(e.target.value)}
                    className="h-9 rounded-xl border border-hairline bg-surface px-2.5 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                  >
                    {TARGET_LEVELS.map(lvl => (
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

                {/* Sort selector */}
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-ink-3 flex items-center gap-1"><ArrowUpDown className="size-3" /> Sort:</span>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="h-9 rounded-xl border border-hairline bg-surface px-2.5 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                  >
                    <option value="price-desc">Price (High to Low)</option>
                    <option value="price-asc">Price (Low to High)</option>
                    <option value="title-asc">Title (A-Z)</option>
                    <option value="title-desc">Title (Z-A)</option>
                    <option value="courses-desc">Courses count (High to Low)</option>
                    <option value="features-desc">Features count (High to Low)</option>
                  </select>
                </div>

                {/* Add package button */}
                <Button 
                  variant="primary" 
                  size="md" 
                  onClick={handleOpenAddModal} 
                  className="rounded-xl flex items-center gap-2"
                >
                  <Plus className="size-4" />
                  <span>Create Package</span>
                </Button>
              </div>
            </div>

            <BulkBar
              count={ids.length}
              busy={busy}
              onClear={clear}
              noun="package"
              onDelete={() => confirmAndDelete("package", (p) => p.title, bulkDeletePackages, loadPackages)}
            />

            {/* Packages Table Grid */}
            <div className="overflow-x-auto border border-hairline rounded-xl">
              <table className="w-full border-collapse text-left text-sm text-ink-2">
                <thead className="bg-surface-2 text-xs font-bold text-ink-3 uppercase border-b border-hairline">
                  <tr>
                    <th scope="col" className="px-6 py-4 w-10">
                      <SelectAllBox checked={allShown} onChange={toggleAll} />
                    </th>
                    <th scope="col" className="px-6 py-4">Package Title</th>
                    <th scope="col" className="px-6 py-4">Pricing Tier</th>
                    <th scope="col" className="px-6 py-4">Target Level</th>
                    <th scope="col" className="px-6 py-4">Linked Courses</th>
                    <th scope="col" className="px-6 py-4">Included Features / Benefits</th>
                    <th scope="col" className="px-6 py-4">Status</th>
                    <th scope="col" className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline bg-surface">
                  {paginatedPackages.length > 0 ? (
                    paginatedPackages.map((pkg) => {
                      return (
                        <tr
                          key={pkg.id}
                          className={cn(
                            "hover:bg-surface-2/60 transition-colors",
                            selected.has(pkg.id) && "bg-accent/5"
                          )}
                        >
                          <td className="px-6 py-4">
                            <SelectBox
                              checked={selected.has(pkg.id)}
                              onChange={() => toggle(pkg.id)}
                              label={pkg.title}
                            />
                          </td>
                          <td className="px-6 py-4 max-w-xs">
                            <div className="font-semibold text-ink">{pkg.title}</div>
                            <div className="text-xs text-ink-3 italic mt-1.5 truncate max-w-xs">{pkg.description}</div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-sm font-bold text-emerald-500">
                              ${pkg.price}
                            </div>
                            <div className="text-xs text-ink-3 flex items-center gap-1 mt-1 font-semibold">
                              <CalendarDays className="size-3 text-accent" /> {pkg.billing} billing
                            </div>
                          </td>
                          <td className="px-6 py-4 text-xs font-bold text-ink">
                            {pkg.level === "All" ? "All Levels" : pkg.level}
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-wrap gap-1 max-w-xs">
                              {pkg.courses.length > 0 ? (
                                pkg.courses.map((c: any) => (
                                  <span key={c} className="font-mono bg-surface-2 border border-hairline rounded text-[10px] px-1 text-ink font-semibold">
                                    {c}
                                  </span>
                                ))
                              ) : (
                                <span className="text-xs text-ink-3 italic font-semibold">None</span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 max-w-xs">
                            <div className="text-xs font-bold text-ink">
                              {pkg.features.length} Features included
                            </div>
                            <div className="text-[11px] text-ink-3 mt-1 truncate max-w-[200px]">
                              {pkg.features.join(", ")}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <Badge tone={statusBadgeTone[pkg.status] || "neutral"}>
                              {pkg.status}
                            </Badge>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex justify-end gap-1.5">
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                onClick={() => handleOpenViewDetails(pkg)}
                                className="rounded-lg text-ink-3 hover:text-ink hover:bg-surface-3 size-8"
                                title="View Details"
                              >
                                <Info className="size-4.5" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                onClick={() => handleOpenEditModal(pkg)}
                                className="rounded-lg text-ink-3 hover:text-accent hover:bg-surface-3 size-8"
                                title="Edit Package"
                              >
                                <Edit2 className="size-4" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                onClick={() => handleDelete(pkg.id, pkg.title)}
                                className="rounded-lg text-ink-3 hover:text-critical hover:bg-surface-3 size-8"
                                title="Delete Package"
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
                      <td colSpan={8} className="px-6 py-12 text-center text-ink-3">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <ClipboardList className="size-8 text-ink-3/60" />
                          <p className="font-semibold text-sm">No subscription packages matched the search parameters.</p>
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
                <span>of {totalItems} filtered packages</span>
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

      {/* Add Package Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-[2px]">
          <div className="relative w-full max-w-xl rounded-2xl border border-hairline bg-surface shadow-2xl overflow-hidden animate-fade-in text-ink max-h-[90vh] overflow-y-auto">
            <header className="flex items-center justify-between border-b border-hairline px-6 py-4 sticky top-0 bg-surface z-10">
              <h3 className="text-base font-bold text-ink">Create New Package</h3>
              <button 
                onClick={() => setShowAddModal(false)}
                className="rounded-lg p-1 text-ink-3 hover:bg-surface-2 hover:text-ink"
              >
                <X className="size-5" />
              </button>
            </header>
            
            <form onSubmit={handleAddSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-ink-3 uppercase mb-1">Package Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Full-Access Membership"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-ink-3 uppercase mb-1">Price ($ USD)</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={formPrice}
                    onChange={(e) => setFormPrice(Number(e.target.value))}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-ink-3 uppercase mb-1">Billing Cycle</label>
                  <select
                    value={formBilling}
                    onChange={(e) => setFormBilling(e.target.value)}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                  >
                    <option value="Monthly">Monthly</option>
                    <option value="Quarterly">Quarterly</option>
                    <option value="Yearly">Yearly</option>
                    <option value="One-time">One-time</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-ink-3 uppercase mb-1">Target Level</label>
                  <select
                    value={formLevel}
                    onChange={(e) => setFormLevel(e.target.value)}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                  >
                    <option value="All">All Levels</option>
                    <option value="Kids">Kids</option>
                    <option value="Adults">Adults</option>
                  </select>
                </div>
              </div>

              {/* Linked Courses Checklist */}
              <div>
                <label className="block text-xs font-bold text-ink-3 uppercase mb-1.5">Linked Courses (Included)</label>
                <div className="border border-hairline rounded-xl p-3 bg-surface-2 max-h-36 overflow-y-auto grid grid-cols-2 gap-2 text-xs font-semibold">
                  {availableCourses.map(course => {
                    const isChecked = formCourses.includes(course.code);
                    return (
                      <label key={course.code} className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleCourseToggle(course.code)}
                          className="rounded text-accent focus:ring-accent border-hairline size-3.5"
                        />
                        <span className="text-ink-2 truncate" title={course.title}>
                          <span className="font-mono bg-surface px-1 py-0.2 rounded mr-1.5 border border-hairline text-[10px]">{course.code}</span>
                          {course.title}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Dynamic Feature Benefits Builder */}
              <div>
                <label className="block text-xs font-bold text-ink-3 uppercase mb-1.5">Included Features & Benefits</label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    placeholder="e.g. 1-on-1 weekly session"
                    value={newFeatureText}
                    onChange={(e) => setNewFeatureText(e.target.value)}
                    className="h-10 flex-1 rounded-xl border border-hairline bg-surface-2 px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleAddFeature}
                    className="rounded-xl flex items-center gap-1.5 px-3 border border-hairline bg-surface hover:bg-surface-2"
                  >
                    <PlusCircle className="size-4 text-accent" />
                    <span>Add</span>
                  </Button>
                </div>
                
                {/* Features item list */}
                <div className="border border-hairline rounded-xl p-3 bg-surface-2 divide-y divide-hairline space-y-1.5 max-h-36 overflow-y-auto">
                  {formFeatures.length > 0 ? (
                    formFeatures.map((feat, idx) => (
                      <div key={idx} className="flex items-center justify-between text-xs py-1 first:pt-0 last:pb-0">
                        <span className="text-ink-2 font-semibold flex items-center gap-1.5">
                          <span className="text-emerald-500 font-bold text-xs">✓</span>
                          {feat}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveFeature(idx)}
                          className="text-ink-3 hover:text-critical p-0.5 rounded"
                          title="Remove feature"
                        >
                          <MinusCircle className="size-4" />
                        </button>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-ink-3 italic text-center py-2">No features added yet. Access benefits will show as General Access.</p>
                  )}
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
                  <option value="Inactive">Inactive</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-ink-3 uppercase mb-1">Description</label>
                <textarea
                  placeholder="Enter details on what the package is target at..."
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
                  Publish Package
                </Button>
              </footer>
            </form>
          </div>
        </div>
      )}

      {/* Edit Package Modal */}
      {showEditModal && selectedPackage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-[2px]">
          <div className="relative w-full max-w-xl rounded-2xl border border-hairline bg-surface shadow-2xl overflow-hidden animate-fade-in text-ink max-h-[90vh] overflow-y-auto">
            <header className="flex items-center justify-between border-b border-hairline px-6 py-4 sticky top-0 bg-surface z-10">
              <h3 className="text-base font-bold text-ink">Edit Package</h3>
              <button 
                onClick={() => setShowEditModal(false)}
                className="rounded-lg p-1 text-ink-3 hover:bg-surface-2 hover:text-ink"
              >
                <X className="size-5" />
              </button>
            </header>
            
            <form onSubmit={handleEditSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-ink-3 uppercase mb-1">Package Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Full-Access Membership"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-ink-3 uppercase mb-1">Price ($ USD)</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={formPrice}
                    onChange={(e) => setFormPrice(Number(e.target.value))}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-ink-3 uppercase mb-1">Billing Cycle</label>
                  <select
                    value={formBilling}
                    onChange={(e) => setFormBilling(e.target.value)}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                  >
                    <option value="Monthly">Monthly</option>
                    <option value="Quarterly">Quarterly</option>
                    <option value="Yearly">Yearly</option>
                    <option value="One-time">One-time</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-ink-3 uppercase mb-1">Target Level</label>
                  <select
                    value={formLevel}
                    onChange={(e) => setFormLevel(e.target.value)}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                  >
                    <option value="All">All Levels</option>
                    <option value="Kids">Kids</option>
                    <option value="Adults">Adults</option>
                  </select>
                </div>
              </div>

              {/* Linked Courses Checklist */}
              <div>
                <label className="block text-xs font-bold text-ink-3 uppercase mb-1.5">Linked Courses (Included)</label>
                <div className="border border-hairline rounded-xl p-3 bg-surface-2 max-h-36 overflow-y-auto grid grid-cols-2 gap-2 text-xs font-semibold">
                  {availableCourses.map(course => {
                    const isChecked = formCourses.includes(course.code);
                    return (
                      <label key={course.code} className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleCourseToggle(course.code)}
                          className="rounded text-accent focus:ring-accent border-hairline size-3.5"
                        />
                        <span className="text-ink-2 truncate" title={course.title}>
                          <span className="font-mono bg-surface px-1 py-0.2 rounded mr-1.5 border border-hairline text-[10px]">{course.code}</span>
                          {course.title}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Dynamic Feature Benefits Builder */}
              <div>
                <label className="block text-xs font-bold text-ink-3 uppercase mb-1.5">Included Features & Benefits</label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    placeholder="e.g. 1-on-1 weekly session"
                    value={newFeatureText}
                    onChange={(e) => setNewFeatureText(e.target.value)}
                    className="h-10 flex-1 rounded-xl border border-hairline bg-surface-2 px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleAddFeature}
                    className="rounded-xl flex items-center gap-1.5 px-3 border border-hairline bg-surface hover:bg-surface-2"
                  >
                    <PlusCircle className="size-4 text-accent" />
                    <span>Add</span>
                  </Button>
                </div>
                
                {/* Features item list */}
                <div className="border border-hairline rounded-xl p-3 bg-surface-2 divide-y divide-hairline space-y-1.5 max-h-36 overflow-y-auto">
                  {formFeatures.length > 0 ? (
                    formFeatures.map((feat, idx) => (
                      <div key={idx} className="flex items-center justify-between text-xs py-1 first:pt-0 last:pb-0">
                        <span className="text-ink-2 font-semibold flex items-center gap-1.5">
                          <span className="text-emerald-500 font-bold text-xs">✓</span>
                          {feat}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveFeature(idx)}
                          className="text-ink-3 hover:text-critical p-0.5 rounded"
                          title="Remove feature"
                        >
                          <MinusCircle className="size-4" />
                        </button>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-ink-3 italic text-center py-2">No features added yet. Access benefits will show as General Access.</p>
                  )}
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
                  <option value="Inactive">Inactive</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-ink-3 uppercase mb-1">Description</label>
                <textarea
                  placeholder="Enter details on what the package is target at..."
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
    </>
  );
}
