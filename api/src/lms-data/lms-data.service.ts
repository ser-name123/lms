import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class LmsDataService {
  constructor(private readonly prisma: PrismaService) {}

  // 1. Courses
  async getCourses() {
    return this.prisma.lmsCourse.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Student/teacher counts can never be negative. */
  private normaliseCourse(data: any) {
    const out = { ...data };
    if (out.studentsCount != null) {
      out.studentsCount = Math.max(0, Math.round(Number(out.studentsCount) || 0));
    }
    if (out.teachersCount != null) {
      out.teachersCount = Math.max(0, Math.round(Number(out.teachersCount) || 0));
    }
    return out;
  }

  async createCourse(dto: any) {
    return this.prisma.lmsCourse.create({ data: this.normaliseCourse(dto) });
  }
  async updateCourse(id: string, dto: any) {
    const { id: _, ...data } = dto;
    return this.prisma.lmsCourse.update({
      where: { id },
      data: this.normaliseCourse(data),
    });
  }
  async deleteCourse(id: string) {
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

  /** Clamps grading counts so 0 ≤ evaluated ≤ submissions ≤ students. */
  private normaliseCounts(
    studentsCount: number,
    submissions: unknown,
    evaluated: unknown,
  ) {
    const submissionsCount = Math.max(
      0,
      Math.min(Number(submissions) || 0, studentsCount),
    );
    const evaluatedCount = Math.max(
      0,
      Math.min(Number(evaluated) || 0, submissionsCount),
    );
    return { submissionsCount, evaluatedCount };
  }

  async getAssignments() {
    const [assignments, courses] = await Promise.all([
      this.prisma.lmsAssignment.findMany({ orderBy: { dueDate: 'asc' } }),
      this.prisma.lmsCourse.findMany({
        select: { code: true, title: true, studentsCount: true },
      }),
    ]);

    const courseByCode = new Map(courses.map((c) => [c.code, c]));

    return assignments.map((a) => {
      const course = courseByCode.get(a.courseCode);
      // Fall back to the stored snapshot only if the course no longer exists.
      const studentsCount = course?.studentsCount ?? a.studentsCount;
      const { submissionsCount, evaluatedCount } = this.normaliseCounts(
        studentsCount,
        a.submissionsCount,
        a.evaluatedCount,
      );
      return {
        ...a,
        studentsCount,
        submissionsCount,
        evaluatedCount,
        courseTitle: course?.title ?? a.courseTitle,
      };
    });
  }

  async createAssignment(dto: any) {
    const course = await this.prisma.lmsCourse.findFirst({
      where: { code: dto.courseCode },
    });
    const studentsCount = course?.studentsCount ?? 0;
    const { submissionsCount, evaluatedCount } = this.normaliseCounts(
      studentsCount,
      dto.submissionsCount,
      dto.evaluatedCount,
    );

    return this.prisma.lmsAssignment.create({
      data: {
        ...dto,
        courseTitle: course?.title ?? dto.courseTitle,
        studentsCount,
        submissionsCount,
        evaluatedCount,
      },
    });
  }

  async updateAssignment(id: string, dto: any) {
    const { id: _, ...data } = dto;
    const course = await this.prisma.lmsCourse.findFirst({
      where: { code: data.courseCode },
    });
    const studentsCount = course?.studentsCount ?? data.studentsCount ?? 0;
    const { submissionsCount, evaluatedCount } = this.normaliseCounts(
      studentsCount,
      data.submissionsCount,
      data.evaluatedCount,
    );

    return this.prisma.lmsAssignment.update({
      where: { id },
      data: {
        ...data,
        courseTitle: course?.title ?? data.courseTitle,
        studentsCount,
        submissionsCount,
        evaluatedCount,
      },
    });
  }
  async deleteAssignment(id: string) {
    return this.prisma.lmsAssignment.delete({ where: { id } });
  }

  // 3. Assessments
  async getAssessments() {
    return this.prisma.lmsAssessment.findMany({
      orderBy: { title: 'asc' },
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
    return out;
  }

  async createPackage(dto: any) {
    return this.prisma.lmsPackage.create({
      data: this.normalisePackage(dto),
    });
  }
  async updatePackage(id: string, dto: any) {
    const { id: _, ...data } = dto;
    return this.prisma.lmsPackage.update({
      where: { id },
      data: this.normalisePackage(data),
    });
  }
  async deletePackage(id: string) {
    return this.prisma.lmsPackage.delete({ where: { id } });
  }
}
