"use client";

/*
 * Parent fees page — the target of the "Pay Fee" quick action.
 *
 * The academy has no online payment gateway: payments are recorded by the
 * office. So this page shows what is owed and how to pay it, rather than a
 * checkout that would not work.
 */

import { useEffect, useState } from "react";
import { AlertCircle, Download, Loader2, Receipt, Wallet } from "lucide-react";
import Swal from "sweetalert2";

import { Topbar } from "@/components/layout/topbar";
import { Card } from "@/components/ui/card";
import { Badge, type Tone } from "@/components/ui/badge";
import { currency } from "@/lib/utils";
import {
  fetchParentChildren,
  fetchParentFees,
  fetchParentReceipt,
  type ParentChild,
  type ParentFees,
} from "@/lib/api";
import { printReceipt } from "@/components/dashboard/parent-print";

const STATUS_TONE: Record<string, Tone> = {
  PAID: "good",
  SENT: "accent",
  PENDING: "accent",
  PARTIALLY_PAID: "warning",
  OVERDUE: "critical",
  CANCELLED: "neutral",
  DRAFT: "neutral",
};

const day = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : "—";

export default function ParentFeesPage() {
  const [children, setChildren] = useState<ParentChild[]>([]);
  const [childId, setChildId] = useState<string | undefined>(undefined);
  const [data, setData] = useState<ParentFees | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchParentChildren()
      .then(setChildren)
      .catch(() => setChildren([]));
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchParentFees(childId)
      .then((d) => active && setData(d))
      .catch((e: Error) => active && setError(e.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [childId]);

  const download = async (receiptId: string) => {
    try {
      printReceipt(await fetchParentReceipt(receiptId, childId));
    } catch (e) {
      await Swal.fire({
        icon: "error",
        title: "Could not open the receipt",
        text: e instanceof Error ? e.message : "Please try again.",
        confirmButtonColor: "#386FA4",
      });
    }
  };

  return (
    <>
      <Topbar title="Fees" subtitle="Outstanding balance, invoices and receipts" />

      <div className="space-y-4 p-4 sm:p-6">
        {children.length > 1 ? (
          <div className="flex flex-wrap gap-2">
            {children.map((c) => (
              <button
                key={c.studentId}
                type="button"
                onClick={() => setChildId(c.studentId)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  (childId ?? children.find((x) => x.isPrimary)?.studentId ?? children[0].studentId) ===
                  c.studentId
                    ? "border-transparent bg-accent text-accent-ink"
                    : "border-hairline text-ink-2 hover:bg-surface-2"
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
        ) : null}

        {loading ? (
          <div className="grid place-items-center py-24">
            <Loader2 className="size-6 animate-spin text-ink-3" />
          </div>
        ) : error || !data ? (
          <Card className="grid place-items-center gap-2 py-16 text-center">
            <AlertCircle className="size-6 text-ink-3" />
            <p className="text-sm font-semibold text-ink">Could not load fees</p>
            <p className="text-xs text-ink-3">{error}</p>
          </Card>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <Card className="p-4">
                <p className="text-xs font-bold tracking-wide text-ink-3 uppercase">Outstanding</p>
                <p className="mt-1 text-2xl font-extrabold text-ink">
                  {currency(data.summary.outstanding)}
                </p>
                <p className="text-xs text-ink-3">{data.summary.unpaidInvoices} unpaid invoice(s)</p>
              </Card>
              <Card className="p-4">
                <p className="text-xs font-bold tracking-wide text-ink-3 uppercase">Next due</p>
                <p className="mt-1 text-2xl font-extrabold text-ink">
                  {data.summary.nextDue?.dueAt ? day(data.summary.nextDue.dueAt) : "—"}
                </p>
                <p className="text-xs text-ink-3">
                  {data.summary.nextDue ? currency(data.summary.nextDue.amount) : "Nothing scheduled"}
                </p>
              </Card>
              <Card className="p-4">
                <p className="text-xs font-bold tracking-wide text-ink-3 uppercase">Last payment</p>
                <p className="mt-1 text-2xl font-extrabold text-ink">
                  {data.summary.lastPayment ? currency(data.summary.lastPayment.amount) : "—"}
                </p>
                <p className="text-xs text-ink-3">
                  {data.summary.lastPayment?.at ? day(data.summary.lastPayment.at) : "No payments yet"}
                </p>
              </Card>
            </div>

            <Card className="p-4">
              <div className="mb-3 flex items-center gap-2">
                <Wallet className="size-4 text-ink-3" aria-hidden />
                <h2 className="text-sm font-extrabold text-ink">How to pay</h2>
              </div>
              {data.academy.name || data.academy.email || data.academy.phone ? (
                <div className="space-y-1 text-sm text-ink-2">
                  {data.academy.name ? (
                    <p className="font-semibold text-ink">{data.academy.name}</p>
                  ) : null}
                  {data.academy.address ? <p>{data.academy.address}</p> : null}
                  <p className="text-xs text-ink-3">
                    {[data.academy.phone, data.academy.email].filter(Boolean).join(" · ")}
                  </p>
                  <p className="pt-2 text-xs text-ink-3">
                    Payments are recorded by the academy office. Contact them using the details
                    above to settle an invoice; a receipt appears here once it is recorded.
                  </p>
                </div>
              ) : (
                <p className="text-xs text-ink-3">
                  The academy has not published its payment details yet. Please contact the office.
                </p>
              )}
            </Card>

            <Card className="p-4">
              <h2 className="mb-3 text-sm font-extrabold text-ink">Invoices</h2>
              {!data.invoices.length ? (
                <p className="py-6 text-center text-xs text-ink-3">No invoices yet.</p>
              ) : (
                <div className="-mx-1 overflow-x-auto">
                  <table className="w-full min-w-[560px] text-left text-sm">
                    <thead>
                      <tr className="text-xs font-semibold text-ink-3">
                        <th className="px-2 pb-2">Invoice</th>
                        <th className="px-2 pb-2">Issued</th>
                        <th className="px-2 pb-2">Due</th>
                        <th className="px-2 pb-2 text-right">Amount</th>
                        <th className="px-2 pb-2 text-right">Balance</th>
                        <th className="px-2 pb-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.invoices.map((i) => (
                        <tr key={i.id} className="border-t border-hairline">
                          <td className="px-2 py-2.5 font-semibold text-ink">{i.number}</td>
                          <td className="px-2 py-2.5 text-ink-2">{day(i.issuedAt)}</td>
                          <td className="px-2 py-2.5 text-ink-2">{day(i.dueAt)}</td>
                          <td className="tnum px-2 py-2.5 text-right text-ink-2">
                            {currency(i.amount)}
                          </td>
                          <td className="tnum px-2 py-2.5 text-right font-semibold text-ink">
                            {currency(i.balance)}
                          </td>
                          <td className="px-2 py-2.5">
                            <Badge tone={STATUS_TONE[i.status] ?? "neutral"}>{i.status}</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            <Card className="p-4">
              <div className="mb-3 flex items-center gap-2">
                <Receipt className="size-4 text-ink-3" aria-hidden />
                <h2 className="text-sm font-extrabold text-ink">Receipts</h2>
              </div>
              {!data.summary.receipts.length ? (
                <p className="py-6 text-center text-xs text-ink-3">No receipts yet.</p>
              ) : (
                <ul className="space-y-2">
                  {data.summary.receipts.map((r) => (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => download(r.id)}
                        className="flex w-full items-center gap-3 rounded-lg border border-hairline px-3 py-2.5 text-left transition-colors hover:bg-surface-2"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-ink">{r.number}</p>
                          <p className="truncate text-xs text-ink-3">
                            {currency(r.amount)}
                            {r.method ? ` · ${r.method}` : ""}
                          </p>
                        </div>
                        <span className="shrink-0 text-xs text-ink-3">{day(r.issuedAt)}</span>
                        <Download className="size-4 shrink-0 text-ink-3" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </>
        )}
      </div>
    </>
  );
}
