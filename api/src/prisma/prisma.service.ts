import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../generated/prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    // Prisma 7 connects through a driver adapter. The running app uses the
    // pooled DATABASE_URL; migrations use DIRECT_URL via prisma.config.ts.
    // NOTE: SSL is driven entirely by the connection string. Do NOT inject
    // sslmode=require here — node-postgres then verifies the cert chain and
    // Supabase's pooler cert fails that ("self-signed certificate in chain"),
    // which breaks every query. TLS for Supabase is enforced at the connection
    // string / Supabase side instead.
    super({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
