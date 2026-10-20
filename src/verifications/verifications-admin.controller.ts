import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { VerificationStatus } from '@prisma/client';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminEmailGuard } from '../common/guards/admin-email.guard';
import { VerificationsService } from './verifications.service';

@Controller('admin/verifications')
@UseGuards(JwtAuthGuard, AdminEmailGuard)
export class VerificationsAdminController {
  constructor(private readonly verificationsService: VerificationsService) {}

  @Get()
  list(@Query('status') status?: VerificationStatus) {
    const validStatus =
      status && status in VerificationStatus ? status : undefined;
    return this.verificationsService.listRequests(validStatus);
  }

  @Patch(':id/approve')
  approve(@Param('id') id: string) {
    return this.verificationsService.approveRequest(id);
  }

  @Patch(':id/reject')
  reject(@Param('id') id: string) {
    return this.verificationsService.rejectRequest(id);
  }
}
