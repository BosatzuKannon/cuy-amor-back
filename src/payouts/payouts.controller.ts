import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PayoutStatus } from '@prisma/client';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminEmailGuard } from '../common/guards/admin-email.guard';
import { PayoutsService } from './payouts.service';

@Controller('admin/payouts')
@UseGuards(JwtAuthGuard, AdminEmailGuard)
export class PayoutsController {
  constructor(private readonly payoutsService: PayoutsService) {}

  @Get()
  list(@Query('status') status?: PayoutStatus) {
    const validStatus = status && status in PayoutStatus ? status : undefined;
    return this.payoutsService.listPayouts(validStatus);
  }

  @Patch(':id/approve')
  approve(@Param('id') id: string) {
    return this.payoutsService.approvePayout(id);
  }

  @Patch(':id/reject')
  reject(@Param('id') id: string, @Body() body: { adminNotes?: string }) {
    return this.payoutsService.rejectPayout(id, body?.adminNotes);
  }
}
