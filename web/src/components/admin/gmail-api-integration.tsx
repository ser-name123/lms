"use client";

/*
 * Gmail API — sends as gmail.com over HTTPS, so it works on a host that blocks
 * SMTP ports (the live server does) and the mail is properly aligned instead of
 * relayed. When configured, it takes precedence over the SMTP settings below.
 *
 * The client secret and refresh token are write-only: the API says only whether
 * each is set, and a blank field on save keeps the stored one. The refresh
 * token is obtained once by running scripts/gmail-oauth.cjs — it cannot be
 * generated from a screen, because it requires a human to consent in a browser.
 */

import { useEffect, useState } from "react";
import { CheckCircle2, CircleAlert, Loader2, Mail, Plug, Save, Link2Off } from "lucide-react";
import Swal from "sweetalert2";

import {
  ApiError,
  fetchGmailApiConfig,
  saveGmailApiConfig,
  testGmailApi,
  disconnectGmailApi,
  type GmailApiConfig,
} from "@/lib/api";

const swalBg = () =>
  typeof document !== "undefined" && document.documentElement.classList.contains("dark")
    ? "#18181b"
    : "#ffffff";

export function GmailApiCard() {
  const [cfg, setCfg] = useState<GmailApiConfig | null>(null);
  const [sender, setSender] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [refreshToken, setRefreshToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const load = () =>
    fetchGmailApiConfig()
      .then((c) => {
        setCfg(c);
        setSender(c.sender ?? "");
        setClientId("");
        setClientSecret("");
        setRefreshToken("");
      })
      .catch(() => setCfg(null));

  useEffect(() => {
    void load();
  }, []);

  const save = async () => {
    if (!sender.trim()) {
      Swal.fire({ title: "The sender Gmail address is required", icon: "info", background: swalBg() });
      return;
    }
    if (!cfg?.configured && (!clientId.trim() || !clientSecret.trim() || !refreshToken.trim())) {
      Swal.fire({
        title: "Client ID, secret and refresh token are all required the first time",
        icon: "info",
        background: swalBg(),
      });
      return;
    }
    setBusy(true);
    setTestResult(null);
    try {
      const next = await saveGmailApiConfig({
        sender: sender.trim(),
        clientId: clientId.trim() || undefined,
        clientSecret: clientSecret.trim() || undefined,
        refreshToken: refreshToken.trim() || undefined,
      });
      setCfg(next);
      setClientSecret("");
      setRefreshToken("");
      Swal.fire({
        toast: true,
        position: "top-end",
        icon: "success",
        title: "Gmail API settings saved",
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
      setTestResult(await testGmailApi());
    } catch (e) {
      setTestResult({ ok: false, message: e instanceof ApiError ? e.message : "The test could not run." });
    } finally {
      setTesting(false);
    }
  };

  const disconnect = async () => {
    const ok = await Swal.fire({
      title: "Disconnect Gmail API?",
      text: "Email will fall back to the SMTP settings below.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Disconnect",
      confirmButtonColor: "#e11d48",
      background: swalBg(),
    });
    if (!ok.isConfirmed) return;
    setBusy(true);
    try {
      setCfg(await disconnectGmailApi());
      setClientId("");
      setClientSecret("");
      setRefreshToken("");
      setTestResult(null);
    } finally {
      setBusy(false);
    }
  };

  if (!cfg) {
    return (
      <div className="grid place-items-center py-10">
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
          <Mail className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-extrabold text-ink">Gmail API</h2>
            {cfg.configured ? (
              <span className="rounded-full border border-good/20 bg-good/10 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-good">
                Active — sending as {cfg.sender}
              </span>
            ) : (
              <span className="rounded-full border border-hairline bg-surface-2 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-ink-3">
                Not configured
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-ink-3">
            Sends as a Gmail address over HTTPS. Use this on the live server, which blocks the
            ports Gmail&apos;s SMTP needs — and unlike a relay, mail from your Gmail address is not
            flagged as spam. When set, this is used for every email; the SMTP settings below are the
            fallback.
          </p>
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-xl border border-accent/15 bg-accent/5 px-4 py-3">
        <CircleAlert className="mt-0.5 size-4 shrink-0 text-accent" />
        <p className="text-xs text-ink-2">
          The <span className="font-bold">refresh token</span> comes from running{" "}
          <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[10px]">
            node scripts/gmail-oauth.cjs &lt;clientId&gt; &lt;clientSecret&gt;
          </code>{" "}
          once and consenting in the browser. It cannot be generated from this screen.
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label className={label}>Sender Gmail address</label>
          <input
            type="email"
            value={sender}
            onChange={(e) => setSender(e.target.value)}
            placeholder="name@gmail.com"
            className={field}
            autoComplete="off"
          />
        </div>
        <div>
          <label className={label}>
            OAuth Client ID {cfg.hasClientId && <span className="text-good">· stored</span>}
          </label>
          <input
            type="text"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder={cfg.hasClientId ? "Leave blank to keep the stored value" : "…apps.googleusercontent.com"}
            className={field}
            autoComplete="off"
          />
        </div>
        <div>
          <label className={label}>
            OAuth Client Secret {cfg.hasClientSecret && <span className="text-good">· stored</span>}
          </label>
          <input
            type="password"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            placeholder={cfg.hasClientSecret ? "Leave blank to keep the stored secret" : "GOCSPX-…"}
            className={field}
            autoComplete="off"
          />
        </div>
        <div>
          <label className={label}>
            Refresh Token {cfg.hasRefreshToken && <span className="text-good">· stored</span>}
          </label>
          <input
            type="password"
            value={refreshToken}
            onChange={(e) => setRefreshToken(e.target.value)}
            placeholder={cfg.hasRefreshToken ? "Leave blank to keep the stored token" : "1//…"}
            className={field}
            autoComplete="off"
          />
        </div>
      </div>

      {testResult && (
        <div
          className={`flex items-start gap-2 rounded-xl border px-4 py-3 ${
            testResult.ok ? "border-good/20 bg-good/5" : "border-critical/20 bg-critical/5"
          }`}
        >
          {testResult.ok ? (
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-good" />
          ) : (
            <CircleAlert className="mt-0.5 size-4 shrink-0 text-critical" />
          )}
          <p className="text-xs text-ink-2">{testResult.message}</p>
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
          disabled={testing || !cfg.configured}
          className="flex h-10 items-center gap-1.5 rounded-xl border border-hairline px-5 text-xs font-bold text-ink-2 transition hover:bg-surface-2 disabled:opacity-50"
          title={cfg.configured ? undefined : "Save credentials first"}
        >
          {testing ? <Loader2 className="size-4 animate-spin" /> : <Plug className="size-4" />}
          Test connection
        </button>
        {cfg.configured && (
          <button
            onClick={disconnect}
            disabled={busy}
            className="flex h-10 items-center gap-1.5 rounded-xl border border-critical/20 px-5 text-xs font-bold text-critical transition hover:bg-critical/5 disabled:opacity-50"
          >
            <Link2Off className="size-4" />
            Disconnect
          </button>
        )}
      </div>
    </div>
  );
}
