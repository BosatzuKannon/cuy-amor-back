import { Controller, Get } from '@nestjs/common';

import { CoinPackagesService } from './coin-packages.service';

@Controller('coin-packages')
export class CoinPackagesController {
  constructor(private readonly coinPackagesService: CoinPackagesService) {}

  @Get()
  findAllActive() {
    return this.coinPackagesService.findAllActive();
  }
}
