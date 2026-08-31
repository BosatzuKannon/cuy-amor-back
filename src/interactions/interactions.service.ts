import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InteractionType, Prisma } from '@prisma/client';

import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInteractionDto } from './dto/create-interaction.dto';

const SUPER_LIKE_COST = 15;

export interface CreateInteractionResult {
  success: boolean;
  isMatch: boolean;
  matchId: string | undefined;
  newCoinBalance: number | undefined;
}

@Injectable()
export class InteractionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async createInteraction(
    fromUserId: string,
    dto: CreateInteractionDto,
  ): Promise<CreateInteractionResult> {
    const { toUserId, type } = dto;

    if (fromUserId === toUserId) {
      throw new BadRequestException('No puedes interactuar contigo mismo');
    }

    let result: CreateInteractionResult;
    try {
      result = await this.prisma.$transaction(async (tx) => {
        const existing = await tx.interaction.findUnique({
          where: {
            fromUserId_toUserId: { fromUserId, toUserId },
          },
        });
        if (existing) {
          throw new ConflictException(
            'Ya registraste una interacción con este usuario',
          );
        }

        const targetUser = await tx.user.findUnique({
          where: { id: toUserId },
          select: { id: true },
        });
        if (!targetUser) {
          throw new NotFoundException('El usuario destino no existe');
        }

        let newCoinBalance: number | undefined;
        if (type === InteractionType.SUPER_LIKE) {
          const fromUser = await tx.user.findUnique({
            where: { id: fromUserId },
            select: {
              isLeyenda: true,
              dailyCuyazosLeft: true,
              coinsBalance: true,
            },
          });
          if (!fromUser) {
            throw new NotFoundException('El usuario no existe');
          }

          const isFree = fromUser.isLeyenda && fromUser.dailyCuyazosLeft > 0;

          if (isFree) {
            await tx.user.update({
              where: { id: fromUserId },
              data: { dailyCuyazosLeft: { decrement: 1 } },
              select: { dailyCuyazosLeft: true },
            });
            newCoinBalance = fromUser.coinsBalance;
          } else {
            const result = await tx.user.updateMany({
              where: { id: fromUserId, coinsBalance: { gte: SUPER_LIKE_COST } },
              data: { coinsBalance: { decrement: SUPER_LIKE_COST } },
            });
            if (result.count === 0) {
              throw new BadRequestException(
                'Saldo insuficiente para enviar un Cuyazo',
              );
            }
            const updated = await tx.user.findUnique({
              where: { id: fromUserId },
              select: { coinsBalance: true },
            });
            newCoinBalance = updated?.coinsBalance;
          }
        }

        await tx.interaction.create({
          data: { fromUserId, toUserId, type },
        });

        let isMatch = false;
        let matchId: string | undefined;
        if (
          type === InteractionType.LIKE ||
          type === InteractionType.SUPER_LIKE
        ) {
          const mutual = await tx.interaction.findFirst({
            where: {
              fromUserId: toUserId,
              toUserId: fromUserId,
              type: { in: [InteractionType.LIKE, InteractionType.SUPER_LIKE] },
            },
          });
          if (mutual) {
            const [user1Id, user2Id] = [fromUserId, toUserId].sort();
            const match = await tx.match.create({
              data: { user1Id, user2Id },
              select: { id: true },
            });
            isMatch = true;
            matchId = match.id;
          }
        }

        return {
          success: true,
          isMatch,
          matchId,
          newCoinBalance,
        };
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Ya registraste una interacción con este usuario',
        );
      }
      throw error;
    }

    if (result.isMatch) {
      const title = '¡Nuevo Match! 🎉';
      const body = 'Tienes un nuevo match. ¡Rompe el hielo ahora!';
      const data = { url: 'cuyamor://matches' };

      this.notifications
        .sendPushNotification(fromUserId, title, body, data)
        .catch(() => {});
      this.notifications
        .sendPushNotification(toUserId, title, body, data)
        .catch(() => {});
    }

    return result;
  }
}
