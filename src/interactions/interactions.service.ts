import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InteractionType, Prisma } from '@prisma/client';

import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { ChangeInteractionDto } from './dto/change-interaction.dto';
import { CreateInteractionDto } from './dto/create-interaction.dto';

const SUPER_LIKE_COST = 15;
const HISTORY_LIMIT = 50;
const MAX_PHOTOS = 3;
const HIGHLY_REQUESTED_THRESHOLD = 10;
const EARTH_RADIUS_KM = 6371;

export interface CreateInteractionResult {
  success: boolean;
  isMatch: boolean;
  matchId: string | undefined;
  newCoinBalance: number | undefined;
}

export interface ChangeInteractionResult {
  success: boolean;
  previousType: InteractionType;
  type: InteractionType;
  isMatch: boolean;
  matchId: string | undefined;
}

type MatchResolution = {
  isMatch: boolean;
  matchId: string | undefined;
  created: boolean;
};

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

    let matchedNow = false;
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
          const resolution = await this.ensureMatch(tx, fromUserId, toUserId);
          isMatch = resolution.isMatch;
          matchId = resolution.matchId;
          matchedNow = resolution.created;
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

    if (result.isMatch && matchedNow) {
      this.notifyNewMatch(fromUserId, toUserId);
    }

    return result;
  }

  async getInteractionHistory(userId: string) {
    const viewer = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { latitude: true, longitude: true },
    });
    if (!viewer) {
      throw new NotFoundException('El usuario no existe');
    }

    const interactions = await this.prisma.interaction.findMany({
      where: { fromUserId: userId },
      orderBy: { createdAt: 'desc' },
      take: HISTORY_LIMIT,
      select: {
        id: true,
        type: true,
        createdAt: true,
        toUser: {
          select: {
            id: true,
            firstName: true,
            birthDate: true,
            bio: true,
            gender: true,
            city: true,
            relationshipGoal: true,
            interestedIn: true,
            hobbies: true,
            isLeyenda: true,
            latitude: true,
            longitude: true,
            photos: {
              orderBy: { order: 'asc' },
              select: { id: true, url: true },
              take: MAX_PHOTOS,
            },
            _count: {
              select: {
                receivedInteractions: {
                  where: {
                    type: {
                      in: [InteractionType.LIKE, InteractionType.SUPER_LIKE],
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    return interactions.map((interaction) => {
      const target = interaction.toUser;
      const distance =
        viewer.latitude != null &&
        viewer.longitude != null &&
        target.latitude != null &&
        target.longitude != null
          ? Number(
              this.haversineKm(
                viewer.latitude,
                viewer.longitude,
                target.latitude,
                target.longitude,
              ).toFixed(1),
            )
          : null;

      return {
        id: interaction.id,
        type: interaction.type,
        createdAt: interaction.createdAt,
        target: {
          id: target.id,
          firstName: target.firstName,
          birthDate: target.birthDate,
          bio: target.bio,
          gender: target.gender,
          city: target.city,
          relationshipGoal: target.relationshipGoal,
          interestedIn: target.interestedIn,
          hobbies: target.hobbies,
          isLeyenda: target.isLeyenda,
          isHighlyRequested:
            target._count.receivedInteractions >= HIGHLY_REQUESTED_THRESHOLD,
          distance,
          photo: target.photos[0] ?? null,
          photos: target.photos.map((photo) => ({
            id: photo.id,
            url: photo.url,
          })),
        },
      };
    });
  }

  async changeInteraction(
    userId: string,
    dto: ChangeInteractionDto,
  ): Promise<ChangeInteractionResult> {
    const { targetUserId, newActionType } = dto;

    if (userId === targetUserId) {
      throw new BadRequestException('No puedes interactuar contigo mismo');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { isLeyenda: true, leyendaExpiresAt: true },
    });
    if (!user) {
      throw new NotFoundException('El usuario no existe');
    }

    const isLeyendaActive =
      user.isLeyenda &&
      user.leyendaExpiresAt != null &&
      user.leyendaExpiresAt.getTime() > Date.now();
    if (!isLeyendaActive) {
      throw new ForbiddenException(
        'El Reversazo es exclusivo para usuarios Cuy Leyenda',
      );
    }

    let matchedNow = false;
    const result = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.interaction.findUnique({
        where: {
          fromUserId_toUserId: { fromUserId: userId, toUserId: targetUserId },
        },
      });
      if (!existing) {
        throw new NotFoundException(
          'No tienes una interacción con este usuario',
        );
      }

      if (existing.type === newActionType) {
        return {
          success: true,
          previousType: existing.type,
          type: newActionType,
          isMatch: false,
          matchId: undefined as string | undefined,
        };
      }

      await tx.interaction.update({
        where: { id: existing.id },
        data: { type: newActionType },
      });

      let isMatch = false;
      let matchId: string | undefined;
      if (
        newActionType === InteractionType.LIKE ||
        newActionType === InteractionType.SUPER_LIKE
      ) {
        const resolution = await this.ensureMatch(tx, userId, targetUserId);
        isMatch = resolution.isMatch;
        matchId = resolution.matchId;
        matchedNow = resolution.created;
      }

      return {
        success: true,
        previousType: existing.type,
        type: newActionType,
        isMatch,
        matchId,
      };
    });

    if (result.isMatch && matchedNow) {
      this.notifyNewMatch(userId, targetUserId);
    }

    return result;
  }

  private async ensureMatch(
    tx: Prisma.TransactionClient,
    fromUserId: string,
    toUserId: string,
  ): Promise<MatchResolution> {
    const mutual = await tx.interaction.findFirst({
      where: {
        fromUserId: toUserId,
        toUserId: fromUserId,
        type: { in: [InteractionType.LIKE, InteractionType.SUPER_LIKE] },
      },
      select: { id: true },
    });
    if (!mutual) {
      return { isMatch: false, matchId: undefined, created: false };
    }

    const [user1Id, user2Id] = [fromUserId, toUserId].sort();
    const existingMatch = await tx.match.findUnique({
      where: { user1Id_user2Id: { user1Id, user2Id } },
      select: { id: true },
    });
    if (existingMatch) {
      return { isMatch: true, matchId: existingMatch.id, created: false };
    }

    const match = await tx.match.create({
      data: { user1Id, user2Id },
      select: { id: true },
    });
    return { isMatch: true, matchId: match.id, created: true };
  }

  private notifyNewMatch(userAId: string, userBId: string): void {
    const title = '¡Nuevo Match! 🎉';
    const body = 'Tienes un nuevo match. ¡Rompe el hielo ahora!';
    const data = { url: 'cuyamor://matches' };

    this.notifications
      .sendPushNotification(userAId, title, body, data)
      .catch(() => {});
    this.notifications
      .sendPushNotification(userBId, title, body, data)
      .catch(() => {});
  }

  private haversineKm(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
  ): number {
    const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
    const dLat = toRadians(lat2 - lat1);
    const dLng = toRadians(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRadians(lat1)) *
        Math.cos(toRadians(lat2)) *
        Math.sin(dLng / 2) ** 2;
    return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
  }
}
