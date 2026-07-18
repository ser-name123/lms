"use client";

/*
 * Global search.
 *
 * The topbar previously rendered a bare <input> with no state and no handler.
 * This replaces it with a real debounced search against /dashboard/search,
 * which scopes results to whatever the caller's role is allowed to see.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  ClipboardList,
  GraduationCap,
  Loader2,
  Receipt,
  Search,
  Users,
  UsersRound,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { globalSearch, type SearchHit } from "@/lib/api";

const ICON: Record<SearchHit["type"], React.ComponentType<{ className?: string }>> = {
  STUDENT: GraduationCap,
  TEACHER: Users,
  PARENT: UsersRound,
  BATCH: UsersRound,
  COURSE: BookOpen,
  INVOICE: Receipt,
  ASSIGNMENT: ClipboardList,
  ASSESSMENT: ClipboardList,
};

export function GlobalSearch({
  autoFocus = false,
  fullWidth = false,
}: {
  autoFocus?: boolean;
  fullWidth?: boolean;
} = {}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  const term = query.trim();
  // Below the minimum length there is nothing to show; derived rather than
  // cleared in the effect, which would cascade a render.
  const visibleHits = term.length < 2 ? [] : hits;

  // Debounced so typing does not fire a request per keystroke.
  useEffect(() => {
    if (term.length < 2) return;

    setLoading(true);
    const timer = setTimeout(() => {
      let cancelled = false;
      globalSearch(term)
        .then((r) => {
          if (cancelled) return;
          setHits(r);
          setActive(0);
        })
        .catch(() => !cancelled && setHits([]))
        .finally(() => !cancelled && setLoading(false));
      return () => {
        cancelled = true;
      };
    }, 250);

    return () => clearTimeout(timer);
  }, [term]);

  // Click-away closes the panel.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const go = (hit: SearchHit) => {
    setOpen(false);
    setQuery("");
    router.push(hit.link);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") return setOpen(false);
    if (!visibleHits.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a + 1) % visibleHits.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a - 1 + visibleHits.length) % visibleHits.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(visibleHits[active]);
    }
  };

  return (
    <div ref={boxRef} className={cn("relative", fullWidth && "w-full")}>
      <label className="relative block">
        <span className="sr-only">Search students, teachers, batches, courses, invoices</span>
        {loading ? (
          <Loader2 className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 animate-spin text-ink-3" />
        ) : (
          <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-ink-3" />
        )}
        <input
          type="search"
          autoFocus={autoFocus}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search..."
          role="combobox"
          aria-expanded={open && visibleHits.length > 0}
          aria-controls="global-search-results"
          aria-autocomplete="list"
          className={cn(
            "h-10 rounded-full border-0 bg-surface-2 pr-4 pl-10 text-sm text-ink transition-all duration-300 placeholder:text-ink-3 focus:bg-surface-2 focus:outline-none",
            fullWidth ? "w-full" : "w-64 focus:w-80",
          )}
        />
      </label>

      {open && term.length >= 2 ? (
        <div
          id="global-search-results"
          role="listbox"
          className={cn(
            "absolute right-0 z-50 mt-2 max-h-96 overflow-y-auto rounded-xl border border-hairline bg-surface p-1.5 shadow-[var(--shadow-pop)]",
            fullWidth ? "w-full" : "w-96",
          )}
        >
          {loading && !visibleHits.length ? (
            <p className="px-3 py-4 text-center text-xs text-ink-3">Searching…</p>
          ) : !visibleHits.length ? (
            <p className="px-3 py-4 text-center text-xs text-ink-3">
              No matches for “{term}”
            </p>
          ) : (
            <ul>
              {visibleHits.map((hit, i) => {
                const Icon = ICON[hit.type] ?? Search;
                return (
                  <li key={`${hit.type}-${hit.id}`}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={i === active}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => go(hit)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left",
                        i === active ? "bg-surface-2" : "hover:bg-surface-2",
                      )}
                    >
                      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-3">
                        <Icon className="size-4 text-ink-2" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-ink">
                          {hit.title}
                        </span>
                        {hit.subtitle ? (
                          <span className="block truncate text-xs text-ink-3">{hit.subtitle}</span>
                        ) : null}
                      </span>
                      <span className="shrink-0 text-[10px] font-bold tracking-wide text-ink-3">
                        {hit.type}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
