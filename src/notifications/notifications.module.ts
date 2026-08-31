import { Global, Module } from '@nestjs/common';

import { NotificationsService } from './notifications.service';
import { RetentionService } from './retention.service';

@Global()
@Module({
  providers: [NotificationsService, RetentionService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
