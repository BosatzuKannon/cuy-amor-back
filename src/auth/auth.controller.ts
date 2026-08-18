import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';

import {
  CurrentUser,
  type AuthenticatedUser,
} from '../common/decorators/current-user.decorator';
import { UserService } from '../users/users.service';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { SyncUserDto } from './sync-user.dto';

@Controller('auth')
@UseGuards(JwtAuthGuard)
export class AuthController {
  constructor(
    private readonly usersService: UserService,
    private readonly authService: AuthService,
  ) {}

  @Post('sync')
  async syncUser(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SyncUserDto,
  ) {
    return this.usersService.syncUser(user, dto);
  }

  @Get('supabase-token')
  supabaseToken(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.generateSupabaseToken(user.userId);
  }
}
