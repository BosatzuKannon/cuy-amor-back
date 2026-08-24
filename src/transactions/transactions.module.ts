import { Module } from '@nestjs/common';

import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';
import { WompiController } from './wompi.controller';
import { WompiService } from './wompi.service';

@Module({
  controllers: [TransactionsController, WompiController],
  providers: [TransactionsService, WompiService],
})
export class TransactionsModule {}
