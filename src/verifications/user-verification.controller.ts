import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SubmitVerificationDto } from './dto/submit-verification.dto';
import { VerificationsService } from './verifications.service';

@Controller('users/verification')
@UseGuards(JwtAuthGuard)
export class UserVerificationController {
  constructor(private readonly verificationsService: VerificationsService) {}

  @Get()
  getMyStatus(@CurrentUser() user: AuthenticatedUser) {
    return this.verificationsService.getMyStatus(user.userId);
  }

  @Post()
  submit(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SubmitVerificationDto,
  ) {
    return this.verificationsService.submitSelfie(user.userId, dto.selfieUrl);
  }
}
