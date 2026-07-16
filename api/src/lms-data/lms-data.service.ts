import { Injectable } from '@nestjs/common';
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
  async createCourse(dto: any) {
    return this.prisma.lmsCourse.create({ data: dto });
  }
  async updateCourse(id: string, dto: any) {
    const { id: _, ...data } = dto;
    return this.prisma.lmsCourse.update({
      where: { id },
      data,
    });
  }
  async deleteCourse(id: string) {
    return this.prisma.lmsCourse.delete({ where: { id } });
  }

  // 2. Assignments
  async getAssignments() {
    return this.prisma.lmsAssignment.findMany({
      orderBy: { dueDate: 'asc' },
    });
  }
  async createAssignment(dto: any) {
    return this.prisma.lmsAssignment.create({ data: dto });
  }
  async updateAssignment(id: string, dto: any) {
    const { id: _, ...data } = dto;
    return this.prisma.lmsAssignment.update({
      where: { id },
      data,
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
  async createAssessment(dto: any) {
    return this.prisma.lmsAssessment.create({ data: dto });
  }
  async updateAssessment(id: string, dto: any) {
    const { id: _, ...data } = dto;
    return this.prisma.lmsAssessment.update({
      where: { id },
      data,
    });
  }
  async deleteAssessment(id: string) {
    return this.prisma.lmsAssessment.delete({ where: { id } });
  }

  // 4. Knowledgebase
  async getKnowledgebase() {
    return this.prisma.lmsKnowledgebase.findMany({
      orderBy: { downloads: 'desc' },
    });
  }
  async createKnowledgebase(dto: any) {
    return this.prisma.lmsKnowledgebase.create({ data: dto });
  }
  async updateKnowledgebase(id: string, dto: any) {
    const { id: _, ...data } = dto;
    return this.prisma.lmsKnowledgebase.update({
      where: { id },
      data,
    });
  }
  async deleteKnowledgebase(id: string) {
    return this.prisma.lmsKnowledgebase.delete({ where: { id } });
  }

  // 5. Packages
  async getPackages() {
    return this.prisma.lmsPackage.findMany({
      orderBy: { title: 'asc' },
    });
  }
  async createPackage(dto: any) {
    return this.prisma.lmsPackage.create({ data: dto });
  }
  async updatePackage(id: string, dto: any) {
    const { id: _, ...data } = dto;
    return this.prisma.lmsPackage.update({
      where: { id },
      data,
    });
  }
  async deletePackage(id: string) {
    return this.prisma.lmsPackage.delete({ where: { id } });
  }
}
