import { Body, Controller, Post } from '@nestjs/common';

import { WompiService } from './wompi.service';

@Controller('wompi')
export class WompiController {
  constructor(private readonly wompiService: WompiService) {}

  /**
   * Endpoint público que recibe los eventos de Wompi.
   * Siempre responde 200 OK para que Wompi no reintente infinitamente.
   */
  @Post('webhook')
  async webhook(@Body() body: unknown) {
    await this.wompiService.handleTransactionEvent(body);
    return { received: true };
  }
}
