import { Body, Controller, Get, Put, Query, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ChangeInteractionDto } from './dto/change-interaction.dto';
import { GetInteractionHistoryQueryDto } from './dto/get-interaction-history-query.dto';
import {
  InteractionsService,
  type ChangeInteractionResult,
} from './interactions.service';

@Controller('users/interactions')
@UseGuards(JwtAuthGuard)
export class UserInteractionsController {
  constructor(private readonly interactionsService: InteractionsService) {}

  @Get('history')
  async history(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: GetInteractionHistoryQueryDto,
  ) {
    return this.interactionsService.getInteractionHistory(user.userId, query);
  }

  @Get('who-likes-me')
  async whoLikesMe(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: GetInteractionHistoryQueryDto,
  ) {
    return this.interactionsService.getWhoLikesMe(user.userId, query);
  }

  @Put('change')
  async change(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangeInteractionDto,
  ): Promise<ChangeInteractionResult> {
    return this.interactionsService.changeInteraction(user.userId, dto);
  }
}
