import { Module } from '@nestjs/common';
import { LmsDataController } from './lms-data.controller';
import { LmsDataService } from './lms-data.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [LmsDataController],
  providers: [LmsDataService],
  exports: [LmsDataService],
})
export class LmsDataModule {}
