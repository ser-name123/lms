"use client";

/*
 * Manage the subscription models the plan form picks from. The two built-ins
 * (Monthly Package / Hourly Subscription) are seeded on the server and cannot
 * be deleted while anything uses them; adding a model here (Corporate, Summer,
 * Family…) makes a new plan type available without any code change — the only
 * thing the code reads is its pricing mode (fixed vs hourly).
 */

import { useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import Swal from "sweetalert2";

import { authHeader } from "@/lib/api";
import { Button } from "@/components/ui/button";
import type { SubscriptionModel } from "./plan-form-modal";

type ModelsModalProps = {
  open: boolean;
  models: SubscriptionModel[];
  apiBase: string;
  onClose: () => void;
  onChanged: () => void;
};

export function ModelsModal({ open, models, apiBase, onClose, onChanged }: ModelsModalProps) {
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [pricingMode, setPricingMode] = useState<"FIXED_MONTHLY" | "HOURLY">("FIXED_MONTHLY");
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const req = async (url: string, init: RequestInit) => {
    const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...authHeader() } });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(
        (Array.isArray(body?.message) ? body.message.join(", ") : body?.message) || `Request failed (${res.status})`,
      );
    }
    return res;
  };

  const add = async () => {
    if (!name.trim() || !key.trim()) {
      Swal.fire({ title: "Name and key required", icon: "error" });
      return;
    }
    setBusy(true);
    try {
      await req(`${apiBase}/lms-data/subscription-models`, {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), key: key.trim(), pricingMode }),
      });
      setName("");
      setKey("");
      setPricingMode("FIXED_MONTHLY");
      onChanged();
    } catch (err: any) {
      Swal.fire({ title: "Could not add", text: err.message, icon: "error" });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (m: SubscriptionModel) => {
    const r = await Swal.fire({
      title: `Delete "${m.name}"?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Delete",
      confirmButtonColor: "#f85a6b",
    });
    if (!r.isConfirmed) return;
    try {
      await req(`${apiBase}/lms-data/subscription-models/${m.id}`, { method: "DELETE" });
      onChanged();
    } catch (err: any) {
      Swal.fire({ title: "Could not delete", text: err.message, icon: "error" });
    }
  };

  const toggleActive = async (m: SubscriptionModel) => {
    try {
      await req(`${apiBase}/lms-data/subscription-models/${m.id}`, {
        method: "PUT",
        body: JSON.stringify({ active: !m.active }),
      });
      onChanged();
    } catch (err: any) {
      Swal.fire({ title: "Could not update", text: err.message, icon: "error" });
    }
  };

  const inputCls =
    "h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-[2px]">
      <div className="relative w-full max-w-lg rounded-2xl border border-hairline bg-surface shadow-2xl overflow-hidden animate-fade-in text-ink max-h-[90vh] overflow-y-auto">
        <header className="flex items-center justify-between border-b border-hairline px-6 py-4">
          <h3 className="text-base font-bold text-ink">Subscription Models</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-ink-3 hover:bg-surface-2 hover:text-ink">
            <X className="size-5" />
          </button>
        </header>

        <div className="p-6 space-y-4">
          <div className="space-y-2">
            {models.map((m) => (
              <div key={m.id} className="flex items-center justify-between rounded-xl border border-hairline bg-surface-2 px-4 py-2.5">
                <div>
                  <div className="text-sm font-bold text-ink">
                    {m.name} <span className="ml-1 font-mono text-[10px] text-ink-3">{m.key}</span>
                  </div>
                  <div className="text-[11px] text-ink-3">{m.pricingMode === "HOURLY" ? "Hourly rate" : "Fixed monthly"}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => toggleActive(m)} className={`rounded-lg px-2 py-1 text-[11px] font-bold ${m.active ? "bg-emerald-500/10 text-emerald-500" : "bg-surface-3 text-ink-3"}`}>
                    {m.active ? "Active" : "Inactive"}
                  </button>
                  <button onClick={() => remove(m)} className="rounded-lg p-1.5 text-ink-3 hover:text-critical hover:bg-surface-3" title="Delete">
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-dashed border-hairline p-4 space-y-3">
            <p className="text-xs font-bold text-ink-3 uppercase">Add a model</p>
            <div className="grid grid-cols-2 gap-3">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (e.g. Summer)" className={inputCls} />
              <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="KEY (e.g. SUMMER)" className={inputCls} />
            </div>
            <select value={pricingMode} onChange={(e) => setPricingMode(e.target.value as any)} className={inputCls}>
              <option value="FIXED_MONTHLY">Fixed monthly price</option>
              <option value="HOURLY">Hourly rate</option>
            </select>
            <Button type="button" variant="primary" onClick={add} disabled={busy} className="rounded-xl flex items-center gap-1.5 w-full justify-center">
              <Plus className="size-4" /> {busy ? "Adding…" : "Add model"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
