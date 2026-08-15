import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { JwtAuthGuard } from './jwt-auth.guard';
import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [ConfigModule, JwtModule.register({})],
  providers: [JwtStrategy, JwtAuthGuard],
  exports: [JwtStrategy, JwtAuthGuard],
})
export class AuthModule {}
