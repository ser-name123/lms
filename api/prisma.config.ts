import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    // tsx, not ts-node: the generated client imports with .js extensions that
    // ts-node will not resolve back to .ts.
    seed: 'npx tsx prisma/seed.ts',
  },
  datasource: {
    // The CLI (migrate, studio) uses the DIRECT connection — migrations cannot
    // run through Supabase's transaction pooler. The running app connects with
    // the pooled DATABASE_URL instead; see PrismaService.
    url: process.env['DIRECT_URL'] ?? process.env['DATABASE_URL'],
  },
});
