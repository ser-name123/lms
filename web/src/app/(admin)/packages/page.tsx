"use client";

import { authHeader, bulkDeletePackages, fetchFeePlans, type FeePlan } from "@/lib/api";
import { money, type Currency } from "@/lib/currency";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Plus,
  Search,
  Edit2,
  Trash2,
  Filter,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Layers,
  DollarSign,
  CheckCircle2,
  CalendarDays,
  SlidersHorizontal,
} from "lucide-react";
import Swal from "sweetalert2";

import { Topbar } from "@/components/layout/topbar";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { useBulkSelect, SelectAllBox, SelectBox, BulkBar } from "@/components/ui/bulk-select";
import { cn } from "@/lib/utils";
import { PlanFormModal, type SubscriptionModel } from "./plan-form-modal";
import { ModelsModal } from "./models-modal";

const STATUSES = ["All", "Active", "Draft", "Inactive"] as const;

const statusBadgeTone: Record<string, Tone> = {
  Active: "good",
  Draft: "warning",
  Inactive: "critical",
};

async function ok(res: Response) {
  if (res.ok) return res;
  const body = await res.json().catch(() => null);
  throw new Error(
    (Array.isArray(body?.message) ? body.message.join(", ") : body?.message) ||
      `Request failed (${res.status})`,
  );
}

export default function PackagesPage() {
  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000/api";

  const [packages, setPackages] = useState<any[]>([]);
  const [models, setModels] = useState<SubscriptionModel[]>([]);
  const [availableCourses, setAvailableCourses] = useState<any[]>([]);
  const [feePlans, setFeePlans] = useState<FeePlan[]>([]);

  const loadPackages = useCallback(() => {
    fetch(`${apiBase}/lms-data/packages`)
      .then((res) => res.json())
      .then((data: any[]) => setPackages(data))
      .catch(console.error);
  }, [apiBase]);

  const loadModels = useCallback(() => {
    fetch(`${apiBase}/lms-data/subscription-models`)
      .then((res) => res.json())
      .then((data: SubscriptionModel[]) => setModels(Array.isArray(data) ? data : []))
      .catch(console.error);
  }, [apiBase]);

  useEffect(() => {
    loadPackages();
    loadModels();
    fetch(`${apiBase}/lms-data/courses`)
      .then((res) => res.json())
      .then((data: any[]) => setAvailableCourses(data))
      .catch(console.error);
    fetchFeePlans({ limit: 100, active: "true" })
      .then((r) => setFeePlans(r.items))
      .catch(console.error);
  }, [apiBase, loadPackages, loadModels]);

  // Resolve a plan's model → pricing mode, so the table shows the right price.
  const modelById = useMemo(() => {
    const m = new Map<string, SubscriptionModel>();
    models.forEach((x) => m.set(x.id, x));
    return m;
  }, [models]);
  const isHourlyPlan = (pkg: any) => modelById.get(pkg.modelId)?.pricingMode === "HOURLY";

  // Filters / sort / pagination
  const [searchQuery, setSearchQuery] = useState("");
  const [modelFilter, setModelFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [sortBy, setSortBy] = useState("order");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Modals
  const [formMode, setFormMode] = useState<"add" | "edit" | null>(null);
  const [editing, setEditing] = useState<any | null>(null);
  const [showModels, setShowModels] = useState(false);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, modelFilter, statusFilter, pageSize]);

  const totalPackagesCount = packages.length;
  const activePackagesCount = packages.filter((p) => p.status === "Active").length;
  const hourlyCount = packages.filter((p) => isHourlyPlan(p)).length;
  const avgPackagePrice =
    totalPackagesCount > 0
      ? Math.round(packages.reduce((s, p) => s + (Number(p.priceUSD) || 0), 0) / totalPackagesCount)
      : 0;

  const filteredPackages = packages
    .filter((pkg) => {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        !q ||
        pkg.title?.toLowerCase().includes(q) ||
        (pkg.tier ?? "").toLowerCase().includes(q) ||
        (pkg.description ?? "").toLowerCase().includes(q) ||
        (pkg.features ?? []).some((f: string) => f.toLowerCase().includes(q));
      const matchesModel =
        modelFilter === "All" ||
        (modelFilter === "None" ? !pkg.modelId : pkg.modelId === modelFilter);
      const matchesStatus = statusFilter === "All" || pkg.status === statusFilter;
      return matchesSearch && matchesModel && matchesStatus;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case "order":
          return (a.displayOrder ?? 0) - (b.displayOrder ?? 0) || a.title.localeCompare(b.title);
        case "price-desc":
          return (b.priceUSD ?? 0) - (a.priceUSD ?? 0);
        case "price-asc":
          return (a.priceUSD ?? 0) - (b.priceUSD ?? 0);
        case "title-asc":
          return a.title.localeCompare(b.title);
        default:
          return 0;
      }
    });

  const totalItems = filteredPackages.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedPackages = filteredPackages.slice(startIndex, startIndex + pageSize);

  const { selected, ids, toggle, toggleAll, allShown, clear, busy, confirmAndDelete } =
    useBulkSelect(paginatedPackages);

  const handleDelete = (id: string, name: string) => {
    Swal.fire({
      title: "Delete Plan?",
      text: `Delete "${name}"? This cannot be undone.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, Delete",
      confirmButtonColor: "#f85a6b",
      background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff",
      color: document.documentElement.classList.contains("dark") ? "#f4f4f5" : "#13222e",
    }).then((result) => {
      if (!result.isConfirmed) return;
      fetch(`${apiBase}/lms-data/packages/${id}`, { method: "DELETE", headers: authHeader() })
        .then(ok)
        .then(() => {
          setPackages((prev) => prev.filter((p) => p.id !== id));
          Swal.fire({ title: "Deleted!", icon: "success" });
        })
        .catch((err) => Swal.fire({ title: "Could not delete", text: err.message, icon: "error" }));
    });
  };

  const onSaved = (saved: any, mode: "add" | "edit") => {
    if (mode === "add") setPackages((prev) => [saved, ...prev]);
    else setPackages((prev) => prev.map((p) => (p.id === saved.id ? saved : p)));
    setFormMode(null);
    setEditing(null);
    Swal.fire({ title: mode === "add" ? "Created" : "Updated", icon: "success" });
  };

  const priceCell = (pkg: any) => {
    if (isHourlyPlan(pkg)) {
      return (
        <div>
          <div className="text-sm font-bold text-emerald-500">
            {money(pkg.hourlyRateUSD, "USD")} <span className="text-[10px] font-normal text-ink-3">/ hr</span>
          </div>
          <div className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] font-semibold">
            {(["AED", "GBP"] as Currency[]).map((c) => {
              const amount = c === "AED" ? pkg.hourlyRateAED : pkg.hourlyRateGBP;
              return (
                <span key={c} className={amount == null ? "text-critical" : "text-ink-2"}>
                  {amount == null ? `No ${c}` : `${money(amount, c)}/hr`}
                </span>
              );
            })}
          </div>
        </div>
      );
    }
    return (
      <div>
        <div className="text-sm font-bold text-emerald-500">{money(pkg.priceUSD, "USD")}</div>
        <div className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] font-semibold">
          {(["AED", "GBP"] as Currency[]).map((c) => {
            const amount = c === "AED" ? pkg.priceAED : pkg.priceGBP;
            return (
              <span key={c} className={amount == null ? "text-critical" : "text-ink-2"}>
                {amount == null ? `No ${c} price` : money(amount, c)}
              </span>
            );
          })}
        </div>
        <div className="text-xs text-ink-3 flex items-center gap-1 mt-1 font-semibold">
          <CalendarDays className="size-3 text-accent" /> {pkg.billing} billing
        </div>
      </div>
    );
  };

  return (
    <>
      <Topbar title="Subscription Plans" subtitle="Configure Monthly & Hourly plans, pricing, features and limits" />

      <div className="animate-fade-up p-4 sm:p-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Card>
            <CardBody className="flex items-center gap-4 py-5">
              <span className="grid size-12 place-items-center rounded-xl bg-accent/10 text-accent"><Layers className="size-6" /></span>
              <div>
                <p className="text-2xl font-bold text-ink">{totalPackagesCount}</p>
                <p className="text-xs font-semibold text-ink-3">Total Plans</p>
              </div>
            </CardBody>
          </Card>
          <Card>
            <CardBody className="flex items-center gap-4 py-5">
              <span className="grid size-12 place-items-center rounded-xl bg-emerald-500/10 text-emerald-500"><CheckCircle2 className="size-6" /></span>
              <div>
                <p className="text-2xl font-bold text-ink">{activePackagesCount}</p>
                <p className="text-xs font-semibold text-ink-3">Active Plans</p>
              </div>
            </CardBody>
          </Card>
          <Card>
            <CardBody className="flex items-center gap-4 py-5">
              <span className="grid size-12 place-items-center rounded-xl bg-amber-500/10 text-amber-500"><DollarSign className="size-6" /></span>
              <div>
                <p className="text-2xl font-bold text-ink">${avgPackagePrice}</p>
                <p className="text-xs font-semibold text-ink-3">Avg Monthly (USD)</p>
              </div>
            </CardBody>
          </Card>
          <Card>
            <CardBody className="flex items-center gap-4 py-5">
              <span className="grid size-12 place-items-center rounded-xl bg-violet-500/10 text-violet-500"><SlidersHorizontal className="size-6" /></span>
              <div>
                <p className="text-2xl font-bold text-ink">{hourlyCount}</p>
                <p className="text-xs font-semibold text-ink-3">Hourly Plans</p>
              </div>
            </CardBody>
          </Card>
        </div>

        <Card>
          <CardBody className="pt-5 space-y-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="relative flex-1 max-w-xs">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" />
                <input
                  type="text"
                  placeholder="Search plans, tiers, features…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-10 w-full rounded-xl border border-hairline bg-surface-2 pr-4 pl-10 text-sm text-ink placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-ink-3 flex items-center gap-1"><Filter className="size-3" /> Model:</span>
                  <select value={modelFilter} onChange={(e) => setModelFilter(e.target.value)} className="h-9 rounded-xl border border-hairline bg-surface px-2.5 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-accent">
                    <option value="All">All</option>
                    {models.map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                    <option value="None">Legacy (no model)</option>
                  </select>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-ink-3">Status:</span>
                  <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-9 rounded-xl border border-hairline bg-surface px-2.5 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-accent">
                    {STATUSES.map((st) => (<option key={st} value={st}>{st}</option>))}
                  </select>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-ink-3 flex items-center gap-1"><ArrowUpDown className="size-3" /> Sort:</span>
                  <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="h-9 rounded-xl border border-hairline bg-surface px-2.5 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-accent">
                    <option value="order">Display order</option>
                    <option value="price-desc">Price (High to Low)</option>
                    <option value="price-asc">Price (Low to High)</option>
                    <option value="title-asc">Title (A-Z)</option>
                  </select>
                </div>

                <Button variant="outline" size="md" onClick={() => setShowModels(true)} className="rounded-xl flex items-center gap-2">
                  <SlidersHorizontal className="size-4" /> Models
                </Button>
                <Button variant="primary" size="md" onClick={() => { setEditing(null); setFormMode("add"); }} className="rounded-xl flex items-center gap-2">
                  <Plus className="size-4" /> Create Plan
                </Button>
              </div>
            </div>

            <BulkBar
              count={ids.length}
              busy={busy}
              onClear={clear}
              noun="plan"
              onDelete={() => confirmAndDelete("plan", (p) => p.title, bulkDeletePackages, loadPackages)}
            />

            <div className="overflow-x-auto border border-hairline rounded-xl">
              <table className="w-full border-collapse text-left text-sm text-ink-2">
                <thead className="bg-surface-2 text-xs font-bold text-ink-3 uppercase border-b border-hairline">
                  <tr>
                    <th className="px-6 py-4 w-10"><SelectAllBox checked={allShown} onChange={toggleAll} /></th>
                    <th className="px-6 py-4">Plan</th>
                    <th className="px-6 py-4">Model / Tier</th>
                    <th className="px-6 py-4">Pricing</th>
                    <th className="px-6 py-4">Structure</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline bg-surface">
                  {paginatedPackages.length > 0 ? (
                    paginatedPackages.map((pkg) => {
                      const m = modelById.get(pkg.modelId);
                      return (
                        <tr key={pkg.id} className={cn("hover:bg-surface-2/60 transition-colors", selected.has(pkg.id) && "bg-accent/5")}>
                          <td className="px-6 py-4"><SelectBox checked={selected.has(pkg.id)} onChange={() => toggle(pkg.id)} label={pkg.title} /></td>
                          <td className="px-6 py-4 max-w-xs">
                            <div className="font-semibold text-ink flex items-center gap-2">
                              {pkg.title}
                              {pkg.badge && <span className="rounded bg-accent/10 px-1.5 py-0.5 text-[10px] font-bold text-accent">{pkg.badge}</span>}
                            </div>
                            <div className="text-xs text-ink-3 italic mt-1 truncate max-w-xs">{pkg.description}</div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-xs font-bold text-ink">{m ? m.name : <span className="text-ink-3 italic">Legacy</span>}</div>
                            {pkg.tier && <div className="text-[11px] text-ink-3">{pkg.tier}</div>}
                          </td>
                          <td className="px-6 py-4">{priceCell(pkg)}</td>
                          <td className="px-6 py-4 text-xs text-ink-2">
                            {isHourlyPlan(pkg) ? (
                              <span className="text-ink-3 italic">Per student</span>
                            ) : (
                              <div>
                                <div>{pkg.durationMinutes ? `${pkg.durationMinutes} min` : "—"} · {pkg.weeklyClasses ?? "—"}×/wk</div>
                                <div className="text-[11px] text-ink-3">{pkg.monthlyHours ?? "—"} hrs / mo</div>
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4"><Badge tone={statusBadgeTone[pkg.status] || "neutral"}>{pkg.status}</Badge></td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex justify-end gap-1.5">
                              <Button variant="ghost" size="icon" onClick={() => { setEditing(pkg); setFormMode("edit"); }} className="rounded-lg text-ink-3 hover:text-accent hover:bg-surface-3 size-8" title="Edit">
                                <Edit2 className="size-4" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => handleDelete(pkg.id, pkg.title)} className="rounded-lg text-ink-3 hover:text-critical hover:bg-surface-3 size-8" title="Delete">
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
                          <p className="font-semibold text-sm">No plans matched.</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pt-4 border-t border-hairline text-xs font-semibold text-ink-3">
              <div className="flex items-center gap-2">
                <span>Show:</span>
                <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }} className="h-8 rounded-lg border border-hairline bg-surface px-2 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-accent">
                  {[5, 10, 20, 50, 100].map((n) => (<option key={n} value={n}>{n} per page</option>))}
                </select>
                <span>of {totalItems} plans</span>
              </div>
              <div>Showing {totalItems > 0 ? startIndex + 1 : 0} to {Math.min(startIndex + pageSize, totalItems)} of {totalItems}</div>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1} className="rounded-lg p-1.5 h-8 size-8 justify-center disabled:opacity-40"><ChevronLeft className="size-4" /></Button>
                {Array.from({ length: totalPages }).map((_, idx) => {
                  const pNum = idx + 1;
                  const isCurrent = currentPage === pNum;
                  return (
                    <Button key={pNum} variant={isCurrent ? "primary" : "outline"} size="sm" onClick={() => setCurrentPage(pNum)} className={cn("rounded-lg text-xs size-8 justify-center h-8 font-bold", isCurrent ? "bg-accent text-accent-ink" : "text-ink hover:bg-surface-2")}>{pNum}</Button>
                  );
                })}
                <Button variant="outline" size="sm" onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="rounded-lg p-1.5 h-8 size-8 justify-center disabled:opacity-40"><ChevronRight className="size-4" /></Button>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>

      <PlanFormModal
        open={formMode !== null}
        mode={formMode ?? "add"}
        initial={editing}
        models={models}
        feePlans={feePlans}
        courses={availableCourses}
        apiBase={apiBase}
        onClose={() => { setFormMode(null); setEditing(null); }}
        onSaved={onSaved}
      />

      <ModelsModal
        open={showModels}
        models={models}
        apiBase={apiBase}
        onClose={() => setShowModels(false)}
        onChanged={loadModels}
      />
    </>
  );
}
