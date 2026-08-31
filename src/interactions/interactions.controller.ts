import { Body, Controller, Post, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateInteractionDto } from './dto/create-interaction.dto';
import {
  InteractionsService,
  type CreateInteractionResult,
} from './interactions.service';

@Controller('interactions')
@UseGuards(JwtAuthGuard)
export class InteractionsController {
  constructor(private readonly interactionsService: InteractionsService) {}

  @Post()
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateInteractionDto,
  ): Promise<CreateInteractionResult> {
    return this.interactionsService.createInteraction(user.userId, dto);
  }
}
