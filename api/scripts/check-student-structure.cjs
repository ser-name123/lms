require('dotenv/config');
const { PrismaClient } = require('../src/generated/prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Client } = require('pg');

(async () => {
  const pgClient = new Client({ connectionString: process.env.DATABASE_URL });
  await pgClient.connect();
  const adapter = new PrismaPg(pgClient);
  const prisma = new PrismaClient({ adapter });

  try {
    const student = await prisma.studentProfile.findFirst({
      include: {
        enrollments: {
          include: {
            course: true,
            package: true,
            teacher: {
              include: {
                user: true
              }
            }
          }
        },
        user: true,
      }
    });
    console.log(JSON.stringify(student, null, 2));
  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
    await pgClient.end();
  }
})();
