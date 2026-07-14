import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';

import { PrismaClient } from '../src/generated/prisma/client';
import { CourseStatus, EnrollmentStatus, Role } from '../src/generated/prisma/enums';

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
  }),
});

const ADMIN = { email: 'admin@lms.local', password: 'Admin@12345' };

async function main() {
  const passwordHash = await bcrypt.hash(ADMIN.password, 12);

  const admin = await prisma.user.upsert({
    where: { email: ADMIN.email },
    update: {},
    create: {
      email: ADMIN.email,
      passwordHash,
      firstName: 'Rajan',
      lastName: 'Soni',
      role: Role.ADMIN,
    },
  });

  const levels = await Promise.all(
    ['Level 1', 'Level 2', 'Level 3'].map((name, i) =>
      prisma.level.upsert({
        where: { name },
        update: {},
        create: { name, order: i + 1 },
      }),
    ),
  );

  const course = await prisma.course.upsert({
    where: { slug: 'quran-level-1' },
    update: {},
    create: {
      title: 'Quran — Level 1',
      slug: 'quran-level-1',
      description: 'Foundational recitation and memorisation.',
      levelId: levels[0].id,
      price: 120,
      status: CourseStatus.PUBLISHED,
    },
  });

  const teacher = await prisma.user.upsert({
    where: { email: 'bilal@lms.local' },
    update: {},
    create: {
      email: 'bilal@lms.local',
      passwordHash,
      firstName: 'Bilal',
      lastName: 'Ahmed',
      role: Role.TEACHER,
      teacherProfile: {
        create: { teacherCode: 'TR-00001', specialisation: 'Quran', hourlyRate: 18 },
      },
    },
    include: { teacherProfile: true },
  });

  const student = await prisma.user.upsert({
    where: { email: 'ayesha@lms.local' },
    update: {},
    create: {
      email: 'ayesha@lms.local',
      passwordHash,
      firstName: 'Ayesha',
      lastName: 'Khan',
      role: Role.STUDENT,
      country: 'United Kingdom',
      studentProfile: { create: { studentCode: 'ST-00001', phone: '+44 7700 900123' } },
    },
    include: { studentProfile: true },
  });

  if (student.studentProfile && teacher.teacherProfile) {
    await prisma.enrollment.upsert({
      where: {
        studentId_courseId: { studentId: student.studentProfile.id, courseId: course.id },
      },
      update: {},
      create: {
        studentId: student.studentProfile.id,
        courseId: course.id,
        teacherId: teacher.teacherProfile.id,
        status: EnrollmentStatus.ACTIVE,
        progress: 45,
        startedAt: new Date(),
      },
    });
  }

  console.log('Seeded.');
  console.log(`  admin   ${ADMIN.email} / ${ADMIN.password}`);
  console.log(`  teacher bilal@lms.local / ${ADMIN.password}`);
  console.log(`  student ayesha@lms.local / ${ADMIN.password}`);
  console.log(`  admin id: ${admin.id}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
