"use client";

/*
 * The family completes what the trial did not capture.
 *
 * Reached with a token from the email their academic coach sent, not a login —
 * so it shows only a first name to address them by and the four choices they
 * are being asked for. Everything else about the lead stays out of reach of
 * anyone holding the link.
 *
 * The answers go straight onto the trial record; there is no local draft to
 * lose, and nothing is kept in the browser.
 */

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { CalendarCheck, CheckCircle2, Loader2 } from "lucide-react";

import {
  ApiError,
  fetchTrialInfoForm,
  submitTrialInfoForm,
  type TrialInfoForm,
} from "@/lib/api";

export default function TrialDetailsPage() {
  const { token } = useParams<{ token: string }>();

  const [form, setForm] = useState<TrialInfoForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [busy, setBusy] = useState(false);

  const [pkg, setPkg] = useState("");
  const [days, setDays] = useState<string[]>([]);
  const [time, setTime] = useState("");
  const [startDate, setStartDate] = useState("");

  useEffect(() => {
    fetchTrialInfoForm(token)
      .then((f) => {
        setForm(f);
        // Prefill whatever the teacher already managed to note down, so the
        // family confirms rather than retypes.
        setPkg(f.current.preferredPackage ?? "");
        setDays(f.current.preferredDays ?? []);
        setTime(f.current.preferredTime ?? "");
        setStartDate(f.current.preferredStartDate ?? "");
      })
      .catch((e) =>
        setError(
          e instanceof ApiError ? e.message : "This link could not be opened.",
        ),
      )
      .finally(() => setLoading(false));
  }, [token]);

  const submit = async () => {
    if (!pkg && !days.length && !time && !startDate) {
      setError("Please fill in at least one of the four details.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await submitTrialInfoForm(token, {
        preferredPackage: pkg || undefined,
        preferredDays: days.length ? days : undefined,
        preferredTime: time || undefined,
        preferredStartDate: startDate || undefined,
      });
      setDone(res.message);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save your details.");
    } finally {
      setBusy(false);
    }
  };

  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

  return (
    <main className="grid min-h-dvh place-items-center bg-surface-2 p-4 sm:p-8">
      <div className="w-full max-w-lg rounded-2xl border border-hairline bg-surface p-6 shadow-sm sm:p-8">
        {loading ? (
          <div className="grid place-items-center py-16">
            <Loader2 className="size-6 animate-spin text-accent" />
          </div>
        ) : done ? (
          <div className="py-10 text-center">
            <CheckCircle2 className="mx-auto mb-3 size-12 text-emerald-500" />
            <h1 className="text-lg font-black text-ink">Thank you</h1>
            <p className="mt-1.5 text-sm text-ink-3">{done}</p>
          </div>
        ) : !form ? (
          <div className="py-10 text-center">
            <h1 className="text-lg font-black text-ink">This link cannot be opened</h1>
            <p className="mt-1.5 text-sm text-ink-3">{error}</p>
          </div>
        ) : (
          <>
            <h1 className="text-lg font-black text-ink">A few details to finish</h1>
            <p className="mt-1.5 text-sm text-ink-3">
              Thank you for attending the trial class for{" "}
              <strong className="text-ink-2">{form.studentName}</strong>
              {form.subject ? ` (${form.subject})` : ""}. Tell us how you would like the
              regular classes to run.
            </p>

            {form.alreadySubmitted && (
              <p className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-600">
                You have answered this once already — sending it again will replace your
                earlier answer.
              </p>
            )}

            <div className="mt-5 space-y-4">
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-ink-3">
                  Preferred package
                </span>
                <select
                  value={pkg}
                  onChange={(e) => setPkg(e.target.value)}
                  className={inputCls}
                >
                  <option value="">Not sure yet</option>
                  {form.packages.map((p) => (
                    <option key={p.id} value={p.name}>
                      {p.name} — {p.classesPerMonth} classes a month
                    </option>
                  ))}
                </select>
              </label>

              <div>
                <span className="mb-1.5 block text-xs font-bold text-ink-3">
                  Preferred days
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {form.weekdays.map((d) => {
                    const on = days.includes(d);
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() =>
                          setDays(on ? days.filter((x) => x !== d) : [...days, d])
                        }
                        className={`h-9 rounded-lg border px-3 text-xs font-bold transition-colors ${
                          on
                            ? "border-accent bg-accent/10 text-accent"
                            : "border-hairline text-ink-3 hover:text-ink-2"
                        }`}
                      >
                        {d.slice(0, 3)}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-bold text-ink-3">
                    Preferred time
                  </span>
                  <input
                    type="time"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    className={inputCls}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-bold text-ink-3">
                    Preferred start date
                  </span>
                  <input
                    type="date"
                    min={tomorrow}
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className={inputCls}
                  />
                </label>
              </div>
            </div>

            {error && (
              <p className="mt-4 rounded-xl bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-500">
                {error}
              </p>
            )}

            <button
              type="button"
              onClick={submit}
              disabled={busy}
              className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent text-sm font-bold text-white hover:opacity-90 disabled:opacity-60"
            >
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <CalendarCheck className="size-4" />
              )}
              Send to my academic coach
            </button>
            <p className="mt-2.5 text-center text-[11px] text-ink-3">
              Leave anything you have not decided blank — your coach can send this link
              again later.
            </p>
          </>
        )}
      </div>
    </main>
  );
}

const inputCls =
  "h-11 w-full rounded-xl border border-hairline bg-surface px-3 text-sm font-semibold text-ink focus:border-accent focus:outline-none";
