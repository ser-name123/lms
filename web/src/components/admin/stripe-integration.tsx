"use client";

/*
 * Stripe keys, managed by the admin.
 *
 * Both secrets are write-only. The API never sends them back — it says only
 * whether each is set — so the fields start blank on every load and an empty
 * value means "keep the stored one" rather than "erase it". A key that can be
 * read back off a screen is a key that leaks through a screenshot or a support
 * session.
 *
 * The mode badge is derived from the key's own prefix rather than a separate
 * setting, so it cannot disagree with the key in use. An admin who has pasted a
 * live key by mistake sees it here before a real card is charged.
 */

import { useEffect, useState } from "react";
import {
  CheckCircle2,
  CircleAlert,
  CreditCard,
  Loader2,
  Plug,
  Save,
} from "lucide-react";
import Swal from "sweetalert2";

import {
  ApiError,
  fetchStripeSettings,
  saveStripeSettings,
  testStripeConnection,
  type StripeSettings,
} from "@/lib/api";

const swalBg = () =>
  typeof document !== "undefined" && document.documentElement.classList.contains("dark")
    ? "#18181b"
    : "#ffffff";

export function StripeIntegrationCard() {
  const [settings, setSettings] = useState<StripeSettings | null>(null);
  const [secretKey, setSecretKey] = useState("");
  const [publishableKey, setPublishableKey] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<
    { ok: boolean; message: string; currencies?: string[] } | null
  >(null);

  const load = () =>
    fetchStripeSettings()
      .then((s) => {
        setSettings(s);
        // The publishable key is not a secret, so it round-trips and can be
        // shown. The other two never come back and stay blank.
        setPublishableKey(s.publishableKey ?? "");
        setSecretKey("");
        setWebhookSecret("");
      })
      .catch(() => setSettings(null));

  useEffect(() => {
    void load();
  }, []);

  const save = async () => {
    if (!settings?.hasSecretKey && !secretKey.trim()) {
      Swal.fire({
        title: "The secret key is required the first time",
        icon: "info",
        background: swalBg(),
      });
      return;
    }
    setBusy(true);
    setTestResult(null);
    try {
      const next = await saveStripeSettings({
        secretKey: secretKey.trim() || undefined,
        publishableKey: publishableKey.trim(),
        webhookSecret: webhookSecret.trim() || undefined,
      });
      setSettings(next);
      setSecretKey("");
      setWebhookSecret("");
      Swal.fire({
        toast: true,
        position: "top-end",
        icon: "success",
        title: "Stripe settings saved",
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

  const test = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      setTestResult(await testStripeConnection());
    } catch (e) {
      setTestResult({
        ok: false,
        message: e instanceof ApiError ? e.message : "The test could not be run.",
      });
    } finally {
      setTesting(false);
    }
  };

  if (!settings) {
    return (
      <div className="grid place-items-center py-16">
        <Loader2 className="size-5 animate-spin text-ink-3" />
      </div>
    );
  }

  const field =
    "h-11 w-full rounded-xl border border-hairline bg-surface px-4 text-sm text-ink focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all";
  const label = "mb-1.5 block text-xs font-bold uppercase tracking-wider text-ink-3";

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent">
          <CreditCard className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-extrabold text-ink">Stripe</h2>
            {settings.mode === "live" && (
              <span className="rounded-full border border-critical/20 bg-critical/10 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-critical">
                Live — real cards
              </span>
            )}
            {settings.mode === "test" && (
              <span className="rounded-full border border-accent/20 bg-accent/10 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-accent">
                Test mode
              </span>
            )}
            {settings.mode === "unset" && (
              <span className="rounded-full border border-hairline bg-surface-2 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-ink-3">
                Not configured
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-ink-3">
            Card payments for fee invoices. Without these keys the academy still
            runs — staff record payments by hand — but families cannot pay online.
          </p>
        </div>
      </div>

      {/* Nothing here is settled by the browser: say so, so nobody wonders why
          an abandoned checkout left the invoice unpaid. */}
      {!settings.hasWebhookSecret && settings.hasSecretKey && (
        <div className="flex items-start gap-2 rounded-xl border border-warning/20 bg-warning/5 px-4 py-3">
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
          <p className="text-xs text-ink-2">
            <span className="font-bold">No webhook secret yet.</span> An invoice is
            marked paid only when Stripe tells us it was — until this is set, a
            family can be charged and the invoice will stay unpaid.
          </p>
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label className={label}>
            Secret key {settings.hasSecretKey && <span className="text-good">· stored</span>}
          </label>
          <input
            type="password"
            value={secretKey}
            onChange={(e) => setSecretKey(e.target.value)}
            placeholder={settings.hasSecretKey ? "Leave blank to keep the stored key" : "sk_test_..."}
            className={field}
            autoComplete="off"
          />
        </div>

        <div>
          <label className={label}>Publishable key</label>
          <input
            type="text"
            value={publishableKey}
            onChange={(e) => setPublishableKey(e.target.value)}
            placeholder="pk_test_..."
            className={field}
            autoComplete="off"
          />
        </div>

        <div>
          <label className={label}>
            Webhook signing secret{" "}
            {settings.hasWebhookSecret && <span className="text-good">· stored</span>}
          </label>
          <input
            type="password"
            value={webhookSecret}
            onChange={(e) => setWebhookSecret(e.target.value)}
            placeholder={settings.hasWebhookSecret ? "Leave blank to keep the stored secret" : "whsec_..."}
            className={field}
            autoComplete="off"
          />
          <p className="mt-1.5 text-[11px] text-ink-3">
            In Stripe: Developers → Webhooks → add an endpoint pointing at{" "}
            <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[10px]">
              {settings.webhookPath}
            </code>{" "}
            for <span className="font-semibold">payment_intent.succeeded</span> and{" "}
            <span className="font-semibold">payment_intent.payment_failed</span>.
          </p>
        </div>
      </div>

      {testResult && (
        <div
          className={`flex items-start gap-2 rounded-xl border px-4 py-3 ${
            testResult.ok
              ? "border-good/20 bg-good/5"
              : "border-critical/20 bg-critical/5"
          }`}
        >
          {testResult.ok ? (
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-good" />
          ) : (
            <CircleAlert className="mt-0.5 size-4 shrink-0 text-critical" />
          )}
          <div className="text-xs text-ink-2">
            <p>{testResult.message}</p>
            {testResult.currencies && testResult.currencies.length > 0 && (
              <p className="mt-1 text-ink-3">
                Settles in: {testResult.currencies.join(", ")}
              </p>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-hairline pt-4">
        <button
          onClick={save}
          disabled={busy}
          className="flex h-10 items-center gap-1.5 rounded-xl bg-accent px-5 text-xs font-bold text-white transition hover:bg-accent-hover disabled:opacity-50"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Save
        </button>
        <button
          onClick={test}
          disabled={testing || !settings.hasSecretKey}
          className="flex h-10 items-center gap-1.5 rounded-xl border border-hairline px-5 text-xs font-bold text-ink-2 transition hover:bg-surface-2 disabled:opacity-50"
          title={settings.hasSecretKey ? undefined : "Save a secret key first"}
        >
          {testing ? <Loader2 className="size-4 animate-spin" /> : <Plug className="size-4" />}
          Test connection
        </button>
      </div>
    </div>
  );
}
