"use client";

/*
 * Zoom credentials for trial-class meetings.
 *
 * A Server-to-Server OAuth app in the academy's Zoom account gives three
 * values; with them, every trial booking opens its own meeting and the joining
 * link goes out in the acknowledgement email. Without them, bookings still work
 * — the coach just has to paste a link on the lead by hand.
 *
 * The client secret is write-only here. The API never sends it back, so the
 * field starts blank on every load and an empty value means "keep the stored
 * one" rather than "erase it".
 */

import { useEffect, useState } from "react";
import { CheckCircle2, CircleAlert, Link2Off, Loader2, Save, Video } from "lucide-react";
import Swal from "sweetalert2";

import {
  ApiError,
  disconnectZoom,
  fetchZoomStatus,
  saveZoomCredentials,
  type ZoomStatus,
} from "@/lib/api";

const swalBg = () =>
  typeof document !== "undefined" && document.documentElement.classList.contains("dark")
    ? "#18181b"
    : "#ffffff";

export function ZoomIntegrationCard() {
  const [status, setStatus] = useState<ZoomStatus | null>(null);
  const [accountId, setAccountId] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () =>
    fetchZoomStatus()
      .then((s) => {
        setStatus(s);
        setAccountId(s.accountId ?? "");
        setClientId(s.clientId ?? "");
        setClientSecret("");
      })
      .catch(() => setStatus(null));

  useEffect(() => {
    void load();
  }, []);

  const save = async () => {
    if (!accountId.trim() || !clientId.trim()) {
      Swal.fire({
        title: "Account ID and Client ID are both required",
        icon: "info",
        background: swalBg(),
      });
      return;
    }
    if (!status?.hasSecret && !clientSecret.trim()) {
      Swal.fire({
        title: "Client Secret is required the first time",
        icon: "info",
        background: swalBg(),
      });
      return;
    }

    setBusy(true);
    try {
      const next = await saveZoomCredentials({
        accountId: accountId.trim(),
        clientId: clientId.trim(),
        clientSecret: clientSecret.trim() || undefined,
      });
      setStatus(next);
      setClientSecret("");
      Swal.fire({
        toast: true,
        position: "top-end",
        icon: "success",
        title: "Zoom credentials saved",
        showConfirmButton: false,
        timer: 2000,
      });
    } catch (e) {
      Swal.fire({
        title: "Could not save",
        text: e instanceof ApiError ? e.message : "Please try again.",
        icon: "error",
        background: swalBg(),
      });
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    const ok = await Swal.fire({
      title: "Disconnect Zoom?",
      text: "New trial bookings will no longer get a meeting link automatically.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Disconnect",
      confirmButtonColor: "#e11d48",
      background: swalBg(),
    });
    if (!ok.isConfirmed) return;

    setBusy(true);
    try {
      const next = await disconnectZoom();
      setStatus(next);
      setAccountId("");
      setClientId("");
      setClientSecret("");
    } finally {
      setBusy(false);
    }
  };

  if (!status) {
    return (
      <div className="grid place-items-center py-16">
        <Loader2 className="size-5 animate-spin text-ink-3" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent">
          <Video className="size-5" />
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-extrabold text-ink">Zoom</h2>
          <p className="mt-0.5 text-xs text-ink-3">
            Used to open a meeting room for every free-trial booking.
          </p>
        </div>
        <span
          className={`ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-bold ${
            status.configured
              ? "bg-emerald-500/10 text-emerald-600"
              : "bg-amber-500/10 text-amber-600"
          }`}
        >
          {status.configured ? (
            <CheckCircle2 className="size-3.5" />
          ) : (
            <CircleAlert className="size-3.5" />
          )}
          {status.configured ? "Connected" : "Not configured"}
        </span>
      </div>

      {!status.configured && (
        <p className="rounded-xl bg-surface-2/60 px-3.5 py-3 text-xs leading-relaxed text-ink-2">
          Create a <b>Server-to-Server OAuth</b> app at{" "}
          <span className="font-mono">marketplace.zoom.us</span> and paste its three credentials
          below. Until then, trials are still booked normally — but the acknowledgement email goes
          out without a joining link, and each lead is flagged so a coach can add one.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <LabelledInput label="Account ID" value={accountId} onChange={setAccountId} />
        <LabelledInput label="Client ID" value={clientId} onChange={setClientId} />
        <div className="sm:col-span-2">
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-ink-3">
            Client Secret
          </label>
          <input
            type="password"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            placeholder={
              status.hasSecret ? "Stored — leave blank to keep it" : "Paste the client secret"
            }
            autoComplete="new-password"
            className="h-11 w-full rounded-xl border border-hairline bg-surface px-3 text-sm text-ink focus:border-accent focus:outline-none"
          />
          <p className="mt-1.5 text-[11px] text-ink-3">
            For security this is never sent back to the browser, so it always starts blank.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="inline-flex h-11 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-bold text-white disabled:opacity-60"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Save credentials
        </button>
        {status.configured && (
          <button
            type="button"
            onClick={disconnect}
            disabled={busy}
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-hairline px-4 text-sm font-bold text-ink-2 hover:border-red-500/40 hover:text-red-500 disabled:opacity-60"
          >
            <Link2Off className="size-4" />
            Disconnect
          </button>
        )}
      </div>
    </div>
  );
}

function LabelledInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-ink-3">
        {label}
      </label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 w-full rounded-xl border border-hairline bg-surface px-3 text-sm text-ink focus:border-accent focus:outline-none"
      />
    </div>
  );
}
