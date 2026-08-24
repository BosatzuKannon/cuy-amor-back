import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CompleteProfileDto } from './dto/complete-profile.dto';
import { EditProfileDto } from './dto/edit-profile.dto';
import { AddPhotosDto } from './dto/photo.dto';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';
import { UserService } from './users.service';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UserController {
  constructor(private readonly usersService: UserService) {}

  @Get('me')
  async getProfile(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.getProfile(user.userId);
  }

  @Get('me/balance')
  async getBalance(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.getBalance(user.userId);
  }

  @Patch('profile')
  async completeProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CompleteProfileDto,
  ) {
    return this.usersService.updateProfile(user.userId, dto);
  }

  @Patch('edit')
  async editProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: EditProfileDto,
  ) {
    return this.usersService.editProfile(user.userId, dto);
  }

  @Patch('last-seen')
  async updateLastSeen(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.updateLastSeen(user.userId);
  }

  @Patch('preferences')
  async updatePreferences(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdatePreferencesDto,
  ) {
    return this.usersService.updatePreferences(user.userId, dto);
  }

  @Post('photos')
  async addPhotos(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AddPhotosDto,
  ) {
    return this.usersService.addPhotos(user.userId, dto);
  }

  @Post('ninja/activate')
  async activateNinja(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.activateNinja(user.userId);
  }

  @Post('ninja/deactivate')
  async deactivateNinja(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.deactivateNinja(user.userId);
  }
}
