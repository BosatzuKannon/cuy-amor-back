import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CompleteProfileDto } from './dto/complete-profile.dto';
import { AddPhotosDto } from './dto/photo.dto';
import { UserService } from './users.service';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UserController {
  constructor(private readonly usersService: UserService) {}

  @Get('me')
  async getProfile(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.getOrCreateUser(user);
  }

  @Patch('profile')
  async completeProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CompleteProfileDto,
  ) {
    return this.usersService.updateProfile(user.userId, dto);
  }

  @Post('photos')
  async addPhotos(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AddPhotosDto,
  ) {
    return this.usersService.addPhotos(user.userId, dto);
  }
}
