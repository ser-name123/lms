"use client";

/*
 * Selecting rows in a list and deleting them.
 *
 * Five catalogues needed the same control, and the parts that are easy to get
 * wrong are the same in all five:
 *
 *  - Selection is held by id, never by row index. Lists re-sort, re-filter and
 *    re-page underneath a selection, and an index would silently follow
 *    whatever row landed in that position.
 *  - The confirmation names what is going. A count alone is not something a
 *    person can check before agreeing to it.
 *  - A partial failure is reported per row, with its reason. "3 failed" sends
 *    somebody ticking boxes one at a time to find out which three.
 *  - The delete control only exists while something is selected. A delete
 *    button sitting permanently above a list is an accident waiting to happen.
 */

import { useCallback, useMemo, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import Swal from "sweetalert2";

export interface BulkDeleteResponse {
  deleted: number;
  failed: number;
  deletedItems: { id: string; label?: string }[];
  failures: { id: string; label?: string; reason: string }[];
}

const swalBg = () =>
  typeof document !== "undefined" && document.documentElement.classList.contains("dark")
    ? "#18181b"
    : "#ffffff";

export function useBulkSelect<T extends { id: string }>(rows: T[]) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const allShown = rows.length > 0 && rows.every((r) => selected.has(r.id));

  const toggleAll = useCallback(() => {
    setSelected((prev) =>
      allShown ? new Set() : new Set([...prev, ...rows.map((r) => r.id)]),
    );
  }, [allShown, rows]);

  const clear = useCallback(() => setSelected(new Set()), []);

  const ids = useMemo(() => [...selected], [selected]);

  /**
   * @param describe  names a row in the confirmation — a title, a code
   * @param remove    the bulk endpoint
   * @param onDone    reload; also clears the selection, since the rows moved
   */
  const confirmAndDelete = useCallback(
    async (
      noun: string,
      describe: (row: T) => string,
      remove: (ids: string[]) => Promise<BulkDeleteResponse>,
      onDone: () => void,
    ) => {
      if (!ids.length) return;
      const names = rows.filter((r) => ids.includes(r.id)).slice(0, 5).map(describe);
      const more = ids.length - names.length;

      const { isConfirmed } = await Swal.fire({
        title: `Delete ${ids.length} ${noun}${ids.length > 1 ? "s" : ""}?`,
        html:
          `<p style="font-size:13px;text-align:left">${names.join("<br/>")}` +
          (more > 0 ? `<br/>…and ${more} more` : "") +
          `</p><p style="font-size:12px;color:#6b7280;text-align:left;margin-top:10px">` +
          `This cannot be undone. Anything still in use will be skipped and listed.</p>`,
        icon: "warning",
        showCancelButton: true,
        confirmButtonText: `Delete ${ids.length}`,
        confirmButtonColor: "#e11d48",
        background: swalBg(),
      });
      if (!isConfirmed) return;

      setBusy(true);
      try {
        const res = await remove(ids);
        if (res.failed) {
          await Swal.fire({
            title: `${res.deleted} deleted, ${res.failed} kept`,
            html: `<p style="font-size:12px;text-align:left">${res.failures
              .map((f) => f.reason)
              .join("<br/><br/>")}</p>`,
            icon: "info",
            background: swalBg(),
          });
        } else {
          Swal.fire({
            toast: true,
            position: "top-end",
            icon: "success",
            title: `${res.deleted} deleted`,
            showConfirmButton: false,
            timer: 1900,
          });
        }
        clear();
        onDone();
      } catch (e) {
        Swal.fire({
          title: "Could not delete",
          text: e instanceof Error ? e.message : "Failed.",
          icon: "error",
          background: swalBg(),
        });
      } finally {
        setBusy(false);
      }
    },
    [ids, rows, clear],
  );

  return { selected, ids, toggle, toggleAll, allShown, clear, busy, confirmAndDelete };
}

/** The tick in a header cell. */
export function SelectAllBox({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={onChange}
      aria-label="Select everything shown"
      className="size-3.5 cursor-pointer accent-[var(--accent)]"
    />
  );
}

/** The tick in a row. Stops the click reaching a row that navigates. */
export function SelectBox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <span onClick={(e) => e.stopPropagation()} className="inline-flex">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        aria-label={`Select ${label}`}
        className="size-3.5 cursor-pointer accent-[var(--accent)]"
      />
    </span>
  );
}

/** Appears only while something is selected. */
export function BulkBar({
  count,
  busy,
  onClear,
  onDelete,
  noun,
}: {
  count: number;
  busy: boolean;
  onClear: () => void;
  onDelete: () => void;
  noun: string;
}) {
  if (count === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-accent/30 bg-accent/5 px-4 py-3">
      <p className="text-xs font-bold text-ink">
        {count} {noun}
        {count > 1 ? "s" : ""} selected
      </p>
      <button onClick={onClear} className="text-[11px] font-bold text-ink-3 hover:text-ink-2">
        Clear
      </button>
      <button
        onClick={onDelete}
        disabled={busy}
        className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 text-xs font-bold text-rose-600 hover:bg-rose-500/20 disabled:opacity-50"
      >
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
        Delete selected
      </button>
    </div>
  );
}
