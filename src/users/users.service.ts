import { createHash, randomUUID } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Gender, InterestedIn, Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { SyncUserDto } from '../auth/sync-user.dto';
import { AddPhotosDto } from './dto/photo.dto';
import { ReportUserDto } from './dto/block-report.dto';
import { CompleteProfileDto } from './dto/complete-profile.dto';
import { EditPhotoDto, EditProfileDto } from './dto/edit-profile.dto';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';

const MAX_PHOTOS = 3;
const NINJA_COST_IN_COINS = 50;
const NINJA_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const MS_PER_DAY = 86_400_000;
const LEYENDA_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
const LEYENDA_PRICE_IN_CENTS = 2499900;
const LEYENDA_WELCOME_COINS = 100;
const WELCOME_GIFT_COINS = 100;
const REFERRAL_CODE_LENGTH = 8;
const REFERRAL_CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const MAX_REFERRAL_CODE_ATTEMPTS = 10;
const DEFAULT_MAX_DISTANCE_KM = 50;
const DEFAULT_MIN_AGE_PREFERENCE = 18;
const DEFAULT_MAX_AGE_PREFERENCE = 99;
const EARTH_RADIUS_KM = 6371;

type UserWithRelations = Prisma.UserGetPayload<{
  include: {
    preferences: true;
    photos: { orderBy: { order: 'asc' } };
  };
}>;

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  private readonly userInclude = {
    preferences: true,
    photos: { orderBy: { order: 'asc' as const } },
  } as const;

  constructor(private readonly prisma: PrismaService) {}

  async getOrCreateUser(authUser: AuthenticatedUser) {
    const existing = await this.prisma.user.findUnique({
      where: { id: authUser.userId },
      include: this.userInclude,
    });

    if (existing) {
      return existing;
    }

    try {
      const email = authUser.email ?? '';
      return await this.prisma.$transaction(async (tx) => {
        const referralCode = await this.generateReferralCode(tx);

        const user = await tx.user.create({
          data: {
            id: authUser.userId,
            email,
            firstName: email.split('@')[0] || 'usuario',
            city: 'Pasto',
            referralCode,
            coinsBalance: WELCOME_GIFT_COINS,
            preferences: {
              create: {},
            },
          },
          include: this.userInclude,
        });

        await tx.transaction.create({
          data: {
            reference: `CUY-WELCOME-${Date.now()}-${randomUUID()}`,
            amountInCents: 0,
            coinsAmount: WELCOME_GIFT_COINS,
            type: 'WELCOME_GIFT',
            status: 'APPROVED',
            userId: user.id,
          },
        });

        return user;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        // Another request may have created the record concurrently.
        return this.prisma.user.findUnique({
          where: { id: authUser.userId },
          include: this.userInclude,
        });
      }
      throw error;
    }
  }

  async syncUser(authUser: AuthenticatedUser, dto: SyncUserDto) {
    const email = dto.email ?? authUser.email ?? '';

    const existing = await this.prisma.user.findUnique({
      where: { id: authUser.userId },
    });

    if (existing) {
      const data: Prisma.UserUpdateInput = {};

      if (dto.googleId && !existing.googleId) {
        data.googleId = dto.googleId;
      }
      if (email && existing.email !== email) {
        data.email = email;
      }

      if (!data.googleId && !data.email) {
        return existing;
      }

      try {
        const updated = await this.prisma.user.update({
          where: { id: authUser.userId },
          data,
        });
        return { ...existing, ...updated };
      } catch (error) {
        this.handlePrismaError(error, 'No se pudo sincronizar el usuario');
      }
    }

    const fullName = [dto.firstName, dto.lastName]
      .filter(Boolean)
      .join(' ')
      .trim();
    const derivedName = fullName || email.split('@')[0] || 'Usuario';
    const [firstName = 'Usuario', ...rest] = derivedName.split(' ');

    try {
      return await this.prisma.$transaction(async (tx) => {
        const referralCode = await this.generateReferralCode(tx);

        let referredById: string | null = null;
        if (dto.referredBy) {
          const referrer = await tx.user.findUnique({
            where: { referralCode: dto.referredBy },
            select: { id: true },
          });
          if (referrer) {
            referredById = referrer.id;
          }
        }

        const user = await tx.user.create({
          data: {
            id: authUser.userId,
            email,
            googleId: dto.googleId ?? null,
            firstName,
            lastName: rest.length ? rest.join(' ') : null,
            city: 'Pasto',
            referralCode,
            referredById,
            coinsBalance: WELCOME_GIFT_COINS,
            preferences: {
              create: {},
            },
          },
        });

        await tx.transaction.create({
          data: {
            reference: `CUY-WELCOME-${Date.now()}-${randomUUID()}`,
            amountInCents: 0,
            coinsAmount: WELCOME_GIFT_COINS,
            type: 'WELCOME_GIFT',
            status: 'APPROVED',
            userId: user.id,
          },
        });

        return user;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return this.prisma.user.findUnique({
          where: { id: authUser.userId },
        });
      }
      throw error;
    }
  }

  async updateProfile(userId: string, dto: CompleteProfileDto) {
    await this.getOrCreateUser({ userId });

    try {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
          gender: dto.gender,
          interestedIn: dto.interestedIn,
          relationshipGoal: dto.relationshipGoal,
          hobbies: dto.hobbies ?? undefined,
          bio: dto.bio,
          city: dto.city ?? 'Pasto',
          latitude: dto.latitude,
          longitude: dto.longitude,
        },
      });

      const updated = await this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        include: this.userInclude,
      });

      return this.serializeProfile(updated);
    } catch (error) {
      this.handlePrismaError(error, 'No se pudo actualizar el perfil');
    }
  }

  async addPhotos(userId: string, dto: AddPhotosDto) {
    await this.getOrCreateUser({ userId });

    try {
      return await this.prisma.$transaction(
        dto.photos.map((photo) =>
          this.prisma.photo.create({
            data: {
              url: photo.url,
              order: photo.order,
              isProfile: photo.isProfile ?? false,
              userId,
            },
          }),
        ),
      );
    } catch (error) {
      this.handlePrismaError(error, 'No se pudieron guardar las fotos');
    }
  }

  async getProfile(userId: string) {
    const user = await this.getOrCreateUser({ userId });
    if (!user) {
      throw new NotFoundException('El usuario no existe');
    }
    return this.serializeProfile(user);
  }

  async getBalance(userId: string): Promise<{
    coinsBalance: number;
    dailyZumbidosLeft: number;
    dailyCuyazosLeft: number;
  }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        coinsBalance: true,
        dailyZumbidosLeft: true,
        dailyCuyazosLeft: true,
      },
    });
    if (!user) {
      throw new NotFoundException('El usuario no existe');
    }
    return {
      coinsBalance: user.coinsBalance,
      dailyZumbidosLeft: user.dailyZumbidosLeft,
      dailyCuyazosLeft: user.dailyCuyazosLeft,
    };
  }

  async activateNinja(userId: string) {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { isNinja: true, isLeyenda: true, coinsBalance: true },
      });

      if (!user) {
        throw new NotFoundException('El usuario no existe');
      }

      if (user.isNinja) {
        throw new BadRequestException('El modo Cuy Ninja ya está activo');
      }

      const isFree = user.isLeyenda;

      if (!isFree && user.coinsBalance < NINJA_COST_IN_COINS) {
        throw new BadRequestException(
          'Saldo insuficiente para activar el modo Cuy Ninja',
        );
      }

      if (!isFree) {
        await tx.user.update({
          where: { id: userId },
          data: { coinsBalance: { decrement: NINJA_COST_IN_COINS } },
          select: { coinsBalance: true },
        });

        await tx.transaction.create({
          data: {
            reference: `CUY-${Date.now()}-${randomUUID()}`,
            amountInCents: 0,
            coinsAmount: -NINJA_COST_IN_COINS,
            type: 'NINJA_ACTIVATED',
            status: 'APPROVED',
            userId,
          },
          select: { id: true },
        });
      }

      const updated = await tx.user.update({
        where: { id: userId },
        data: {
          isNinja: true,
          ninjaExpiresAt: isFree
            ? new Date(Date.now() + LEYENDA_DURATION_MS)
            : new Date(Date.now() + NINJA_DURATION_MS),
        },
        select: { isNinja: true, ninjaExpiresAt: true },
      });

      return {
        isNinja: updated.isNinja,
        ninjaExpiresAt: updated.ninjaExpiresAt,
        ninjaDaysLeft: updated.ninjaExpiresAt
          ? Math.max(
              0,
              Math.ceil(
                (updated.ninjaExpiresAt.getTime() - Date.now()) / MS_PER_DAY,
              ),
            )
          : 0,
      };
    });
  }

  async deactivateNinja(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { isLeyenda: true },
    });

    if (!user) {
      throw new NotFoundException('El usuario no existe');
    }

    if (!user.isLeyenda) {
      throw new ForbiddenException(
        'Solo los usuarios Cuy Leyenda pueden desactivar este modo manualmente.',
      );
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: { isNinja: false, ninjaExpiresAt: null },
      select: { isNinja: true, ninjaExpiresAt: true },
    });
  }

  async createLeyendaCheckout(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { isLeyenda: true, leyendaExpiresAt: true },
    });

    if (!user) {
      throw new NotFoundException('El usuario no existe');
    }

    if (
      user.isLeyenda &&
      user.leyendaExpiresAt &&
      user.leyendaExpiresAt > new Date()
    ) {
      throw new BadRequestException(
        'Ya tienes una suscripción Cuy Leyenda activa',
      );
    }

    const reference = `CUY-LEYENDA-${Date.now()}-${randomUUID()}`;

    const transaction = await this.prisma.transaction.create({
      data: {
        reference,
        amountInCents: LEYENDA_PRICE_IN_CENTS,
        coinsAmount: LEYENDA_WELCOME_COINS,
        type: 'VIP_SUBSCRIPTION',
        status: 'PENDING',
        userId,
      },
    });

    const signature = this.buildIntegritySignature(
      transaction.reference,
      transaction.amountInCents,
    );

    return {
      reference: transaction.reference,
      amountInCents: transaction.amountInCents,
      currency: 'COP' as const,
      signature,
      publicKey: process.env.WOMPI_PUBLIC_KEY,
      transactionId: transaction.id,
    };
  }

  async verifyLeyendaSubscription(userId: string, reference: string) {
    const dbTransaction = await this.prisma.transaction.findUnique({
      where: { reference },
      select: {
        id: true,
        reference: true,
        amountInCents: true,
        status: true,
        userId: true,
      },
    });

    if (!dbTransaction) {
      throw new NotFoundException('Transacción no encontrada');
    }

    if (dbTransaction.userId !== userId) {
      throw new ForbiddenException('Esta transacción no te pertenece');
    }

    if (dbTransaction.status !== 'PENDING') {
      if (dbTransaction.status === 'APPROVED') {
        const user = await this.prisma.user.findUniqueOrThrow({
          where: { id: userId },
          select: {
            isLeyenda: true,
            leyendaExpiresAt: true,
            coinsBalance: true,
            dailyZumbidosLeft: true,
            dailyCuyazosLeft: true,
          },
        });
        const leyendaDaysLeft =
          user.isLeyenda && user.leyendaExpiresAt
            ? Math.max(
                0,
                Math.ceil(
                  (user.leyendaExpiresAt.getTime() - Date.now()) / MS_PER_DAY,
                ),
              )
            : 0;
        return {
          status: 'APPROVED',
          message: 'La suscripción Cuy Leyenda ya fue activada',
          isLeyenda: user.isLeyenda,
          leyendaExpiresAt: user.leyendaExpiresAt,
          coinsBalance: user.coinsBalance,
          dailyZumbidosLeft: user.dailyZumbidosLeft,
          dailyCuyazosLeft: user.dailyCuyazosLeft,
          leyendaDaysLeft,
        };
      }
      return {
        status: dbTransaction.status,
        message: 'La transacción no fue aprobada',
      };
    }

    const wompiTx = await this.queryWompiTransaction(reference);

    if (!wompiTx) {
      return {
        status: 'PENDING',
        message: 'El pago aún no ha sido confirmado por Wompi',
      };
    }

    if (wompiTx.status === 'APPROVED') {
      const activated = await this.activateLeyenda(
        dbTransaction.id,
        userId,
        wompiTx.id,
      );
      return {
        status: 'APPROVED',
        message: '¡Suscripción Cuy Leyenda activada!',
        ...activated,
      };
    }

    if (['DECLINED', 'VOIDED', 'ERROR'].includes(wompiTx.status)) {
      await this.prisma.transaction.updateMany({
        where: { id: dbTransaction.id, status: 'PENDING' },
        data: { status: 'DECLINED' },
      });
      return {
        status: wompiTx.status,
        message: 'El pago no fue aprobado',
      };
    }

    return {
      status: wompiTx.status,
      message: 'El pago está siendo procesado',
    };
  }

  private async activateLeyenda(
    transactionId: string,
    userId: string,
    wompiTransactionId: string,
  ) {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const updated = await tx.transaction.updateMany({
        where: { id: transactionId, status: 'PENDING' },
        data: { status: 'APPROVED', wompiTransactionId },
      });

      if (updated.count === 0) {
        const existing = await tx.transaction.findUniqueOrThrow({
          where: { id: transactionId },
          select: { status: true },
        });
        throw new ConflictException(
          `La transacción ya fue procesada con estado: ${existing.status}`,
        );
      }

      const user = await tx.user.update({
        where: { id: userId },
        data: {
          isLeyenda: true,
          leyendaExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          coinsBalance: { increment: 100 },
          dailyZumbidosLeft: 3,
          dailyCuyazosLeft: 1,
        },
        select: {
          isLeyenda: true,
          leyendaExpiresAt: true,
          coinsBalance: true,
          dailyZumbidosLeft: true,
          dailyCuyazosLeft: true,
        },
      });

      return {
        isLeyenda: user.isLeyenda,
        leyendaExpiresAt: user.leyendaExpiresAt,
        coinsBalance: user.coinsBalance,
        dailyZumbidosLeft: user.dailyZumbidosLeft,
        dailyCuyazosLeft: user.dailyCuyazosLeft,
        leyendaDaysLeft: user.leyendaExpiresAt
          ? Math.max(
              0,
              Math.ceil(
                (user.leyendaExpiresAt.getTime() - Date.now()) / MS_PER_DAY,
              ),
            )
          : 0,
      };
    });
  }

  private async queryWompiTransaction(reference: string) {
    const privateKey = process.env.WOMPI_PRIVATE_KEY;
    if (!privateKey) {
      this.logger.error('WOMPI_PRIVATE_KEY no está configurada');
      throw new InternalServerErrorException('Error de configuración de pagos');
    }

    try {
      const response = await fetch(
        //`https://production.wompi.su/v1/transactions?reference=${reference}`,
        `https://sandbox.wompi.su/v1/transactions?reference=${reference}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${privateKey}`,
          },
        },
      );

      if (!response.ok) {
        this.logger.error(
          `Wompi API error ${response.status} for reference ${reference}`,
        );
        return null;
      }

      const body = (await response.json()) as {
        data?: { id?: string; status?: string };
      };

      const tx = body?.data;
      if (!tx?.id || !tx?.status) {
        return null;
      }

      return { id: tx.id, status: tx.status };
    } catch (error) {
      this.logger.error(
        `Error consultando Wompi API para ${reference}: ${error instanceof Error ? error.message : error}`,
      );
      return null;
    }
  }

  private buildIntegritySignature(
    reference: string,
    amountInCents: number,
  ): string {
    const secret = process.env.WOMPI_INTEGRITY_SECRET ?? '';
    if (!secret) {
      this.logger.warn(
        'WOMPI_INTEGRITY_SECRET no está configurada; la firma se generará vacía',
      );
    }
    return createHash('sha256')
      .update(`${reference}${amountInCents}COP${secret}`)
      .digest('hex');
  }

  async deleteAccount(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, firstName: true },
    });

    if (!user) {
      throw new NotFoundException('El usuario no existe');
    }

    this.logger.log(
      `User deleted account: ${userId} (${user.email ?? user.firstName})`,
    );

    await this.prisma.user.delete({ where: { id: userId } });

    return { message: 'Cuenta eliminada correctamente' };
  }

  async editProfile(userId: string, dto: EditProfileDto) {
    await this.getOrCreateUser({ userId });

    const userUpdate: Prisma.UserUpdateInput = {};
    if (dto.firstName !== undefined) {
      userUpdate.firstName = dto.firstName;
    }
    if (dto.lastName !== undefined) {
      userUpdate.lastName = dto.lastName;
    }
    if (dto.birthDate !== undefined) {
      userUpdate.birthDate = new Date(dto.birthDate);
    }
    if (dto.gender !== undefined) {
      userUpdate.gender = dto.gender;
    }
    if (dto.interestedIn !== undefined) {
      userUpdate.interestedIn = dto.interestedIn;
    }
    if (dto.relationshipGoal !== undefined) {
      userUpdate.relationshipGoal = dto.relationshipGoal;
    }
    if (dto.hobbies !== undefined) {
      userUpdate.hobbies = dto.hobbies;
    }
    if (dto.bio !== undefined) {
      userUpdate.bio = dto.bio;
    }
    if (dto.city !== undefined) {
      userUpdate.city = dto.city;
    }
    if (dto.latitude !== undefined) {
      userUpdate.latitude = dto.latitude;
    }
    if (dto.longitude !== undefined) {
      userUpdate.longitude = dto.longitude;
    }

    const preferenceUpdate = dto.preferences
      ? {
          pushNotifications: dto.preferences.pushNotifications,
          emailNotifications: dto.preferences.emailNotifications,
          matchAlerts: dto.preferences.matchAlerts,
          messageAlerts: dto.preferences.messageAlerts,
          showLocation: dto.preferences.showLocation,
          invisibleMode: dto.preferences.invisibleMode,
          maxDistanceKm: dto.preferences.maxDistanceKm,
          minAgePreference: dto.preferences.minAgePreference,
          maxAgePreference: dto.preferences.maxAgePreference,
        }
      : undefined;

    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        if (Object.keys(userUpdate).length > 0) {
          await tx.user.update({ where: { id: userId }, data: userUpdate });
        }

        if (preferenceUpdate) {
          await tx.userPreference.upsert({
            where: { userId },
            create: { userId, ...preferenceUpdate },
            update: preferenceUpdate,
          });
        }

        if (dto.photos) {
          await this.syncPhotos(tx, userId, dto.photos);
        }

        return tx.user.findUniqueOrThrow({
          where: { id: userId },
          include: this.userInclude,
        });
      });

      return this.serializeProfile(updated);
    } catch (error) {
      this.handlePrismaError(error, 'No se pudo actualizar el perfil');
    }
  }

  async updateLastSeen(userId: string) {
    try {
      const user = await this.prisma.user.update({
        where: { id: userId },
        data: { lastSeen: new Date() },
        select: { id: true, lastSeen: true },
      });
      return { ok: true, lastSeen: user.lastSeen };
    } catch (error) {
      this.handlePrismaError(error, 'No se pudo actualizar la última conexión');
    }
  }

  async blockUser(blockerId: string, blockedId: string, reason?: string) {
    this.assertDistinctUsers(blockerId, blockedId);
    await this.assertUserExists(blockedId);

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.blockedUser.upsert({
        where: {
          blockerId_blockedId: { blockerId, blockedId },
        },
        create: { blockerId, blockedId, reason: reason ?? null },
        update: { reason: reason ?? null },
        select: { id: true },
      });

      const severed = await this.severConnection(tx, blockerId, blockedId);

      return {
        blocked: true,
        blockedId,
        matchSevered: severed.count > 0,
      };
    });
  }

  async reportUser(reporterId: string, reportedId: string, dto: ReportUserDto) {
    this.assertDistinctUsers(reporterId, reportedId);
    await this.assertUserExists(reportedId);

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const report = await tx.userReport.create({
        data: {
          reason: dto.reason,
          details: dto.details || null,
          reporterId,
          reportedId,
        },
        select: { id: true, createdAt: true },
      });

      await tx.blockedUser.upsert({
        where: {
          blockerId_blockedId: { blockerId: reporterId, blockedId: reportedId },
        },
        create: {
          blockerId: reporterId,
          blockedId: reportedId,
          reason: dto.reason,
        },
        update: { reason: dto.reason },
        select: { id: true },
      });

      const severed = await this.severConnection(tx, reporterId, reportedId);

      return {
        reportId: report.id,
        reported: true,
        blocked: true,
        matchSevered: severed.count > 0,
      };
    });
  }

  private async assertUserExists(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) {
      throw new NotFoundException('El usuario no existe');
    }
  }

  private assertDistinctUsers(actorId: string, targetId: string) {
    if (actorId === targetId) {
      throw new BadRequestException(
        'No puedes realizar esta acción sobre tu propio perfil',
      );
    }
  }

  private severConnection(
    tx: Prisma.TransactionClient,
    user1Id: string,
    user2Id: string,
  ) {
    return tx.match.deleteMany({
      where: {
        OR: [
          { user1Id, user2Id },
          { user1Id: user2Id, user2Id: user1Id },
        ],
      },
    });
  }

  async updatePreferences(userId: string, dto: UpdatePreferencesDto) {
    await this.getOrCreateUser({ userId });

    const data: Partial<Prisma.UserPreferenceUncheckedCreateInput> = {};
    if (dto.minAgePreference !== undefined) {
      data.minAgePreference = dto.minAgePreference;
    }
    if (dto.maxAgePreference !== undefined) {
      data.maxAgePreference = dto.maxAgePreference;
    }
    if (dto.maxDistanceKm !== undefined) {
      data.maxDistanceKm = dto.maxDistanceKm;
    }
    if (dto.showLocation !== undefined) {
      data.showLocation = dto.showLocation;
    }
    if (dto.invisibleMode !== undefined) {
      data.invisibleMode = dto.invisibleMode;
    }

    try {
      if (Object.keys(data).length === 0) {
        const existing = await this.prisma.userPreference.findUnique({
          where: { userId },
        });
        if (existing) {
          return existing;
        }
        return this.prisma.userPreference.create({ data: { userId } });
      }

      return await this.prisma.userPreference.upsert({
        where: { userId },
        create: { ...data, userId },
        update: data,
      });
    } catch (error) {
      this.handlePrismaError(
        error,
        'No se pudieron actualizar las preferencias',
      );
    }
  }

  async getExploreFeed(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        latitude: true,
        longitude: true,
        interestedIn: true,
        preferences: true,
      },
    });

    if (!user) {
      throw new NotFoundException('El usuario no existe');
    }

    const preferences = user.preferences;
    const maxDistanceKm = preferences?.maxDistanceKm ?? DEFAULT_MAX_DISTANCE_KM;
    const minAgePreference =
      preferences?.minAgePreference ?? DEFAULT_MIN_AGE_PREFERENCE;
    const maxAgePreference =
      preferences?.maxAgePreference ?? DEFAULT_MAX_AGE_PREFERENCE;

    const now = new Date();
    const minBirthDate = this.subtractYears(now, maxAgePreference);
    const maxBirthDate = this.subtractYears(now, minAgePreference);

    const where: Prisma.UserWhereInput = {
      id: { not: userId },
      isNinja: false,
      birthDate: { gte: minBirthDate, lte: maxBirthDate },
      receivedInteractions: {
        none: { fromUserId: userId },
      },
    };

    if (user.interestedIn && user.interestedIn !== InterestedIn.BOTH) {
      where.gender =
        user.interestedIn === InterestedIn.WOMEN ? Gender.FEMALE : Gender.MALE;
    }

    const { latitude, longitude } = user;
    if (latitude != null && longitude != null) {
      const latDelta = maxDistanceKm / 111.32;
      const lngDelta =
        maxDistanceKm / (111.32 * Math.cos((latitude * Math.PI) / 180));
      where.latitude = { gte: latitude - latDelta, lte: latitude + latDelta };
      where.longitude = {
        gte: longitude - lngDelta,
        lte: longitude + lngDelta,
      };
    }

    let candidates = await this.prisma.user.findMany({
      where,
      select: {
        id: true,
        firstName: true,
        birthDate: true,
        bio: true,
        gender: true,
        city: true,
        relationshipGoal: true,
        hobbies: true,
        isLeyenda: true,
        latitude: true,
        longitude: true,
        photos: {
          orderBy: { order: 'asc' },
          select: { id: true, url: true },
          take: MAX_PHOTOS,
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (latitude != null && longitude != null) {
      candidates = candidates.filter(
        (candidate) =>
          candidate.latitude != null &&
          candidate.longitude != null &&
          this.haversineKm(
            latitude,
            longitude,
            candidate.latitude,
            candidate.longitude,
          ) <= maxDistanceKm,
      );
    }

    return candidates.map((candidate) => ({
      id: candidate.id,
      firstName: candidate.firstName,
      birthDate: candidate.birthDate,
      bio: candidate.bio,
      gender: candidate.gender,
      city: candidate.city,
      relationshipGoal: candidate.relationshipGoal,
      hobbies: candidate.hobbies,
      isLeyenda: candidate.isLeyenda,
      photo: candidate.photos[0] ?? null,
      photos: candidate.photos.map((photo) => ({
        id: photo.id,
        url: photo.url,
      })),
      distance:
        latitude != null &&
        longitude != null &&
        candidate.latitude != null &&
        candidate.longitude != null
          ? Number(
              this.haversineKm(
                latitude,
                longitude,
                candidate.latitude,
                candidate.longitude,
              ).toFixed(1),
            )
          : null,
    }));
  }

  private subtractYears(date: Date, years: number): Date {
    return new Date(
      date.getFullYear() - years,
      date.getMonth(),
      date.getDate(),
    );
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

  private async syncPhotos(
    tx: Prisma.TransactionClient,
    userId: string,
    photos: EditPhotoDto[],
  ) {
    if (photos.length > MAX_PHOTOS) {
      throw new BadRequestException(
        `No puedes tener más de ${MAX_PHOTOS} fotos en tu perfil`,
      );
    }

    const existing = await tx.photo.findMany({
      where: { userId },
      select: { id: true },
    });
    const existingIds = new Set(existing.map((photo) => photo.id));

    for (const photo of photos) {
      if (photo.id && !existingIds.has(photo.id)) {
        throw new BadRequestException(
          'Una de las fotos ya no existe o no te pertenece',
        );
      }
    }

    const keptIds = new Set(
      photos
        .filter((photo) => photo.id !== undefined)
        .map((photo) => photo.id as string),
    );
    const removedIds = existing
      .filter((photo) => !keptIds.has(photo.id))
      .map((photo) => photo.id);

    if (removedIds.length > 0) {
      await tx.photo.deleteMany({
        where: { id: { in: removedIds } },
      });
    }

    for (const photo of photos) {
      const data = {
        url: photo.url,
        order: photo.order,
        isProfile: photo.isProfile ?? false,
      };

      if (photo.id) {
        await tx.photo.update({ where: { id: photo.id }, data });
      } else {
        await tx.photo.create({ data: { ...data, userId } });
      }
    }
  }

  private serializeProfile(user: UserWithRelations) {
    const photos = (user.photos ?? []).slice(0, MAX_PHOTOS);
    const now = Date.now();
    const ninjaDaysLeft =
      user.isNinja && user.ninjaExpiresAt
        ? Math.max(
            0,
            Math.ceil((user.ninjaExpiresAt.getTime() - now) / MS_PER_DAY),
          )
        : 0;
    const leyendaDaysLeft =
      user.isLeyenda && user.leyendaExpiresAt
        ? Math.max(
            0,
            Math.ceil((user.leyendaExpiresAt.getTime() - now) / MS_PER_DAY),
          )
        : 0;

    return {
      firstName: user.firstName,
      lastName: user.lastName,
      birthDate: user.birthDate,
      gender: user.gender,
      interestedIn: user.interestedIn,
      relationshipGoal: user.relationshipGoal,
      hobbies: user.hobbies,
      bio: user.bio,
      city: user.city,
      latitude: user.latitude,
      longitude: user.longitude,
      coinsBalance: user.coinsBalance,
      cashBalanceInCents: user.cashBalanceInCents,
      referralCode: user.referralCode,
      referralEarnings: user.referralEarnings,
      isNinja: user.isNinja,
      isLeyenda: user.isLeyenda,
      leyendaExpiresAt: user.leyendaExpiresAt,
      leyendaDaysLeft,
      dailyZumbidosLeft: user.dailyZumbidosLeft,
      dailyCuyazosLeft: user.dailyCuyazosLeft,
      ninjaDaysLeft,
      preferences: user.preferences
        ? {
            pushNotifications: user.preferences.pushNotifications,
            emailNotifications: user.preferences.emailNotifications,
            matchAlerts: user.preferences.matchAlerts,
            messageAlerts: user.preferences.messageAlerts,
            showLocation: user.preferences.showLocation,
            invisibleMode: user.preferences.invisibleMode,
            maxDistanceKm: user.preferences.maxDistanceKm,
            minAgePreference: user.preferences.minAgePreference,
            maxAgePreference: user.preferences.maxAgePreference,
          }
        : null,
      photos: photos.map((photo) => ({
        id: photo.id,
        url: photo.url,
        order: photo.order,
        isProfile: photo.isProfile,
      })),
    };
  }

  private async generateReferralCode(
    tx: Prisma.TransactionClient,
  ): Promise<string> {
    for (let attempt = 0; attempt < MAX_REFERRAL_CODE_ATTEMPTS; attempt++) {
      let code = '';
      for (let i = 0; i < REFERRAL_CODE_LENGTH; i++) {
        code += REFERRAL_CODE_CHARS.charAt(
          Math.floor(Math.random() * REFERRAL_CODE_CHARS.length),
        );
      }

      const exists = await tx.user.findUnique({
        where: { referralCode: code },
        select: { id: true },
      });

      if (!exists) {
        return code;
      }
    }

    throw new InternalServerErrorException(
      'No se pudo generar un código de referido único',
    );
  }

  private handlePrismaError(error: unknown, fallbackMessage: string): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') {
        throw new NotFoundException('El usuario no existe');
      }
      if (error.code === 'P2002') {
        throw new ConflictException('Registro duplicado');
      }
      throw new ConflictException(fallbackMessage);
    }

    throw error;
  }
}
