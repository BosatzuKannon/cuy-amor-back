import { Body, Controller, Post, UseGuards } from '@nestjs/common';

import {
  CurrentUser,
  type AuthenticatedUser,
} from '../common/decorators/current-user.decorator';
import { UserService } from '../users/users.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { SyncUserDto } from './sync-user.dto';

@Controller('auth')
@UseGuards(JwtAuthGuard)
export class AuthController {
  constructor(private readonly usersService: UserService) {}

  @Post('sync')
  async syncUser(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SyncUserDto,
  ) {
    return this.usersService.syncUser(user, dto);
  }
}
