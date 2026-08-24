import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Redirect,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import { TransactionsService } from './transactions.service';

@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @UseGuards(JwtAuthGuard)
  @Post('checkout')
  checkout(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCheckoutDto,
  ) {
    return this.transactionsService.createCheckout(user.userId, dto);
  }

  /**
   * Trampoline público para retornos de Wompi en Expo Go:
   * Wompi exige un redirect-url HTTPS, así que recibimos aquí y
   * rebotamos (302) hacia el deep link exp:// del usuario.
   */
  @Get('return')
  @Redirect()
  handleWompiReturn(@Query('url') url: string) {
    if (!url) return { url: 'https://cuyamor.com' };
    return { url };
  }
}
