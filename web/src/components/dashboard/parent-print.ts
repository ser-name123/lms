/*
 * Printable documents for parents: a fee receipt and a progress report card.
 *
 * These open a self-contained window and call print(), which lets the browser
 * produce a PDF without pulling a PDF library into the bundle. Every value
 * shown comes from the API payload — nothing is computed or invented here.
 */

import type { ParentReceipt, ParentReportCard } from "@/lib/api";

const escapeHtml = (value: unknown): string =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );

const money = (amount: number, currency = "USD") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);

const date = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";

/** Shared document chrome. Styles are inline so the popup needs no stylesheet. */
function openPrintable(title: string, body: string) {
  const win = window.open("", "_blank", "width=900,height=1000");
  if (!win) {
    // Pop-up blocked — the caller surfaces this to the user.
    throw new Error("Please allow pop-ups to download this document.");
  }

  win.document.write(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
  * { box-sizing: border-box; }
  body { font: 14px/1.5 ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
         color: #14161a; margin: 0; padding: 40px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .06em;
       color: #6b7280; margin: 28px 0 8px; }
  .muted { color: #6b7280; }
  .head { display: flex; justify-content: space-between; align-items: flex-start;
          border-bottom: 2px solid #14161a; padding-bottom: 16px; }
  .right { text-align: right; }
  table { width: 100%; border-collapse: collapse; margin-top: 4px; }
  th, td { text-align: left; padding: 8px 6px; border-bottom: 1px solid #e5e7eb; }
  th { font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: #6b7280; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  .total { font-size: 22px; font-weight: 800; }
  .foot { margin-top: 40px; font-size: 11px; color: #9ca3af;
          border-top: 1px solid #e5e7eb; padding-top: 12px; }
  @media print { body { padding: 0; } }
</style></head><body>${body}</body></html>`);
  win.document.close();
  win.focus();
  // Let the document lay out before the print dialog measures it.
  win.setTimeout(() => win.print(), 250);
}

function academyBlock(academy: ParentReceipt["academy"]) {
  return `<div>
    <h1>${escapeHtml(academy.name || "Academy")}</h1>
    <p class="muted" style="margin:0">
      ${[academy.address, academy.phone, academy.email].filter(Boolean).map(escapeHtml).join(" · ")}
    </p>
  </div>`;
}

export function printReceipt(r: ParentReceipt) {
  openPrintable(
    `Receipt ${r.number}`,
    `<div class="head">
      ${academyBlock(r.academy)}
      <div class="right">
        <h1>Receipt</h1>
        <p class="muted" style="margin:0">${escapeHtml(r.number)}</p>
      </div>
    </div>

    <h2>Received from</h2>
    <p style="margin:0"><strong>${escapeHtml(r.student.name)}</strong>
      <span class="muted">· ${escapeHtml(r.student.code)}</span></p>

    <h2>Payment</h2>
    <table>
      <tr><th>Invoice</th><th>Method</th><th>Paid on</th><th class="num">Amount</th></tr>
      <tr>
        <td>${escapeHtml(r.invoice.number)}</td>
        <td>${escapeHtml(r.method ?? "—")}</td>
        <td>${date(r.paidAt ?? r.issuedAt)}</td>
        <td class="num">${money(r.amount, r.currency)}</td>
      </tr>
    </table>

    <p class="total right" style="margin-top:16px">${money(r.amount, r.currency)}</p>
    ${r.reference ? `<p class="muted">Reference: ${escapeHtml(r.reference)}</p>` : ""}
    ${r.notes ? `<p class="muted">${escapeHtml(r.notes)}</p>` : ""}

    <p class="foot">Issued ${date(r.issuedAt)}. This is a computer-generated receipt.</p>`,
  );
}

export function printReportCard(c: ParentReportCard) {
  const rate = (v: number) => `${Math.round(v)}%`;

  const skills = c.skills.length
    ? `<h2>Skills</h2><table>
        <tr><th>Skill</th><th class="num">Progress</th></tr>
        ${c.skills
          .map(
            (s) =>
              `<tr><td>${escapeHtml(s.name)}</td><td class="num">${rate(s.percentage)}</td></tr>`,
          )
          .join("")}
       </table>`
    : "";

  const reviews = c.reviews.length
    ? `<h2>Coach reviews</h2><table>
        <tr><th>Period</th><th class="num">Academic</th><th class="num">Attendance</th>
            <th class="num">Behaviour</th><th class="num">Participation</th></tr>
        ${c.reviews
          .map(
            (r) =>
              `<tr><td>${escapeHtml(r.monthLabel)}</td>
                <td class="num">${r.academic ?? "—"}</td>
                <td class="num">${r.attendance ?? "—"}</td>
                <td class="num">${r.behavior ?? "—"}</td>
                <td class="num">${r.participation ?? "—"}</td></tr>` +
              (r.remarks
                ? `<tr><td colspan="5" class="muted">${escapeHtml(r.remarks)}</td></tr>`
                : ""),
          )
          .join("")}
       </table>`
    : "";

  openPrintable(
    `Report card — ${c.child.name}`,
    `<div class="head">
      ${academyBlock(c.academy)}
      <div class="right">
        <h1>Report card</h1>
        <p class="muted" style="margin:0">Last ${escapeHtml(c.range)}</p>
      </div>
    </div>

    <h2>Student</h2>
    <p style="margin:0"><strong>${escapeHtml(c.child.name)}</strong>
      <span class="muted">· ${escapeHtml(c.child.studentCode)}${
        c.child.course ? ` · ${escapeHtml(c.child.course)}` : ""
      }${c.child.teacher ? ` · ${escapeHtml(c.child.teacher)}` : ""}</span></p>

    <h2>Summary</h2>
    <table>
      <tr><th>Measure</th><th class="num">Result</th></tr>
      <tr><td>Attendance</td><td class="num">${rate(c.summary.attendancePct)}</td></tr>
      <tr><td>Assignments submitted</td>
          <td class="num">${c.summary.assignments.submitted} / ${c.summary.assignments.total}</td></tr>
      <tr><td>Overall progress</td><td class="num">${rate(c.summary.overallProgress)}</td></tr>
      ${
        c.summary.lastResult
          ? `<tr><td>Latest assessment — ${escapeHtml(c.summary.lastResult.title)}</td>
               <td class="num">${rate(c.summary.lastResult.percentage)}</td></tr>`
          : ""
      }
    </table>

    ${skills}
    ${reviews}

    <p class="foot">Generated ${date(c.generatedAt)} from the academy's own records.</p>`,
  );
}
