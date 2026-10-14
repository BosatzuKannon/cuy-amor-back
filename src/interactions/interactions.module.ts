import { Module } from '@nestjs/common';

import { InteractionsController } from './interactions.controller';
import { InteractionsService } from './interactions.service';
import { UserInteractionsController } from './user-interactions.controller';

@Module({
  controllers: [InteractionsController, UserInteractionsController],
  providers: [InteractionsService],
})
export class InteractionsModule {}
