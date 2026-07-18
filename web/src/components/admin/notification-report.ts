"use client";

/*
 * CSV download for the notification reports.
 *
 * RFC-4180 quoting (a comma, quote or newline inside a value forces quotes and
 * doubles embedded quotes) plus a UTF-8 BOM so Excel opens non-ASCII names
 * correctly instead of mojibake.
 */

import Swal from "sweetalert2";

import { authHeader } from "@/lib/api";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000/api";

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = typeof value === "object" ? JSON.stringify(value) : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(payload: { columns?: string[]; rows: Record<string, unknown>[] }): string {
  const columns = payload.columns?.length
    ? payload.columns
    : [...new Set(payload.rows.flatMap((r) => Object.keys(r)))];
  const header = columns.map(csvCell).join(",");
  const body = payload.rows.map((r) => columns.map((c) => csvCell(r[c])).join(","));
  return [header, ...body].join("\r\n");
}

export async function downloadNotificationReport(
  kind: string,
  label: string,
  range = "30d",
): Promise<void> {
  try {
    const res = await fetch(`${BASE}/notification-admin/reports/${kind}?range=${range}`, {
      headers: authHeader(),
    });
    if (!res.ok) throw new Error(`Report failed (${res.status})`);
    const payload = (await res.json()) as { columns?: string[]; rows: Record<string, unknown>[] };

    if (!payload.rows?.length) {
      Swal.fire({
        toast: true,
        position: "top-end",
        icon: "info",
        title: "Nothing to export for this period",
        showConfirmButton: false,
        timer: 1800,
      });
      return;
    }

    const blob = new Blob([`﻿${toCsv(payload)}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${kind}-report-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (e) {
    Swal.fire({
      title: `Could not download the ${label.toLowerCase()}`,
      text: e instanceof Error ? e.message : "Please try again.",
      icon: "error",
    });
  }
}
