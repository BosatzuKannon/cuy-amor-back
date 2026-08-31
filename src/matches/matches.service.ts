import { randomUUID } from 'node:crypto';

import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import { Prisma } from '@prisma/client';

import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

const GIFT_RECEIVER_SHARE = 0.35;
const PLATFORM_REVENUE_SOURCE_GIFT_FEE = 'GIFT_FEE';

const GIFT_RELATION_SELECT = {
  select: {
    id: true,
    name: true,
    iconUrl: true,
    coinCost: true,
    cashValueCops: true,
  },
} as const;

@Injectable()
export class MatchesService {
  private readonly logger = new Logger(MatchesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  private readonly messageSelect = {
    id: true,
    content: true,
    isRead: true,
    isPriority: true,
    isSystemMessage: true,
    createdAt: true,
    senderId: true,
    recipientId: true,
    replyToId: true,
    gift: GIFT_RELATION_SELECT,
  } as const;

  async getUserMatches(userId: string) {
    const matches = await this.prisma.match.findMany({
      where: {
        OR: [{ user1Id: userId }, { user2Id: userId }],
      },
      include: {
        user1: {
          select: {
            id: true,
            firstName: true,
            gender: true,
            lastSeen: true,
            isLeyenda: true,
            photos: {
              where: { isProfile: true },
              orderBy: { order: 'asc' },
              take: 1,
              select: { url: true },
            },
          },
        },
        user2: {
          select: {
            id: true,
            firstName: true,
            gender: true,
            lastSeen: true,
            isLeyenda: true,
            photos: {
              where: { isProfile: true },
              orderBy: { order: 'asc' },
              take: 1,
              select: { url: true },
            },
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            content: true,
            createdAt: true,
            isRead: true,
            senderId: true,
            recipientId: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return matches.map((match) => {
      const isUser1 = match.user1Id === userId;
      const otherUser = isUser1 ? match.user2 : match.user1;
      const lastMessage = match.messages[0] ?? null;

      return {
        id: match.id,
        createdAt: match.createdAt,
        otherUser: {
          id: otherUser.id,
          firstName: otherUser.firstName,
          gender: otherUser.gender,
          lastSeen: otherUser.lastSeen,
          isLeyenda: otherUser.isLeyenda,
          avatarUrl: otherUser.photos[0]?.url ?? null,
        },
        lastMessage,
        hasUnread: lastMessage
          ? !lastMessage.isRead && lastMessage.senderId !== userId
          : false,
      };
    });
  }

  async getMatchMessages(matchId: string, userId: string) {
    const match = await this.assertMembership(matchId, userId);

    await this.markIncomingAsRead(match.id, userId);

    return this.prisma.message.findMany({
      where: { matchId },
      orderBy: { createdAt: 'asc' },
      select: this.messageSelect,
    });
  }

  async markMatchAsRead(matchId: string, userId: string) {
    const match = await this.assertMembership(matchId, userId);
    const result = await this.markIncomingAsRead(match.id, userId);
    return { updatedCount: result.count };
  }

  private async assertMembership(matchId: string, userId: string) {
    const match = await this.prisma.match.findFirst({
      where: {
        id: matchId,
        OR: [{ user1Id: userId }, { user2Id: userId }],
      },
      select: { id: true },
    });

    if (!match) {
      throw new NotFoundException('Match no encontrado');
    }

    return match;
  }

  private markIncomingAsRead(matchId: string, userId: string) {
    return this.prisma.message.updateMany({
      where: {
        matchId,
        senderId: { not: userId },
        isRead: false,
      },
      data: { isRead: true },
    });
  }

  async createMessage(
    matchId: string,
    userId: string,
    content: string,
    replyToId?: string,
  ) {
    const match = await this.prisma.match.findFirst({
      where: {
        id: matchId,
        OR: [{ user1Id: userId }, { user2Id: userId }],
      },
      select: { id: true, user1Id: true, user2Id: true },
    });

    if (!match) {
      throw new NotFoundException('Match no encontrado');
    }

    if (replyToId) {
      const replyTo = await this.prisma.message.findFirst({
        where: { id: replyToId, matchId },
        select: { id: true },
      });
      if (!replyTo) {
        throw new NotFoundException('Mensaje a responder no encontrado');
      }
    }

    const recipientId =
      match.user1Id === userId ? match.user2Id : match.user1Id;

    const message = await this.prisma.message.create({
      data: {
        content,
        matchId,
        senderId: userId,
        recipientId,
        replyToId,
      },
      select: this.messageSelect,
    });

    this.dispatchMessagePushNotification(matchId, userId, recipientId, {
      content: message.content,
      isSystemMessage: message.isSystemMessage,
      giftId: message.gift?.id ?? null,
    });

    return message;
  }

  private dispatchMessagePushNotification(
    matchId: string,
    senderId: string,
    recipientId: string,
    message: {
      content: string;
      isSystemMessage?: boolean | null;
      giftId?: string | null;
    },
  ): void {
    void this.sendMessagePushNotification(
      matchId,
      senderId,
      recipientId,
      message,
    ).catch(() => {
      // Push notifications must never break the chat flow.
    });
  }

  private async sendMessagePushNotification(
    matchId: string,
    senderId: string,
    recipientId: string,
    message: {
      content: string;
      isSystemMessage?: boolean | null;
      giftId?: string | null;
    },
  ): Promise<void> {
    try {
      const sender = await this.prisma.user.findUnique({
        where: { id: senderId },
        select: { firstName: true },
      });
      const firstName = sender?.firstName?.trim() || 'Alguien';

      let body: string;
      if (message.giftId) {
        body = 'Te ha enviado un regalo 🎁';
      } else if (
        message.isSystemMessage === true &&
        /zumbido/i.test(message.content ?? '')
      ) {
        body = '¡Te ha enviado un Zumbido! 🐝';
      } else {
        const content = message.content ?? '';
        body = content.length > 100 ? `${content.slice(0, 100)}…` : content;
      }

      await this.notificationsService.sendPushNotification(
        recipientId,
        `Nuevo mensaje de ${firstName}`,
        body,
        { url: `cuyamor://chat/${matchId}` },
      );
    } catch (error) {
      this.logger.error(
        `[matches] push notification dispatch failed (match ${matchId}):`,
        error,
      );
    }
  }

  async sendZumbido(matchId: string, userId: string) {
    const ZUMBIDO_COST_IN_COINS = 5;

    const match = await this.prisma.match.findFirst({
      where: {
        id: matchId,
        OR: [{ user1Id: userId }, { user2Id: userId }],
      },
      select: { id: true, user1Id: true, user2Id: true },
    });

    if (!match) {
      throw new NotFoundException('Match no encontrado');
    }

    const recipientId =
      match.user1Id === userId ? match.user2Id : match.user1Id;

    const message = await this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const user = await tx.user.findUnique({
          where: { id: userId },
          select: {
            isLeyenda: true,
            dailyZumbidosLeft: true,
            coinsBalance: true,
          },
        });

        if (!user) {
          throw new NotFoundException('El usuario no existe');
        }

        const isFree = user.isLeyenda && user.dailyZumbidosLeft > 0;

        if (!isFree && user.coinsBalance < ZUMBIDO_COST_IN_COINS) {
          throw new BadRequestException(
            'Saldo insuficiente para enviar un zumbido',
          );
        }

        if (isFree) {
          await tx.user.update({
            where: { id: userId },
            data: { dailyZumbidosLeft: { decrement: 1 } },
            select: { dailyZumbidosLeft: true },
          });
        } else {
          await tx.user.update({
            where: { id: userId },
            data: { coinsBalance: { decrement: ZUMBIDO_COST_IN_COINS } },
            select: { coinsBalance: true },
          });

          await tx.transaction.create({
            data: {
              reference: `CUY-${Date.now()}-${randomUUID()}`,
              amountInCents: 0,
              coinsAmount: -ZUMBIDO_COST_IN_COINS,
              type: 'ZUMBIDO_SENT',
              status: 'APPROVED',
              userId,
            },
            select: { id: true },
          });
        }

        return tx.message.create({
          data: {
            content: 'ha enviado un zumbido',
            matchId,
            senderId: userId,
            recipientId,
            isSystemMessage: true,
          },
          select: this.messageSelect,
        });
      },
    );

    this.dispatchMessagePushNotification(matchId, userId, recipientId, {
      content: message.content,
      isSystemMessage: message.isSystemMessage,
      giftId: message.gift?.id ?? null,
    });

    return message;
  }

  async sendGift(matchId: string, giftId: string, userId: string) {
    const match = await this.prisma.match.findFirst({
      where: {
        id: matchId,
        OR: [{ user1Id: userId }, { user2Id: userId }],
      },
      select: { id: true, user1Id: true, user2Id: true },
    });

    if (!match) {
      throw new NotFoundException('Match no encontrado');
    }

    const recipientId =
      match.user1Id === userId ? match.user2Id : match.user1Id;

    const message = await this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const [gift, sender] = await Promise.all([
          tx.virtualGift.findUnique({
            where: { id: giftId },
            select: {
              id: true,
              name: true,
              iconUrl: true,
              coinCost: true,
              cashValueCops: true,
            },
          }),
          tx.user.findUnique({
            where: { id: userId },
            select: { coinsBalance: true },
          }),
        ]);

        if (!gift) {
          throw new NotFoundException('El regalo no existe');
        }

        if (!sender) {
          throw new NotFoundException('El usuario no existe');
        }

        if (sender.coinsBalance < gift.coinCost) {
          throw new BadRequestException(
            'Saldo insuficiente para enviar este regalo',
          );
        }

        const receiverCut = Math.floor(
          gift.cashValueCops * GIFT_RECEIVER_SHARE,
        );
        const platformCut = gift.cashValueCops - receiverCut;

        await tx.user.update({
          where: { id: userId },
          data: { coinsBalance: { decrement: gift.coinCost } },
          select: { coinsBalance: true },
        });

        await tx.transaction.create({
          data: {
            reference: `CUY-${Date.now()}-${randomUUID()}`,
            amountInCents: 0,
            coinsAmount: -gift.coinCost,
            type: 'GIFT_SENT',
            status: 'APPROVED',
            userId,
          },
          select: { id: true },
        });

        await tx.user.update({
          where: { id: recipientId },
          data: { cashBalanceInCents: { increment: receiverCut } },
          select: { id: true },
        });

        await tx.transaction.create({
          data: {
            reference: `CUY-${Date.now()}-${randomUUID()}`,
            amountInCents: receiverCut,
            coinsAmount: 0,
            type: 'GIFT_RECEIVED',
            status: 'APPROVED',
            userId: recipientId,
          },
          select: { id: true },
        });

        await tx.platformRevenue.create({
          data: {
            amountInCents: platformCut,
            source: PLATFORM_REVENUE_SOURCE_GIFT_FEE,
          },
          select: { id: true },
        });

        await tx.userGift.create({
          data: {
            giftId: gift.id,
            senderId: userId,
            receiverId: recipientId,
          },
          select: { id: true },
        });

        return tx.message.create({
          data: {
            content: 'ha enviado un regalo',
            isSystemMessage: true,
            matchId,
            senderId: userId,
            recipientId,
            giftId: gift.id,
          },
          select: this.messageSelect,
        });
      },
    );

    this.dispatchMessagePushNotification(matchId, userId, recipientId, {
      content: message.content,
      isSystemMessage: message.isSystemMessage,
      giftId: message.gift?.id ?? null,
    });

    return message;
  }
}
