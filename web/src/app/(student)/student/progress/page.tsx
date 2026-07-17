"use client";

import { useEffect, useState } from "react";
import {
  TrendingUp,
  CalendarCheck,
  FileText,
  ClipboardCheck,
  Trophy,
  Target,
  Star,
  Award,
  FileBadge,
  ExternalLink,
  MessageSquare,
  Loader2,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

import { Topbar } from "@/components/layout/topbar";
import { Card, CardBody } from "@/components/ui/card";
import { Badge, type Tone } from "@/components/ui/badge";
import { fetchStudentProgress } from "@/lib/api";

const BADGE_TONES: Tone[] = ["good", "accent", "warning", "critical", "neutral"];
const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) : "—";

export default function StudentProgressPage() {
  const [d, setD] = useState<any>(null);

  useEffect(() => {
    fetchStudentProgress().then(setD).catch(() => undefined);
  }, []);

  if (!d) {
    return (
      <>
        <Topbar title="My Progress" subtitle="Your academic journey at a glance" />
        <div className="grid h-[calc(100vh-4.5rem)] place-items-center">
          <div className="text-center">
            <Loader2 className="mx-auto size-8 animate-spin text-accent" />
            <p className="mt-3 text-sm font-bold text-ink-3">Loading your progress…</p>
          </div>
        </div>
      </>
    );
  }

  const cards = d.cards ?? {};
  const goal = cards.learningGoal;
  const timeline: { month: string; overall: number }[] = d.timeline ?? [];
  const subjects: { subject: string; progress: number }[] = d.subjects ?? [];
  const skills: { skillId: string; name: string; percentage: number }[] = d.skills ?? [];
  const goals: any[] = d.goals ?? [];
  const recent: any[] = d.feedback?.recent ?? [];
  const badges: any[] = d.badges ?? [];
  const certificates: any[] = d.certificates ?? [];
  const activityTimeline: { type?: string; title?: string; description?: string; at?: string }[] = d.activityTimeline ?? [];

  return (
    <>
      <Topbar title="My Progress" subtitle="Your academic journey at a glance" />
      <div className="animate-fade-up space-y-5 p-4 sm:p-6">
        {/* KPI cards */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
          <Kpi label="Overall Progress" value={`${cards.overall ?? 0}%`} icon={TrendingUp} color="text-accent bg-accent/10" />
          <Kpi label="Attendance" value={`${cards.attendancePct ?? 0}%`} icon={CalendarCheck} color="text-emerald-500 bg-emerald-500/10" />
          <Kpi label="Assignments" value={`${cards.assignmentPct ?? 0}%`} icon={FileText} color="text-sky-500 bg-sky-500/10" />
          <Kpi label="Assessments" value={`${cards.assessmentPct ?? 0}%`} icon={ClipboardCheck} color="text-violet-500 bg-violet-500/10" />
          <Kpi label="Current Rank" value={cards.rank != null ? `#${cards.rank}` : "—"} icon={Trophy} color="text-amber-500 bg-amber-500/10" />
          <Kpi
            label={goal?.title ? `Goal: ${goal.title}` : "Learning Goal"}
            value={goal ? `${goal.current ?? 0}%` : "—"}
            icon={Target}
            color="text-rose-500 bg-rose-500/10"
          />
        </div>

        {/* Progress timeline */}
        <Section title="Progress Timeline">
          {timeline.length === 0 ? (
            <Empty text="No snapshots yet — your trend will build over time." />
          ) : (
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={timeline} margin={{ top: 8, right: 8, bottom: 4, left: -16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: "var(--ink-3)" }} />
                  <YAxis tick={{ fontSize: 10, fill: "var(--ink-3)" }} domain={[0, 100]} />
                  <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 8, fontSize: 12 }} />
                  <Line type="monotone" dataKey="overall" stroke="#386FA4" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </Section>

        {/* Progress Journey — activity timeline */}
        <Section title="Progress Journey">
          {activityTimeline.length === 0 ? (
            <Empty text="Your milestones will appear here as you learn." />
          ) : (
            <ol className="relative space-y-5 border-l border-hairline pl-6">
              {activityTimeline.map((ev, i) => (
                <li key={i} className="relative">
                  <span className="absolute -left-[27px] top-1 grid size-3.5 place-items-center rounded-full border-2 border-surface bg-accent" />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-bold text-ink">{ev.title || ev.type || "Milestone"}</p>
                    <span className="text-xs text-ink-3">{fmtDate(ev.at)}</span>
                  </div>
                  {ev.description && <p className="mt-0.5 text-xs text-ink-3">{ev.description}</p>}
                </li>
              ))}
            </ol>
          )}
        </Section>

        <div className="grid gap-4 lg:grid-cols-2">
          {/* Subject-wise progress */}
          <Section title="Subject-wise Progress">
            {subjects.length === 0 ? (
              <Empty text="No subjects yet" />
            ) : (
              <div className="space-y-3">
                {subjects.map((s) => (
                  <Bar2 key={s.subject} label={s.subject} value={s.progress} />
                ))}
              </div>
            )}
          </Section>

          {/* Skills */}
          {skills.length > 0 && (
            <Section title="Skills">
              <div className="space-y-3">
                {skills.map((s) => (
                  <Bar2 key={s.skillId} label={s.name} value={s.percentage} />
                ))}
              </div>
            </Section>
          )}
        </div>

        {/* Learning goals */}
        {goals.length > 0 && (
          <Section title="Learning Goals">
            <div className="space-y-3">
              {goals.map((g) => (
                <div key={g.id} className="rounded-xl border border-hairline bg-surface-2 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-bold text-ink">{g.title}</p>
                    <span className="text-xs font-semibold text-ink-3">Deadline: {fmtDate(g.deadline)}</span>
                  </div>
                  {g.description && <p className="mt-0.5 text-xs text-ink-3">{g.description}</p>}
                  <div className="mt-2">
                    <Bar2 label={`${g.current ?? 0} / ${g.target ?? 0}`} value={goalPct(g.current, g.target)} />
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Teacher feedback */}
        <Section title="Teacher Feedback">
          {recent.length === 0 ? (
            <Empty text="No feedback yet" />
          ) : (
            <div className="space-y-3">
              {recent.map((f) => (
                <div key={f.id} className="rounded-xl border border-hairline bg-surface-2 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-bold text-ink">{f.actorName || "Teacher"}</p>
                    <span className="text-xs text-ink-3">{fmtDate(f.createdAt)}</span>
                  </div>
                  <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                    <Stars label="Participation" value={f.participation} />
                    <Stars label="Homework" value={f.homework} />
                    <Stars label="Communication" value={f.communication} />
                    <Stars label="Understanding" value={f.understanding} />
                    <Stars label="Behavior" value={f.behavior} />
                  </div>
                  {f.remarks && (
                    <p className="mt-2 flex gap-1.5 text-sm text-ink-2">
                      <MessageSquare className="mt-0.5 size-3.5 shrink-0 text-ink-3" /> {f.remarks}
                    </p>
                  )}
                  {f.suggestions && (
                    <p className="mt-1 text-xs text-ink-3">
                      <span className="font-bold">Suggestions:</span> {f.suggestions}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Badges */}
        <Section title="Badges & Achievements">
          {badges.length === 0 ? (
            <Empty text="No badges earned yet" />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {badges.map((b, i) => (
                <div key={b.code} className="flex items-start gap-3 rounded-xl border border-hairline bg-surface-2 p-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent">
                    <Award className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-bold text-ink">{b.name}</p>
                      <Badge tone={BADGE_TONES[i % BADGE_TONES.length]}>Badge</Badge>
                    </div>
                    {b.description && <p className="mt-0.5 text-xs text-ink-3">{b.description}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Certificates */}
        <Section title="Certificates">
          {certificates.length === 0 ? (
            <Empty text="No certificates yet" />
          ) : (
            <div className="space-y-2">
              {certificates.map((c) => (
                <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-hairline bg-surface-2 px-3 py-2.5">
                  <div className="flex items-center gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-amber-500/10 text-amber-500">
                      <FileBadge className="size-5" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-ink">{c.title}</p>
                      <p className="text-xs text-ink-3">
                        {c.certificateNo ? `${c.certificateNo} · ` : ""}
                        {c.percentage != null ? `${c.percentage}%` : ""} · {fmtDate(c.issuedAt)}
                      </p>
                    </div>
                  </div>
                  {c.certificateUrl && (
                    <a
                      href={c.certificateUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-hairline bg-surface px-3 text-xs font-bold text-accent hover:bg-surface-3"
                    >
                      <ExternalLink className="size-3.5" /> Open
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>
    </>
  );
}

function goalPct(current?: number | null, target?: number | null) {
  if (!target || target <= 0) return 0;
  return Math.min(100, Math.round(((current ?? 0) / target) * 100));
}

function Kpi({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}) {
  return (
    <Card className="border border-hairline bg-surface shadow-sm">
      <CardBody className="flex items-center gap-3 p-4">
        <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${color}`}>
          <Icon className="size-5" />
        </span>
        <div className="min-w-0">
          <div className="truncate text-lg font-extrabold text-ink">{value}</div>
          <div className="truncate text-[11px] font-semibold text-ink-3">{label}</div>
        </div>
      </CardBody>
    </Card>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="border border-hairline bg-surface shadow-sm">
      <CardBody className="p-5">
        <h3 className="mb-4 text-sm font-black text-ink">{title}</h3>
        {children}
      </CardBody>
    </Card>
  );
}

function Bar2({ label, value }: { label: string; value: number }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="font-semibold text-ink-2">{label}</span>
        <span className="font-bold text-ink">{value}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
        <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, value)}%` }} />
      </div>
    </div>
  );
}

function Stars({ label, value }: { label: string; value?: number | null }) {
  const v = Math.round(value ?? 0);
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="font-semibold text-ink-3">{label}</span>
      <span className="flex items-center gap-0.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Star key={i} className={`size-3.5 ${i < v ? "fill-amber-400 text-amber-400" : "text-ink-3/40"}`} />
        ))}
      </span>
    </div>
  );
}

function Empty({ text = "No data yet" }: { text?: string }) {
  return <p className="py-6 text-center text-sm text-ink-3">{text}</p>;
}
