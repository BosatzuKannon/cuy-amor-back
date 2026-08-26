import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreatePayoutDto } from './dto/create-payout.dto';
import { WalletHistoryQueryDto } from './dto/wallet-history-query.dto';
import { WalletService } from './wallet.service';

@Controller('wallet')
@UseGuards(JwtAuthGuard)
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Post('payout')
  createPayout(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePayoutDto,
  ) {
    return this.walletService.createPayout(user.userId, dto);
  }

  @Get('history')
  getHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: WalletHistoryQueryDto,
  ) {
    return this.walletService.getHistory(user.userId, query);
  }
}
