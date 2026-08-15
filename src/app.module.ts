import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { KeepAliveModule } from './keep-alive/keep-alive.module';
import { PrismaModule } from './prisma/prisma.module';
import { UserModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    AuthModule,
    UserModule,
    KeepAliveModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
