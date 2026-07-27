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
    const students = await prisma.studentProfile.findMany({
      include: {
        user: true,
        enrollments: {
          include: {
            package: true
          }
        }
      }
    });
    for (const s of students) {
      console.log(`Student: ${s.user.firstName} ${s.user.lastName}`);
      console.log(`- parentEmail: ${s.parentEmail}`);
      console.log(`- enrollments: ${s.enrollments.length}`);
      if (s.enrollments.length > 0) {
        console.log(`  - package: ${s.enrollments[0].package?.name}`);
      }
      
      // Let's query lead by parentEmail
      if (s.parentEmail) {
        const lead = await prisma.lead.findUnique({
          where: { email: s.parentEmail }
        });
        console.log(`- matched lead preferredPackage: ${lead?.preferredPackage}`);
      }
      console.log('---');
    }
  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
    await pgClient.end();
  }
})();
