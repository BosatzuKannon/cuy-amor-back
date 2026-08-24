import { Module } from '@nestjs/common';

import { CoinPackagesController } from './coin-packages.controller';
import { CoinPackagesService } from './coin-packages.service';

@Module({
  controllers: [CoinPackagesController],
  providers: [CoinPackagesService],
})
export class CoinPackagesModule {}
