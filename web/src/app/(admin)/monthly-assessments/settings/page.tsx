"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import {
  Loader2, Plus, Trash2, Copy, Power, PowerOff, Save, GripVertical, Award, SlidersHorizontal,
  ListChecks, Ruler, Wand2, ArrowDownUp,
} from "lucide-react";

import { Topbar } from "@/components/layout/topbar";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  fetchMonthlyAssessmentMeta, fetchAssessmentConfig, saveAssessmentConfig,
  fetchGradingScales, createGradingScale, updateGradingScale, deleteGradingScale,
  fetchBadgeConfigs, saveBadgeConfig,
  fetchAssessmentTemplates, createAssessmentTemplate, updateAssessmentTemplate,
  activateAssessmentTemplate, deactivateAssessmentTemplate, duplicateAssessmentTemplate,
  deleteAssessmentTemplate, fetchAssessmentPresets, seedAssessmentPresets,
  type AssessmentConfigMeta, type AssessmentConfig, type GradingScale, type GradeBand,
  type RankingBadgeConfig, type AssessmentTemplate, type AssessmentCriterion,
  type AssessmentPreset,
} from "@/lib/api";

const swalBg = () =>
  typeof document !== "undefined" && document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff";
const ok = (title: string, text?: string) =>
  Swal.fire({ title, text, icon: "success", background: swalBg(), confirmButtonColor: "#10b981" });
const fail = (e: unknown) =>
  Swal.fire({
    title: "Could not save",
    text: e instanceof Error ? e.message : "Something went wrong",
    icon: "error",
    background: swalBg(),
  });

const input =
  "h-9 w-full rounded-xl border border-hairline bg-surface px-3 text-sm text-ink outline-none focus:border-accent";
const label = "mb-1 block text-[10px] font-extrabold uppercase tracking-wider text-ink-3";

type Tab = "templates" | "grading" | "badges" | "rules";

const TABS: { key: Tab; label: string; icon: typeof ListChecks }[] = [
  { key: "templates", label: "Assessment Templates", icon: ListChecks },
  { key: "grading", label: "Grading Scales", icon: Ruler },
  { key: "rules", label: "Rules & Ranking Weightage", icon: SlidersHorizontal },
  { key: "badges", label: "Achievement Badges", icon: Award },
];

// ── Template editor ─────────────────────────────────────────────────────────

type DraftCriterion = AssessmentCriterion & { key: string };

const emptyCriterion = (order: number): DraftCriterion => ({
  key: `${Date.now()}-${order}-${Math.random().toString(36).slice(2, 7)}`,
  name: "",
  maxMarks: 10,
  displayOrder: order,
  isMandatory: true,
});

function TemplateEditor({
  meta,
  scales,
  editing,
  onClose,
  onSaved,
}: {
  meta: AssessmentConfigMeta | null;
  scales: GradingScale[];
  editing: AssessmentTemplate | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(editing?.name ?? "");
  const [courseId, setCourseId] = useState(editing?.course?.id ?? "");
  const [levelId, setLevelId] = useState(editing?.level?.id ?? "");
  const [frequency, setFrequency] = useState(editing?.frequency ?? "MONTHLY");
  const [maxMarks, setMaxMarks] = useState(editing?.maxMarks ?? 100);
  const [passingMarks, setPassingMarks] = useState(editing?.passingMarks ?? 40);
  const [gradingScaleId, setGradingScaleId] = useState(
    editing?.gradingScale?.id ?? scales.find((s) => s.isDefault)?.id ?? "",
  );
  const [status, setStatus] = useState(editing?.status ?? "ACTIVE");
  const [displayOrder, setDisplayOrder] = useState(editing?.displayOrder ?? 0);
  const [criteria, setCriteria] = useState<DraftCriterion[]>(
    editing?.criteria?.length
      ? editing.criteria.map((c, i) => ({ ...c, key: c.id ?? `c-${i}` }))
      : [emptyCriterion(0)],
  );
  const [busy, setBusy] = useState(false);
  const [presets, setPresets] = useState<AssessmentPreset[]>([]);

  // Only offered on a NEW template — applying one to an existing rubric would
  // silently discard criteria that assessments have already been scored against.
  useEffect(() => {
    if (editing) return;
    fetchAssessmentPresets().then(setPresets).catch(() => undefined);
  }, [editing]);

  const applyPreset = async (key: string) => {
    const p = presets.find((x) => x.key === key);
    if (!p) return;
    if (criteria.some((c) => c.name.trim())) {
      const go = await Swal.fire({
        title: `Replace with the ${p.name} rubric?`,
        text: "The criteria you have entered will be discarded.",
        icon: "warning",
        showCancelButton: true,
        confirmButtonText: "Replace",
        background: swalBg(),
        confirmButtonColor: "#ef4444",
      });
      if (!go.isConfirmed) return;
    }
    if (!name.trim()) setName(p.name);
    setMaxMarks(p.maxMarks);
    setPassingMarks(p.passingMarks);
    setCriteria(
      p.criteria.map((c, i) => ({
        key: `preset-${key}-${i}`,
        name: c.name,
        maxMarks: c.maxMarks,
        displayOrder: i,
        isMandatory: true,
      })),
    );
  };

  const total = useMemo(() => criteria.reduce((a, c) => a + (Number(c.maxMarks) || 0), 0), [criteria]);
  const balanced = total === Number(maxMarks);

  const setCriterion = (key: string, patch: Partial<DraftCriterion>) =>
    setCriteria((cs) => cs.map((c) => (c.key === key ? { ...c, ...patch } : c)));

  const move = (index: number, dir: -1 | 1) =>
    setCriteria((cs) => {
      const next = [...cs];
      const target = index + dir;
      if (target < 0 || target >= next.length) return cs;
      [next[index], next[target]] = [next[target], next[index]];
      return next.map((c, i) => ({ ...c, displayOrder: i }));
    });

  const save = async () => {
    if (!name.trim()) return fail(new Error("Give the template a name."));
    if (!courseId) return fail(new Error("Pick a course."));
    if (criteria.some((c) => !c.name.trim())) return fail(new Error("Every criterion needs a name."));
    setBusy(true);
    try {
      const payload = {
        name: name.trim(),
        courseId,
        levelId: levelId || undefined,
        frequency,
        maxMarks: Number(maxMarks),
        passingMarks: Number(passingMarks),
        gradingScaleId: gradingScaleId || undefined,
        displayOrder: Number(displayOrder) || 0,
        status,
        criteria: criteria.map((c, i) => ({
          name: c.name.trim(),
          maxMarks: Number(c.maxMarks),
          displayOrder: i,
          isMandatory: c.isMandatory ?? true,
        })),
      };
      if (editing) await updateAssessmentTemplate(editing.id, payload);
      else await createAssessmentTemplate(payload);
      await ok(editing ? "Template updated" : "Template created");
      onSaved();
      onClose();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 backdrop-blur-sm">
      <Card className="my-8 w-full max-w-3xl border border-hairline bg-surface shadow-xl">
        <CardBody className="p-6">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-black text-ink">
                {editing ? "Edit assessment template" : "New assessment template"}
              </h2>
              <p className="mt-0.5 text-xs text-ink-3">
                A new course becomes assessable the moment it has a template — no code change needed.
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>

          {!editing && presets.length > 0 && (
            <div className="mb-5 rounded-xl border border-accent/30 bg-accent-soft/20 p-3">
              <p className="mb-2 flex items-center gap-1.5 text-[11px] font-extrabold text-ink-2">
                <Wand2 className="size-3.5 text-accent" /> Start from a ready rubric
              </p>
              <div className="flex flex-wrap gap-2">
                {presets.map((p) => (
                  <Button key={p.key} variant="outline" size="sm" onClick={() => void applyPreset(p.key)}>
                    {p.name.replace(" Monthly Assessment", "")}
                    <span className="ml-1 text-[10px] text-ink-3">{p.criteria.length} criteria</span>
                  </Button>
                ))}
              </div>
              <p className="mt-2 text-[10.5px] text-ink-3">
                Everything stays editable afterwards — a preset is a starting point, not a lock.
              </p>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={label}>Assessment name</label>
              <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Quran Monthly Assessment" />
            </div>
            <div>
              <label className={label}>Course</label>
              <select className={input} value={courseId} onChange={(e) => setCourseId(e.target.value)}>
                <option value="">Select a course…</option>
                {meta?.courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={label}>Applicable level (optional)</label>
              <select className={input} value={levelId} onChange={(e) => setLevelId(e.target.value)}>
                <option value="">All levels</option>
                {meta?.levels.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={label}>Frequency</label>
              <select className={input} value={frequency} onChange={(e) => setFrequency(e.target.value as typeof frequency)}>
                <option value="MONTHLY">Monthly (every billing cycle)</option>
                <option value="QUARTERLY">Quarterly</option>
                <option value="HALF_YEARLY">Half-yearly</option>
                <option value="YEARLY">Yearly</option>
              </select>
            </div>
            <div>
              <label className={label}>Grading system</label>
              <select className={input} value={gradingScaleId} onChange={(e) => setGradingScaleId(e.target.value)}>
                {scales.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.isDefault ? " (default)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={label}>Maximum marks</label>
              <input type="number" min={1} className={input} value={maxMarks} onChange={(e) => setMaxMarks(Number(e.target.value))} />
            </div>
            <div>
              <label className={label}>Passing marks</label>
              <input type="number" min={0} className={input} value={passingMarks} onChange={(e) => setPassingMarks(Number(e.target.value))} />
            </div>
            <div>
              <label className={label}>Status</label>
              <select className={input} value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            </div>
            <div>
              <label className={label}>Display order</label>
              <input
                type="number"
                min={0}
                className={input}
                value={displayOrder}
                onChange={(e) => setDisplayOrder(Number(e.target.value))}
              />
              <p className="mt-1 text-[10px] text-ink-3">Lower shows first in the template list.</p>
            </div>
          </div>

          <div className="mt-6">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-ink-3">Assessment criteria</p>
              <Badge tone={balanced ? "good" : "critical"}>
                {total} / {maxMarks} marks allocated
              </Badge>
            </div>
            {!balanced ? (
              <p className="mb-2 text-[11px] text-red-600 dark:text-red-400">
                The criteria must add up to exactly the maximum. Otherwise no student could ever score full marks.
              </p>
            ) : null}

            <div className="space-y-2">
              {criteria.map((c, i) => (
                <div key={c.key} className="flex items-center gap-2 rounded-xl border border-hairline bg-surface-2/40 p-2">
                  <div className="flex flex-col">
                    <button type="button" onClick={() => move(i, -1)} className="text-ink-3 hover:text-ink" aria-label="Move up">
                      <GripVertical className="size-3.5" />
                    </button>
                  </div>
                  <input
                    className={`${input} flex-1`}
                    value={c.name}
                    placeholder="Tajweed Rules"
                    onChange={(e) => setCriterion(c.key, { name: e.target.value })}
                  />
                  <input
                    type="number"
                    min={1}
                    className={`${input} w-24`}
                    value={c.maxMarks}
                    onChange={(e) => setCriterion(c.key, { maxMarks: Number(e.target.value) })}
                  />
                  <label className="flex items-center gap-1 whitespace-nowrap text-[11px] text-ink-3">
                    <input
                      type="checkbox"
                      checked={c.isMandatory ?? true}
                      onChange={(e) => setCriterion(c.key, { isMandatory: e.target.checked })}
                    />
                    Required
                  </label>
                  <button
                    type="button"
                    onClick={() => setCriteria((cs) => (cs.length > 1 ? cs.filter((x) => x.key !== c.key) : cs))}
                    className="text-ink-3 hover:text-red-500"
                    aria-label="Remove criterion"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
            </div>

            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => setCriteria((cs) => [...cs, emptyCriterion(cs.length)])}
            >
              <Plus className="size-3.5" /> Add criterion
            </Button>
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" onClick={save} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Save template
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

// ── Grading scale editor ────────────────────────────────────────────────────

type DraftBand = GradeBand & { key: string };

function GradingEditor({
  editing,
  onClose,
  onSaved,
}: {
  editing: GradingScale | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(editing?.name ?? "");
  const [isDefault, setIsDefault] = useState(editing?.isDefault ?? false);
  const [bands, setBands] = useState<DraftBand[]>(
    (editing?.bands ?? [{ grade: "A", minPercent: 0, maxPercent: 100 }]).map((b, i) => ({
      ...b,
      key: b.id ?? `b-${i}`,
    })),
  );
  const [busy, setBusy] = useState(false);

  const setBand = (key: string, patch: Partial<DraftBand>) =>
    setBands((bs) => bs.map((b) => (b.key === key ? { ...b, ...patch } : b)));

  const save = async () => {
    if (!name.trim()) return fail(new Error("Give the scale a name."));
    setBusy(true);
    try {
      const payload = {
        name: name.trim(),
        isDefault,
        bands: bands.map((b, i) => ({
          grade: b.grade.trim(),
          minPercent: Number(b.minPercent),
          maxPercent: Number(b.maxPercent),
          displayOrder: i,
        })),
      };
      if (editing) await updateGradingScale(editing.id, payload);
      else await createGradingScale(payload);
      await ok("Grading scale saved");
      onSaved();
      onClose();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 backdrop-blur-sm">
      <Card className="my-8 w-full max-w-xl border border-hairline bg-surface shadow-xl">
        <CardBody className="p-6">
          <h2 className="text-lg font-black text-ink">{editing ? "Edit grading scale" : "New grading scale"}</h2>
          <p className="mt-0.5 text-xs text-ink-3">
            Bands must cover 0–100 with no gaps, or some percentage would have no grade at all.
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={label}>Scale name</label>
              <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Standard (A+ – F)" />
            </div>
            <label className="flex items-center gap-2 text-xs text-ink-2">
              <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
              Use as the default for new templates
            </label>
          </div>

          <div className="mt-5 space-y-2">
            {bands.map((b) => (
              <div key={b.key} className="flex items-center gap-2 rounded-xl border border-hairline bg-surface-2/40 p-2">
                <input
                  className={`${input} w-20`}
                  value={b.grade}
                  placeholder="A+"
                  onChange={(e) => setBand(b.key, { grade: e.target.value })}
                />
                <input
                  type="number"
                  step="0.01"
                  className={`${input} flex-1`}
                  value={b.minPercent}
                  onChange={(e) => setBand(b.key, { minPercent: Number(e.target.value) })}
                />
                <span className="text-xs text-ink-3">to</span>
                <input
                  type="number"
                  step="0.01"
                  className={`${input} flex-1`}
                  value={b.maxPercent}
                  onChange={(e) => setBand(b.key, { maxPercent: Number(e.target.value) })}
                />
                <button
                  type="button"
                  onClick={() => setBands((bs) => (bs.length > 1 ? bs.filter((x) => x.key !== b.key) : bs))}
                  className="text-ink-3 hover:text-red-500"
                  aria-label="Remove band"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
          </div>

          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() =>
              setBands((bs) => [
                ...bs,
                { key: `${Date.now()}`, grade: "", minPercent: 0, maxPercent: 0 },
              ])
            }
          >
            <Plus className="size-3.5" /> Add band
          </Button>

          <div className="mt-6 flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" onClick={save} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Save scale
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function AssessmentSettingsPage() {
  const [tab, setTab] = useState<Tab>("templates");
  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState<AssessmentConfigMeta | null>(null);
  const [templates, setTemplates] = useState<AssessmentTemplate[]>([]);
  const [scales, setScales] = useState<GradingScale[]>([]);
  const [badges, setBadges] = useState<RankingBadgeConfig[]>([]);
  const [cfg, setCfg] = useState<AssessmentConfig | null>(null);

  const [templateModal, setTemplateModal] = useState<{ open: boolean; editing: AssessmentTemplate | null }>({
    open: false,
    editing: null,
  });
  const [scaleModal, setScaleModal] = useState<{ open: boolean; editing: GradingScale | null }>({
    open: false,
    editing: null,
  });

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetchMonthlyAssessmentMeta().catch(() => null),
      fetchAssessmentTemplates().catch(() => []),
      fetchGradingScales().catch(() => []),
      fetchBadgeConfigs().catch(() => []),
      fetchAssessmentConfig().catch(() => null),
    ])
      .then(([m, t, s, b, c]) => {
        setMeta(m);
        setTemplates(t);
        setScales(s);
        setBadges(b);
        setCfg(c);
      })
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => load(), [load]);

  const [seeding, setSeeding] = useState(false);
  /*
   * Attaches the shipped rubrics to matching courses that have none. Safe to
   * press repeatedly — a course with any template is skipped — so it also picks
   * up a Quran/Arabic/Islamic Studies course added long after the first boot.
   */
  const seedStarters = async () => {
    setSeeding(true);
    try {
      const { created } = await seedAssessmentPresets();
      if (created.length) {
        load();
        await ok(`Seeded ${created.length} rubric(s)`, created.join(", "));
      } else {
        await ok("Nothing to seed", "Every matching course already has a template.");
      }
    } catch (e) {
      fail(e);
    } finally {
      setSeeding(false);
    }
  };

  const weightTotal = cfg
    ? cfg.ranking.assessment + cfg.ranking.attendance + cfg.ranking.assignment + cfg.ranking.homework + cfg.ranking.teacherRating
    : 0;

  const saveRules = async () => {
    if (!cfg) return;
    try {
      const saved = await saveAssessmentConfig(cfg);
      setCfg(saved);
      ok("Rules saved");
    } catch (e) {
      fail(e);
    }
  };

  const removeTemplate = async (t: AssessmentTemplate) => {
    const c = await Swal.fire({
      title: `Delete "${t.name}"?`,
      text: "Templates that have already been used cannot be deleted — deactivate them instead.",
      icon: "warning",
      showCancelButton: true,
      background: swalBg(),
      confirmButtonColor: "#ef4444",
    });
    if (!c.isConfirmed) return;
    try {
      await deleteAssessmentTemplate(t.id);
      load();
    } catch (e) {
      fail(e);
    }
  };

  return (
    <>
      <Topbar title="Assessment Setup" subtitle="Templates, criteria, grading, rules and badges" />

      <div className="p-4 lg:p-6">
        <div className="mb-5 flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold transition-colors ${
                tab === t.key ? "bg-accent text-accent-ink" : "bg-surface-2 text-ink-2 hover:bg-surface-3"
              }`}
            >
              <t.icon className="size-3.5" />
              {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="size-6 animate-spin text-ink-3" />
          </div>
        ) : null}

        {/* ── Templates ── */}
        {!loading && tab === "templates" ? (
          <div className="space-y-4">
            <div className="flex justify-between">
              <p className="text-xs text-ink-3">
                One active template per course (optionally per level). {templates.length} template(s) configured.
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => void seedStarters()} disabled={seeding}>
                  {seeding ? <Loader2 className="size-3.5 animate-spin" /> : <Wand2 className="size-3.5" />}
                  Seed starter rubrics
                </Button>
                <Button variant="primary" size="sm" onClick={() => setTemplateModal({ open: true, editing: null })}>
                  <Plus className="size-3.5" /> New template
                </Button>
              </div>
            </div>

            {templates.length === 0 ? (
              <Card className="border border-hairline bg-surface">
                <CardBody className="p-10 text-center">
                  <ListChecks className="mx-auto size-8 text-ink-3" />
                  <p className="mt-3 text-sm font-bold text-ink">No templates yet</p>
                  <p className="mt-1 text-xs text-ink-3">
                    A course cannot be assessed until it has one. Create the first template to get started.
                  </p>
                </CardBody>
              </Card>
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                {templates.map((t) => (
                  <Card key={t.id} className="border border-hairline bg-surface">
                    <CardBody className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-black text-ink">{t.name}</p>
                          <p className="mt-0.5 text-[11px] text-ink-3">
                            {t.course?.title ?? "—"}
                            {t.level ? ` · ${t.level.name}` : " · all levels"} · {t.frequency.toLowerCase()}
                          </p>
                        </div>
                        <Badge tone={t.status === "ACTIVE" ? "good" : "neutral"}>{t.status}</Badge>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {t.criteria.map((c) => (
                          <span
                            key={c.id}
                            className="rounded-lg border border-hairline bg-surface-2/60 px-2 py-0.5 text-[10px] font-semibold text-ink-2"
                          >
                            {c.name} · {c.maxMarks}
                          </span>
                        ))}
                      </div>

                      <div className="mt-3 flex items-center justify-between text-[11px] text-ink-3">
                        <span>
                          {t.criteriaTotal}/{t.maxMarks} marks · pass at {t.passingMarks} · {t.gradingScale?.name ?? "default scale"}
                        </span>
                        <span>{t.usedBy} used</span>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-1.5">
                        <Button size="sm" variant="outline" onClick={() => setTemplateModal({ open: true, editing: t })}>
                          Edit
                        </Button>
                        {t.status === "ACTIVE" ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => deactivateAssessmentTemplate(t.id).then(load).catch(fail)}
                          >
                            <PowerOff className="size-3.5" /> Deactivate
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => activateAssessmentTemplate(t.id).then(load).catch(fail)}
                          >
                            <Power className="size-3.5" /> Activate
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => duplicateAssessmentTemplate(t.id).then(load).catch(fail)}>
                          <Copy className="size-3.5" /> Duplicate
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => removeTemplate(t)}>
                          <Trash2 className="size-3.5" /> Delete
                        </Button>
                      </div>
                    </CardBody>
                  </Card>
                ))}
              </div>
            )}
          </div>
        ) : null}

        {/* ── Grading scales ── */}
        {!loading && tab === "grading" ? (
          <div className="space-y-4">
            <div className="flex justify-between">
              <p className="text-xs text-ink-3">The grade a percentage maps to. Each template picks one.</p>
              <Button variant="primary" size="sm" onClick={() => setScaleModal({ open: true, editing: null })}>
                <Plus className="size-3.5" /> New scale
              </Button>
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              {scales.map((s) => (
                <Card key={s.id} className="border border-hairline bg-surface">
                  <CardBody className="p-4">
                    <div className="flex items-start justify-between">
                      <p className="text-sm font-black text-ink">{s.name}</p>
                      {s.isDefault ? <Badge tone="accent">Default</Badge> : null}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {s.bands.map((b) => (
                        <span
                          key={b.id ?? b.grade}
                          className="rounded-lg border border-hairline bg-surface-2/60 px-2 py-0.5 text-[10px] font-semibold text-ink-2"
                        >
                          {b.grade}: {b.minPercent}–{b.maxPercent}%
                        </span>
                      ))}
                    </div>
                    <div className="mt-3 flex gap-1.5">
                      <Button size="sm" variant="outline" onClick={() => setScaleModal({ open: true, editing: s })}>
                        Edit
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => deleteGradingScale(s.id).then(load).catch(fail)}>
                        <Trash2 className="size-3.5" /> Delete
                      </Button>
                    </div>
                  </CardBody>
                </Card>
              ))}
            </div>
          </div>
        ) : null}

        {/* ── Rules + weightage ── */}
        {!loading && tab === "rules" && cfg ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="border border-hairline bg-surface">
              <CardBody className="p-5">
                <p className="text-sm font-black text-ink">Assessment rules</p>
                <p className="mt-0.5 text-xs text-ink-3">
                  The period is the student&apos;s 28-day billing cycle, labelled by the month it falls in.
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className={label}>Minimum days enrolled</label>
                    <input
                      type="number"
                      min={0}
                      max={28}
                      className={input}
                      value={cfg.minDaysBeforeAssessment}
                      onChange={(e) => setCfg({ ...cfg, minDaysBeforeAssessment: Number(e.target.value) })}
                    />
                    <p className="mt-1 text-[10px] text-ink-3">A new student below this is skipped for the cycle.</p>
                  </div>
                  <div>
                    <label className={label}>Due days after cycle end</label>
                    <input
                      type="number"
                      min={0}
                      max={60}
                      className={input}
                      value={cfg.dueDaysAfterCycleEnd}
                      onChange={(e) => setCfg({ ...cfg, dueDaysAfterCycleEnd: Number(e.target.value) })}
                    />
                  </div>
                  <div>
                    <label className={label}>Remind teacher (days before)</label>
                    <input
                      type="number"
                      min={0}
                      max={30}
                      className={input}
                      value={cfg.reminderDaysBefore}
                      onChange={(e) => setCfg({ ...cfg, reminderDaysBefore: Number(e.target.value) })}
                    />
                  </div>
                  <div>
                    <label className={label}>Leaderboard places students may see</label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      className={input}
                      value={cfg.studentVisibleTopN}
                      onChange={(e) => setCfg({ ...cfg, studentVisibleTopN: Number(e.target.value) })}
                    />
                  </div>
                </div>
                <div className="mt-4 space-y-2">
                  {(
                    [
                      ["overdueReminders", "Keep reminding daily once overdue"],
                      [
                        "requireSupervisorApproval",
                        "Require supervisor approval before publishing — leave off and a teacher's submission publishes to the family straight away",
                      ],
                      ["autoRankOnPublish", "Generate rankings automatically once a cycle is fully published"],
                    ] as const
                  ).map(([key, text]) => (
                    <label key={key} className="flex items-center gap-2 text-xs text-ink-2">
                      <input
                        type="checkbox"
                        checked={cfg[key]}
                        onChange={(e) => setCfg({ ...cfg, [key]: e.target.checked })}
                      />
                      {text}
                    </label>
                  ))}
                </div>
              </CardBody>
            </Card>

            <Card className="border border-hairline bg-surface">
              <CardBody className="p-5">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-black text-ink">Ranking weightage</p>
                  <Badge tone={Math.round(weightTotal) === 100 ? "good" : "critical"}>{weightTotal}%</Badge>
                </div>
                <p className="mt-0.5 text-xs text-ink-3">Must total exactly 100%.</p>
                <div className="mt-4 space-y-3">
                  {(
                    [
                      ["assessment", "Monthly assessment score"],
                      ["attendance", "Attendance percentage"],
                      ["assignment", "Assignment score"],
                      ["homework", "Homework completion"],
                      ["teacherRating", "Teacher performance rating"],
                    ] as const
                  ).map(([key, text]) => (
                    <div key={key} className="flex items-center gap-3">
                      <span className="flex-1 text-xs text-ink-2">{text}</span>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        className={`${input} w-24`}
                        value={cfg.ranking[key]}
                        onChange={(e) => setCfg({ ...cfg, ranking: { ...cfg.ranking, [key]: Number(e.target.value) } })}
                      />
                      <span className="text-xs text-ink-3">%</span>
                    </div>
                  ))}
                </div>
                <Button variant="primary" className="mt-5 w-full" onClick={saveRules}>
                  <Save className="size-4" /> Save rules &amp; weightage
                </Button>
              </CardBody>
            </Card>
          </div>
        ) : null}

        {/* ── Badges ── */}
        {!loading && tab === "badges" ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {badges.map((b) => (
              <Card key={b.id} className="border border-hairline bg-surface">
                <CardBody className="p-4">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{b.icon}</span>
                    <div className="flex-1">
                      <input
                        className={input}
                        value={b.label}
                        onChange={(e) => setBadges((bs) => bs.map((x) => (x.id === b.id ? { ...x, label: e.target.value } : x)))}
                      />
                      <p className="mt-1 text-[10px] text-ink-3">{b.rule.replace(/_/g, " ")}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-3">
                    <input
                      className={`${input} w-20`}
                      value={b.icon}
                      onChange={(e) => setBadges((bs) => bs.map((x) => (x.id === b.id ? { ...x, icon: e.target.value } : x)))}
                    />
                    {b.threshold != null ? (
                      <input
                        type="number"
                        className={`${input} w-24`}
                        value={b.threshold}
                        onChange={(e) =>
                          setBadges((bs) => bs.map((x) => (x.id === b.id ? { ...x, threshold: Number(e.target.value) } : x)))
                        }
                      />
                    ) : null}
                    <label className="flex items-center gap-1.5 whitespace-nowrap text-xs text-ink-2">
                      <input
                        type="checkbox"
                        checked={b.enabled}
                        onChange={(e) => setBadges((bs) => bs.map((x) => (x.id === b.id ? { ...x, enabled: e.target.checked } : x)))}
                      />
                      Enabled
                    </label>
                    <Button
                      size="sm"
                      variant="outline"
                      className="ml-auto"
                      onClick={() =>
                        saveBadgeConfig({
                          rule: b.rule,
                          label: b.label,
                          icon: b.icon,
                          enabled: b.enabled,
                          ...(b.threshold != null ? { threshold: b.threshold } : {}),
                        })
                          .then((next) => {
                            setBadges(next);
                            ok("Badge saved");
                          })
                          .catch(fail)
                      }
                    >
                      Save
                    </Button>
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        ) : null}
      </div>

      {templateModal.open ? (
        <TemplateEditor
          meta={meta}
          scales={scales}
          editing={templateModal.editing}
          onClose={() => setTemplateModal({ open: false, editing: null })}
          onSaved={load}
        />
      ) : null}
      {scaleModal.open ? (
        <GradingEditor editing={scaleModal.editing} onClose={() => setScaleModal({ open: false, editing: null })} onSaved={load} />
      ) : null}
    </>
  );
}
