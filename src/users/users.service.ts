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
import { Gender, InteractionType, InterestedIn, Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { SyncUserDto } from '../auth/sync-user.dto';
import { AddPhotosDto } from './dto/photo.dto';
import { RegisterDeviceDto } from './dto/register-device.dto';
import { ReportUserDto } from './dto/block-report.dto';
import { CompleteProfileDto } from './dto/complete-profile.dto';
import { EditPhotoDto, EditProfileDto } from './dto/edit-profile.dto';
import {
  PROFILE_PROMPTS_MAX_COUNT,
  ProfilePromptDto,
} from './dto/profile-prompts.dto';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';

const MAX_PHOTOS = 3;
const NINJA_COST_IN_COINS = 50;
const NINJA_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const MS_PER_DAY = 86_400_000;
const LEYENDA_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
const LEYENDA_PRICE_IN_CENTS = 2499900;
const LEYENDA_WELCOME_COINS = 100;
const WELCOME_GIFT_COINS = 100;
const HIGHLY_REQUESTED_THRESHOLD = 10;
const REFERRAL_CODE_LENGTH = 8;
const REFERRAL_CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const MAX_REFERRAL_CODE_ATTEMPTS = 10;
const DEFAULT_MAX_DISTANCE_KM = 50;
const DEFAULT_MIN_AGE_PREFERENCE = 18;
const DEFAULT_MAX_AGE_PREFERENCE = 99;
const EARTH_RADIUS_KM = 6371;
const STREAK_TIME_ZONE = 'America/Bogota';
const STREAK_LOOP_DAYS = 7;
const HOURS_MS = 60 * 60 * 1000;
const LEYENDA_DAILY_ZUMBIDOS = 3;
const LEYENDA_DAILY_CUYAZOS = 1;
const LEYENDA_DAILY_AI = 10;

/**
 * Los `profilePrompts` se volvieron obligatorios en el onboarding con el
 * lanzamiento de los prompts de perfil. Los usuarios creados antes de esta
 * fecha son "legados": su perfil se considera completo sin necesidad de
 * responder prompts, de lo contrario quedan atrapados en el onboarding.
 */
const PROFILE_PROMPTS_REQUIRED_SINCE = new Date('2026-10-20T00:00:00.000Z');

type StreakLoopReward = {
  coins?: number;
  zumbidos?: number;
  ninjaHours?: number;
  leyendaHours?: number;
  label: string;
};

const STREAK_LOOP_REWARDS: Record<number, StreakLoopReward> = {
  1: { coins: 5, label: '+5 Cuy Coins' },
  2: { coins: 10, label: '+10 Cuy Coins' },
  3: { ninjaHours: 24, label: '24h de Modo Cuy Ninja' },
  4: { coins: 15, label: '+15 Cuy Coins' },
  5: { zumbidos: 1, label: '+1 Zumbido gratis' },
  6: { coins: 20, label: '+20 Cuy Coins' },
  7: { leyendaHours: 24, label: '24h de Cuy Leyenda' },
};

const STREAK_MILESTONES: Record<number, StreakLoopReward> = {
  30: { coins: 100, label: '+100 Cuy Coins (30 días)' },
  100: {
    coins: 300,
    leyendaHours: 3 * 24,
    label: '+300 Cuy Coins y 3 días de Cuy Leyenda (100 días)',
  },
  365: { leyendaHours: 30 * 24, label: '1 mes de Cuy Leyenda (365 días)' },
  730: {
    coins: 1000,
    leyendaHours: 60 * 24,
    label: '+1000 Cuy Coins y 2 meses de Cuy Leyenda (730 días)',
  },
};

function bogotaDayNumber(date: Date): number {
  const [year, month, day] = new Intl.DateTimeFormat('en-CA', {
    timeZone: STREAK_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(date)
    .split('-')
    .map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / MS_PER_DAY);
}

function streakLoopDay(currentStreak: number): number {
  return currentStreak % STREAK_LOOP_DAYS === 0
    ? STREAK_LOOP_DAYS
    : currentStreak % STREAK_LOOP_DAYS;
}

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

        await this.createWelcomeGiftTransaction(tx, user.id, null);

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
      if (dto.firstName && existing.firstName !== dto.firstName) {
        data.firstName = dto.firstName;
      }
      if (dto.lastName && dto.lastName !== (existing.lastName ?? '')) {
        data.lastName = dto.lastName;
      }

      const inviteCode = (dto.invitedByCode ?? dto.referredBy)?.trim();
      let linkedReferrerId: string | null = null;
      if (inviteCode && !existing.referredById) {
        const referrer = await this.prisma.user.findUnique({
          where: { referralCode: inviteCode.toUpperCase() },
          select: { id: true },
        });
        if (referrer) {
          linkedReferrerId = referrer.id;
          data.referredBy = { connect: { id: referrer.id } };
        }
      }

      if (Object.keys(data).length === 0) {
        return existing;
      }

      try {
        const updated = await this.prisma.$transaction(async (tx) => {
          const synced = await tx.user.update({
            where: { id: authUser.userId },
            data,
          });

          if (linkedReferrerId && !existing.referredById) {
            await this.attributeWelcomeGiftToReferral(
              tx,
              authUser.userId,
              linkedReferrerId,
            );
          }

          return synced;
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
        const inviteCode = (dto.invitedByCode ?? dto.referredBy)?.trim();
        if (inviteCode) {
          const referrer = await tx.user.findUnique({
            where: { referralCode: inviteCode.toUpperCase() },
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

        await this.createWelcomeGiftTransaction(tx, user.id, referredById);

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
    const user = await this.getOrCreateUser({ userId });

    let referredBy: Prisma.UserUpdateOneWithoutReferralsNestedInput | undefined;
    let referredByIdLinked: string | null = null;
    if (user && dto.invitedByCode && !user.referredById) {
      const referrer = await this.prisma.user.findUnique({
        where: { referralCode: dto.invitedByCode.trim().toUpperCase() },
        select: { id: true },
      });
      if (referrer) {
        referredByIdLinked = referrer.id;
        referredBy = { connect: { id: referrer.id } };
      }
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: userId },
          data: {
            birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
            gender: dto.gender,
            interestedIn: dto.interestedIn,
            relationshipGoal: dto.relationshipGoal,
            hobbies: dto.hobbies ?? undefined,
            bio: dto.bio,
            ...(dto.profilePrompts !== undefined
              ? {
                  profilePrompts: this.normalizeProfilePrompts(
                    dto.profilePrompts,
                  ),
                }
              : {}),
            city: dto.city ?? 'Pasto',
            latitude: dto.latitude,
            longitude: dto.longitude,
            ...(referredBy ? { referredBy } : {}),
          },
        });

        if (referredByIdLinked && !user?.referredById) {
          await this.attributeWelcomeGiftToReferral(
            tx,
            userId,
            referredByIdLinked,
          );
        }
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
    dailyAiLeft: number;
  }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        coinsBalance: true,
        dailyZumbidosLeft: true,
        dailyCuyazosLeft: true,
        dailyAiLeft: true,
      },
    });
    if (!user) {
      throw new NotFoundException('El usuario no existe');
    }
    return {
      coinsBalance: user.coinsBalance,
      dailyZumbidosLeft: user.dailyZumbidosLeft,
      dailyCuyazosLeft: user.dailyCuyazosLeft,
      dailyAiLeft: user.dailyAiLeft,
    };
  }

  async claimDailyStreak(userId: string) {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: {
          currentStreak: true,
          longestStreak: true,
          lastStreakClaimDate: true,
          coinsBalance: true,
          dailyZumbidosLeft: true,
          dailyCuyazosLeft: true,
          dailyAiLeft: true,
          isNinja: true,
          ninjaExpiresAt: true,
          isLeyenda: true,
          leyendaExpiresAt: true,
        },
      });

      if (!user) {
        throw new NotFoundException('El usuario no existe');
      }

      const now = new Date();
      const today = bogotaDayNumber(now);
      const lastClaim = user.lastStreakClaimDate
        ? bogotaDayNumber(user.lastStreakClaimDate)
        : null;

      if (lastClaim === today) {
        return {
          claimed: false,
          currentStreak: user.currentStreak,
          longestStreak: user.longestStreak,
          loopDay:
            user.currentStreak > 0 ? streakLoopDay(user.currentStreak) : 0,
          rewards: {
            coins: 0,
            zumbidos: 0,
            ninjaHours: 0,
            leyendaHours: 0,
            items: [],
          },
          coinsBalance: user.coinsBalance,
          dailyZumbidosLeft: user.dailyZumbidosLeft,
          dailyCuyazosLeft: user.dailyCuyazosLeft,
          isNinja: user.isNinja,
          isLeyenda: user.isLeyenda,
        };
      }

      const currentStreak =
        lastClaim !== null && lastClaim === today - 1
          ? user.currentStreak + 1
          : 1;

      const loopDay = streakLoopDay(currentStreak);
      const loopReward = STREAK_LOOP_REWARDS[loopDay];
      const milestone = STREAK_MILESTONES[currentStreak];

      let coins = loopReward.coins ?? 0;
      const zumbidos = loopReward.zumbidos ?? 0;
      const ninjaHours = loopReward.ninjaHours ?? 0;
      let leyendaHours = loopReward.leyendaHours ?? 0;
      const items: string[] = [loopReward.label];

      if (milestone) {
        coins += milestone.coins ?? 0;
        leyendaHours += milestone.leyendaHours ?? 0;
        items.push(milestone.label);
      }

      const data: Prisma.UserUpdateInput = {
        currentStreak,
        longestStreak: Math.max(user.longestStreak, currentStreak),
        lastStreakClaimDate: now,
      };

      if (coins > 0) {
        data.coinsBalance = { increment: coins };
      }
      if (zumbidos > 0) {
        data.dailyZumbidosLeft = { increment: zumbidos };
      }
      if (ninjaHours > 0) {
        const base =
          user.isNinja && user.ninjaExpiresAt
            ? Math.max(user.ninjaExpiresAt.getTime(), now.getTime())
            : now.getTime();
        data.isNinja = true;
        data.ninjaExpiresAt = new Date(base + ninjaHours * HOURS_MS);
      }
      if (leyendaHours > 0) {
        const base =
          user.isLeyenda && user.leyendaExpiresAt
            ? Math.max(user.leyendaExpiresAt.getTime(), now.getTime())
            : now.getTime();
        data.isLeyenda = true;
        data.leyendaExpiresAt = new Date(base + leyendaHours * HOURS_MS);
        // Activar los perks diarios de Leyenda de inmediato (el cron de
        // mediano noche no los otorga hasta el siguiente reinicio).
        data.dailyZumbidosLeft = Math.max(
          user.dailyZumbidosLeft + zumbidos,
          LEYENDA_DAILY_ZUMBIDOS,
        );
        data.dailyCuyazosLeft = Math.max(
          user.dailyCuyazosLeft,
          LEYENDA_DAILY_CUYAZOS,
        );
        data.dailyAiLeft = Math.max(user.dailyAiLeft, LEYENDA_DAILY_AI);
      }

      // Guardia atómica: solo aplica si nadie reclamó hoy aún (evita
      // doble reclamo concurrente por el mismo usuario).
      const bogotaStartOfToday = new Date(today * MS_PER_DAY);
      const claimResult = await tx.user.updateMany({
        where: {
          id: userId,
          OR: [
            { lastStreakClaimDate: null },
            { lastStreakClaimDate: { lt: bogotaStartOfToday } },
          ],
        },
        data,
      });

      if (claimResult.count === 0) {
        const fresh = await tx.user.findUnique({
          where: { id: userId },
          select: {
            currentStreak: true,
            longestStreak: true,
            coinsBalance: true,
            dailyZumbidosLeft: true,
            dailyCuyazosLeft: true,
            dailyAiLeft: true,
            isNinja: true,
            isLeyenda: true,
          },
        });
        if (!fresh) {
          throw new NotFoundException('El usuario no existe');
        }
        return {
          claimed: false,
          currentStreak: fresh.currentStreak,
          longestStreak: fresh.longestStreak,
          loopDay:
            fresh.currentStreak > 0 ? streakLoopDay(fresh.currentStreak) : 0,
          rewards: {
            coins: 0,
            zumbidos: 0,
            ninjaHours: 0,
            leyendaHours: 0,
            items: [],
          },
          coinsBalance: fresh.coinsBalance,
          dailyZumbidosLeft: fresh.dailyZumbidosLeft,
          dailyCuyazosLeft: fresh.dailyCuyazosLeft,
          dailyAiLeft: fresh.dailyAiLeft,
          isNinja: fresh.isNinja,
          isLeyenda: fresh.isLeyenda,
        };
      }

      if (coins > 0) {
        await tx.transaction.create({
          data: {
            reference: `CUY-STREAK-${Date.now()}-${randomUUID()}`,
            amountInCents: 0,
            coinsAmount: coins,
            type: 'STREAK_REWARD',
            status: 'APPROVED',
            userId,
          },
        });
      }

      const updated = await tx.user.findUnique({
        where: { id: userId },
        select: {
          currentStreak: true,
          longestStreak: true,
          coinsBalance: true,
          dailyZumbidosLeft: true,
          dailyCuyazosLeft: true,
          dailyAiLeft: true,
          isNinja: true,
          isLeyenda: true,
        },
      });
      if (!updated) {
        throw new NotFoundException('El usuario no existe');
      }

      return {
        claimed: true,
        currentStreak: updated.currentStreak,
        longestStreak: updated.longestStreak,
        loopDay,
        rewards: { coins, zumbidos, ninjaHours, leyendaHours, items },
        coinsBalance: updated.coinsBalance,
        dailyZumbidosLeft: updated.dailyZumbidosLeft,
        dailyCuyazosLeft: updated.dailyCuyazosLeft,
        dailyAiLeft: updated.dailyAiLeft,
        isNinja: updated.isNinja,
        isLeyenda: updated.isLeyenda,
      };
    });
  }

  async registerDevice(userId: string, dto: RegisterDeviceDto) {
    return this.prisma.device.upsert({
      where: { pushToken: dto.pushToken },
      update: { userId },
      create: {
        pushToken: dto.pushToken,
        platform: dto.platform,
        userId,
      },
    });
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
          dailyAiLeft: LEYENDA_DAILY_AI,
        },
        select: {
          isLeyenda: true,
          leyendaExpiresAt: true,
          coinsBalance: true,
          dailyZumbidosLeft: true,
          dailyCuyazosLeft: true,
          dailyAiLeft: true,
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
    if (dto.profilePrompts !== undefined) {
      userUpdate.profilePrompts = this.normalizeProfilePrompts(
        dto.profilePrompts,
      );
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
        gender: true,
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

    const isProduction = process.env.NODE_ENV === 'production';

    const now = new Date();
    const minBirthDate = this.subtractYears(now, maxAgePreference);
    const maxBirthDate = this.subtractYears(now, minAgePreference);

    const birthDateCondition: Prisma.UserWhereInput = isProduction
      ? { birthDate: { gte: minBirthDate, lte: maxBirthDate } }
      : {
          OR: [
            { birthDate: null },
            { birthDate: { gte: minBirthDate, lte: maxBirthDate } },
          ],
        };

    const conditions: Prisma.UserWhereInput[] = [
      { id: { not: userId } },
      { isNinja: false },
      birthDateCondition,
      {
        receivedInteractions: {
          none: { fromUserId: userId },
        },
      },
    ];

    const allowedGenders = this.gendersForInterest(user.interestedIn);
    if (allowedGenders.length > 0) {
      conditions.push({ gender: { in: allowedGenders } });
    }

    const allowedInterests = this.interestsForGender(user.gender);
    if (allowedInterests.length > 0) {
      conditions.push({ interestedIn: { in: allowedInterests } });
    }

    const { latitude, longitude } = user;
    if (isProduction) {
      conditions.push({ latitude: { not: null } });
      conditions.push({ longitude: { not: null } });
    }

    if (latitude != null && longitude != null) {
      const latDelta = maxDistanceKm / 111.32;
      const lngDelta =
        maxDistanceKm / (111.32 * Math.cos((latitude * Math.PI) / 180));
      const boundingBox: Prisma.UserWhereInput = {
        latitude: { gte: latitude - latDelta, lte: latitude + latDelta },
        longitude: { gte: longitude - lngDelta, lte: longitude + lngDelta },
      };
      conditions.push(
        isProduction
          ? boundingBox
          : {
              OR: [{ latitude: null }, { longitude: null }, boundingBox],
            },
      );
    }

    const where: Prisma.UserWhereInput = { AND: conditions };

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
        interestedIn: true,
        hobbies: true,
        profilePrompts: true,
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
      orderBy: { createdAt: 'desc' },
    });

    if (latitude != null && longitude != null) {
      candidates = candidates.filter((candidate) => {
        if (candidate.latitude == null || candidate.longitude == null) {
          return !isProduction;
        }
        return (
          this.haversineKm(
            latitude,
            longitude,
            candidate.latitude,
            candidate.longitude,
          ) <= maxDistanceKm
        );
      });
    }

    return candidates.map((candidate) => ({
      id: candidate.id,
      firstName: candidate.firstName,
      birthDate: candidate.birthDate,
      bio: candidate.bio,
      gender: candidate.gender,
      city: candidate.city,
      relationshipGoal: candidate.relationshipGoal,
      interestedIn: candidate.interestedIn,
      hobbies: candidate.hobbies,
      profilePrompts: this.readProfilePrompts(candidate.profilePrompts),
      isLeyenda: candidate.isLeyenda,
      isHighlyRequested:
        candidate._count.receivedInteractions >= HIGHLY_REQUESTED_THRESHOLD,
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

  async getPublicProfile(viewerId: string, targetUserId: string) {
    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
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
        profilePrompts: true,
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
    });

    if (!target) {
      throw new NotFoundException('Perfil no encontrado');
    }

    const viewer = await this.prisma.user.findUnique({
      where: { id: viewerId },
      select: { latitude: true, longitude: true },
    });

    let distance: number | null = null;
    if (
      viewer?.latitude != null &&
      viewer?.longitude != null &&
      target.latitude != null &&
      target.longitude != null
    ) {
      distance = Number(
        this.haversineKm(
          viewer.latitude,
          viewer.longitude,
          target.latitude,
          target.longitude,
        ).toFixed(1),
      );
    }

    return {
      id: target.id,
      firstName: target.firstName,
      birthDate: target.birthDate,
      bio: target.bio,
      gender: target.gender,
      city: target.city,
      relationshipGoal: target.relationshipGoal,
      interestedIn: target.interestedIn,
      hobbies: target.hobbies,
      profilePrompts: this.readProfilePrompts(target.profilePrompts),
      isLeyenda: target.isLeyenda,
      isHighlyRequested:
        target._count.receivedInteractions >= HIGHLY_REQUESTED_THRESHOLD,
      photo: target.photos[0] ?? null,
      photos: target.photos.map((photo) => ({
        id: photo.id,
        url: photo.url,
      })),
      distance,
    };
  }

  private gendersForInterest(interestedIn: InterestedIn | null): Gender[] {
    switch (interestedIn) {
      case InterestedIn.WOMEN:
        return [Gender.FEMALE];
      case InterestedIn.MEN:
        return [Gender.MALE];
      case InterestedIn.BOTH:
        return [Gender.FEMALE, Gender.MALE];
      default:
        return [];
    }
  }

  private interestsForGender(gender: Gender | null): InterestedIn[] {
    switch (gender) {
      case Gender.MALE:
        return [InterestedIn.MEN, InterestedIn.BOTH];
      case Gender.FEMALE:
        return [InterestedIn.WOMEN, InterestedIn.BOTH];
      default:
        return [];
    }
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

  private normalizeProfilePrompts(
    prompts: ProfilePromptDto[],
  ): Prisma.InputJsonValue {
    const cleaned = prompts
      .map((prompt) => ({
        id: prompt.id.trim(),
        answer: prompt.answer.trim(),
      }))
      .filter((prompt) => prompt.id.length > 0 && prompt.answer.length > 0)
      .slice(0, PROFILE_PROMPTS_MAX_COUNT);
    return cleaned;
  }

  private readProfilePrompts(
    value: Prisma.JsonValue | null | undefined,
  ): { id: string; answer: string }[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .filter(
        (item): item is { id: string; answer: string } =>
          !!item &&
          typeof item === 'object' &&
          typeof (item as { id?: unknown }).id === 'string' &&
          typeof (item as { answer?: unknown }).answer === 'string',
      )
      .map((item) => ({ id: item.id, answer: item.answer }))
      .slice(0, PROFILE_PROMPTS_MAX_COUNT);
  }

  /**
   * Los usuarios creados antes del lanzamiento de los prompts de perfil
   * (usuarios legados) no están obligados a responderlos.
   */
  private requiresProfilePrompts(user: { createdAt: Date }): boolean {
    return (
      user.createdAt.getTime() >= PROFILE_PROMPTS_REQUIRED_SINCE.getTime()
    );
  }

  private serializeProfile(user: UserWithRelations) {
    const photos = (user.photos ?? []).slice(0, MAX_PHOTOS);
    const profilePrompts = this.readProfilePrompts(user.profilePrompts);
    const requiresProfilePrompts = this.requiresProfilePrompts(user);
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
      profilePrompts,
      requiresProfilePrompts,
      profileComplete:
        !!user.birthDate &&
        !!user.gender &&
        photos.length > 0 &&
        (!requiresProfilePrompts || profilePrompts.length > 0),
      city: user.city,
      latitude: user.latitude,
      longitude: user.longitude,
      coinsBalance: user.coinsBalance,
      cashBalanceInCents: user.cashBalanceInCents,
      referralCode: user.referralCode,
      referralEarningsInCents: user.referralEarningsInCents,
      isNinja: user.isNinja,
      isLeyenda: user.isLeyenda,
      leyendaExpiresAt: user.leyendaExpiresAt,
      leyendaDaysLeft,
      dailyZumbidosLeft: user.dailyZumbidosLeft,
      dailyCuyazosLeft: user.dailyCuyazosLeft,
      dailyAiLeft: user.dailyAiLeft,
      currentStreak: user.currentStreak,
      longestStreak: user.longestStreak,
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

  private async createWelcomeGiftTransaction(
    tx: Prisma.TransactionClient,
    userId: string,
    referredById: string | null,
  ): Promise<void> {
    const reference = referredById
      ? `CUY-REFERRAL-GIFT-${referredById}-${Date.now()}-${randomUUID()}`
      : `CUY-WELCOME-${Date.now()}-${randomUUID()}`;

    await tx.transaction.create({
      data: {
        reference,
        amountInCents: 0,
        coinsAmount: WELCOME_GIFT_COINS,
        type: 'WELCOME_GIFT',
        status: 'APPROVED',
        userId,
      },
    });
  }

  private async attributeWelcomeGiftToReferral(
    tx: Prisma.TransactionClient,
    userId: string,
    referredById: string,
  ): Promise<void> {
    const existing = await tx.transaction.findFirst({
      where: { userId, type: 'WELCOME_GIFT' },
      orderBy: { createdAt: 'asc' },
      select: { id: true, reference: true },
    });

    if (!existing || existing.reference.startsWith('CUY-REFERRAL-GIFT')) {
      return;
    }

    await tx.transaction.update({
      where: { id: existing.id },
      data: {
        reference: `CUY-REFERRAL-GIFT-${referredById}-${Date.now()}-${randomUUID()}`,
      },
    });
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
