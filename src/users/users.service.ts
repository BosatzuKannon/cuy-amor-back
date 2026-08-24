import { randomUUID } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Gender, InterestedIn, Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { SyncUserDto } from '../auth/sync-user.dto';
import { AddPhotosDto } from './dto/photo.dto';
import { CompleteProfileDto } from './dto/complete-profile.dto';
import { EditPhotoDto, EditProfileDto } from './dto/edit-profile.dto';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';

const MAX_PHOTOS = 3;
const NINJA_COST_IN_COINS = 50;
const NINJA_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const MS_PER_DAY = 86_400_000;
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
      return await this.prisma.user.create({
        data: {
          id: authUser.userId,
          email,
          firstName: email.split('@')[0] || 'usuario',
          city: 'Pasto',
          preferences: {
            create: {},
          },
        },
        include: this.userInclude,
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
      return await this.prisma.user.create({
        data: {
          id: authUser.userId,
          email,
          googleId: dto.googleId ?? null,
          firstName,
          lastName: rest.length ? rest.join(' ') : null,
          city: 'Pasto',
          preferences: {
            create: {},
          },
        },
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
      return await this.prisma.user.update({
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

  async getBalance(userId: string): Promise<{ coinsBalance: number }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { coinsBalance: true },
    });
    if (!user) {
      throw new NotFoundException('El usuario no existe');
    }
    return { coinsBalance: user.coinsBalance };
  }

  async activateNinja(userId: string) {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { isNinja: true, coinsBalance: true },
      });

      if (!user) {
        throw new NotFoundException('El usuario no existe');
      }

      if (user.isNinja) {
        throw new BadRequestException('El modo Cuy Ninja ya está activo');
      }

      if (user.coinsBalance < NINJA_COST_IN_COINS) {
        throw new BadRequestException(
          'Saldo insuficiente para activar el modo Cuy Ninja',
        );
      }

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

      return tx.user.update({
        where: { id: userId },
        data: {
          isNinja: true,
          ninjaExpiresAt: new Date(Date.now() + NINJA_DURATION_MS),
        },
        select: { isNinja: true, ninjaExpiresAt: true },
      });
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
      isNinja: user.isNinja,
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
