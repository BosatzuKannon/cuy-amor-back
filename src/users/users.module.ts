import { Module } from '@nestjs/common';

import { ExploreController } from './explore.controller';
import { NinjaCronService } from './ninja-cron.service';
import { UserController } from './users.controller';
import { UserService } from './users.service';

@Module({
  controllers: [UserController, ExploreController],
  providers: [UserService, NinjaCronService],
  exports: [UserService],
})
export class UserModule {}
