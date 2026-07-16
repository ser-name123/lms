import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTrialDto, ScheduleTrialDto, EvaluateTrialDto } from './dto';

@Injectable()
export class TrialsService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    return this.prisma.trialClass.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(dto: CreateTrialDto) {
    return this.prisma.trialClass.create({
      data: {
        name: dto.name,
        email: dto.email,
        mobile: dto.mobile || '',
        country: dto.country,
        course: dto.course,
        prefTeacherGender: dto.prefTeacherGender,
        age: dto.age,
        goals: dto.goals || '',
        status: (dto.status as any) || 'PENDING',
        scheduledTime: dto.scheduledTime || null,
        assignedTeacher: dto.assignedTeacher || null,
        meetLink: dto.meetLink || null,
      },
    });
  }

  async schedule(id: string, dto: ScheduleTrialDto) {
    const trial = await this.prisma.trialClass.findUnique({
      where: { id },
    });
    if (!trial) {
      throw new NotFoundException(`Trial class inquiry with ID ${id} not found.`);
    }

    const meetLink = dto.meetLink || null;

    return this.prisma.trialClass.update({
      where: { id },
      data: {
        status: 'SCHEDULED',
        scheduledTime: dto.dateTime,
        assignedTeacher: dto.teacher,
        meetLink,
      },
    });
  }

  async evaluate(id: string, dto: EvaluateTrialDto) {
    const trial = await this.prisma.trialClass.findUnique({
      where: { id },
    });
    if (!trial) {
      throw new NotFoundException(`Trial class inquiry with ID ${id} not found.`);
    }

    return this.prisma.trialClass.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        pronunciationGrade: dto.pronunciation,
        fluencyGrade: dto.fluency,
        focusGrade: dto.focus,
        recommendedLevel: dto.recommendedLevel,
        evaluationNotes: dto.notes || '',
      },
    });
  }

  async update(id: string, dto: any) {
    const trial = await this.prisma.trialClass.findUnique({
      where: { id },
    });
    if (!trial) {
      throw new NotFoundException(`Trial class inquiry with ID ${id} not found.`);
    }

    return this.prisma.trialClass.update({
      where: { id },
      data: {
        name: dto.name,
        email: dto.email,
        mobile: dto.mobile,
        country: dto.country,
        course: dto.course,
        prefTeacherGender: dto.prefTeacherGender,
        age: dto.age !== undefined ? Number(dto.age) : undefined,
        goals: dto.goals,
        meetLink: dto.meetLink,
        status: dto.status,
        scheduledTime: dto.scheduledTime,
        assignedTeacher: dto.assignedTeacher,
      },
    });
  }

  async delete(id: string) {
    const trial = await this.prisma.trialClass.findUnique({
      where: { id },
    });
    if (!trial) {
      throw new NotFoundException(`Trial class inquiry with ID ${id} not found.`);
    }

    return this.prisma.trialClass.delete({
      where: { id },
    });
  }
}
