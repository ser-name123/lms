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
      /*
       * Prisma's default interactive-transaction timeout is 5 seconds, and this
       * app talks to a *pooled, remote* Postgres where a single round trip can
       * take hundreds of milliseconds — more under concurrency. A four-query
       * activation was measured at 9.8s and died with P2028, rolling back and
       * returning a 500; conversion is far longer (users, profiles, enrolments,
       * invoices, one set per child) and would fail the same way on the money
       * path.
       *
       * Set here rather than per call site: there are 31 interactive
       * transactions and none had a timeout, so fixing them one at a time would
       * mean the next one written inherits the problem again.
       *
       * This is a mitigation, not a cure. The real cost is pooler latency; if
       * transactions routinely approach this ceiling the work inside them
       * needs to shrink, not the ceiling to grow.
       */
      transactionOptions: { timeout: 20_000, maxWait: 10_000 },
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
