import { Module } from '@nestjs/common';

import { ExploreController } from './explore.controller';
import { UserController } from './users.controller';
import { UserService } from './users.service';

@Module({
  controllers: [UserController, ExploreController],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
