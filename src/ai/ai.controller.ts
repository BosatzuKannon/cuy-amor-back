import {
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AiService } from './ai.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('matches/:matchId/ai/icebreaker')
  async generateIcebreakers(
    @CurrentUser() user: AuthenticatedUser,
    @Param('matchId', new ParseUUIDPipe({ version: '4' })) matchId: string,
  ) {
    return this.aiService.generateIcebreakers(matchId, user.userId);
  }

  @Post('users/me/ai/roast')
  async generateProfileRoast(@CurrentUser() user: AuthenticatedUser) {
    return this.aiService.generateProfileRoast(user.userId);
  }
}
