"use client";

import { useCallback, useEffect, useState } from "react";
import Swal from "sweetalert2";
import { Loader2, Calculator, CheckCircle2, Download, Eye, Wallet, X } from "lucide-react";

import { useAuth } from "@/store/auth";
import { Topbar } from "@/components/layout/topbar";
import { Card, CardBody } from "@/components/ui/card";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  calculateSalaries, fetchSalaries, fetchSalaryDetail, fetchSalaryPayments,
  addSalaryAdjustment, approveSalary, paySalary, fetchPayoutDetails, updatePayoutDetails,
  reviewSalary, fetchReportsGate,
  type SalaryRow, type SalaryDetail, type SalaryStatus, type SalaryPaymentRow, type PayoutDetails, type ReportsGate,
} from "@/lib/api";

const money = (n: number, c = "USD") => `${c} ${n.toFixed(2)}`;
const swalBg = () => (typeof document !== "undefined" && document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff");
const statusTone: Record<SalaryStatus, Tone> = {
  CALCULATED: "neutral", UNDER_REVIEW: "warning", ADJUSTMENT_APPLIED: "accent", APPROVED: "good", PAID: "good", FAILED: "critical",
};
const monthValue = () => { const d = new Date(); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; };

/* Export the salary dashboard for the period as CSV (spec 6B step 3). */
function exportCsv(rows: SalaryRow[], month: string) {
  if (!rows.length) return;
  const esc = (v: unknown) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const cols = ["Teacher", "Code", "Month", "Classes", "Regular", "Trial", "Bonus", "Gross", "Adjustments", "Net", "Currency", "Status"];
  const body = rows.map((r) => [r.teacher?.name, r.teacher?.code, r.monthLabel, r.totalClasses, r.regularEarnings, r.trialEarnings, r.bonusEarnings, r.grossAmount, r.adjustmentsTotal, r.netAmount, r.currency, r.status].map(esc).join(","));
  const csv = [cols.join(","), ...body].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a");
  a.href = url; a.download = `salaries-${month}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}

export default function SalaryPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const [month, setMonth] = useState(monthValue());
  const [rows, setRows] = useState<SalaryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const periodStartIso = () => new Date(`${month}-01T00:00:00Z`).toISOString();

  const load = useCallback(() => {
    setLoading(true);
    fetchSalaries(periodStartIso()).then(setRows).catch(() => setRows([])).finally(() => setLoading(false));
  }, [month]);
  useEffect(() => load(), [load]);

  const calculate = async () => {
    setBusy(true);
    try {
      const [y, m] = month.split("-").map(Number);
      const ps = new Date(Date.UTC(y, m - 1, 1)).toISOString();
      const pe = new Date(Date.UTC(y, m, 0)).toISOString();
      const res = await calculateSalaries(ps, pe);
      await Swal.fire({ title: "Calculated", text: `${res.salariesCalculated} salaries for ${res.period}.`, icon: "success", background: swalBg(), confirmButtonColor: "#10b981" });
      load();
    } catch (e) {
      Swal.fire({ title: "Failed", text: e instanceof Error ? e.message : "Failed", icon: "error", background: swalBg() });
    } finally { setBusy(false); }
  };

  return (
    <>
      <Topbar title="Salary Management" subtitle="Consolidate teacher earnings, adjust, approve and pay via Wise" />
      <div className="animate-fade-up space-y-6 p-4 sm:p-6">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-ink-3">Salary period</label>
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)}
              className="h-10 rounded-xl border border-hairline bg-surface px-3 text-sm text-ink focus:outline-none focus:border-accent" />
          </div>
          {isAdmin && (
            <Button onClick={calculate} disabled={busy}
              className="h-10 rounded-xl bg-accent px-4 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50">
              {busy ? <Loader2 className="mr-1 size-4 animate-spin" /> : <Calculator className="mr-1 size-4" />} Calculate salaries
            </Button>
          )}
          <Button onClick={() => exportCsv(rows, month)} disabled={!rows.length}
            className="h-10 rounded-xl border border-hairline bg-surface px-4 text-xs font-bold text-ink-2 hover:bg-surface-2 disabled:opacity-50">
            <Download className="mr-1 size-4" /> Export report
          </Button>
        </div>

        <Card className="border border-hairline bg-surface shadow-sm">
          <CardBody className="p-0">
            {loading ? (
              <div className="flex items-center gap-2 p-8 text-xs font-bold text-ink-3"><Loader2 className="size-4 animate-spin text-accent" /> Loading…</div>
            ) : !rows.length ? (
              <div className="py-16 text-center text-xs text-ink-3">No salaries for this period. {isAdmin ? "Click Calculate to generate them." : ""}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-hairline bg-surface-2/45 text-[10px] font-extrabold uppercase tracking-wider text-ink-3">
                      <th className="px-5 py-3">Teacher</th>
                      <th className="px-5 py-3">Classes</th>
                      <th className="px-5 py-3">Gross</th>
                      <th className="px-5 py-3">Adjust.</th>
                      <th className="px-5 py-3">Net</th>
                      <th className="px-5 py-3">Status</th>
                      <th className="px-5 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hairline">
                    {rows.map((r) => (
                      <tr key={r.id} className="hover:bg-surface-2/30">
                        <td className="px-5 py-3">
                          <p className="text-xs font-bold text-ink">{r.teacher?.name}</p>
                          <p className="text-[10px] text-ink-3">{r.teacher?.code}</p>
                        </td>
                        <td className="px-5 py-3 text-xs text-ink-2">{r.totalClasses}</td>
                        <td className="px-5 py-3 text-xs text-ink-2">{money(r.grossAmount, r.currency)}</td>
                        <td className="px-5 py-3 text-xs text-ink-2">{r.adjustmentsTotal ? money(r.adjustmentsTotal, r.currency) : "—"}</td>
                        <td className="px-5 py-3 text-xs font-bold text-ink">{money(r.netAmount, r.currency)}</td>
                        <td className="px-5 py-3"><Badge tone={statusTone[r.status]}>{r.status.replace(/_/g, " ").toLowerCase()}</Badge></td>
                        <td className="px-5 py-3 text-right">
                          <Button variant="ghost" size="sm" onClick={() => setSelected(r.id)} className="h-8 rounded-lg px-2.5 text-[11px] font-bold text-accent hover:bg-accent/10">View</Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      {selected && <SalaryDrawer id={selected} isAdmin={isAdmin} onClose={() => setSelected(null)} onChanged={load} />}
    </>
  );
}

function SalaryDrawer({ id, isAdmin, onClose, onChanged }: { id: string; isAdmin: boolean; onClose: () => void; onChanged: () => void }) {
  const [d, setD] = useState<SalaryDetail | null>(null);
  const [payments, setPayments] = useState<SalaryPaymentRow[]>([]);
  const [payout, setPayout] = useState<PayoutDetails | null>(null);
  const [gate, setGate] = useState<ReportsGate | null>(null);
  const [busy, setBusy] = useState(false);
  const [adj, setAdj] = useState({ type: "DEDUCTION" as "EXTRA_PAY" | "DEDUCTION", amount: "", reason: "" });
  const [editPayout, setEditPayout] = useState(false);

  const reload = useCallback(() => {
    fetchSalaryDetail(id).then((detail) => {
      setD(detail);
      if (detail.teacher?.id) {
        fetchPayoutDetails(detail.teacher.id).then(setPayout).catch(() => undefined);
        fetchReportsGate(detail.teacher.id, detail.periodStart).then(setGate).catch(() => undefined);
      }
    }).catch(() => undefined);
    fetchSalaryPayments(id).then(setPayments).catch(() => undefined);
  }, [id]);
  useEffect(() => reload(), [reload]);

  const act = async (fn: () => Promise<unknown>, okMsg: string) => {
    setBusy(true);
    try { await fn(); await Swal.fire({ title: okMsg, icon: "success", background: swalBg(), confirmButtonColor: "#10b981" }); reload(); onChanged(); }
    catch (e) { Swal.fire({ title: "Failed", text: e instanceof Error ? e.message : "Failed", icon: "error", background: swalBg() }); }
    finally { setBusy(false); }
  };

  const doPay = async () => {
    setBusy(true);
    try {
      const res = await paySalary(id);
      if (res.status === "PAID") await Swal.fire({ title: "Paid", text: `Wise ref ${res.reference}`, icon: "success", background: swalBg(), confirmButtonColor: "#10b981" });
      else await Swal.fire({ title: "Payment failed", text: res.failureReason || "Failed", icon: "error", background: swalBg() });
      reload(); onChanged();
    } catch (e) { Swal.fire({ title: "Failed", text: e instanceof Error ? e.message : "Failed", icon: "error", background: swalBg() }); }
    finally { setBusy(false); }
  };

  const submitAdj = async () => {
    const amount = Number(adj.amount);
    if (!(amount > 0) || !adj.reason.trim()) { Swal.fire({ title: "Enter amount + reason", icon: "warning", background: swalBg() }); return; }
    await act(() => addSalaryAdjustment(id, { type: adj.type, amount, reason: adj.reason.trim() }), "Adjustment added");
    setAdj({ type: "DEDUCTION", amount: "", reason: "" });
  };

  const savePayout = async () => {
    if (!d?.teacher?.id || !payout) return;
    await act(() => updatePayoutDetails(d.teacher!.id, {
      recipientName: payout.recipientName ?? "", payoutCountry: payout.payoutCountry ?? "", payoutBankName: payout.payoutBankName ?? "",
      iban: payout.iban ?? "", swift: payout.swift ?? "", wiseRecipientId: payout.wiseRecipientId ?? "", payoutCurrency: payout.payoutCurrency ?? "",
    }).then((p) => setPayout(p)), "Payout details saved");
    setEditPayout(false);
  };

  const canAdjust = isAdmin && d && !["APPROVED", "PAID"].includes(d.status);
  const canApprove = isAdmin && d && !["APPROVED", "PAID"].includes(d.status);
  const canPay = isAdmin && d && (d.status === "APPROVED" || d.status === "FAILED");

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div className="flex h-full w-full max-w-lg flex-col bg-surface shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-hairline p-5">
          <div>
            <h3 className="text-sm font-black text-ink">{d?.teacher?.name ?? "Salary"}</h3>
            <p className="text-[11px] text-ink-3">{d?.monthLabel} · {d?.teacher?.code}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-ink-3 hover:bg-surface-2"><X className="size-5" /></button>
        </div>

        {!d ? (
          <div className="flex items-center gap-2 p-8 text-xs font-bold text-ink-3"><Loader2 className="size-4 animate-spin text-accent" /> Loading…</div>
        ) : (
          <div className="flex-1 space-y-5 overflow-y-auto p-5">
            <div className="rounded-xl border border-hairline bg-surface-2/40 p-4">
              <div className="mb-2 flex items-center justify-between">
                <Badge tone={statusTone[d.status]}>{d.status.replace(/_/g, " ").toLowerCase()}</Badge>
                <span className="text-lg font-black text-ink">{money(d.netAmount, d.currency)}</span>
              </div>
              <dl className="grid grid-cols-2 gap-1.5 text-xs">
                <dt className="text-ink-3">Regular ({d.totalClasses} cls)</dt><dd className="text-right text-ink-2">{money(d.regularEarnings, d.currency)}</dd>
                <dt className="text-ink-3">Trial</dt><dd className="text-right text-ink-2">{money(d.trialEarnings, d.currency)}</dd>
                <dt className="text-ink-3">Gross</dt><dd className="text-right text-ink-2">{money(d.grossAmount, d.currency)}</dd>
                <dt className="text-ink-3">Adjustments</dt><dd className="text-right text-ink-2">{money(d.adjustmentsTotal, d.currency)}</dd>
              </dl>
              {d.status === "FAILED" && d.failureReason && <p className="mt-2 rounded-lg border border-red-500/30 bg-red-500/5 p-2 text-[11px] text-red-500">{d.failureReason}</p>}
              {d.status === "PAID" && d.wiseReference && <p className="mt-2 text-[11px] text-emerald-500">Paid · Wise ref {d.wiseReference}</p>}
            </div>

            {/* Monthly-report gate (spec 6D): reports should be approved before finalising salary. */}
            {gate && gate.pending > 0 && d.status !== "PAID" && (
              <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                {gate.pending} monthly report{gate.pending === 1 ? "" : "s"} for this teacher/period {gate.pending === 1 ? "is" : "are"} not yet approved. Approve the reports before finalising this salary.
              </div>
            )}

            {/* Recipient (Wise) details */}
            <div className="rounded-xl border border-hairline p-4">
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-[11px] font-extrabold uppercase tracking-wider text-ink-3">Wise recipient</h4>
                {isAdmin && d.status !== "PAID" && (
                  <button onClick={() => setEditPayout(!editPayout)} className="text-[11px] font-bold text-accent">{editPayout ? "Cancel" : "Edit"}</button>
                )}
              </div>
              {editPayout && payout ? (
                <div className="space-y-2">
                  {([["recipientName", "Recipient name"], ["payoutCountry", "Country"], ["payoutBankName", "Bank"], ["iban", "IBAN / account"], ["swift", "SWIFT"], ["wiseRecipientId", "Wise recipient id"], ["payoutCurrency", "Currency"]] as const).map(([k, lbl]) => (
                    <input key={k} placeholder={lbl} value={(payout[k] as string) ?? ""} onChange={(e) => setPayout({ ...payout, [k]: e.target.value })}
                      className="h-9 w-full rounded-lg border border-hairline bg-surface px-3 text-xs text-ink focus:outline-none focus:border-accent" />
                  ))}
                  <Button onClick={savePayout} disabled={busy} className="h-9 w-full rounded-lg bg-accent text-xs font-bold text-white">Save details</Button>
                </div>
              ) : payout ? (
                <div className="space-y-0.5 text-xs text-ink-2">
                  <p>{payout.recipientName || <span className="text-ink-3">No recipient name</span>}</p>
                  <p className="text-ink-3">{[payout.payoutBankName, payout.iban, payout.swift, payout.payoutCurrency].filter(Boolean).join(" · ") || "Details incomplete"}</p>
                  {!payout.complete && <p className="mt-1 text-[11px] text-amber-500">Missing: {payout.missing.join(", ")}</p>}
                </div>
              ) : null}
            </div>

            {/* Adjustments */}
            <div className="rounded-xl border border-hairline p-4">
              <h4 className="mb-2 text-[11px] font-extrabold uppercase tracking-wider text-ink-3">Adjustments</h4>
              {d.adjustments.length ? (
                <ul className="mb-3 space-y-1.5">
                  {d.adjustments.map((a) => (
                    <li key={a.id} className="flex items-center justify-between text-xs">
                      <span className="text-ink-2">{a.type === "DEDUCTION" ? "−" : "+"} {money(a.amount, d.currency)} <span className="text-ink-3">· {a.reason}</span></span>
                    </li>
                  ))}
                </ul>
              ) : <p className="mb-3 text-xs text-ink-3">No adjustments.</p>}
              {canAdjust && (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <select value={adj.type} onChange={(e) => setAdj({ ...adj, type: e.target.value as any })} className="h-9 rounded-lg border border-hairline bg-surface px-2 text-xs text-ink">
                      <option value="DEDUCTION">Deduction</option>
                      <option value="EXTRA_PAY">Extra pay</option>
                    </select>
                    <input type="number" placeholder="Amount" value={adj.amount} onChange={(e) => setAdj({ ...adj, amount: e.target.value })} className="h-9 w-24 rounded-lg border border-hairline bg-surface px-2 text-xs text-ink" />
                    <input placeholder="Reason (required)" value={adj.reason} onChange={(e) => setAdj({ ...adj, reason: e.target.value })} className="h-9 flex-1 rounded-lg border border-hairline bg-surface px-2 text-xs text-ink" />
                  </div>
                  <Button onClick={submitAdj} disabled={busy} className="h-9 w-full rounded-lg border border-hairline bg-surface text-xs font-bold text-ink-2 hover:bg-surface-2">Add adjustment</Button>
                </div>
              )}
            </div>

            {/* Payment history */}
            {payments.length > 0 && (
              <div className="rounded-xl border border-hairline p-4">
                <h4 className="mb-2 text-[11px] font-extrabold uppercase tracking-wider text-ink-3">Payment history</h4>
                <ul className="space-y-1.5">
                  {payments.map((p) => (
                    <li key={p.id} className="flex items-center justify-between text-xs">
                      <span className={p.status === "SUCCESS" ? "text-emerald-500" : "text-red-500"}>{p.status}</span>
                      <span className="text-ink-3">{p.reference || p.failureReason} · {new Date(p.at).toLocaleDateString()}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {d && isAdmin && (
          <div className="flex gap-2 border-t border-hairline p-4">
            {canApprove && d.status !== "UNDER_REVIEW" && <Button onClick={() => act(() => reviewSalary(id), "Marked under review")} disabled={busy} className="h-11 flex-1 rounded-xl border border-hairline bg-surface text-xs font-bold text-ink-2 hover:bg-surface-2"><Eye className="mr-1 size-4" /> Review</Button>}
            {canApprove && <Button onClick={() => act(() => approveSalary(id), "Approved")} disabled={busy} className="h-11 flex-1 rounded-xl bg-accent text-xs font-bold text-white"><CheckCircle2 className="mr-1 size-4" /> Approve</Button>}
            {canPay && <Button onClick={doPay} disabled={busy} className="h-11 flex-1 rounded-xl bg-emerald-600 text-xs font-bold text-white hover:opacity-90"><Wallet className="mr-1 size-4" /> {d.status === "FAILED" ? "Retry payment" : "Pay via Wise"}</Button>}
            {d.status === "PAID" && <div className="flex-1 text-center text-xs font-bold text-emerald-500">Paid ✓</div>}
          </div>
        )}
      </div>
    </div>
  );
}
