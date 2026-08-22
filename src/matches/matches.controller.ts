import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateMessageDto } from './dto/create-message.dto';
import { MatchesService } from './matches.service';

@Controller('matches')
@UseGuards(JwtAuthGuard)
export class MatchesController {
  constructor(private readonly matchesService: MatchesService) {}

  @Get()
  async getMatches(@CurrentUser() user: AuthenticatedUser) {
    return this.matchesService.getUserMatches(user.userId);
  }

  @Get(':matchId/messages')
  async getMessages(
    @CurrentUser() user: AuthenticatedUser,
    @Param('matchId', new ParseUUIDPipe({ version: '4' })) matchId: string,
  ) {
    return this.matchesService.getMatchMessages(matchId, user.userId);
  }

  @Patch(':matchId/read')
  async markRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('matchId', new ParseUUIDPipe({ version: '4' })) matchId: string,
  ) {
    return this.matchesService.markMatchAsRead(matchId, user.userId);
  }

  @Post(':matchId/messages')
  async createMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('matchId', new ParseUUIDPipe({ version: '4' })) matchId: string,
    @Body() dto: CreateMessageDto,
  ) {
    return this.matchesService.createMessage(
      matchId,
      user.userId,
      dto.content,
      dto.replyToId,
    );
  }
}
