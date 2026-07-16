import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { CandidateStatus } from '../generated/prisma/enums';
import type { Prisma } from '../generated/prisma/client';
import type { CreateCandidateDto, ListCandidatesDto, UpdateCandidateDto } from './dto';

@Injectable()
export class CandidatesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(dto: ListCandidatesDto) {
    const { page, limit, search, status, sortBy } = dto;

    const where: Prisma.CandidateWhereInput = {
      ...(status ? { status } : {}),
      ...(search
        ? {
            OR: [
              { firstName: { contains: search, mode: 'insensitive' } },
              { lastName: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search, mode: 'insensitive' } },
              { position: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    let orderBy: Prisma.CandidateOrderByWithRelationInput = { appliedAt: 'desc' };
    if (sortBy) {
      if (sortBy === 'date_asc') orderBy = { appliedAt: 'asc' };
      else if (sortBy === 'date_desc') orderBy = { appliedAt: 'desc' };
      else if (sortBy === 'name_asc') orderBy = { firstName: 'asc' };
      else if (sortBy === 'name_desc') orderBy = { firstName: 'desc' };
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.candidate.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.candidate.count({ where }),
    ]);

    return {
      items,
      meta: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
    };
  }

  async findOne(id: string) {
    const candidate = await this.prisma.candidate.findUnique({
      where: { id },
    });
    if (!candidate) throw new NotFoundException(`Candidate ${id} not found`);
    return candidate;
  }

  async create(dto: CreateCandidateDto) {
    const existing = await this.prisma.candidate.findUnique({
      where: { email: dto.email },
    });
    if (existing) throw new ConflictException('A candidate with this email has already applied');

    return this.prisma.candidate.create({
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        phone: dto.phone,
        position: dto.position,
        resumeUrl: dto.resumeUrl,
        notes: dto.notes,
      },
    });
  }

  async update(id: string, dto: UpdateCandidateDto) {
    await this.findOne(id);
    return this.prisma.candidate.update({
      where: { id },
      data: {
        status: dto.status,
        notes: dto.notes,
      },
    });
  }

  async remove(id: string) {
    const candidate = await this.findOne(id);
    await this.prisma.candidate.delete({
      where: { id: candidate.id },
    });
  }

  async getStats() {
    const [total, news, shortlisted, rejected, waiting, approved] = await Promise.all([
      this.prisma.candidate.count(),
      this.prisma.candidate.count({ where: { status: CandidateStatus.NEW } }),
      this.prisma.candidate.count({ where: { status: CandidateStatus.SHORTLISTED } }),
      this.prisma.candidate.count({ where: { status: CandidateStatus.REJECTED } }),
      this.prisma.candidate.count({ where: { status: CandidateStatus.WAITING } }),
      this.prisma.candidate.count({ where: { status: CandidateStatus.APPROVED } }),
    ]);

    return {
      total,
      new: news,
      shortlisted,
      rejected,
      waiting,
      approved,
    };
  }

  async seed() {
    const dummy = [
      {
        firstName: 'Test',
        lastName: 'Teacher 1',
        email: 'testteacher4@yopmail.com',
        phone: '208887753537',
        position: 'Quran Teacher',
        resumeUrl: 'https://alfurqanapp.com/resumes/test1.pdf',
        status: CandidateStatus.NEW,
        notes: 'Highly recommended for beginner level recitation classes.',
      },
      {
        firstName: 'New',
        lastName: 'Teacher Test',
        email: 'newteacher_test@yopmail.com',
        phone: '20204259925',
        position: 'Arabic Teacher',
        resumeUrl: 'https://alfurqanapp.com/resumes/new_test.pdf',
        status: CandidateStatus.NEW,
        notes: 'Fluent in Egyptian dialect, fits the conversational courses.',
      },
      {
        firstName: 'Mohammed',
        lastName: 'Taha',
        email: 'mohammed.t@yopmail.com',
        phone: '971554546725',
        position: 'Quran Teacher',
        resumeUrl: 'https://alfurqanapp.com/resumes/taha.pdf',
        status: CandidateStatus.APPROVED,
        notes: 'Approved candidate, onboarding as teaching staff.',
      },
      {
        firstName: 'Mariam',
        lastName: 'Hossam',
        email: 'ayesha.riyaz@gmail.com',
        phone: '9086460848',
        position: 'Quran Teacher',
        resumeUrl: 'https://alfurqanapp.com/resumes/mariam.pdf',
        status: CandidateStatus.APPROVED,
        notes: 'Ijazah holder with 10 years experience.',
      },
      {
        firstName: 'Samantha',
        lastName: 'James',
        email: 'samantha@gmail.com',
        phone: '8680971523',
        position: 'Arabic Teacher',
        resumeUrl: 'https://alfurqanapp.com/resumes/samantha.pdf',
        status: CandidateStatus.APPROVED,
        notes: 'Native speaker with formal literature background.',
      },
      {
        firstName: 'Aisha',
        lastName: 'Al-Amin',
        email: 'aisha.alamin@yopmail.com',
        phone: '201019988774',
        position: 'Quran Teacher',
        resumeUrl: 'https://alfurqanapp.com/resumes/aisha.pdf',
        status: CandidateStatus.SHORTLISTED,
        notes: 'Shortlisted for technical tajweed demo session.',
      },
      {
        firstName: 'Yousef',
        lastName: 'Mansour',
        email: 'yousef.mansour@yopmail.com',
        phone: '966504543210',
        position: 'Islamic Studies Teacher',
        resumeUrl: 'https://alfurqanapp.com/resumes/yousef.pdf',
        status: CandidateStatus.WAITING,
        notes: 'Waiting list. Pending vacancy in standard levels.',
      },
      {
        firstName: 'Fatima',
        lastName: 'Rashid',
        email: 'fatima.rashid@yopmail.com',
        phone: '971501122334',
        position: 'Arabic Teacher',
        resumeUrl: 'https://alfurqanapp.com/resumes/fatima.pdf',
        status: CandidateStatus.REJECTED,
        notes: 'Rejected. Did not clear the initial demo session.',
      },
    ];

    let count = 0;
    for (const item of dummy) {
      const existing = await this.prisma.candidate.findUnique({
        where: { email: item.email },
      });
      if (!existing) {
        await this.prisma.candidate.create({ data: item });
        count++;
      }
    }
    return { count };
  }
}
