"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Plus, Search, SlidersHorizontal } from "lucide-react";

import { Topbar } from "@/components/layout/topbar";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { students, type Student } from "@/lib/mock-data";
import { cn, initials } from "@/lib/utils";

const FILTERS = ["All", "Active", "Trial", "Pending", "Paused"] as const;
const PER_PAGE = 8;

const statusTone: Record<Student["status"], Tone> = {
  Active: "good",
  Trial: "accent",
  Pending: "warning",
  Paused: "neutral",
};

export default function StudentsPage() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [page, setPage] = useState(1);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return students.filter((s) => {
      const matchesFilter = filter === "All" || s.status === filter;
      const matchesQuery =
        !q ||
        s.student.toLowerCase().includes(q) ||
        s.email.toLowerCase().includes(q) ||
        s.course.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q);
      return matchesFilter && matchesQuery;
    });
  }, [query, filter]);

  const pages = Math.max(1, Math.ceil(rows.length / PER_PAGE));
  const current = Math.min(page, pages);
  const visible = rows.slice((current - 1) * PER_PAGE, current * PER_PAGE);

  const reset = (fn: () => void) => {
    fn();
    setPage(1);
  };

  return (
    <>
      <Topbar title="Students" subtitle={`${students.length} enrolled across 6 courses`} />

      <div className="animate-fade-up space-y-5 p-4 sm:p-6">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3">
          <label className="relative min-w-56 flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-3" />
            <input
              value={query}
              onChange={(e) => reset(() => setQuery(e.target.value))}
              placeholder="Search name, email, course…"
              className="h-9 w-full rounded-xl border border-hairline bg-surface pr-3 pl-10 text-sm text-ink placeholder:text-ink-3 focus:bg-surface focus:shadow-sm focus:border-accent/30 transition-all duration-300 focus:outline-none"
            />
          </label>

          <div className="inline-flex rounded-xl border border-hairline bg-surface p-0.5 shadow-sm">
            {FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => reset(() => setFilter(f))}
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
            <Button variant="outline" size="sm" className="rounded-xl">
              <SlidersHorizontal className="size-3.5" />
              Filters
            </Button>
            <Button variant="outline" size="sm" className="rounded-xl">
              <Download className="size-3.5" />
              Export
            </Button>
            <Button variant="primary" size="sm" className="rounded-xl">
              <Plus className="size-3.5" />
              Add student
            </Button>
          </div>
        </div>

        <Card className="overflow-hidden border border-hairline bg-surface shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline bg-surface-2/40 text-left">
                  <th className="px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-ink-3">Student</th>
                  <th className="px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-ink-3">ID</th>
                  <th className="px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-ink-3">Course</th>
                  <th className="px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-ink-3">Country</th>
                  <th className="px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-ink-3">Progress</th>
                  <th className="px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-ink-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-hairline last:border-0 hover:bg-surface-2/30 transition-colors duration-150"
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-to-tr from-indigo-500 via-indigo-600 to-violet-500 text-[11px] font-bold text-white shadow-sm shadow-indigo-500/10">
                          {initials(row.student)}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-ink text-sm">{row.student}</p>
                          <p className="truncate text-xs text-ink-3">{row.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="tnum px-5 py-3.5 text-xs font-bold text-ink-3">{row.id}</td>
                    <td className="px-5 py-3.5">
                      <p className="whitespace-nowrap font-medium text-ink-2">{row.course}</p>
                      <p className="text-xs text-ink-3">{row.teacher}</p>
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap text-ink-2 font-medium">{row.country}</td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-surface-3/50 dark:bg-zinc-800 border border-hairline/20">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500"
                            style={{ width: `${row.progress}%` }}
                          />
                        </div>
                        <span className="tnum text-xs font-bold text-ink-2">{row.progress}%</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <Badge tone={statusTone[row.status]}>{row.status}</Badge>
                    </td>
                  </tr>
                ))}

                {visible.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-16 text-center">
                      <p className="text-sm font-semibold text-ink">No students found</p>
                      <p className="mt-1 text-xs text-ink-3">
                        Try a different search term or clear the filter.
                      </p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between border-t border-hairline px-5 py-3">
            <p className="text-xs text-ink-3 font-medium">
              Showing <span className="tnum font-bold text-ink-2">{visible.length}</span> of{" "}
              <span className="tnum font-bold text-ink-2">{rows.length}</span> students
            </p>
            <div className="flex items-center gap-1.5">
              <Button
                variant="ghost"
                size="icon"
                disabled={current === 1}
                onClick={() => setPage(current - 1)}
                aria-label="Previous page"
                className="rounded-xl hover:bg-surface-2"
              >
                <ChevronLeft className="size-4" />
              </Button>
              <span className="tnum px-2 text-xs font-bold text-ink-2">
                {current} / {pages}
              </span>
              <Button
                variant="ghost"
                size="icon"
                disabled={current === pages}
                onClick={() => setPage(current + 1)}
                aria-label="Next page"
                className="rounded-xl hover:bg-surface-2"
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}
