import { Controller, Get, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserService } from './users.service';

@Controller('explore')
@UseGuards(JwtAuthGuard)
export class ExploreController {
  constructor(private readonly usersService: UserService) {}

  @Get()
  async explore(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.getExploreFeed(user.userId);
  }
}
