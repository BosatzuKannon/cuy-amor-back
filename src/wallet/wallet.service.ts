import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TransactionType } from '@prisma/client';
//import { randomUUID } from 'crypto';

import { PrismaService } from '../prisma/prisma.service';
import { CreatePayoutDto } from './dto/create-payout.dto';
import {
  CurrencyType,
  WalletHistoryQueryDto,
} from './dto/wallet-history-query.dto';

const COIN_TRANSACTION_TYPES: TransactionType[] = [
  'NINJA_ACTIVATED',
  'ZUMBIDO_SENT',
  'GIFT_SENT',
  'WELCOME_GIFT',
  'COIN_RECHARGE',
  'VIP_SUBSCRIPTION',
  'BOOST_PURCHASE',
  'PRIORITY_MESSAGE',
];

const REAL_MONEY_TRANSACTION_TYPES: TransactionType[] = [
  'VIP_SUBSCRIPTION',
  'REFERRAL_COMMISSION',
  'GIFT_RECEIVED',
];

type HistoryEntry = {
  id: string;
  type: string;
  amountInCents: number;
  coinsAmount: number | null;
  description: string;
  status: string;
  createdAt: Date;
  source: 'TRANSACTION' | 'PAYOUT_REQUEST';
};

@Injectable()
export class WalletService {
  constructor(private readonly prisma: PrismaService) {}

  async createPayout(userId: string, dto: CreatePayoutDto) {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { cashBalanceInCents: true },
      });

      if (!user) {
        throw new NotFoundException('Usuario no encontrado');
      }

      if (user.cashBalanceInCents < dto.amountInCents) {
        throw new BadRequestException(
          `Saldo insuficiente. Tu saldo disponible es de $${Math.floor(user.cashBalanceInCents / 100).toLocaleString('es-CO')} COP`,
        );
      }

      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: {
          cashBalanceInCents: { decrement: dto.amountInCents },
        },
        select: { cashBalanceInCents: true },
      });

      const payoutRequest = await tx.payoutRequest.create({
        data: {
          amountInCents: dto.amountInCents,
          bankName: 'Nequi',
          accountNumber: dto.nequiNumber,
          accountHolder: 'User',
          status: 'PENDING',
          userId,
        },
        select: {
          id: true,
          amountInCents: true,
          bankName: true,
          accountNumber: true,
          status: true,
          createdAt: true,
        },
      });

      return {
        payoutRequest,
        newBalance: updatedUser.cashBalanceInCents,
      };
    });
  }

  async getHistory(userId: string, query: WalletHistoryQueryDto) {
    const startDate = query.startDate ? new Date(query.startDate) : undefined;
    const endDate = query.endDate ? new Date(query.endDate) : undefined;

    if (query.currencyType === CurrencyType.CUY_COINS) {
      return this.getCoinHistory(userId, startDate, endDate);
    }

    return this.getRealMoneyHistory(userId, startDate, endDate);
  }

  private async getCoinHistory(
    userId: string,
    startDate?: Date,
    endDate?: Date,
  ) {
    const where: Prisma.TransactionWhereInput = {
      userId,
      type: { in: COIN_TRANSACTION_TYPES },
      status: 'APPROVED',
    };

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }

    const transactions = await this.prisma.transaction.findMany({
      where,
      select: {
        id: true,
        type: true,
        amountInCents: true,
        coinsAmount: true,
        status: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return transactions.map((tx) => ({
      id: tx.id,
      type: tx.type,
      amountInCents: tx.amountInCents,
      coinsAmount: tx.coinsAmount,
      description: this.getCoinDescription(tx.type, tx.coinsAmount),
      status: tx.status,
      createdAt: tx.createdAt,
      source: 'TRANSACTION' as const,
    }));
  }

  private async getRealMoneyHistory(
    userId: string,
    startDate?: Date,
    endDate?: Date,
  ) {
    const dateFilter: Prisma.DateTimeFilter = {};
    if (startDate) dateFilter.gte = startDate;
    if (endDate) dateFilter.lte = endDate;

    const hasDateFilter = startDate || endDate;

    const [transactions, payoutRequests] = await Promise.all([
      this.prisma.transaction.findMany({
        where: {
          userId,
          type: { in: REAL_MONEY_TRANSACTION_TYPES },
          status: 'APPROVED',
          ...(hasDateFilter ? { createdAt: dateFilter } : {}),
        },
        select: {
          id: true,
          type: true,
          amountInCents: true,
          coinsAmount: true,
          status: true,
          createdAt: true,
        },
      }),
      this.prisma.payoutRequest.findMany({
        where: {
          userId,
          ...(hasDateFilter ? { createdAt: dateFilter } : {}),
        },
        select: {
          id: true,
          amountInCents: true,
          bankName: true,
          accountNumber: true,
          status: true,
          createdAt: true,
        },
      }),
    ]);

    const entries: HistoryEntry[] = [
      ...transactions.map((tx) => ({
        id: tx.id,
        type: tx.type,
        amountInCents: tx.amountInCents,
        coinsAmount: tx.coinsAmount,
        description: this.getRealMoneyDescription(tx.type),
        status: tx.status,
        createdAt: tx.createdAt,
        source: 'TRANSACTION' as const,
      })),
      ...payoutRequests.map((pr) => ({
        id: pr.id,
        type: 'PAYOUT_REQUEST' as const,
        amountInCents: pr.amountInCents,
        coinsAmount: null,
        description: `Retiro a Nequi (${pr.accountNumber})`,
        status: pr.status,
        createdAt: pr.createdAt,
        source: 'PAYOUT_REQUEST' as const,
      })),
    ];

    entries.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    return entries;
  }

  private getCoinDescription(
    type: TransactionType,
    coinsAmount: number | null,
  ): string {
    const descs: Record<TransactionType, string> = {
      COIN_RECHARGE: 'Recarga de monedas',
      GIFT_SENT: 'Regalo enviado',
      GIFT_RECEIVED: 'Regalo recibido',
      PRIORITY_MESSAGE: 'Mensaje prioritario',
      BOOST_PURCHASE: 'Compra de boost',
      REFERRAL_COMMISSION: 'Comisión de referido',
      WELCOME_GIFT: 'Regalo de bienvenida',
      NINJA_ACTIVATED: 'Modo Ninja activado',
      ZUMBIDO_SENT: 'Zumbido enviado',
      VIP_SUBSCRIPTION: 'Suscripción Cuy Leyenda',
    };
    const base = descs[type] ?? type;
    if (coinsAmount !== null && coinsAmount !== 0) {
      const sign = coinsAmount > 0 ? '+' : '';
      return `${base} (${sign}${coinsAmount} monedas)`;
    }
    return base;
  }

  private getRealMoneyDescription(type: TransactionType): string {
    const descs: Record<TransactionType, string> = {
      COIN_RECHARGE: 'Recarga de monedas',
      VIP_SUBSCRIPTION: 'Suscripción Cuy Leyenda',
      REFERRAL_COMMISSION: 'Comisión de referido',
      GIFT_SENT: 'Regalo enviado',
      GIFT_RECEIVED: 'Regalo recibido',
      PRIORITY_MESSAGE: 'Mensaje prioritario',
      BOOST_PURCHASE: 'Compra de boost',
      WELCOME_GIFT: 'Regalo de bienvenida',
      NINJA_ACTIVATED: 'Modo Ninja activado',
      ZUMBIDO_SENT: 'Zumbido enviado',
    };
    return descs[type] ?? type;
  }
}
