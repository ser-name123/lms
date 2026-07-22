import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService],
  // The billing sweep applies queued changes when a cycle turns.
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}
