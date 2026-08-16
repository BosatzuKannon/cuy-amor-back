import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { SyncUserDto } from '../auth/sync-user.dto';
import { AddPhotosDto } from './dto/photo.dto';
import { CompleteProfileDto } from './dto/complete-profile.dto';

@Injectable()
export class UserService {
  private readonly userInclude = {
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
