import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import type { RankingBadgeRule } from '../generated/prisma/enums';
import {
  ASSESSMENT_CONFIG_KEY,
  AssessmentConfig,
  DEFAULT_ASSESSMENT_CONFIG,
  DEFAULT_BADGES,
  DEFAULT_GRADE_BANDS,
  DEFAULT_GRADING_SCALE_NAME,
  STARTER_TEMPLATES,
  starterFor,
} from './assessment.config';
import type {
  CreateTemplateDto, CriterionDto, ListTemplatesQuery, SaveAssessmentConfigDto,
  SaveBadgeDto, SaveGradingScaleDto, UpdateTemplateDto,
} from './dto';

export interface Actor {
  id: string;
  email: string;
  role: string;
}

/*
 * The name stored on an audit field. The JWT carries only id/email/role, and
 * the rest of this codebase settles for stamping the email — which reads badly
 * on a report a family sees ("Approved by ops@..."). One lookup on an action
 * that happens a few times a day is worth the readable name; the email remains
 * the fallback so a missing user never blocks the write.
 */
export async function actorName(
  prisma: PrismaService,
  actor: Actor | null | undefined,
): Promise<string | null> {
  if (!actor?.id) return null;
  const u = await prisma.user
    .findUnique({ where: { id: actor.id }, select: { firstName: true, lastName: true } })
    .catch(() => null);
  const full = u ? `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() : '';
  return full || actor.email || null;
}

/*
 * The configuration half of Module 7: rubrics, grade ladders, deadlines,
 * ranking weightage and badges. Everything a new course needs in order to be
 * assessable — which is the module's central promise: adding "French Language"
 * is a row here, never a deploy.
 */
@Injectable()
export class AssessmentTemplatesService implements OnModuleInit {
  private readonly logger = new Logger(AssessmentTemplatesService.name);

  constructor(private readonly prisma: PrismaService) {}

  /*
   * Seed the shipped defaults once. Without a default grading scale the very
   * first template has nothing to grade against, and without badge rows the
   * ranking engine has nothing to award — both would look like bugs to whoever
   * opened the screen first.
   */
  async onModuleInit() {
    setTimeout(() => void this.seedDefaults().catch(() => undefined), 8_000).unref();
  }

  async seedDefaults() {
    const scaleCount = await this.prisma.gradingScale.count();
    if (scaleCount === 0) {
      await this.prisma.gradingScale.create({
        data: {
          name: DEFAULT_GRADING_SCALE_NAME,
          isDefault: true,
          bands: {
            create: DEFAULT_GRADE_BANDS.map((b, i) => ({
              grade: b.grade,
              minPercent: b.minPercent,
              maxPercent: b.maxPercent,
              displayOrder: i,
            })),
          },
        },
      });
    }

    for (const b of DEFAULT_BADGES) {
      await this.prisma.rankingBadgeConfig
        .upsert({
          where: { rule: b.rule },
          update: {},
          create: {
            rule: b.rule,
            label: b.label,
            icon: b.icon,
            threshold: b.threshold,
            displayOrder: b.displayOrder,
          },
        })
        .catch(() => undefined);
    }

    await this.seedStarterTemplates().catch(() => undefined);
  }

  /*
   * Give the courses the spec names a working rubric out of the box.
   *
   * Deliberately conservative: only a published course whose title matches a
   * preset and which has NO template at all is seeded. Once an admin has
   * touched a course's rubric — even to delete it and start over — this never
   * runs against it again, so a boot can never resurrect or overwrite their
   * work.
   */
  async seedStarterTemplates(): Promise<{ created: string[] }> {
    const scale = await this.prisma.gradingScale.findFirst({
      where: { isDefault: true },
      select: { id: true },
    });

    const courses = await this.prisma.course.findMany({
      where: { status: { not: 'ARCHIVED' } },
      select: { id: true, title: true, _count: { select: { assessmentTemplates: true } } },
    });

    const created: string[] = [];
    for (const c of courses) {
      if (c._count.assessmentTemplates > 0) continue;
      const preset = starterFor(c.title);
      if (!preset) continue;
      try {
        await this.prisma.assessmentTemplate.create({
          data: {
            name: preset.name,
            courseId: c.id,
            maxMarks: preset.maxMarks,
            passingMarks: preset.passingMarks,
            gradingScaleId: scale?.id ?? null,
            status: 'ACTIVE',
            createdByName: 'System (starter template)',
            criteria: {
              create: preset.criteria.map((cr, i) => ({
                name: cr.name,
                maxMarks: cr.maxMarks,
                displayOrder: i,
                isMandatory: true,
              })),
            },
          },
        });
        created.push(c.title);
      } catch {
        /* a course seeded by a concurrent boot is not an error */
      }
    }
    if (created.length) this.logger.log(`Seeded starter rubrics for: ${created.join(', ')}`);
    return { created };
  }

  /** The shipped rubrics, for the "start from a preset" picker. */
  presets() {
    return STARTER_TEMPLATES.map((t) => ({
      key: t.key,
      name: t.name,
      maxMarks: t.maxMarks,
      passingMarks: t.passingMarks,
      criteria: t.criteria,
    }));
  }

  // ── Module config ──────────────────────────────────────────────────────────

  async config(): Promise<AssessmentConfig> {
    const row = await this.prisma.systemSetting.findUnique({
      where: { key: ASSESSMENT_CONFIG_KEY },
    });
    if (!row) return { ...DEFAULT_ASSESSMENT_CONFIG };
    try {
      const parsed = JSON.parse(row.value) as Partial<AssessmentConfig>;
      return {
        ...DEFAULT_ASSESSMENT_CONFIG,
        ...parsed,
        ranking: { ...DEFAULT_ASSESSMENT_CONFIG.ranking, ...(parsed.ranking ?? {}) },
      };
    } catch {
      return { ...DEFAULT_ASSESSMENT_CONFIG };
    }
  }

  async saveConfig(dto: SaveAssessmentConfigDto): Promise<AssessmentConfig> {
    const current = await this.config();
    const next: AssessmentConfig = {
      ...current,
      ...dto,
      ranking: { ...current.ranking, ...(dto.ranking ?? {}) },
    };
    /*
     * The weights are re-normalised at scoring time, so a set that does not add
     * to 100 still produces a sane ranking — but it is almost always a typo, and
     * silently rescaling it would hide the mistake until somebody queried a
     * league table. Refuse it here instead.
     */
    const sum =
      next.ranking.assessment + next.ranking.attendance + next.ranking.assignment +
      next.ranking.homework + next.ranking.teacherRating;
    if (Math.round(sum) !== 100) {
      throw new BadRequestException(
        `Ranking weightage must total 100% — it currently totals ${Math.round(sum * 100) / 100}%.`,
      );
    }
    await this.prisma.systemSetting.upsert({
      where: { key: ASSESSMENT_CONFIG_KEY },
      update: { value: JSON.stringify(next) },
      create: { key: ASSESSMENT_CONFIG_KEY, value: JSON.stringify(next) },
    });
    return next;
  }

  // ── Grading scales ─────────────────────────────────────────────────────────

  async listScales() {
    const rows = await this.prisma.gradingScale.findMany({
      include: { bands: { orderBy: { displayOrder: 'asc' } } },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
    return rows.map((s) => ({
      id: s.id,
      name: s.name,
      isDefault: s.isDefault,
      bands: s.bands.map((b) => ({
        id: b.id,
        grade: b.grade,
        minPercent: Number(b.minPercent),
        maxPercent: Number(b.maxPercent),
        displayOrder: b.displayOrder,
      })),
    }));
  }

  private assertBands(bands: SaveGradingScaleDto['bands']) {
    if (!bands?.length) throw new BadRequestException('A grading scale needs at least one band.');
    for (const b of bands) {
      if (b.minPercent > b.maxPercent) {
        throw new BadRequestException(
          `Grade "${b.grade}": the minimum (${b.minPercent}%) is above the maximum (${b.maxPercent}%).`,
        );
      }
    }
    // A gap means some percentage has no grade at all, which surfaces as a blank
    // grade on a finished report — worth catching at configuration time.
    const sorted = [...bands].sort((a, b) => a.minPercent - b.minPercent);
    if (sorted[0].minPercent > 0) {
      throw new BadRequestException(
        `The lowest band starts at ${sorted[0].minPercent}% — scores below that would have no grade.`,
      );
    }
    if (sorted[sorted.length - 1].maxPercent < 100) {
      throw new BadRequestException(
        `The highest band ends at ${sorted[sorted.length - 1].maxPercent}% — a perfect score would have no grade.`,
      );
    }
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].minPercent > sorted[i - 1].maxPercent + 0.011) {
        throw new BadRequestException(
          `There is a gap between ${sorted[i - 1].maxPercent}% and ${sorted[i].minPercent}% with no grade.`,
        );
      }
    }
  }

  async createScale(dto: SaveGradingScaleDto) {
    this.assertBands(dto.bands);
    if (dto.isDefault) await this.prisma.gradingScale.updateMany({ data: { isDefault: false } });
    const created = await this.prisma.gradingScale.create({
      data: {
        name: dto.name.trim(),
        isDefault: dto.isDefault ?? false,
        bands: {
          create: dto.bands.map((b, i) => ({
            grade: b.grade.trim(),
            minPercent: b.minPercent,
            maxPercent: b.maxPercent,
            displayOrder: b.displayOrder ?? i,
          })),
        },
      },
      select: { id: true },
    });
    return this.getScale(created.id);
  }

  async getScale(id: string) {
    const s = await this.prisma.gradingScale.findUnique({
      where: { id },
      include: { bands: { orderBy: { displayOrder: 'asc' } } },
    });
    if (!s) throw new NotFoundException('Grading scale not found.');
    return {
      id: s.id,
      name: s.name,
      isDefault: s.isDefault,
      bands: s.bands.map((b) => ({
        id: b.id,
        grade: b.grade,
        minPercent: Number(b.minPercent),
        maxPercent: Number(b.maxPercent),
        displayOrder: b.displayOrder,
      })),
    };
  }

  async updateScale(id: string, dto: SaveGradingScaleDto) {
    const existing = await this.prisma.gradingScale.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw new NotFoundException('Grading scale not found.');
    if (dto.bands) this.assertBands(dto.bands);
    if (dto.isDefault) await this.prisma.gradingScale.updateMany({ data: { isDefault: false } });

    await this.prisma.$transaction(async (tx) => {
      await tx.gradingScale.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.isDefault !== undefined ? { isDefault: dto.isDefault } : {}),
        },
      });
      if (dto.bands) {
        // Bands are replaced wholesale: they are a set, not independently
        // addressable rows, and a diff would be more code for identical results.
        await tx.gradeBand.deleteMany({ where: { scaleId: id } });
        await tx.gradeBand.createMany({
          data: dto.bands.map((b, i) => ({
            scaleId: id,
            grade: b.grade.trim(),
            minPercent: b.minPercent,
            maxPercent: b.maxPercent,
            displayOrder: b.displayOrder ?? i,
          })),
        });
      }
    });
    return this.getScale(id);
  }

  async deleteScale(id: string) {
    const scale = await this.prisma.gradingScale.findUnique({
      where: { id },
      select: { isDefault: true, _count: { select: { templates: true } } },
    });
    if (!scale) throw new NotFoundException('Grading scale not found.');
    if (scale.isDefault) {
      throw new BadRequestException('The default grading scale cannot be deleted — make another one the default first.');
    }
    if (scale._count.templates > 0) {
      throw new BadRequestException(
        `This scale is used by ${scale._count.templates} template(s). Point them at another scale first.`,
      );
    }
    await this.prisma.gradingScale.delete({ where: { id } });
    return { deleted: true };
  }

  /** The bands an assessment should be graded against, template scale or default. */
  async bandsFor(gradingScaleId: string | null | undefined) {
    const scale = gradingScaleId
      ? await this.prisma.gradingScale.findUnique({
          where: { id: gradingScaleId },
          include: { bands: true },
        })
      : await this.prisma.gradingScale.findFirst({
          where: { isDefault: true },
          include: { bands: true },
        });
    const fallback = scale ?? (await this.prisma.gradingScale.findFirst({ include: { bands: true } }));
    return (fallback?.bands ?? []).map((b) => ({
      grade: b.grade,
      minPercent: Number(b.minPercent),
      maxPercent: Number(b.maxPercent),
    }));
  }

  // ── Templates ──────────────────────────────────────────────────────────────

  private assertCriteria(criteria: CriterionDto[], maxMarks: number, passingMarks: number) {
    if (!criteria?.length) {
      throw new BadRequestException('A template needs at least one assessment criterion.');
    }
    const names = new Set<string>();
    for (const c of criteria) {
      const key = c.name.trim().toLowerCase();
      if (names.has(key)) {
        throw new BadRequestException(`"${c.name.trim()}" is listed twice — criteria names must be unique.`);
      }
      names.add(key);
    }
    const sum = criteria.reduce((a, c) => a + Number(c.maxMarks || 0), 0);
    /*
     * The criteria ARE the total: if they sum to 95 while the template claims
     * 100, every student is capped at 95% and no one can score an A+. Refusing
     * the save is the only place this is cheap to notice.
     */
    if (sum !== maxMarks) {
      throw new BadRequestException(
        `The criteria add up to ${sum} marks but the template's total is ${maxMarks}. They must match.`,
      );
    }
    if (passingMarks > maxMarks) {
      throw new BadRequestException(`Passing marks (${passingMarks}) cannot exceed the total (${maxMarks}).`);
    }
  }

  /** Refuse a second ACTIVE template for the same course + level. */
  private async assertNoActiveClash(
    courseId: string,
    levelId: string | null,
    status: string,
    ignoreId?: string,
  ) {
    if (status !== 'ACTIVE') return;
    const clash = await this.prisma.assessmentTemplate.findFirst({
      where: {
        courseId,
        levelId: levelId ?? null,
        status: 'ACTIVE',
        ...(ignoreId ? { id: { not: ignoreId } } : {}),
      },
      select: { id: true, name: true },
    });
    if (clash) {
      throw new BadRequestException(
        `"${clash.name}" is already the active template for this course${levelId ? ' and level' : ''}. Deactivate it first.`,
      );
    }
  }

  async createTemplate(dto: CreateTemplateDto, actor: Actor) {
    const course = await this.prisma.course.findUnique({
      where: { id: dto.courseId },
      select: { id: true },
    });
    if (!course) throw new BadRequestException('Course not found.');
    if (dto.levelId) {
      const lvl = await this.prisma.level.findUnique({ where: { id: dto.levelId }, select: { id: true } });
      if (!lvl) throw new BadRequestException('Level not found.');
    }

    const maxMarks = dto.maxMarks ?? 100;
    const passingMarks = dto.passingMarks ?? 40;
    const status = dto.status ?? 'ACTIVE';
    this.assertCriteria(dto.criteria, maxMarks, passingMarks);
    await this.assertNoActiveClash(dto.courseId, dto.levelId ?? null, status);

    const created = await this.prisma.assessmentTemplate.create({
      data: {
        name: dto.name.trim(),
        courseId: dto.courseId,
        levelId: dto.levelId ?? null,
        frequency: (dto.frequency ?? 'MONTHLY') as never,
        maxMarks,
        passingMarks,
        gradingScaleId: dto.gradingScaleId ?? (await this.defaultScaleId()),
        displayOrder: dto.displayOrder ?? 0,
        status: status as never,
        createdById: actor?.id ?? null,
        createdByName: await actorName(this.prisma, actor),
        criteria: {
          create: dto.criteria.map((c, i) => ({
            name: c.name.trim(),
            maxMarks: c.maxMarks,
            displayOrder: c.displayOrder ?? i,
            isMandatory: c.isMandatory ?? true,
          })),
        },
      },
      select: { id: true },
    });
    return this.getTemplate(created.id);
  }

  private async defaultScaleId(): Promise<string | null> {
    const s = await this.prisma.gradingScale.findFirst({
      where: { isDefault: true },
      select: { id: true },
    });
    return s?.id ?? null;
  }

  async listTemplates(q: ListTemplatesQuery) {
    const rows = await this.prisma.assessmentTemplate.findMany({
      where: {
        ...(q.courseId ? { courseId: q.courseId } : {}),
        ...(q.levelId ? { levelId: q.levelId } : {}),
        ...(q.status ? { status: q.status as never } : {}),
        ...(q.search ? { name: { contains: q.search, mode: 'insensitive' as const } } : {}),
      },
      include: {
        course: { select: { id: true, title: true } },
        level: { select: { id: true, name: true } },
        gradingScale: { select: { id: true, name: true } },
        criteria: { orderBy: { displayOrder: 'asc' } },
        _count: { select: { assessments: true } },
      },
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'desc' }],
    });
    return rows.map((t) => this.shapeTemplate(t));
  }

  private shapeTemplate(t: any) {
    return {
      id: t.id,
      name: t.name,
      course: t.course ? { id: t.course.id, title: t.course.title } : null,
      level: t.level ? { id: t.level.id, name: t.level.name } : null,
      frequency: t.frequency,
      maxMarks: t.maxMarks,
      passingMarks: t.passingMarks,
      gradingScale: t.gradingScale ? { id: t.gradingScale.id, name: t.gradingScale.name } : null,
      displayOrder: t.displayOrder,
      status: t.status,
      criteria: (t.criteria ?? []).map((c: any) => ({
        id: c.id,
        name: c.name,
        maxMarks: c.maxMarks,
        displayOrder: c.displayOrder,
        isMandatory: c.isMandatory,
      })),
      criteriaTotal: (t.criteria ?? []).reduce((a: number, c: any) => a + c.maxMarks, 0),
      usedBy: t._count?.assessments ?? 0,
      createdByName: t.createdByName ?? null,
      createdAt: t.createdAt,
    };
  }

  async getTemplate(id: string) {
    const t = await this.prisma.assessmentTemplate.findUnique({
      where: { id },
      include: {
        course: { select: { id: true, title: true } },
        level: { select: { id: true, name: true } },
        gradingScale: { select: { id: true, name: true } },
        criteria: { orderBy: { displayOrder: 'asc' } },
        _count: { select: { assessments: true } },
      },
    });
    if (!t) throw new NotFoundException('Assessment template not found.');
    return this.shapeTemplate(t);
  }

  async updateTemplate(id: string, dto: UpdateTemplateDto) {
    const existing = await this.prisma.assessmentTemplate.findUnique({
      where: { id },
      include: { criteria: true },
    });
    if (!existing) throw new NotFoundException('Assessment template not found.');

    const maxMarks = dto.maxMarks ?? existing.maxMarks;
    const passingMarks = dto.passingMarks ?? existing.passingMarks;
    const status = dto.status ?? existing.status;
    const courseId = dto.courseId ?? existing.courseId;
    const levelId = dto.levelId !== undefined ? dto.levelId ?? null : existing.levelId;

    const criteria =
      dto.criteria ??
      existing.criteria.map((c) => ({
        name: c.name,
        maxMarks: c.maxMarks,
        displayOrder: c.displayOrder,
        isMandatory: c.isMandatory,
      }));
    this.assertCriteria(criteria as CriterionDto[], maxMarks, passingMarks);
    await this.assertNoActiveClash(courseId, levelId, status, id);

    await this.prisma.$transaction(async (tx) => {
      await tx.assessmentTemplate.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.courseId !== undefined ? { courseId: dto.courseId } : {}),
          ...(dto.levelId !== undefined ? { levelId: dto.levelId ?? null } : {}),
          ...(dto.frequency !== undefined ? { frequency: dto.frequency as never } : {}),
          ...(dto.maxMarks !== undefined ? { maxMarks: dto.maxMarks } : {}),
          ...(dto.passingMarks !== undefined ? { passingMarks: dto.passingMarks } : {}),
          ...(dto.gradingScaleId !== undefined ? { gradingScaleId: dto.gradingScaleId || null } : {}),
          ...(dto.displayOrder !== undefined ? { displayOrder: dto.displayOrder } : {}),
          ...(dto.status !== undefined ? { status: dto.status as never } : {}),
        },
      });
      if (dto.criteria) {
        /*
         * Criteria are replaced wholesale. Assessments already written keep
         * their own snapshot of every criterion name and ceiling
         * (MonthlyAssessmentScore), so rewriting the rubric never rewrites a
         * report that has already been graded.
         */
        await tx.assessmentCriterion.deleteMany({ where: { templateId: id } });
        await tx.assessmentCriterion.createMany({
          data: dto.criteria.map((c, i) => ({
            templateId: id,
            name: c.name.trim(),
            maxMarks: c.maxMarks,
            displayOrder: c.displayOrder ?? i,
            isMandatory: c.isMandatory ?? true,
          })),
        });
      }
    });
    return this.getTemplate(id);
  }

  async setTemplateStatus(id: string, status: 'ACTIVE' | 'INACTIVE') {
    const t = await this.prisma.assessmentTemplate.findUnique({
      where: { id },
      select: { courseId: true, levelId: true },
    });
    if (!t) throw new NotFoundException('Assessment template not found.');
    await this.assertNoActiveClash(t.courseId, t.levelId, status, id);
    await this.prisma.assessmentTemplate.update({ where: { id }, data: { status: status as never } });
    return this.getTemplate(id);
  }

  async duplicateTemplate(id: string, actor: Actor) {
    const t = await this.prisma.assessmentTemplate.findUnique({
      where: { id },
      include: { criteria: { orderBy: { displayOrder: 'asc' } } },
    });
    if (!t) throw new NotFoundException('Assessment template not found.');
    const copy = await this.prisma.assessmentTemplate.create({
      data: {
        name: `${t.name} (Copy)`,
        courseId: t.courseId,
        levelId: t.levelId,
        frequency: t.frequency,
        maxMarks: t.maxMarks,
        passingMarks: t.passingMarks,
        gradingScaleId: t.gradingScaleId,
        displayOrder: t.displayOrder,
        // A copy is always INACTIVE: two active templates for one course is
        // exactly the clash `assertNoActiveClash` exists to prevent.
        status: 'INACTIVE',
        createdById: actor?.id ?? null,
        createdByName: await actorName(this.prisma, actor),
        criteria: {
          create: t.criteria.map((c) => ({
            name: c.name,
            maxMarks: c.maxMarks,
            displayOrder: c.displayOrder,
            isMandatory: c.isMandatory,
          })),
        },
      },
      select: { id: true },
    });
    return this.getTemplate(copy.id);
  }

  async deleteTemplate(id: string) {
    const t = await this.prisma.assessmentTemplate.findUnique({
      where: { id },
      select: { name: true, _count: { select: { assessments: true } } },
    });
    if (!t) throw new NotFoundException('Assessment template not found.');
    if (t._count.assessments > 0) {
      /*
       * Deleting would orphan the assessments that used it (templateId is
       * SetNull), losing the link from a report back to the rubric it came
       * from. Deactivating keeps the history and stops new use — which is what
       * "delete" actually means here.
       */
      throw new BadRequestException(
        `"${t.name}" has been used for ${t._count.assessments} assessment(s). Deactivate it instead of deleting it.`,
      );
    }
    await this.prisma.assessmentTemplate.delete({ where: { id } });
    return { deleted: true };
  }

  /** The rubric that applies to a student's course + level, if any. */
  async templateFor(courseId: string, levelId: string | null) {
    const byLevel = levelId
      ? await this.prisma.assessmentTemplate.findFirst({
          where: { courseId, levelId, status: 'ACTIVE' },
          include: { criteria: { orderBy: { displayOrder: 'asc' } } },
        })
      : null;
    if (byLevel) return byLevel;
    return this.prisma.assessmentTemplate.findFirst({
      where: { courseId, levelId: null, status: 'ACTIVE' },
      include: { criteria: { orderBy: { displayOrder: 'asc' } } },
    });
  }

  // ── Badges ─────────────────────────────────────────────────────────────────

  async listBadges() {
    const rows = await this.prisma.rankingBadgeConfig.findMany({ orderBy: { displayOrder: 'asc' } });
    if (!rows.length) {
      await this.seedDefaults();
      return this.prisma.rankingBadgeConfig.findMany({ orderBy: { displayOrder: 'asc' } });
    }
    return rows;
  }

  async saveBadge(dto: SaveBadgeDto) {
    const rule = dto.rule as RankingBadgeRule;
    const known = DEFAULT_BADGES.some((b) => b.rule === rule);
    if (!known) throw new BadRequestException(`Unknown badge rule "${dto.rule}".`);
    const fallback = DEFAULT_BADGES.find((b) => b.rule === rule)!;
    await this.prisma.rankingBadgeConfig.upsert({
      where: { rule },
      update: {
        ...(dto.label !== undefined ? { label: dto.label.trim() } : {}),
        ...(dto.icon !== undefined ? { icon: dto.icon } : {}),
        ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
        ...(dto.threshold !== undefined ? { threshold: dto.threshold } : {}),
        ...(dto.displayOrder !== undefined ? { displayOrder: dto.displayOrder } : {}),
      },
      create: {
        rule,
        label: dto.label?.trim() || fallback.label,
        icon: dto.icon || fallback.icon,
        enabled: dto.enabled ?? true,
        threshold: dto.threshold ?? fallback.threshold,
        displayOrder: dto.displayOrder ?? fallback.displayOrder,
      },
    });
    return this.listBadges();
  }

  // ── Meta for the configuration screens ─────────────────────────────────────

  async meta() {
    const [courses, levels, scales] = await Promise.all([
      this.prisma.course.findMany({
        select: { id: true, title: true, levelId: true },
        orderBy: { title: 'asc' },
      }),
      this.prisma.level.findMany({ select: { id: true, name: true }, orderBy: { order: 'asc' } }),
      this.prisma.gradingScale.findMany({
        select: { id: true, name: true, isDefault: true },
        orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
      }),
    ]);
    return { courses, levels, gradingScales: scales };
  }
}
