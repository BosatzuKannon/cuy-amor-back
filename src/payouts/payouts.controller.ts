import { Controller, Param, Patch, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PayoutsService } from './payouts.service';

@Controller('admin/payouts')
@UseGuards(JwtAuthGuard)
export class PayoutsController {
  constructor(private readonly payoutsService: PayoutsService) {}

  @Patch(':id/approve')
  approve(@Param('id') id: string) {
    return this.payoutsService.approvePayout(id);
  }
}
