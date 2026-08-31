import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { CoinPackagesModule } from './coin-packages/coin-packages.module';
import { GiftsModule } from './gifts/gifts.module';
import { InteractionsModule } from './interactions/interactions.module';
import { KeepAliveModule } from './keep-alive/keep-alive.module';
import { MatchesModule } from './matches/matches.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PrismaModule } from './prisma/prisma.module';
import { PayoutsModule } from './payouts/payouts.module';
import { TransactionsModule } from './transactions/transactions.module';
import { UserModule } from './users/users.module';
import { WalletModule } from './wallet/wallet.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    UserModule,
    InteractionsModule,
    MatchesModule,
    NotificationsModule,
    CoinPackagesModule,
    GiftsModule,
    TransactionsModule,
    PayoutsModule,
    WalletModule,
    KeepAliveModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
