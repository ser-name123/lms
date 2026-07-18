import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { EmailsModule } from '../emails/emails.module';

import { NotificationsController } from './notifications.controller';
import { NotificationAdminController } from './admin.controller';

import { NotificationsService } from './notifications.service';
import { NotificationEngineService } from './engine.service';
import { NotificationChannelsService } from './channels.service';
import { NotificationStreamService } from './stream.service';
import { NotificationPreferencesService } from './preferences.service';
import { NotificationTemplatesService } from './templates.service';
import { NotificationBroadcastService } from './broadcast.service';
import { NotificationAdminService } from './admin.service';
import { NotificationComposeService } from './compose.service';
import { NotificationSweepsService } from './sweeps.service';

/*
 * NotificationsService keeps its original name and method signatures — 16 other
 * modules inject it. Everything new sits behind it, so those modules gained
 * categories, priorities, per-channel delivery, user preferences and real-time
 * streaming without a single call site changing.
 */
@Module({
  imports: [PrismaModule, EmailsModule],
  controllers: [NotificationsController, NotificationAdminController],
  providers: [
    NotificationsService,
    NotificationEngineService,
    NotificationChannelsService,
    NotificationStreamService,
    NotificationPreferencesService,
    NotificationTemplatesService,
    NotificationBroadcastService,
    NotificationAdminService,
    NotificationComposeService,
    NotificationSweepsService,
  ],
  exports: [NotificationsService, NotificationEngineService, NotificationStreamService],
})
export class NotificationsModule {}
