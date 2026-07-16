import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CandidatesController } from './candidates.controller';
import { CandidatesService } from './candidates.service';

@Module({
  imports: [PrismaModule],
  controllers: [CandidatesController],
  providers: [CandidatesService],
  exports: [CandidatesService],
})
export class CandidatesModule {}
