import { Controller, Get } from '@nestjs/common';

import { GiftsService } from './gifts.service';

@Controller('gifts')
export class GiftsController {
  constructor(private readonly giftsService: GiftsService) {}

  @Get()
  listGifts() {
    return this.giftsService.listGifts();
  }
}
