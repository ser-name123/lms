import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { CourseStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { bulkDelete } from '../common/bulk-delete';

@Injectable()
export class LmsDataService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    try {
      const lmsPackages = await this.prisma.lmsPackage.findMany();
      for (const lp of lmsPackages) {
        const exists = await this.prisma.package.findUnique({ where: { id: lp.id } });
        if (!exists) {
          console.log(`[LmsDataService] Syncing missing Package: ${lp.title}`);
          await this.prisma.package.create({
            data: {
              id: lp.id,
              name: lp.title,
              description: lp.description,
              price: lp.price,
              classesPerMonth: classesFor(lp),
              active: lp.status === 'Active',
            }
          });
        }
      }

      // Clean up stale trials for converted/rejected/closed leads
      const staleTrials = await this.prisma.leadTrial.findMany({
        where: {
          status: { in: ['SCHEDULED', 'RESCHEDULED'] },
          lead: {
            status: { in: ['CONVERTED', 'REJECTED', 'CLOSED'] }
          }
        },
        include: { lead: true }
      });
      for (const t of staleTrials) {
        const isFuture = t.scheduledAt && new Date(t.scheduledAt) > new Date();
        const newStatus = t.lead.status === 'CONVERTED'
          ? (isFuture ? 'CANCELLED' : 'COMPLETED')
          : 'CANCELLED';
        console.log(`[LmsDataService] Cleaning up stale trial ${t.id} for lead ${t.lead.leadNumber} (${t.lead.status}) -> ${newStatus}`);
        await this.prisma.leadTrial.update({
          where: { id: t.id },
          data: { status: newStatus }
        });
      }
    } catch (err) {
      console.error('[LmsDataService] Failed to sync packages/clean up trials on init:', err);
    }
  }

  // 1. Courses
  //
  // A course exists in two places: this flat catalogue (LmsCourse), which is
  // what the admin page edits, and the relational `Course`, which is what
  // enrolments, batches, class sessions, assignments, assessments and
  // subscriptions all point at. They share an id and are written together —
  // a catalogue entry with no Course behind it is a course nobody can be put
  // into, which is how this used to behave.
  //
  // Counts are read from the relational side rather than from the two stored
  // columns. Those were typed in by hand, so they claimed 20 students for a
  // course with no enrolments — and the delete guard believed them, refusing
  // deletions for students who did not exist and allowing them for students
  // who did.
  async getCourses() {
    const [courses, enrolments, teacherLinks] = await Promise.all([
      this.prisma.lmsCourse.findMany({ orderBy: { createdAt: 'desc' } }),
      this.prisma.enrollment.groupBy({
        by: ['courseId'],
        where: { status: { in: ['ACTIVE', 'TRIAL', 'PENDING'] } },
        _count: { _all: true },
      }),
      this.prisma.course.findMany({
        select: { id: true, _count: { select: { teachers: true } } },
      }),
    ]);

    const students = new Map(enrolments.map((e) => [e.courseId, e._count._all]));
    const teachers = new Map(teacherLinks.map((c) => [c.id, c._count.teachers]));

    return courses.map((c) => ({
      ...c,
      studentsCount: students.get(c.id) ?? 0,
      teachersCount: teachers.get(c.id) ?? 0,
    }));
  }

  /**
   * The catalogue's words for a course's state, and the enum's.
   *
   * Kept as a pair of maps rather than one shared vocabulary because the
   * catalogue's strings are what the admin page has always shown and the enum
   * is what every relational reader switches on.
   */
  private static readonly COURSE_STATUS_TO_ENUM: Record<string, CourseStatus> = {
    Active: CourseStatus.PUBLISHED,
    Draft: CourseStatus.DRAFT,
    Archived: CourseStatus.ARCHIVED,
  };

  /** Sanity-clamps the numbers the form sends. Counts are no longer stored. */
  private normaliseCourse(data: any) {
    const { studentsCount: _s, teachersCount: _t, ...out } = data;
    if (out.price != null) out.price = Math.max(0, Number(out.price) || 0);
    if (out.durationWeeks != null) {
      out.durationWeeks = Math.max(1, Math.round(Number(out.durationWeeks) || 0));
    }
    return out;
  }

  /** A slug the relational Course can hold, free of any already in use. */
  private async freeCourseSlug(code: string, id: string) {
    const base =
      String(code)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60) || 'course';
    const taken = await this.prisma.course.findFirst({
      where: { slug: base, id: { not: id } },
      select: { id: true },
    });
    return taken ? `${base}-${id.slice(0, 8)}` : base;
  }

  async createCourse(dto: any) {
    const data = this.normaliseCourse(dto);
    const id: string = data.id ?? randomUUID();
    const slug = await this.freeCourseSlug(data.code, id);

    /*
     * One transaction, so the two rows cannot disagree. Previously the
     * package equivalent of this wrote the catalogue row, then tried the
     * relational row inside a try/catch that only logged — leaving a
     * catalogue entry that nothing could reference and no sign anything
     * had gone wrong.
     */
    const [lmsCourse] = await this.prisma.$transaction([
      this.prisma.lmsCourse.create({ data: { ...data, id } }),
      this.prisma.course.create({
        data: {
          id,
          title: data.title,
          slug,
          description: data.description ?? null,
          price: data.price ?? 0,
          durationWeeks: data.durationWeeks ?? 12,
          status:
            LmsDataService.COURSE_STATUS_TO_ENUM[data.status] ?? CourseStatus.DRAFT,
        },
      }),
    ]);
    return lmsCourse;
  }

  async updateCourse(id: string, dto: any) {
    const { id: _, ...raw } = dto;
    const data = this.normaliseCourse(raw);
    const existing = await this.prisma.lmsCourse.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Course not found.');

    const code = data.code ?? existing.code;
    const slug = await this.freeCourseSlug(code, id);
    const status = data.status ?? existing.status;

    const courseFields = {
      title: data.title ?? existing.title,
      slug,
      description: data.description ?? existing.description,
      price: data.price ?? existing.price ?? 0,
      durationWeeks: data.durationWeeks ?? existing.durationWeeks ?? 12,
      status: LmsDataService.COURSE_STATUS_TO_ENUM[status] ?? CourseStatus.DRAFT,
    };

    /*
     * Renaming the code re-files everything filed under the old one.
     *
     * Classes, assignments, assessments, knowledgebase material and student
     * registrations all reference a course by its code as plain text — there
     * is no foreign key to stop the old value going stale. Deleting a course
     * is guarded; renaming one was not, so changing "QR-101" to "QR-201"
     * detached every one of those rows at once. They do not error, they just
     * stop appearing, which reads as missing rather than as misfiled.
     *
     * The course's title is carried along too, since these rows cache it for
     * display and a renamed course would otherwise show its old name.
     */
    const reFile =
      code !== existing.code
        ? [
            this.prisma.lmsClass.updateMany({
              where: { courseCode: existing.code },
              data: { courseCode: code, courseTitle: courseFields.title },
            }),
            this.prisma.lmsAssignment.updateMany({
              where: { courseCode: existing.code },
              data: { courseCode: code, courseTitle: courseFields.title },
            }),
            this.prisma.lmsAssessment.updateMany({
              where: { courseCode: existing.code },
              data: { courseCode: code, courseTitle: courseFields.title },
            }),
            this.prisma.lmsKnowledgebase.updateMany({
              where: { courseCode: existing.code },
              data: { courseCode: code, courseTitle: courseFields.title },
            }),
            this.prisma.studentRegistration.updateMany({
              where: { courseCode: existing.code },
              data: { courseCode: code, courseTitle: courseFields.title },
            }),
          ]
        : [];

    const [lmsCourse] = await this.prisma.$transaction([
      this.prisma.lmsCourse.update({ where: { id }, data }),
      // Upsert, not update: rows created before the two lists were joined may
      // still have no relational half, and an edit is a fine moment to give
      // them one.
      this.prisma.course.upsert({
        where: { id },
        create: { id, ...courseFields },
        update: courseFields,
      }),
      ...reFile,
    ]);
    return lmsCourse;
  }

  /*
   * Everything that would be quietly broken by deleting this course.
   *
   * Enrolments and batches cascade on the relational side, so without this
   * the delete succeeds and takes a student's enrolment, their batch, and
   * every class session in it along with it — silently.
   */
  private async assertCourseDeletable(id: string, title: string, code: string) {
    const [enrolled, batches, material] = await Promise.all([
      this.prisma.enrollment.count({ where: { courseId: id } }),
      this.prisma.batch.count({ where: { courseId: id } }),
      this.prisma.lmsKnowledgebase.count({ where: { courseCode: code } }),
    ]);

    if (enrolled > 0) {
      throw new BadRequestException(
        `"${title}" has ${enrolled} enrolled student${enrolled > 1 ? 's' : ''}. ` +
          'Move them first — deleting it would take their enrolment with it.',
      );
    }
    if (batches > 0) {
      throw new BadRequestException(
        `"${title}" has ${batches} batch${batches > 1 ? 'es' : ''} running on it. ` +
          'Deleting it would delete those batches and every class session in them.',
      );
    }
    if (material > 0) {
      throw new BadRequestException(
        `"${title}" has ${material} knowledgebase item${material > 1 ? 's' : ''} filed under it. ` +
          'Remove or re-file those first.',
      );
    }
  }

  async deleteCourse(id: string) {
    const course = await this.prisma.lmsCourse.findUnique({
      where: { id },
      select: { title: true, code: true },
    });
    if (!course) throw new NotFoundException('Course not found.');
    await this.assertCourseDeletable(id, course.title, course.code);

    await this.prisma.course.delete({ where: { id } }).catch(() => null);
    return this.prisma.lmsCourse.delete({ where: { id } });
  }

  // 2. Assignments
  //
  // The course is the single source of truth for how many students an
  // assignment reaches: `studentsCount` is never trusted from the stored row,
  // it is resolved live from the linked LmsCourse (by courseCode) on read and
  // on write. Submissions and evaluations are admin-tracked grading progress,
  // but can never exceed what is logically possible — a submission needs a
  // student, and an evaluation needs a submission — so both are clamped.

  // LmsAssignment catalog CRUD retired — assignments now run through the
  // unified AssignmentsModule (Assignment/Submission). The LmsAssignment model
  // is kept only for the legacy student-portal read path.

  // 3. Assessments
  // LmsAssessment has no student count of its own, so it is resolved live from
  // the linked course (by courseCode) — the same rule assignments follow, and
  // it comes from real enrolments rather than the stored figure, so this and
  // the courses page can never disagree about how many students a course has.
  async getAssessments() {
    const [assessments, courses, enrolments] = await Promise.all([
      this.prisma.lmsAssessment.findMany({ orderBy: { title: 'asc' } }),
      this.prisma.lmsCourse.findMany({ select: { id: true, code: true, title: true } }),
      this.prisma.enrollment.groupBy({
        by: ['courseId'],
        where: { status: { in: ['ACTIVE', 'TRIAL', 'PENDING'] } },
        _count: { _all: true },
      }),
    ]);

    const students = new Map(enrolments.map((e) => [e.courseId, e._count._all]));
    const courseByCode = new Map(courses.map((c) => [c.code, c]));

    return assessments.map((a) => {
      const course = courseByCode.get(a.courseCode);
      return {
        ...a,
        studentsCount: course ? (students.get(course.id) ?? 0) : 0,
        courseTitle: course?.title ?? a.courseTitle,
      };
    });
  }
  /** Keeps assessment numbers sane: non-negative counts, score within 0–100. */
  private normaliseAssessment(data: any) {
    const out = { ...data };
    if (out.questionsCount != null) {
      out.questionsCount = Math.max(0, Math.round(Number(out.questionsCount) || 0));
    }
    if (out.duration != null) {
      out.duration = Math.max(0, Math.round(Number(out.duration) || 0));
    }
    if (out.avgScore != null) {
      out.avgScore = Math.min(100, Math.max(0, Number(out.avgScore) || 0));
    }
    return out;
  }

  async createAssessment(dto: any) {
    return this.prisma.lmsAssessment.create({
      data: this.normaliseAssessment(dto),
    });
  }
  async updateAssessment(id: string, dto: any) {
    const { id: _, ...data } = dto;
    return this.prisma.lmsAssessment.update({
      where: { id },
      data: this.normaliseAssessment(data),
    });
  }
  async deleteAssessment(id: string) {
    return this.prisma.lmsAssessment.delete({ where: { id } });
  }

  // 4. Knowledgebase
  //
  // `downloads` is a usage metric that only ever grows as people open the
  // resource — it is never set by the admin form. So it starts at 0 on create
  // and is preserved (not overwritable) on update. File size is stored as the
  // browser reports it and only sanity-clamped to be non-negative.
  async getKnowledgebase() {
    return this.prisma.lmsKnowledgebase.findMany({
      orderBy: { downloads: 'desc' },
    });
  }
  async createKnowledgebase(dto: any) {
    const { downloads: _ignored, ...rest } = dto;
    return this.prisma.lmsKnowledgebase.create({
      data: {
        ...rest,
        sizeMB: Math.max(0, Number(dto.sizeMB) || 0),
        downloads: 0,
      },
    });
  }
  async updateKnowledgebase(id: string, dto: any) {
    // Strip id and downloads: the tracked view count must survive edits.
    const { id: _id, downloads: _downloads, ...data } = dto;
    return this.prisma.lmsKnowledgebase.update({
      where: { id },
      data: {
        ...data,
        ...(data.sizeMB != null
          ? { sizeMB: Math.max(0, Number(data.sizeMB) || 0) }
          : {}),
      },
    });
  }
  async deleteKnowledgebase(id: string) {
    return this.prisma.lmsKnowledgebase.delete({ where: { id } });
  }

  /** Turns an uploaded file into the reference the create/update form stores. */
  storeKnowledgebaseFile(file?: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file was uploaded');
    }
    return {
      fileUrl: `knowledgebase/${file.filename}`,
      fileName: file.originalname,
      sizeMB: Math.max(0.01, Math.round((file.size / 1024 / 1024) * 100) / 100),
    };
  }

  /** Counts one download and returns the file reference to serve. */
  async registerDownload(id: string) {
    const resource = await this.prisma.lmsKnowledgebase.findUnique({
      where: { id },
      select: { id: true, fileUrl: true, fileName: true },
    });
    if (!resource) {
      throw new NotFoundException('Resource not found');
    }
    await this.prisma.lmsKnowledgebase.update({
      where: { id },
      data: { downloads: { increment: 1 } },
    });
    return resource;
  }

  // 5. Packages
  async getPackages() {
    return this.prisma.lmsPackage.findMany({
      orderBy: { title: 'asc' },
    });
  }
  /** A package price can never be negative. */
  private normalisePackage(data: any) {
    const out = { ...data };
    if (out.price != null) out.price = Math.max(0, Number(out.price) || 0);
    if (out.classesPerMonth != null && out.classesPerMonth !== '') {
      out.classesPerMonth = Math.max(1, Math.round(Number(out.classesPerMonth) || 0));
    }
    // An empty select means "no fee plan", which is a null column, not "".
    if (out.feePlanId === '') out.feePlanId = null;
    return out;
  }

  /** Refuses a fee plan id that does not name a real plan. */
  private async assertFeePlan(feePlanId?: string | null) {
    if (!feePlanId) return;
    const plan = await this.prisma.feePlan.findUnique({
      where: { id: feePlanId },
      select: { id: true },
    });
    if (!plan) throw new BadRequestException('That fee plan no longer exists.');
  }

  /** The relational half of a package — what enrolments and billing read. */
  private packageFields(lmsPkg: {
    title: string;
    description: string;
    price: number;
    status: string;
    classesPerMonth?: number | null;
    features?: string[];
    feePlanId?: string | null;
  }) {
    return {
      name: lmsPkg.title,
      description: lmsPkg.description,
      price: lmsPkg.price,
      classesPerMonth: classesFor(lmsPkg),
      active: lmsPkg.status === 'Active',
      feePlanId: lmsPkg.feePlanId ?? null,
    };
  }

  async createPackage(dto: any) {
    const data = this.normalisePackage(dto);
    await this.assertFeePlan(data.feePlanId);
    const id: string = data.id ?? randomUUID();

    /*
     * One transaction. This used to write the catalogue row and then attempt
     * the relational row inside a try/catch that only logged — so a failure
     * left a package the admin could see, price and sell, that no enrolment
     * could ever point at, with nothing on screen to say so.
     */
    const [lmsPkg] = await this.prisma.$transaction([
      this.prisma.lmsPackage.create({ data: { ...data, id } }),
      this.prisma.package.create({ data: { id, ...this.packageFields(data) } }),
    ]);
    return lmsPkg;
  }

  async updatePackage(id: string, dto: any) {
    const { id: _, ...raw } = dto;
    const data = this.normalisePackage(raw);
    await this.assertFeePlan(data.feePlanId);
    const existing = await this.prisma.lmsPackage.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Package not found.');

    const merged = { ...existing, ...data };
    const fields = this.packageFields(merged);

    const [lmsPkg] = await this.prisma.$transaction([
      this.prisma.lmsPackage.update({ where: { id }, data }),
      this.prisma.package.upsert({
        where: { id },
        create: { id, ...fields },
        update: fields,
      }),
    ]);
    return lmsPkg;
  }
  /*
   * Everything that would be quietly broken by deleting this package.
   *
   * The subscription references are foreign keys with ON DELETE SET NULL, so
   * without this the delete succeeds and the damage is invisible: a queued
   * change loses its package and the student, who was told their request was
   * approved, simply never gets it.
   *
   * Shared by both delete paths. A rule that holds for a bulk selection and
   * not for a single click is not a rule.
   */
  private async assertPackageDeletable(id: string, title: string) {
    const [onTrials, pendingRequests, queued] = await Promise.all([
      /*
       * Named rather than joined: LmsPackage is the flat catalogue and the
       * relational Package that enrolments point at is a separate table, so
       * the only link is the name a coach chose from a list.
       */
      this.prisma.leadTrial.count({ where: { preferredPackage: title } }),
      this.prisma.subscriptionRequest.count({
        where: { requestedPackageId: id, status: 'PENDING' },
      }),
      this.prisma.subscriptionNextCycle.count({ where: { nextPackageId: id } }),
    ]);

    if (onTrials > 0) {
      throw new BadRequestException(
        `"${title}" is the package chosen on ${onTrials} trial${onTrials > 1 ? 's' : ''}. ` +
          'Deleting it would leave those families billed for something that no longer exists.',
      );
    }
    if (pendingRequests > 0) {
      throw new BadRequestException(
        `${pendingRequests} student${pendingRequests > 1 ? 's have' : ' has'} asked to move to "${title}" and ${pendingRequests > 1 ? 'are' : 'is'} waiting for a decision. ` +
          'Decide those requests before deleting it.',
      );
    }
    if (queued > 0) {
      throw new BadRequestException(
        `"${title}" is already approved to start next cycle for ${queued} student${queued > 1 ? 's' : ''}. ` +
          'Deleting it would cancel that change without telling them.',
      );
    }
  }

  async deletePackage(id: string) {
    const pkg = await this.prisma.lmsPackage.findUnique({
      where: { id },
      select: { title: true },
    });
    if (!pkg) throw new NotFoundException('Package not found.');
    await this.assertPackageDeletable(id, pkg.title);

    await this.prisma.package.delete({ where: { id } }).catch(() => null);
    return this.prisma.lmsPackage.delete({ where: { id } });
  }

  // 6. Classes (scheduled live sessions)
  async getClasses() {
    return this.prisma.lmsClass.findMany({ orderBy: { timeStart: 'asc' } });
  }

  /** Counts stay non-negative; enrolled can never exceed capacity. */
  private normaliseClass(data: any) {
    const out = { ...data };
    if (out.capacity != null) {
      out.capacity = Math.max(0, Math.round(Number(out.capacity) || 0));
    }
    if (out.enrolled != null) {
      const cap = out.capacity ?? Number.MAX_SAFE_INTEGER;
      out.enrolled = Math.max(0, Math.min(Math.round(Number(out.enrolled) || 0), cap));
    }
    return out;
  }

  async createClass(dto: any) {
    return this.prisma.lmsClass.create({ data: this.normaliseClass(dto) });
  }
  async updateClass(id: string, dto: any) {
    const { id: _, ...data } = dto;
    return this.prisma.lmsClass.update({
      where: { id },
      data: this.normaliseClass(data),
    });
  }
  async deleteClass(id: string) {
    return this.prisma.lmsClass.delete({ where: { id } });
  }

  // 7. Meetings
  async getMeetings() {
    return this.prisma.lmsMeeting.findMany({ orderBy: { timeStart: 'asc' } });
  }
  async createMeeting(dto: any) {
    return this.prisma.lmsMeeting.create({ data: dto });
  }
  async updateMeeting(id: string, dto: any) {
    const { id: _, ...data } = dto;
    return this.prisma.lmsMeeting.update({ where: { id }, data });
  }
  async deleteMeeting(id: string) {
    return this.prisma.lmsMeeting.delete({ where: { id } });
  }

  // ── Bulk delete ────────────────────────────────────────────────────────────
  /*
   * Each of these catalogues grew a "select several and delete" control, and
   * they share one rule: a catalogue entry still pointed at by live records is
   * refused rather than quietly taking those records with it.
   */

  async deleteCourses(ids: string[]) {
    return bulkDelete(ids, async (id) => {
      const course = await this.prisma.lmsCourse.findUnique({
        where: { id },
        select: { title: true, code: true },
      });
      if (!course) throw new NotFoundException('Course not found.');
      // Same guard the single-click delete uses. A rule that holds for a bulk
      // selection and not for one row is not a rule.
      await this.assertCourseDeletable(id, course.title, course.code);
      await this.prisma.course.delete({ where: { id } }).catch(() => null);
      await this.prisma.lmsCourse.delete({ where: { id } });
      return course.title;
    });
  }

  async deleteKnowledgebaseMany(ids: string[]) {
    return bulkDelete(ids, async (id) => {
      const item = await this.prisma.lmsKnowledgebase.findUnique({
        where: { id },
        select: { title: true },
      });
      if (!item) throw new NotFoundException('Item not found.');
      await this.prisma.lmsKnowledgebase.delete({ where: { id } });
      return item.title;
    });
  }

  async deletePackages(ids: string[]) {
    return bulkDelete(ids, async (id) => {
      const pkg = await this.prisma.lmsPackage.findUnique({
        where: { id },
        select: { title: true },
      });
      if (!pkg) throw new NotFoundException('Package not found.');
      await this.assertPackageDeletable(id, pkg.title);
      await this.prisma.package.delete({ where: { id } }).catch(() => null);
      await this.prisma.lmsPackage.delete({ where: { id } });
      return pkg.title;
    });
  }
}

/*
 * How many classes a month a package buys.
 *
 * Prefers what the academy actually typed in. The guess below is only for rows
 * created before that field existed — it reads a number out of marketing copy
 * and falls back to 8, and this number reaches a student's screen, decides the
 * "hours difference" a coach approves, and rides along with the billing. It is
 * a fallback, not a policy.
 */
function classesFor(pkg: { classesPerMonth?: number | null; features?: string[]; title?: string }): number {
  if (typeof pkg.classesPerMonth === 'number' && pkg.classesPerMonth > 0) {
    return pkg.classesPerMonth;
  }
  return parseClassesPerMonth(pkg.features ?? [], pkg.title ?? '');
}

function parseClassesPerMonth(features: string[] = [], title: string = ''): number {
  const textToSearch = `${title} ${features.join(' ')}`.toLowerCase();
  
  // Search for "X classes/week" or "X classes per week" or "X/week"
  const weekMatch = textToSearch.match(/(\d+)\s*(?:classes|sessions|hours|days)?\s*(?:\/|per)\s*week/);
  if (weekMatch) {
    const val = parseInt(weekMatch[1], 10);
    if (!isNaN(val)) return val * 4;
  }
  
  // Search for "X classes/month" or "X classes per month" or "X/month"
  const monthMatch = textToSearch.match(/(\d+)\s*(?:classes|sessions|hours|days)?\s*(?:\/|per)\s*month/);
  if (monthMatch) {
    const val = parseInt(monthMatch[1], 10);
    if (!isNaN(val)) return val;
  }

  // Fallback: search for any number in features or title
  const numberMatches = textToSearch.match(/\b\d+\b/g);
  if (numberMatches) {
    for (const numStr of numberMatches) {
      const val = parseInt(numStr, 10);
      if (val >= 4 && val <= 30) return val; // if it looks like a classes count
    }
  }

  return 8; // Default fallback to 8 classes per month (2 classes per week)
}
